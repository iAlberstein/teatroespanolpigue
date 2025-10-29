import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';

const router = Router();

router.get('/', async (req, res) => {
  const Session = sequelize.models.sessions;
  const sessions = await Session.findAll({ limit: 100 });
  res.json(sessions);
});

router.get('/:id/availability', async (req, res) => {
  const io = req.app.get('io');
  const sessionId = req.params.id;
  const seatHolds = io.seatHolds || new Map();
  const palcoHolds = io.palcoHolds || new Map();
  const pullmanState = io.pullmanState || new Map();
  const soldSeats = io.soldSeats || new Map();
  const soldPalcos = io.soldPalcos || new Map();
  const pullmanSold = io.pullmanSold || new Map();

  const seatMap = seatHolds.get(sessionId) || new Map();
  const palcoMap = palcoHolds.get(sessionId) || new Map();
  const pull = pullmanState.get(sessionId) || { capacity: 92, heldBySocket: new Map() };
  const totalHeld = Array.from(pull.heldBySocket?.values?.() || []).reduce((a,b)=>a+b,0);
  const soldCount = pullmanSold.get(sessionId) || 0;
  const available = Math.max(0, (pull.capacity || 92) - totalHeld - soldCount);

  res.json({
    heldSeats: Array.from(seatMap.entries()).map(([seatId, by]) => ({ seatId, by })),
    heldPalcos: Array.from(palcoMap.entries()).map(([palco, by]) => ({ palco, by })),
    soldSeats: Array.from(soldSeats.get(sessionId) || []),
    soldPalcos: Array.from(soldPalcos.get(sessionId) || []),
    pullman: { capacity: pull.capacity || 92, available, sold: soldCount }
  });
});

// Mark items as sold (dev/test utility). Body: { seats?: string[], palcos?: string[], pullman?: number }
router.post('/:id/sold', async (req, res) => {
  const io = req.app.get('io');
  const sessionId = req.params.id;
  const { seats = [], palcos = [], pullman = 0 } = req.body || {};

  io.soldSeats = io.soldSeats || new Map();
  io.soldPalcos = io.soldPalcos || new Map();
  io.pullmanSold = io.pullmanSold || new Map();

  // seats
  if (!io.soldSeats.has(sessionId)) io.soldSeats.set(sessionId, new Set());
  const sset = io.soldSeats.get(sessionId);
  for (const sid of seats) {
    sset.add(String(sid));
    io.to(`session:${sessionId}`).emit('seat_sold', { seatId: String(sid) });
  }

  // palcos
  if (!io.soldPalcos.has(sessionId)) io.soldPalcos.set(sessionId, new Set());
  const pset = io.soldPalcos.get(sessionId);
  for (const label of palcos) {
    pset.add(String(label));
    io.to(`session:${sessionId}`).emit('palco_sold', { palco: String(label) });
  }

  // pullman
  const prevSold = io.pullmanSold.get(sessionId) || 0;
  const newSold = Math.max(0, prevSold + (Number.isFinite(pullman) ? pullman : 0));
  io.pullmanSold.set(sessionId, newSold);
  io.to(`session:${sessionId}`).emit('pullman_sold', { sold: newSold });
  // also emit updated availability for pullman
  const pull = (io.pullmanState || new Map()).get(sessionId) || { capacity: 92, heldBySocket: new Map() };
  const totalHeld = Array.from(pull.heldBySocket?.values?.() || []).reduce((a,b)=>a+b,0);
  const available = Math.max(0, (pull.capacity || 92) - totalHeld - newSold);
  io.to(`session:${sessionId}`).emit('pullman_updated', { available, capacity: pull.capacity || 92 });

  res.json({ ok: true, soldSeats: Array.from(sset), soldPalcos: Array.from(pset), pullmanSold: newSold });
});

export default router;
