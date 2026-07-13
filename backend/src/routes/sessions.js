import { Router } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getPriceTiers } from '../lib/seatPricing.js';

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
  
  // Get blocked seats from memory or database
  const blockedSeats = io.blockedSeats || new Map();
  const blockedPalcos = io.blockedPalcos || new Map();
  const blockedGeneral = io.blockedGeneral || new Map();

  const seatMap = seatHolds.get(sessionId) || new Map();
  const palcoMap = palcoHolds.get(sessionId) || new Map();
  const pull = pullmanState.get(sessionId) || { capacity: 92, heldBySocket: new Map() };
  const totalHeld = Array.from(pull.heldBySocket?.values?.() || []).reduce((a,b)=>a+b,0);
  const soldCount = pullmanSold.get(sessionId) || 0;
  const blockedGeneralCount = blockedGeneral.get(sessionId) || 0;
  const available = Math.max(0, (pull.capacity || 92) - totalHeld - soldCount - blockedGeneralCount);
  
  // Helper to get guestId from hold (now stored directly in hold structure)
  const getHoldGuestId = (hold) => {
    if (!hold) return null;
    // New structure: { socketId, guestId, userId }
    if (typeof hold === 'object' && hold.guestId) return hold.guestId;
    // Legacy: just socketId - try to get from socket
    const socketId = typeof hold === 'string' ? hold : hold.socketId;
    const socket = io.sockets?.sockets?.get(socketId);
    return socket?.data?.guestId || null;
  };
  
  // Helper to get socketId from hold (handles both old and new structure)
  const getHoldSocketId = (hold) => {
    if (!hold) return null;
    return typeof hold === 'string' ? hold : hold.socketId;
  };

  // Load pricing from session (with fallback to show)
  let pricing = null;
  let session = null;
  
  // Helper to parse pricing_json (handles string or object)
  const parsePricing = (pricingData) => {
    if (!pricingData) return null;
    if (typeof pricingData === 'string') {
      try {
        const parsed = JSON.parse(pricingData);
        return (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) ? parsed : null;
      } catch { return null; }
    }
    if (typeof pricingData === 'object' && Object.keys(pricingData).length > 0) {
      return pricingData;
    }
    return null;
  };
  
  try {
    const { sessions: Session, shows: Show } = sequelize.models;
    session = await Session.findByPk(sessionId, {
      include: [{ model: Show, as: 'show' }]
    });
    
    if (session) {
      // Priority 1: Session-specific pricing (override)
      pricing = parsePricing(session.pricing_json);
      // Priority 2: Show default pricing (base)
      if (!pricing && session.show) {
        pricing = parsePricing(session.show.pricing_json);
      }

      // Pack pricing preview: if pack_size is requested and show has pack enabled
      const packSize = req.query.pack_size;
      if (packSize && session.show?.pack_enabled && session.show?.pack_pricing_json) {
        const packPricing = parsePricing(session.show.pack_pricing_json);
        const tier = packPricing?.[packSize] || packPricing?.[String(packSize)];
        if (tier) {
          pricing = { ...pricing, ...tier, _pack_preview: true, _pack_size: Number(packSize) };
        }
      }
    }
    
    if (!pricing) {
      console.error('[SESSIONS] No pricing found for session:', sessionId);
      return res.status(500).json({ error: 'pricing_not_configured', message: 'Precios no configurados para esta sesión' });
    }
  } catch (err) {
    console.error('[SESSIONS] Error loading pricing:', err);
    return res.status(500).json({ error: 'internal_error' });
  }

  // Get price tiers for display
  let priceTiers = [];
  try {
    priceTiers = await getPriceTiers(sessionId, session?.show_id, pricing);
  } catch (err) {
    console.error('[SESSIONS] Error getting price tiers:', err);
    // Don't fail the request, just skip price tiers
  }

  res.json({
    heldSeats: Array.from(seatMap.entries()).map(([seatId, hold]) => ({ 
      seatId, 
      by: getHoldSocketId(hold),
      guestId: getHoldGuestId(hold) 
    })),
    heldPalcos: Array.from(palcoMap.entries()).map(([palco, hold]) => ({ 
      palco, 
      by: getHoldSocketId(hold),
      guestId: getHoldGuestId(hold)
    })),
    soldSeats: Array.from(soldSeats.get(sessionId) || []),
    soldPalcos: Array.from(soldPalcos.get(sessionId) || []),
    blockedSeats: Array.from(blockedSeats.get(sessionId) || []),
    blockedPalcos: Array.from(blockedPalcos.get(sessionId) || []),
    blockedGeneral: blockedGeneralCount,
    pullman: { capacity: pull.capacity || 92, available, sold: soldCount, blocked: blockedGeneralCount },
    pricing,  // Include pricing in response
    priceTiers  // Include price tiers with section/range breakdown
  });
});

// Get general admission availability for non-numbered venues
router.get('/:id/general-admission-availability', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { sessions: Session, shows: Show, tickets: Ticket } = sequelize.models;
    
    // Get session and show info
    const session = await Session.findByPk(sessionId, {
      include: [{ model: Show, as: 'show' }]
    });
    
    if (!session) {
      return res.status(404).json({ error: 'session_not_found', message: 'Sesión no encontrada' });
    }
    
    // Check if this is a general admission venue
    if (session.show.venue_type === 'sala_principal') {
      return res.status(400).json({ 
        error: 'invalid_venue_type', 
        message: 'Esta sesión no es de entrada general' 
      });
    }
    
    // Get capacity (from session override or show default)
    const capacity = session.capacity_override || session.show.general_capacity;
    
    if (!capacity) {
      return res.status(500).json({ 
        error: 'capacity_not_configured', 
        message: 'Capacidad no configurada para esta sesión' 
      });
    }
    
    // Count sold+validated tickets for this session (validated tickets are still consumed capacity)
    const soldCount = await Ticket.count({
      where: {
        session_id: sessionId,
        type: 'general',
        status: { [Op.in]: ['sold', 'validated'] }
      }
    });
    
    const available = Math.max(0, capacity - soldCount);
    
    res.json({
      capacity,
      sold: soldCount,
      available
    });
  } catch (error) {
    console.error('[SESSIONS] Error getting general admission availability:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al obtener disponibilidad' });
  }
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
    const { show_id, starts_at, capacity_override, pricing_json, palcos_individual_seats } = req.body;
    
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
      pricing_json: pricing_json || null,
      palcos_individual_seats: palcos_individual_seats !== undefined ? palcos_individual_seats : null
    });
    
    // Note: Pricing rules are now managed only at session level, not copied from show
    
    res.status(201).json(session);
  } catch (error) {
    console.error('[SESSIONS] Error creating session:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al crear sesión' });
  }
});

// Update a session (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Session = sequelize.models.sessions;
    const Show = sequelize.models.shows;
    const { starts_at, capacity_override, pricing_json, palcos_individual_seats } = req.body;
    
    const session = await Session.findByPk(req.params.id, {
      include: [{ model: Show, as: 'show' }]
    });
    
    if (!session) {
      return res.status(404).json({ error: 'not_found', message: 'Sesión no encontrada' });
    }
    
    // Build update object
    const updateData = {};
    
    if (starts_at) {
      const duration_minutes = session.show?.duration_minutes || 120;
      const startsAt = new Date(starts_at);
      const endsAt = new Date(startsAt.getTime() + duration_minutes * 60000);
      updateData.starts_at = startsAt;
      updateData.ends_at = endsAt;
    }
    
    if (capacity_override !== undefined) {
      updateData.capacity_override = capacity_override || null;
    }
    
    if (pricing_json !== undefined) {
      updateData.pricing_json = pricing_json || null;
    }
    
    if (palcos_individual_seats !== undefined) {
      updateData.palcos_individual_seats = palcos_individual_seats;
    }
    
    await session.update(updateData);
    
    res.json(session);
  } catch (error) {
    console.error('[SESSIONS] Error updating session:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al actualizar sesión' });
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

// TEMPORARY DEBUG ENDPOINT - Check pricing rules for a show
router.get('/debug/pricing/:showId', async (req, res) => {
  try {
    const { showId } = req.params;
    const { seat_pricing: SeatPricing } = sequelize.models;
    const Show = sequelize.models.shows;
    
    const show = await Show.findByPk(showId);
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    // Get all pricing rules for this show
    const rules = await SeatPricing.findAll({
      where: { show_id: showId }
    });
    
    // Get tickets with $20000 price for palcos bajos
    const { QueryTypes } = require('sequelize');
    const tickets = await sequelize.query(
      `SELECT t.id, t.seat_code, t.section, t.price, t.status, t.created_at, t.sale_id
       FROM tickets t
       JOIN sessions ss ON t.session_id = ss.id
       WHERE ss.show_id = :showId
         AND t.section = 'palcos_bajos'
         AND t.price = 20000
         AND t.status IN ('sold', 'validated')
       ORDER BY t.created_at DESC
       LIMIT 20`,
      {
        replacements: { showId },
        type: QueryTypes.SELECT
      }
    );
    
    res.json({
      show: {
        id: show.id,
        title: show.title,
        pricing_json: show.pricing_json
      },
      pricing_rules: rules,
      tickets_with_20000: tickets
    });
  } catch (error) {
    console.error('[DEBUG] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
