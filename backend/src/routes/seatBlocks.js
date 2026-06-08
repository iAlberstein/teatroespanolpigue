import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Get all blocks for a session (admin only)
router.get('/session/:sessionId', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { seat_blocks: SeatBlock } = sequelize.models;
    const { sessionId } = req.params;
    
    const blocks = await SeatBlock.findAll({
      where: { session_id: sessionId },
      order: [['blocked_at', 'DESC']]
    });
    
    res.json({ blocks });
  } catch (error) {
    console.error('[SEAT_BLOCKS] Error fetching blocks:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al obtener bloqueos' });
  }
});

// Block seats/palcos (admin only)
router.post('/block', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { seat_blocks: SeatBlock, tickets: Ticket } = sequelize.models;
    const { session_id, items, notes } = req.body;
    const userId = req.user.userId;
    
    if (!session_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'invalid_request', 
        message: 'session_id y items son requeridos' 
      });
    }
    
    const blocked = [];
    const errors = [];
    
    for (const item of items) {
      const { seat_code, block_type = 'butaca', quantity = 1 } = item;
      
      if (!seat_code) {
        errors.push({ seat_code, error: 'seat_code requerido' });
        continue;
      }
      
      // Check if already sold
      const existingTicket = await Ticket.findOne({
        where: {
          session_id,
          seat_code,
          status: 'sold'
        }
      });
      
      if (existingTicket) {
        errors.push({ seat_code, error: 'Ya está vendida' });
        continue;
      }
      
      // Check if already blocked
      const existingBlock = await SeatBlock.findOne({
        where: { session_id, seat_code, block_type }
      });
      
      if (existingBlock) {
        errors.push({ seat_code, error: 'Ya está bloqueada' });
        continue;
      }
      
      // Create block
      const block = await SeatBlock.create({
        session_id,
        seat_code,
        block_type,
        quantity,
        blocked_by: userId,
        notes: notes || null
      });
      
      blocked.push(block);
    }
    
    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      // Add to soldSeats/soldPalcos so they appear as unavailable
      io.blockedSeats = io.blockedSeats || new Map();
      io.blockedPalcos = io.blockedPalcos || new Map();
      
      if (!io.blockedSeats.has(session_id)) io.blockedSeats.set(session_id, new Set());
      if (!io.blockedPalcos.has(session_id)) io.blockedPalcos.set(session_id, new Set());
      
      for (const block of blocked) {
        if (block.block_type === 'palco') {
          io.blockedPalcos.get(session_id).add(block.seat_code);
          io.to(`session:${session_id}`).emit('palco_blocked', { palco: block.seat_code });
        } else if (block.block_type === 'butaca') {
          io.blockedSeats.get(session_id).add(block.seat_code);
          io.to(`session:${session_id}`).emit('seat_blocked', { seatId: block.seat_code });
        }
      }
    }
    
    res.json({ 
      success: true, 
      blocked: blocked.length,
      errors: errors.length > 0 ? errors : undefined,
      items: blocked
    });
  } catch (error) {
    console.error('[SEAT_BLOCKS] Error blocking seats:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al bloquear asientos' });
  }
});

// Unblock seats/palcos (admin only)
router.post('/unblock', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { seat_blocks: SeatBlock } = sequelize.models;
    const { session_id, items } = req.body;
    
    if (!session_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'invalid_request', 
        message: 'session_id y items son requeridos' 
      });
    }
    
    const unblocked = [];
    const errors = [];
    
    for (const item of items) {
      const { seat_code, block_type = 'butaca' } = item;
      
      if (!seat_code) {
        errors.push({ seat_code, error: 'seat_code requerido' });
        continue;
      }
      
      // Find and delete block
      const block = await SeatBlock.findOne({
        where: { session_id, seat_code, block_type }
      });
      
      if (!block) {
        errors.push({ seat_code, error: 'No está bloqueada' });
        continue;
      }
      
      await block.destroy();
      unblocked.push({ seat_code, block_type });
    }
    
    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.blockedSeats = io.blockedSeats || new Map();
      io.blockedPalcos = io.blockedPalcos || new Map();
      
      for (const item of unblocked) {
        if (item.block_type === 'palco') {
          io.blockedPalcos.get(session_id)?.delete(item.seat_code);
          io.to(`session:${session_id}`).emit('palco_unblocked', { palco: item.seat_code });
        } else if (item.block_type === 'butaca') {
          io.blockedSeats.get(session_id)?.delete(item.seat_code);
          io.to(`session:${session_id}`).emit('seat_unblocked', { seatId: item.seat_code });
        }
      }
    }
    
    res.json({ 
      success: true, 
      unblocked: unblocked.length,
      errors: errors.length > 0 ? errors : undefined,
      items: unblocked
    });
  } catch (error) {
    console.error('[SEAT_BLOCKS] Error unblocking seats:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al desbloquear asientos' });
  }
});

// Helper to emit pullman availability updates after blocking/unblocking general admission
const emitPullmanUpdate = (io, session_id) => {
  if (!io) return;
  io.pullmanState = io.pullmanState || new Map();
  io.pullmanSold = io.pullmanSold || new Map();
  io.blockedGeneral = io.blockedGeneral || new Map();

  const pull = io.pullmanState.get(session_id) || { capacity: 92, heldBySocket: new Map() };
  const capacity = pull.capacity || 92;
  const heldValues = pull.heldBySocket instanceof Map
    ? Array.from(pull.heldBySocket.values())
    : Object.values(pull.heldBySocket || {});
  const totalHeld = heldValues.reduce((sum, value) => {
    if (typeof value === 'number') return sum + value;
    if (value && typeof value === 'object' && 'count' in value) {
      return sum + Number(value.count || 0);
    }
    return sum;
  }, 0);
  const soldCount = io.pullmanSold.get(session_id) || 0;
  const blockedCount = io.blockedGeneral.get(session_id) || 0;
  const available = Math.max(0, capacity - totalHeld - soldCount - blockedCount);

  io.to(`session:${session_id}`).emit('pullman_updated', { available, capacity });
};

// Block general admission tickets (admin only)
router.post('/block-general', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { seat_blocks: SeatBlock } = sequelize.models;
    const { session_id, quantity, notes } = req.body;
    const userId = req.user.userId;
    
    if (!session_id || !quantity || quantity < 1) {
      return res.status(400).json({ 
        error: 'invalid_request', 
        message: 'session_id y quantity son requeridos' 
      });
    }
    
    // For general admission, we use a special seat_code
    const seat_code = 'GENERAL_BLOCK';
    const io = req.app.get('io');
    const pull = io?.pullmanState?.get(session_id) || { capacity: 92 };
    const capacity = pull.capacity || 92;
    
    // Check if already has a general block
    let block = await SeatBlock.findOne({
      where: { session_id, seat_code, block_type: 'general' }
    });
    
    if (block) {
      // Update quantity (cap at capacity)
      block.quantity = Math.min(capacity, block.quantity + quantity);
      block.notes = notes || block.notes;
      await block.save();
    } else {
      // Create new block
      block = await SeatBlock.create({
        session_id,
        seat_code,
        block_type: 'general',
        quantity: Math.min(capacity, quantity),
        blocked_by: userId,
        notes: notes || null
      });
    }
    
    // Update in-memory state and emit socket event
    if (io) {
      io.blockedGeneral = io.blockedGeneral || new Map();
      io.blockedGeneral.set(session_id, block.quantity);
      emitPullmanUpdate(io, session_id);
    }
    
    res.json({ 
      success: true, 
      blocked_quantity: block.quantity
    });
  } catch (error) {
    console.error('[SEAT_BLOCKS] Error blocking general admission:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al bloquear entradas generales' });
  }
});

// Unblock general admission tickets (admin only)
router.post('/unblock-general', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { seat_blocks: SeatBlock } = sequelize.models;
    const { session_id, quantity } = req.body;
    
    if (!session_id || !quantity || quantity < 1) {
      return res.status(400).json({ 
        error: 'invalid_request', 
        message: 'session_id y quantity son requeridos' 
      });
    }
    
    const seat_code = 'GENERAL_BLOCK';
    
    const block = await SeatBlock.findOne({
      where: { session_id, seat_code, block_type: 'general' }
    });
    
    if (!block) {
      return res.status(404).json({ 
        error: 'not_found', 
        message: 'No hay bloqueos de entrada general' 
      });
    }
    
    const newQuantity = Math.max(0, block.quantity - quantity);
    
    if (newQuantity <= 0) {
      await block.destroy();
    } else {
      block.quantity = newQuantity;
      await block.save();
    }
    
    // Update in-memory state and emit socket event
    const io = req.app.get('io');
    if (io) {
      io.blockedGeneral = io.blockedGeneral || new Map();
      if (newQuantity <= 0) {
        io.blockedGeneral.delete(session_id);
      } else {
        io.blockedGeneral.set(session_id, newQuantity);
      }
      emitPullmanUpdate(io, session_id);
    }
    
    res.json({ 
      success: true, 
      remaining_blocked: newQuantity
    });
  } catch (error) {
    console.error('[SEAT_BLOCKS] Error unblocking general admission:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al desbloquear entradas generales' });
  }
});

export default router;
