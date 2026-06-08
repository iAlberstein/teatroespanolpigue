import { Router } from 'express';
import { Op } from 'sequelize';
import dayjs from 'dayjs';

const router = Router();

// Clear all holds for a session (admin only)
router.post('/clear-holds/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const io = req.app.get('io');
    
    if (!io) {
      return res.status(500).json({ error: 'Socket.IO not available' });
    }
    
    // Clear seat holds
    if (io.seatHolds && io.seatHolds.has(sessionId)) {
      const seatMap = io.seatHolds.get(sessionId);
      const clearedSeats = Array.from(seatMap.keys());
      seatMap.clear();
      
      // Emit release events
      for (const seatId of clearedSeats) {
        io.to(`session:${sessionId}`).emit('seat_released', { seatId, reason: 'admin_clear' });
      }
      
      console.log(`[Admin] Cleared ${clearedSeats.length} seat holds for session ${sessionId}`);
    }
    
    // Clear palco holds
    if (io.palcoHolds && io.palcoHolds.has(sessionId)) {
      const palcoMap = io.palcoHolds.get(sessionId);
      const clearedPalcos = Array.from(palcoMap.keys());
      palcoMap.clear();
      
      // Emit release events
      for (const palco of clearedPalcos) {
        io.to(`session:${sessionId}`).emit('palco_released', { palco, reason: 'admin_clear' });
      }
      
      console.log(`[Admin] Cleared ${clearedPalcos.length} palco holds for session ${sessionId}`);
    }
    
    // Clear pullman holds
    if (io.pullmanState && io.pullmanState.has(sessionId)) {
      const st = io.pullmanState.get(sessionId);
      st.heldBySocket.clear();
      const soldCount = io.pullmanSold?.get(sessionId) || 0;
      const available = Math.max(0, st.capacity - soldCount);
      io.to(`session:${sessionId}`).emit('pullman_updated', { available, capacity: st.capacity });
      
      console.log(`[Admin] Cleared pullman holds for session ${sessionId}`);
    }
    
    res.json({ success: true, message: 'Holds cleared successfully' });
  } catch (err) {
    console.error('[Admin] Error clearing holds:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reload sold tickets from DB for a session
router.post('/reload-sold/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const io = req.app.get('io');
    const { tickets: Ticket } = req.app.get('sequelize').models;
    
    if (!io) {
      return res.status(500).json({ error: 'Socket.IO not available' });
    }
    
    // Reload from DB
    const soldTickets = await Ticket.findAll({
      where: {
        session_id: sessionId,
        status: { [Op.in]: ['sold', 'validated'] }
      },
      attributes: ['type', 'seat_code']
    });
    
    // Update memory
    if (!io.soldSeats) io.soldSeats = new Map();
    if (!io.soldPalcos) io.soldPalcos = new Map();
    if (!io.pullmanSold) io.pullmanSold = new Map();
    
    const seats = new Set();
    const palcos = new Set();
    let pullmanCount = 0;
    
    for (const t of soldTickets) {
      if (t.type === 'butaca' && t.seat_code) seats.add(t.seat_code);
      if (t.type === 'palco' && t.seat_code) palcos.add(t.seat_code);
      if (t.type === 'pullman') pullmanCount++;
    }
    
    io.soldSeats.set(sessionId, seats);
    io.soldPalcos.set(sessionId, palcos);
    io.pullmanSold.set(sessionId, pullmanCount);
    
    console.log(`[Admin] Reloaded ${soldTickets.length} sold tickets for session ${sessionId}`);
    
    res.json({ 
      success: true, 
      soldTickets: soldTickets.length,
      seats: seats.size,
      palcos: palcos.size,
      pullman: pullmanCount
    });
  } catch (err) {
    console.error('[Admin] Error reloading sold tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

// Clear all holds and reload from DB
router.post('/sync-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Clear holds
    await router.handle({ method: 'POST', url: `/clear-holds/${sessionId}`, params: { sessionId }, app: req.app }, res, () => {});
    
    // Reload sold
    await router.handle({ method: 'POST', url: `/reload-sold/${sessionId}`, params: { sessionId }, app: req.app }, res, () => {});
    
    res.json({ success: true, message: 'Session synchronized with database' });
  } catch (err) {
    console.error('[Admin] Error syncing session:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
