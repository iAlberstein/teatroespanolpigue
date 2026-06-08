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
  // Only return non-expired active reservations
  if (status === 'active') {
    where.expires_at = { [Op.gt]: new Date() };
  }

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
    const sess = await Session.findByPk(session_id, {
      include: [{ model: Show, as: 'show' }]
    });
    if (!sess) return items;
    
    // Priority: session pricing > show pricing
    let pricing = null;
    
    // Parse session pricing_json
    let sessionPricing = sess.pricing_json;
    if (typeof sessionPricing === 'string') {
      try { sessionPricing = JSON.parse(sessionPricing); } catch { sessionPricing = null; }
    }
    
    // Parse show pricing_json
    let showPricing = sess.show?.pricing_json;
    if (typeof showPricing === 'string') {
      try { showPricing = JSON.parse(showPricing); } catch { showPricing = null; }
    }
    
    // Use session pricing if available and has values, otherwise fall back to show pricing
    if (sessionPricing && typeof sessionPricing === 'object' && Object.keys(sessionPricing).length > 0) {
      pricing = sessionPricing;
      console.log('[RESERVATION] Using SESSION pricing:', pricing);
    } else if (showPricing && typeof showPricing === 'object') {
      pricing = showPricing;
      console.log('[RESERVATION] Using SHOW pricing (session has no pricing):', pricing);
    } else {
      pricing = {};
      console.log('[RESERVATION] No pricing found!');
    }
    
    const mapSectionToPrice = (it) => {
      const sec = (it.section || '').toLowerCase();
      if (it.type === 'butaca') return { ...it, price: Number(pricing.platea_general || 0) };
      if (it.type === 'palco') {
        const isBajo = sec.includes('bajo');
        const price = isBajo ? Number(pricing.palcos_bajos || 0) : Number(pricing.palcos_altos || 0);
        return { ...it, price };
      }
      if (it.type === 'pullman') return { ...it, unit_price: Number(pricing.pullman || 0) };
      if (it.type === 'general') return { ...it, unit_price: Number(pricing.general || 0) };
      return it;
    };
    return (Array.isArray(items) ? items : []).map(mapSectionToPrice);
  } catch (err) {
    console.error('[RESERVATION] Error enriching items with prices:', err);
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
  // Hold structure: { socketId, guestId, userId } or legacy string
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
        const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
        if (holder && holderSocketId !== caller) conflicts.push({ type:'butaca', seat_code: it.seat_code });
      }
      if (it.type === 'palco' && it.seat_code) {
        const holder = palcoMap.get(it.seat_code);
        const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
        if (holder && holderSocketId !== caller) conflicts.push({ type:'palco', seat_code: it.seat_code });
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
  console.log('[RESERVATION] Items received:', JSON.stringify(items, null, 2));
  console.log('[RESERVATION] Items with prices:', JSON.stringify(itemsWithPrices, null, 2));
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

// Find active reservation by session and seat codes (for guest recovery)
// IMPORTANT: This route MUST be before /:id to avoid being caught by the wildcard
router.post('/find-by-items', async (req, res) => {
  const { session_id, seat_codes, palco_codes } = req.body;
  
  if (!session_id) {
    return res.status(400).json({ error: 'session_id required' });
  }
  
  const Reservation = sequelize.models.reservations;
  
  try {
    // Find active reservations for this session
    const activeReservations = await Reservation.findAll({
      where: {
        session_id,
        status: 'active',
        expires_at: { [Op.gt]: new Date() }
      },
      order: [['createdAt', 'DESC']]
    });
    
    // Find reservation that matches the provided items
    for (const reservation of activeReservations) {
      const items = Array.isArray(reservation.items) ? reservation.items : [];
      
      // Check if any of the provided seat codes match
      const reservationSeats = items.filter(it => it.type === 'butaca').map(it => it.seat_code);
      const reservationPalcos = items.filter(it => it.type === 'palco').map(it => it.seat_code);
      
      const matchesSeats = (seat_codes || []).some(code => reservationSeats.includes(code));
      const matchesPalcos = (palco_codes || []).some(code => reservationPalcos.includes(code));
      
      if (matchesSeats || matchesPalcos) {
        return res.json(reservation);
      }
    }
    
    return res.status(404).json({ error: 'No matching reservation found' });
  } catch (err) {
    console.error('[Reservations find-by-items] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get reservation by id (for checkout summary)
router.get('/:id', async (req, res) => {
  const { reservations: Reservation, sessions: Session, shows: Show } = sequelize.models;
  const reservation = await Reservation.findByPk(req.params.id, {
    include: [{
      model: Session,
      as: 'session',
      include: [{ model: Show, as: 'show' }]
    }]
  });
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
  // Hold structure: { socketId, guestId, userId } or legacy string
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
        const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
        if (holder && holderSocketId !== caller) conflicts.push({ type:'butaca', seat_code: it.seat_code });
      }
      if (it.type === 'palco' && it.seat_code) {
        const holder = palcoMap.get(it.seat_code);
        const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
        if (holder && holderSocketId !== caller) conflicts.push({ type:'palco', seat_code: it.seat_code });
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
  console.log('[RESERVATION PUT] Reservation ID:', reservation.id);
  console.log('[RESERVATION PUT] Items received:', JSON.stringify(items, null, 2));
  console.log('[RESERVATION PUT] Items with prices:', JSON.stringify(itemsWithPrices2, null, 2));
  console.log('[RESERVATION PUT] Items count:', itemsWithPrices2.length);
  await reservation.update({ items: itemsWithPrices2 }); // keep expires_at unchanged
  
  // Verify what was saved
  const updated = await Reservation.findByPk(reservation.id);
  console.log('[RESERVATION PUT] Saved items:', JSON.stringify(updated.items, null, 2));
  console.log('[RESERVATION PUT] Saved items count:', updated.items?.length);
  
  try {
    const io = req.app.get('io');
    io.to(`session:${reservation.session_id}`).emit('reservation_updated', { reservation_id: reservation.id, items: itemsWithPrices2 });
  } catch {}
  res.json(updated);
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
