import { Router } from 'express';
import dayjs from 'dayjs';
import { sequelize } from '../lib/sequelize.js';
import { Op } from 'sequelize';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/reservations - List reservations with filters
router.get('/', async (req, res) => {
  const { user_id, session_id, status } = req.query;
  const Reservation = sequelize.models.reservations;
  
  const where = {};
  if (user_id) where.user_id = user_id;
  if (session_id) where.session_id = session_id;
  if (status) where.status = status;
  
  try {
    const reservations = await Reservation.findAll({ 
      where,
      order: [['createdAt', 'DESC']]
    });
    return res.json(reservations);
  } catch (err) {
    console.error('[Reservations GET] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

async function enrichItemsWithPrices(items, session_id) {
  try {
    const { sessions: Session, shows: Show } = sequelize.models;
    const sess = await Session.findByPk(session_id);
    if (!sess) return items;
    const show = await Show.findByPk(sess.show_id);
    const pricing = show?.pricing_json || {};
    const mapSectionToPrice = (it) => {
      const sec = (it.section || '').toLowerCase();
      if (it.type === 'butaca') return { ...it, price: Number(pricing.platea_general || 100) };
      if (it.type === 'palco') {
        const isBajo = sec.includes('bajo');
        const price = isBajo ? Number(pricing.palcos_bajos || 100) : Number(pricing.palcos_altos || 100);
        return { ...it, price };
      }
      if (it.type === 'pullman') return { ...it, unit_price: Number(pricing.pullman || 100) };
      return it;
    };
    return (Array.isArray(items) ? items : []).map(mapSectionToPrice);
  } catch {
    return items;
  }
}

router.post('/', optionalAuth, async (req, res) => {
  const { session_id, user_id: bodyUserId, items } = req.body;
  // Prefer user_id from JWT, fallback to body
  const user_id = req.user?.userId || bodyUserId;
  if (!session_id || !items?.length) return res.status(400).json({ error: 'session_id and items required' });
  const Reservation = sequelize.models.reservations;
  const User = sequelize.models.users;
  // Validate holds: ensure user is not trying to reserve items held by others
  try {
    const io = req.app.get('io');
    const caller = req.header('x-socket-id') || null;
    const seatHolds = io.seatHolds || new Map();
    const palcoHolds = io.palcoHolds || new Map();
    const seatMap = seatHolds.get(session_id) || new Map();
    const palcoMap = palcoHolds.get(session_id) || new Map();
    const conflicts = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code) {
        const holder = seatMap.get(it.seat_code);
        if (holder && holder !== caller) conflicts.push({ type:'butaca', seat_code: it.seat_code });
      }
      if (it.type === 'palco' && it.seat_code) {
        const holder = palcoMap.get(it.seat_code);
        if (holder && holder !== caller) conflicts.push({ type:'palco', seat_code: it.seat_code });
      }
    }
    if (conflicts.length) return res.status(409).json({ error: 'items_conflict', conflicts });
  } catch {}

  // Validate SOLD states and Pullman capacity (sold + held by others)
  try {
    const io = req.app.get('io');
    const caller = req.header('x-socket-id') || null;
    io.soldSeats = io.soldSeats || new Map();
    io.soldPalcos = io.soldPalcos || new Map();
    io.pullmanSold = io.pullmanSold || new Map();
    const soldSeatsSet = io.soldSeats.get(session_id) || new Set();
    const soldPalcosSet = io.soldPalcos.get(session_id) || new Set();
    const soldConflicts = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code && soldSeatsSet.has(it.seat_code)) {
        soldConflicts.push({ type:'butaca', seat_code: it.seat_code });
      }
      if (it.type === 'palco' && it.seat_code && soldPalcosSet.has(it.seat_code)) {
        soldConflicts.push({ type:'palco', seat_code: it.seat_code });
      }
    }
    if (soldConflicts.length) return res.status(409).json({ error: 'items_sold', conflicts: soldConflicts });

    // Pullman capacity check
    const st = (req.app.get('io').pullmanState || new Map()).get(session_id) || { capacity: 92, heldBySocket: new Map() };
    const totalHeldExcludingCaller = Array.from(st.heldBySocket?.entries?.() || [])
      .filter(([sid]) => sid !== caller)
      .reduce((a, [, v]) => a + v, 0);
    const soldCount = io.pullmanSold.get(session_id) || 0;
    const maxForCaller = Math.max(0, (st.capacity || 92) - soldCount - totalHeldExcludingCaller);
    const requestedPullman = (items.find(it => it.type === 'pullman')?.quantity) || 0;
    if (requestedPullman > maxForCaller) {
      return res.status(409).json({ error: 'pullman_capacity', available: maxForCaller });
    }
  } catch {}

  // Optional: avoid multiple active reservations per user/session
  if (user_id) {
    const existing = await Reservation.findOne({ where: { user_id, session_id, status: 'active', expires_at: { [Op.gt]: new Date() } } });
    if (existing) return res.status(409).json({ error: 'Active reservation exists', reservation_id: existing.id, reservation: existing });
  }

  const itemsWithPrices = await enrichItemsWithPrices(items, session_id);
  // Validate user_id exists to honor FK; if not, set null
  let uid = null;
  try {
    if (user_id) {
      const u = await User.findByPk(user_id);
      if (u) uid = user_id;
    }
  } catch {}
  const reservation = await Reservation.create({
    session_id,
    user_id: uid,
    items: itemsWithPrices,
    expires_at: dayjs().add(10, 'minute').toDate(),
    status: 'active'
  });
  try {
    const io = req.app.get('io');
    io.to(`session:${session_id}`).emit('reservation_created', { reservation_id: reservation.id, items: itemsWithPrices });
  } catch {}
  res.status(201).json(reservation);
});

// Get reservation by id (for checkout summary)
router.get('/:id', async (req, res) => {
  const Reservation = sequelize.models.reservations;
  const reservation = await Reservation.findByPk(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Not found' });
  return res.json(reservation);
});

router.put('/:id', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  const Reservation = sequelize.models.reservations;
  const reservation = await Reservation.findByPk(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Not found' });
  // only allow update if still active and not expired
  if (reservation.status !== 'active' || dayjs(reservation.expires_at).isBefore(dayjs())) {
    return res.status(409).json({ error: 'Reservation not active' });
  }
  // Validate holds ownership
  try {
    const io = req.app.get('io');
    const caller = req.header('x-socket-id') || null;
    const seatHolds = io.seatHolds || new Map();
    const palcoHolds = io.palcoHolds || new Map();
    const seatMap = seatHolds.get(reservation.session_id) || new Map();
    const palcoMap = palcoHolds.get(reservation.session_id) || new Map();
    const conflicts = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code) {
        const holder = seatMap.get(it.seat_code);
        if (holder && holder !== caller) conflicts.push({ type:'butaca', seat_code: it.seat_code });
      }
      if (it.type === 'palco' && it.seat_code) {
        const holder = palcoMap.get(it.seat_code);
        if (holder && holder !== caller) conflicts.push({ type:'palco', seat_code: it.seat_code });
      }
    }
    if (conflicts.length) return res.status(409).json({ error: 'items_conflict', conflicts });
  } catch {}
  // Validate SOLD states and Pullman capacity on update
  try {
    const io = req.app.get('io');
    const caller = req.header('x-socket-id') || null;
    io.soldSeats = io.soldSeats || new Map();
    io.soldPalcos = io.soldPalcos || new Map();
    io.pullmanSold = io.pullmanSold || new Map();
    const soldSeatsSet = io.soldSeats.get(reservation.session_id) || new Set();
    const soldPalcosSet = io.soldPalcos.get(reservation.session_id) || new Set();
    const soldConflicts = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code && soldSeatsSet.has(it.seat_code)) {
        soldConflicts.push({ type:'butaca', seat_code: it.seat_code });
      }
      if (it.type === 'palco' && it.seat_code && soldPalcosSet.has(it.seat_code)) {
        soldConflicts.push({ type:'palco', seat_code: it.seat_code });
      }
    }
    if (soldConflicts.length) return res.status(409).json({ error: 'items_sold', conflicts: soldConflicts });
    const st = (req.app.get('io').pullmanState || new Map()).get(reservation.session_id) || { capacity: 92, heldBySocket: new Map() };
    const totalHeldExcludingCaller = Array.from(st.heldBySocket?.entries?.() || [])
      .filter(([sid]) => sid !== caller)
      .reduce((a, [, v]) => a + v, 0);
    const soldCount = io.pullmanSold.get(reservation.session_id) || 0;
    const maxForCaller = Math.max(0, (st.capacity || 92) - soldCount - totalHeldExcludingCaller);
    const requestedPullman = (items.find(it => it.type === 'pullman')?.quantity) || 0;
    if (requestedPullman > maxForCaller) {
      return res.status(409).json({ error: 'pullman_capacity', available: maxForCaller });
    }
  } catch {}

  const itemsWithPrices2 = await enrichItemsWithPrices(items, reservation.session_id);
  await reservation.update({ items: itemsWithPrices2 }); // keep expires_at unchanged
  try {
    const io = req.app.get('io');
    io.to(`session:${reservation.session_id}`).emit('reservation_updated', { reservation_id: reservation.id, items: itemsWithPrices2 });
  } catch {}
  res.json(reservation);
});

router.delete('/:id', async (req, res) => {
  const Reservation = sequelize.models.reservations;
  const reservation = await Reservation.findByPk(req.params.id);
  if (!reservation) return res.status(404).json({ error: 'Not found' });
  await reservation.update({ status: 'canceled' });
  try {
    const io = req.app.get('io');
    // Release all holds associated with this reservation's items
    const items = Array.isArray(reservation.items) ? reservation.items : [];
    const seatHolds = io.seatHolds || new Map();
    const palcoHolds = io.palcoHolds || new Map();
    const seatMap = seatHolds.get(reservation.session_id) || new Map();
    const palcoMap = palcoHolds.get(reservation.session_id) || new Map();
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code && seatMap.has(it.seat_code)) {
        seatMap.delete(it.seat_code);
        io.to(`session:${reservation.session_id}`).emit('seat_released', { seatId: it.seat_code, by: 'system' });
      }
      if (it.type === 'palco' && it.seat_code && palcoMap.has(it.seat_code)) {
        palcoMap.delete(it.seat_code);
        io.to(`session:${reservation.session_id}`).emit('palco_released', { palco: it.seat_code, by: 'system' });
      }
    }
    io.to(`session:${reservation.session_id}`).emit('reservation_canceled', { reservation_id: reservation.id });
  } catch {}
  res.json({ ok: true });
});

export default router;
