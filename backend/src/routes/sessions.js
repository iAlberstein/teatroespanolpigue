import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { sessions: Session, shows: Show } = sequelize.models;
  const sessions = await Session.findAll({ 
    include: [{ model: Show, as: 'show' }],
    limit: 100,
    order: [['starts_at', 'ASC']]
  });
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

  // Load pricing from session (with fallback to show)
  let pricing = {
    platea_general: 5000,
    palcos_bajos: 10000,
    palcos_altos: 8000,
    pullman: 3000
  };
  
  try {
    const { sessions: Session, shows: Show } = sequelize.models;
    const session = await Session.findByPk(sessionId, {
      include: [{ model: Show, as: 'show' }]
    });
    
    if (session) {
      // Priority 1: Session-specific pricing
      if (session.pricing_json && Object.keys(session.pricing_json).length > 0) {
        pricing = { ...pricing, ...session.pricing_json };
      }
      // Priority 2: Show default pricing
      else if (session.show && session.show.pricing_json) {
        pricing = { ...pricing, ...session.show.pricing_json };
      }
    }
  } catch (err) {
    console.error('[SESSIONS] Error loading pricing:', err);
  }

  res.json({
    heldSeats: Array.from(seatMap.entries()).map(([seatId, by]) => ({ seatId, by })),
    heldPalcos: Array.from(palcoMap.entries()).map(([palco, by]) => ({ palco, by })),
    soldSeats: Array.from(soldSeats.get(sessionId) || []),
    soldPalcos: Array.from(soldPalcos.get(sessionId) || []),
    pullman: { capacity: pull.capacity || 92, available, sold: soldCount },
    pricing  // Include pricing in response
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

// Create a new session (admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Session = sequelize.models.sessions;
    const Show = sequelize.models.shows;
    const { show_id, starts_at, capacity_override, pricing_json } = req.body;
    
    if (!show_id || !starts_at) {
      return res.status(400).json({ 
        error: 'missing_fields', 
        message: 'show_id y starts_at son obligatorios' 
      });
    }
    
    // Verify show exists
    const show = await Show.findByPk(show_id);
    if (!show) {
      return res.status(404).json({ error: 'show_not_found', message: 'Espectáculo no encontrado' });
    }
    
    // Calculate ends_at based on show duration (default 2 hours)
    const duration_minutes = show.duration_minutes || 120;
    const startsAt = new Date(starts_at);
    const endsAt = new Date(startsAt.getTime() + duration_minutes * 60000);
    
    const session = await Session.create({
      show_id,
      starts_at: startsAt,
      ends_at: endsAt,
      capacity_override: capacity_override || null,
      pricing_json: pricing_json || null  // Allow session-specific pricing
    });
    
    res.status(201).json(session);
  } catch (error) {
    console.error('[SESSIONS] Error creating session:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al crear sesión' });
  }
});

// Delete a session (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Session = sequelize.models.sessions;
    const Ticket = sequelize.models.tickets;
    
    const session = await Session.findByPk(req.params.id);
    
    if (!session) {
      return res.status(404).json({ error: 'not_found', message: 'Sesión no encontrada' });
    }
    
    // Check if session has sold tickets
    const ticketCount = await Ticket.count({ 
      where: { 
        session_id: req.params.id,
        status: 'sold'
      } 
    });
    
    if (ticketCount > 0) {
      return res.status(400).json({ 
        error: 'has_tickets', 
        message: `No se puede eliminar una sesión con ${ticketCount} entrada(s) vendida(s).` 
      });
    }
    
    await session.destroy();
    res.json({ success: true, message: 'Sesión eliminada exitosamente' });
  } catch (error) {
    console.error('[SESSIONS] Error deleting session:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al eliminar sesión' });
  }
});

export default router;
