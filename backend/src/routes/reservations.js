import { Router } from 'express';
import dayjs from 'dayjs';
import { sequelize } from '../lib/sequelize.js';
import { Op } from 'sequelize';

const router = Router();

router.post('/', async (req, res) => {
  const { session_id, user_id, items } = req.body;
  if (!session_id || !items?.length) return res.status(400).json({ error: 'session_id and items required' });
  const Reservation = sequelize.models.reservations;
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
    if (existing) return res.status(409).json({ error: 'Active reservation exists', reservation_id: existing.id });
  }

  const reservation = await Reservation.create({
    session_id,
    user_id: user_id || null,
    items,
    expires_at: dayjs().add(1, 'minute').toDate(),
    status: 'active'
  });
  try {
    const io = req.app.get('io');
    io.to(`session:${session_id}`).emit('reservation_created', { reservation_id: reservation.id, items });
  } catch {}
  res.status(201).json(reservation);
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

  await reservation.update({ items }); // keep expires_at unchanged
  try {
    const io = req.app.get('io');
    io.to(`session:${reservation.session_id}`).emit('reservation_updated', { reservation_id: reservation.id, items });
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
    io.to(`session:${reservation.session_id}`).emit('reservation_canceled', { reservation_id: reservation.id });
  } catch {}
  res.json({ ok: true });
});

export default router;
