// Force Argentina timezone for all date operations on this server
process.env.TZ = 'America/Argentina/Buenos_Aires';

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env.local en desarrollo, .env en producción
const envFile = process.env.NODE_ENV === 'development' ? '.env.local' : '.env';
dotenv.config({ path: join(__dirname, '..', envFile) });
console.log(`[ENV] Loaded ${envFile}`);

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { initSequelize, sequelize } from './lib/sequelize.js';
import registerModels from './models/registerModels.js';
import apiRouter from './routes/index.js';
import dayjs from 'dayjs';
import { Op } from 'sequelize';
import { scheduleDailySalesEmail } from './lib/dailySalesReport.js';
import { attemptSipagoFinalizationForReservation, reconcileSipagoAttempts } from './routes/payments.js';

// Inicializar Sequelize DESPUÉS de cargar dotenv
const sequelizeInstance = initSequelize();
registerModels(sequelizeInstance);

const app = express();
const server = http.createServer(app);
// Build allowed origins list: support comma-separated CORS_ORIGIN plus FRONTEND_URL and APP_URL
const normalizeOrigin = (o) => (o || '').replace(/\/$/, '');
const parseOrigins = (raw) =>
  (raw || '')
    .split(',')
    .map((s) => normalizeOrigin(s.trim()))
    .filter(Boolean);

const envOrigins = parseOrigins(process.env.CORS_ORIGIN);
const extraOrigins = [process.env.FRONTEND_URL, process.env.APP_URL]
  .filter(Boolean)
  .map(normalizeOrigin);
const allowedOrigins = Array.from(new Set([...envOrigins, ...extraOrigins]));
if (allowedOrigins.length === 0) {
  // default to localhost:5173 if nothing provided
  allowedOrigins.push('http://localhost:5173');
}
console.log('[CORS] allowed origins:', allowedOrigins);

const isNgrok = (o) => /https?:\/\/[^\s]+\.ngrok(-free)?\.(dev|io)$/i.test(o);
const originAllowed = (o) => {
  const n = normalizeOrigin(o);
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(n)) return true;
  if (isNgrok(n)) return true; // allow any ngrok domain in dev
  return false;
};

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (originAllowed(origin)) return callback(null, true);
      console.warn('[CORS][socket.io] denied origin:', origin, 'allowed:', allowedOrigins);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST']
  }
});

app.use(cors({
  origin: (origin, callback) => {
    // Safari y otros navegadores pueden enviar undefined para same-origin requests
    if (!origin) return callback(null, true);
    if (originAllowed(origin)) return callback(null, true);
    console.warn('[CORS][express] denied origin:', origin, 'allowed:', allowedOrigins);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: false, // Cambiado a false porque usamos JWT en headers, no cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-socket-id', 'Cache-Control', 'Pragma'],
  exposedHeaders: ['Content-Length', 'X-JSON', 'Content-Type'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Handle preflight requests explicitly (importante para Safari)
app.options('*', cors());

// Servir archivos estáticos de media
app.use('/media', express.static(join(__dirname, '../media')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Aplicar express.json() condicionalmente (skip para upload endpoints)
app.use((req, res, next) => {
  // No parsear JSON para endpoints de upload
  if (req.path.includes('/upload')) {
    return next();
  }
  express.json({ limit: '10mb' })(req, res, next);
});

app.set('io', io);

app.use('/api', apiRouter);

scheduleDailySalesEmail();

// Socket namespaces for seats
io.on('connection', (socket) => {
  // session tracking for this socket
  socket.data.sessionId = null;
  // In-memory Pullman state per session
  // { capacity: number, heldBySocket: Map<socketId, number> }
  const pullmanState = io.pullmanState || (io.pullmanState = new Map());
  // In-memory seat holds per session: Map(sessionId => Map(seatId => socketId))
  const seatHolds = io.seatHolds || (io.seatHolds = new Map());
  // In-memory palco holds per session: Map(sessionId => Map(palcoLabel => socketId))
  const palcoHolds = io.palcoHolds || (io.palcoHolds = new Map());
  const getBlockedGeneral = (sessionId) => io.blockedGeneral?.get(sessionId) || 0;

  socket.on('join_session', async (data) => {
    const sessionId = typeof data === 'string' ? data : data.sessionId;
    const userId = typeof data === 'object' ? data.userId : null;
    const guestId = typeof data === 'object' ? data.guestId : null;
    
    socket.join(`session:${sessionId}`);
    socket.data.sessionId = sessionId;
    socket.data.userId = userId;
    socket.data.guestId = guestId; // Track guest identifier for reconnection
    
    // Reload sold tickets from DB for this session (to sync with DB state)
    try {
      const { tickets: Ticket } = sequelize.models;
      const soldTickets = await Ticket.findAll({
        where: {
          session_id: sessionId,
          status: { [Op.in]: ['sold', 'validated'] }
        },
        attributes: ['type', 'seat_code']
      });

      // Update sold seats/palcos/general admission in memory
      if (!io.soldSeats) io.soldSeats = new Map();
      if (!io.soldPalcos) io.soldPalcos = new Map();
      if (!io.pullmanSold) io.pullmanSold = new Map();

      const seats = new Set();
      const palcos = new Set();
      let pullmanCount = 0;

      for (const t of soldTickets) {
        if (t.type === 'butaca' && t.seat_code) seats.add(t.seat_code);
        if (t.type === 'palco' && t.seat_code) palcos.add(t.seat_code);
        // For capacity-based sections (pullman and general admission), each ticket consumes 1 slot
        if (t.type === 'pullman' || t.type === 'general') pullmanCount++;
      }

      io.soldSeats.set(sessionId, seats);
      io.soldPalcos.set(sessionId, palcos);
      io.pullmanSold.set(sessionId, pullmanCount);
    } catch (err) {
      console.error('[Socket] Error reloading sold tickets:', err);
    }
    
    // init pullman state if missing (get capacity from session/show)
    if (!pullmanState.has(sessionId)) {
      try {
        const { sessions: Session, shows: Show } = sequelize.models;
        const session = await Session.findByPk(sessionId, {
          include: [{ model: Show, as: 'show' }]
        });
        
        // Use general_capacity from show, fallback to 92 if not found
        const capacity = session?.show?.general_capacity || 92;
        pullmanState.set(sessionId, { capacity, heldBySocket: new Map() });
        console.log(`[Socket] Initialized pullman state for session ${sessionId} with capacity ${capacity}`);
      } catch (err) {
        console.error('[Socket] Error loading session capacity:', err);
        pullmanState.set(sessionId, { capacity: 92, heldBySocket: new Map() });
      }
    }
    
    // Clean up orphaned holds from disconnected sockets
    const st = pullmanState.get(sessionId);
    const connectedSockets = await io.in(`session:${sessionId}`).fetchSockets();
    const connectedIds = new Set(connectedSockets.map(s => s.id));
    
    for (const [socketId] of st.heldBySocket.entries()) {
      if (!connectedIds.has(socketId)) {
        console.log(`[Socket] Cleaning orphaned pullman hold from ${socketId}`);
        st.heldBySocket.delete(socketId);
      }
    }
    
    const totalHeld = Array.from(st.heldBySocket.values()).reduce((a,b)=>a+b,0);
    const soldCount = io.pullmanSold?.get(sessionId) || 0;
    const blockedCount = getBlockedGeneral(sessionId);
    const available = Math.max(0, st.capacity - totalHeld - soldCount - blockedCount);
    console.log(`[Socket] User joined session ${sessionId}: capacity=${st.capacity}, totalHeld=${totalHeld}, sold=${soldCount}, blocked=${blockedCount}, available=${available}`);
    socket.emit('pullman_updated', { available, capacity: st.capacity });

    // ensure seat holds map exists
    if (!seatHolds.has(sessionId)) seatHolds.set(sessionId, new Map());
    if (!palcoHolds.has(sessionId)) palcoHolds.set(sessionId, new Map());
    
    // Clean orphan holds - release holds from disconnected sockets ONLY if they are NOT covered by an active reservation
    // This prevents releasing seats while another user is actively paying for them.
    try {
      const { reservations: Reservation } = sequelize.models;
      const now = dayjs().toDate();
      const actives = await Reservation.findAll({
        where: { session_id: sessionId, status: 'active', expires_at: { [Op.gt]: now } },
        attributes: ['id', 'items']
      });
      const isSeatKept = (seatId) => actives.some(r => Array.isArray(r.items) && r.items.some(it => it.type === 'butaca' && it.seat_code === seatId));
      const isPalcoKept = (palco) => actives.some(r => Array.isArray(r.items) && r.items.some(it => it.type === 'palco' && it.seat_code === palco));
      console.log(`[Socket][join_session] Active reservations loaded: ${actives.length} for session ${sessionId}`);

      const seatMap = seatHolds.get(sessionId);
      const palcoMap = palcoHolds.get(sessionId);
      const toRelease = [];
      const toReleasePalcos = [];
      
      // Release holds from disconnected sockets only if not covered by an active reservation
      for (const [seatId, hold] of seatMap.entries()) {
        const holderSocketId = typeof hold === 'string' ? hold : hold?.socketId;
        const holderSocket = io.sockets.sockets.get(holderSocketId);
        if (!holderSocket && !isSeatKept(seatId)) {
          toRelease.push(seatId);
        }
      }
      
      for (const [palco, hold] of palcoMap.entries()) {
        const holderSocketId = typeof hold === 'string' ? hold : hold?.socketId;
        const holderSocket = io.sockets.sockets.get(holderSocketId);
        if (!holderSocket && !isPalcoKept(palco)) {
          toReleasePalcos.push(palco);
        }
      }
      
      // Release orphan holds and notify all users in session
      for (const seatId of toRelease) {
        seatMap.delete(seatId);
        io.to(`session:${sessionId}`).emit('seat_released', { seatId, by: 'system', reason: 'orphan_cleanup' });
      }
      for (const palco of toReleasePalcos) {
        palcoMap.delete(palco);
        io.to(`session:${sessionId}`).emit('palco_released', { palco, by: 'system', reason: 'orphan_cleanup' });
      }
      
      if (toRelease.length > 0 || toReleasePalcos.length > 0) {
        console.log(`[Socket][join_session] Cleaned and broadcast ${toRelease.length} orphan seat holds and ${toReleasePalcos.length} orphan palco holds (kept by active reservations: ${actives.length})`);
      }
    } catch (err) {
      console.error('[Socket][join_session] Error cleaning orphan holds:', err);
    }
  });

  // Toggle palco hold (PA/PB packs)
  // Hold structure: { socketId, guestId, userId }
  socket.on('palco_toggle', ({ sessionId, palco }) => {
    if (!palco) return;
    if (!palcoHolds.has(sessionId)) palcoHolds.set(sessionId, new Map());
    const holds = palcoHolds.get(sessionId);
    const holder = holds.get(palco);
    const myGuestId = socket.data.guestId;
    const myUserId = socket.data.userId;
    
    if (!holder) {
      holds.set(palco, { socketId: socket.id, guestId: myGuestId, userId: myUserId });
      io.to(`session:${sessionId}`).emit('palco_held', { palco, by: socket.id, guestId: myGuestId });
    } else if (holder.socketId === socket.id || (myGuestId && holder.guestId === myGuestId) || (myUserId && holder.userId === myUserId)) {
      holds.delete(palco);
      io.to(`session:${sessionId}`).emit('palco_released', { palco, by: socket.id });
    } else {
      socket.emit('palco_denied', { palco, reason: 'held_by_other' });
    }
  });

  // Cancel reservation: delete from DB and release all holds
  socket.on('cancel_reservation', async ({ reservationId }) => {
    try {
      const { reservations: Reservation } = sequelize.models;
      const reservation = await Reservation.findByPk(reservationId);
      
      if (!reservation) {
        socket.emit('cancel_reservation_error', { error: 'Reservation not found' });
        return;
      }
      
      const sessionId = reservation.session_id;
      const items = Array.isArray(reservation.items) ? reservation.items : [];
      const myGuestId = socket.data.guestId;
      const myUserId = socket.data.userId;
      
      // Mark reservation as canceled
      await reservation.update({ status: 'canceled' });
      
      // Release all holds
      const seatMap = seatHolds.get(sessionId);
      const palcoMap = palcoHolds.get(sessionId);
      
      if (seatMap) {
        for (const item of items) {
          if (item.type === 'butaca' && item.seat_code) {
            seatMap.delete(item.seat_code);
            io.to(`session:${sessionId}`).emit('seat_released', { seatId: item.seat_code, by: socket.id });
          }
        }
      }
      
      if (palcoMap) {
        for (const item of items) {
          if (item.type === 'palco' && item.seat_code) {
            palcoMap.delete(item.seat_code);
            io.to(`session:${sessionId}`).emit('palco_released', { palco: item.seat_code, by: socket.id });
          }
        }
      }
      
      // Clear pullman if any
      const st = pullmanState.get(sessionId);
      if (st && st.heldBySocket.has(socket.id)) {
        st.heldBySocket.set(socket.id, 0);
        const soldCount = io.pullmanSold?.get(sessionId) || 0;
        const blockedCount = getBlockedGeneral(sessionId);
        const newTotal = Array.from(st.heldBySocket.values()).reduce((a,b)=>a+b,0);
        const available = Math.max(0, st.capacity - newTotal - soldCount - blockedCount);
        io.to(`session:${sessionId}`).emit('pullman_updated', { available, capacity: st.capacity });
      }
      
      // ALSO release ALL holds by this socket (safety net - ensures nothing is left behind)
      // This covers cases where items array doesn't match actual holds
      if (seatMap) {
        const seatsToRelease = [];
        for (const [seatId, holder] of seatMap.entries()) {
          const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
          const holderGuestId = typeof holder === 'object' ? holder?.guestId : null;
          const holderUserId = typeof holder === 'object' ? holder?.userId : null;
          if (holderSocketId === socket.id || (myGuestId && holderGuestId === myGuestId) || (myUserId && holderUserId === myUserId)) {
            seatsToRelease.push(seatId);
          }
        }
        for (const seatId of seatsToRelease) {
          seatMap.delete(seatId);
          io.to(`session:${sessionId}`).emit('seat_released', { seatId, by: socket.id, reason: 'cancel_reservation' });
        }
        if (seatsToRelease.length > 0) {
          console.log(`[Socket] Released ${seatsToRelease.length} additional seats held by socket`);
        }
      }
      
      if (palcoMap) {
        const palcosToRelease = [];
        for (const [palco, holder] of palcoMap.entries()) {
          const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
          const holderGuestId = typeof holder === 'object' ? holder?.guestId : null;
          const holderUserId = typeof holder === 'object' ? holder?.userId : null;
          if (holderSocketId === socket.id || (myGuestId && holderGuestId === myGuestId) || (myUserId && holderUserId === myUserId)) {
            palcosToRelease.push(palco);
          }
        }
        for (const palco of palcosToRelease) {
          palcoMap.delete(palco);
          io.to(`session:${sessionId}`).emit('palco_released', { palco, by: socket.id, reason: 'cancel_reservation' });
        }
        if (palcosToRelease.length > 0) {
          console.log(`[Socket] Released ${palcosToRelease.length} additional palcos held by socket`);
        }
      }
      
      socket.emit('cancel_reservation_success', { reservationId });
      console.log(`[Socket] Reservation ${reservationId} cancelled and holds released`);
    } catch (err) {
      console.error('[Socket] Error cancelling reservation:', err);
      socket.emit('cancel_reservation_error', { error: err.message });
    }
  });

  // Clear all seats held by this socket in a session
  // Hold structure: { socketId, guestId, userId } or legacy string
  socket.on('seat_clear', ({ sessionId }) => {
    const holds = seatHolds.get(sessionId);
    if (!holds) return;
    const toRelease = [];
    const myGuestId = socket.data.guestId;
    const myUserId = socket.data.userId;
    for (const [seatId, holder] of holds.entries()) {
      const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
      const holderGuestId = typeof holder === 'object' ? holder?.guestId : null;
      const holderUserId = typeof holder === 'object' ? holder?.userId : null;
      if (holderSocketId === socket.id || (myGuestId && holderGuestId === myGuestId) || (myUserId && holderUserId === myUserId)) {
        toRelease.push(seatId);
      }
    }
    for (const seatId of toRelease) {
      holds.delete(seatId);
      io.to(`session:${sessionId}`).emit('seat_released', { seatId, by: socket.id });
    }
  });

  // Clear all palcos held by this socket in a session
  // Hold structure: { socketId, guestId, userId } or legacy string
  socket.on('palco_clear', ({ sessionId }) => {
    const holds = palcoHolds.get(sessionId);
    if (!holds) return;
    const toRelease = [];
    const myGuestId = socket.data.guestId;
    const myUserId = socket.data.userId;
    for (const [palco, holder] of holds.entries()) {
      const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
      const holderGuestId = typeof holder === 'object' ? holder?.guestId : null;
      const holderUserId = typeof holder === 'object' ? holder?.userId : null;
      if (holderSocketId === socket.id || (myGuestId && holderGuestId === myGuestId) || (myUserId && holderUserId === myUserId)) {
        toRelease.push(palco);
      }
    }
    for (const palco of toRelease) {
      holds.delete(palco);
      io.to(`session:${sessionId}`).emit('palco_released', { palco, by: socket.id });
    }
  });

  // Toggle seat hold
  // Hold structure: { socketId, guestId, userId }
  socket.on('seat_toggle', ({ sessionId, seatId }) => {
    if (!seatHolds.has(sessionId)) seatHolds.set(sessionId, new Map());
    const holds = seatHolds.get(sessionId);
    const holder = holds.get(seatId);
    const myGuestId = socket.data.guestId;
    const myUserId = socket.data.userId;
    
    if (!holder) {
      // hold seat
      holds.set(seatId, { socketId: socket.id, guestId: myGuestId, userId: myUserId });
      io.to(`session:${sessionId}`).emit('seat_held', { seatId, by: socket.id, guestId: myGuestId });
    } else if (holder.socketId === socket.id || (myGuestId && holder.guestId === myGuestId) || (myUserId && holder.userId === myUserId)) {
      // release by same socket/guest/user
      holds.delete(seatId);
      io.to(`session:${sessionId}`).emit('seat_released', { seatId, by: socket.id });
    } else {
      // held by someone else
      socket.emit('seat_denied', { seatId, reason: 'held_by_other' });
    }
  });

  // Pullman change: delta = +1 | -1
  socket.on('pullman_change', ({ sessionId, delta }) => {
    if (!pullmanState.has(sessionId)) return;
    const st = pullmanState.get(sessionId);
    const soldCount = io.pullmanSold?.get(sessionId) || 0;
    const blockedCount = getBlockedGeneral(sessionId);
    const current = st.heldBySocket.get(socket.id) || 0;
    const totalHeldExcludingMe = Array.from(st.heldBySocket.entries())
      .filter(([sid]) => sid !== socket.id)
      .reduce((a, [, v]) => a + v, 0);
    const maxForMe = Math.max(0, st.capacity - totalHeldExcludingMe - soldCount - blockedCount);
    let desired = current + (delta > 0 ? 1 : delta < 0 ? -1 : 0);
    desired = Math.max(0, Math.min(maxForMe, desired));
    if (desired === current) {
      const availableNoChange = Math.max(0, st.capacity - (totalHeldExcludingMe + current) - soldCount - blockedCount);
      socket.emit('pullman_confirmed', { selected: current, available: availableNoChange, capacity: st.capacity });
      return;
    }
    st.heldBySocket.set(socket.id, desired);
    const newTotal = totalHeldExcludingMe + desired;
    const available = Math.max(0, st.capacity - newTotal - soldCount - blockedCount);
    // confirm current user's count
    socket.emit('pullman_confirmed', { selected: desired, available, capacity: st.capacity });
    // broadcast availability to all in session
    io.to(`session:${sessionId}`).emit('pullman_updated', { available, capacity: st.capacity });
  });

  socket.on('pullman_clear', ({ sessionId }) => {
    if (!pullmanState.has(sessionId)) return;
    const st = pullmanState.get(sessionId);
    if (st.heldBySocket.has(socket.id)) {
      st.heldBySocket.set(socket.id, 0);
      const soldCount = io.pullmanSold?.get(sessionId) || 0;
      const blockedCount = getBlockedGeneral(sessionId);
      const newTotal = Array.from(st.heldBySocket.values()).reduce((a,b)=>a+b,0);
      const available = Math.max(0, st.capacity - newTotal - soldCount - blockedCount);
      socket.emit('pullman_confirmed', { selected: 0, available, capacity: st.capacity });
      io.to(`session:${sessionId}`).emit('pullman_updated', { available, capacity: st.capacity });
    }
  });

  socket.on('disconnect', async () => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) return;
    console.log(`[Socket][disconnect] Socket ${socket.id} disconnecting from session ${sessionId}`);
    const st = pullmanState.get(sessionId);
    if (!st) return;
    if (st.heldBySocket.has(socket.id)) {
      st.heldBySocket.delete(socket.id);
      const soldCount = io.pullmanSold?.get(sessionId) || 0;
      const blockedCount = getBlockedGeneral(sessionId);
      const newTotal = Array.from(st.heldBySocket.values()).reduce((a,b)=>a+b,0);
      const available = Math.max(0, st.capacity - newTotal - soldCount - blockedCount);
      io.to(`session:${sessionId}`).emit('pullman_updated', { available, capacity: st.capacity });
    }

    // Load active reservations once to decide which holds must survive payment/navigation
    let actives = [];
    try {
      const { reservations: Reservation } = sequelize.models;
      const now = dayjs().toDate();
      actives = await Reservation.findAll({
        where: { session_id: sessionId, status: 'active', expires_at: { [Op.gt]: now } },
        attributes: ['id', 'items']
      });
      console.log(`[Socket][disconnect] Found ${actives.length} active reservations for session ${sessionId}`);
    } catch (err) {
      console.error('[Socket][disconnect] Error loading active reservations:', err);
    }
    const isSeatKept = (seatId) => actives.some(r => Array.isArray(r.items) && r.items.some(it => it.type === 'butaca' && it.seat_code === seatId));
    const isPalcoKept = (palco) => actives.some(r => Array.isArray(r.items) && r.items.some(it => it.type === 'palco' && it.seat_code === palco));

    // Release all seats held by this socket that are NOT covered by an active reservation
    const holds = seatHolds.get(sessionId);
    if (holds) {
      const toRelease = [];
      for (const [seatId, holder] of holds.entries()) {
        const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
        if (holderSocketId === socket.id && !isSeatKept(seatId)) {
          toRelease.push(seatId);
        }
      }
      for (const seatId of toRelease) {
        holds.delete(seatId);
        io.to(`session:${sessionId}`).emit('seat_released', { seatId, by: socket.id, reason: 'disconnect' });
      }
      if (toRelease.length > 0) {
        console.log(`[Socket][disconnect] Released ${toRelease.length} seats not covered by active reservations`);
      }
      const kept = [];
      for (const [seatId, holder] of holds.entries()) {
        const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
        if (holderSocketId === socket.id && isSeatKept(seatId)) {
          kept.push(seatId);
        }
      }
      if (kept.length > 0) {
        console.log(`[Socket][disconnect] Kept ${kept.length} seats covered by active reservations`, kept);
      }
    }

    // Release all palcos held by this socket that are NOT covered by an active reservation
    const pHolds = palcoHolds.get(sessionId);
    if (pHolds) {
      const toReleasePalcos = [];
      for (const [palco, holder] of pHolds.entries()) {
        const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
        if (holderSocketId === socket.id && !isPalcoKept(palco)) {
          toReleasePalcos.push(palco);
        }
      }
      for (const palco of toReleasePalcos) {
        pHolds.delete(palco);
        io.to(`session:${sessionId}`).emit('palco_released', { palco, by: socket.id, reason: 'disconnect' });
      }
      if (toReleasePalcos.length > 0) {
        console.log(`[Socket][disconnect] Released ${toReleasePalcos.length} palcos not covered by active reservations`);
      }
      const keptPalcos = [];
      for (const [palco, holder] of pHolds.entries()) {
        const holderSocketId = typeof holder === 'string' ? holder : holder?.socketId;
        if (holderSocketId === socket.id && isPalcoKept(palco)) {
          keptPalcos.push(palco);
        }
      }
      if (keptPalcos.length > 0) {
        console.log(`[Socket][disconnect] Kept ${keptPalcos.length} palcos covered by active reservations`, keptPalcos);
      }
    }
  });
});

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    // Load sold tickets from DB into memory on startup
    const { tickets: Ticket } = sequelize.models;
    try {
      io.soldSeats = io.soldSeats || new Map();
      io.soldPalcos = io.soldPalcos || new Map();
      io.pullmanSold = io.pullmanSold || new Map();
      
      const soldTickets = await Ticket.findAll({
        where: {
          status: { [Op.in]: ['sold', 'validated'] }
        },
        attributes: ['session_id', 'type', 'seat_code']
      });
      
      // Group by session
      const sessionMap = new Map();
      for (const t of soldTickets) {
        if (!sessionMap.has(t.session_id)) {
          sessionMap.set(t.session_id, { seats: new Set(), palcos: new Set(), pullman: 0 });
        }
        const s = sessionMap.get(t.session_id);
        if (t.type === 'butaca' && t.seat_code) s.seats.add(t.seat_code);
        if (t.type === 'palco' && t.seat_code) s.palcos.add(t.seat_code);
        if (t.type === 'pullman' || t.type === 'general') s.pullman++;
      }
      
      // Populate io maps
      for (const [sessionId, data] of sessionMap.entries()) {
        io.soldSeats.set(sessionId, data.seats);
        io.soldPalcos.set(sessionId, data.palcos);
        io.pullmanSold.set(sessionId, data.pullman);
      }
      
      console.log(`[STARTUP] Loaded ${soldTickets.length} sold tickets from DB into memory`);
    } catch (err) {
      console.error('[STARTUP] Error loading sold tickets:', err);
    }

    // Load blocked seats from DB into memory on startup
    try {
      const { seat_blocks: SeatBlock } = sequelize.models;
      io.blockedSeats = io.blockedSeats || new Map();
      io.blockedPalcos = io.blockedPalcos || new Map();
      io.blockedGeneral = io.blockedGeneral || new Map();
      
      const blocks = await SeatBlock.findAll();
      
      for (const block of blocks) {
        const sessionId = block.session_id;
        
        if (block.block_type === 'butaca') {
          if (!io.blockedSeats.has(sessionId)) io.blockedSeats.set(sessionId, new Set());
          io.blockedSeats.get(sessionId).add(block.seat_code);
        } else if (block.block_type === 'palco') {
          if (!io.blockedPalcos.has(sessionId)) io.blockedPalcos.set(sessionId, new Set());
          io.blockedPalcos.get(sessionId).add(block.seat_code);
        } else if (block.block_type === 'general') {
          io.blockedGeneral.set(sessionId, (io.blockedGeneral.get(sessionId) || 0) + block.quantity);
        }
      }
      
      console.log(`[STARTUP] Loaded ${blocks.length} seat blocks from DB into memory`);
    } catch (err) {
      console.error('[STARTUP] Error loading seat blocks:', err);
    }

    const SIPAGO_EXPIRY_VERIFICATION_GRACE_MS = Number(process.env.SIPAGO_EXPIRY_VERIFICATION_GRACE_MINUTES || 2) * 60 * 1000;
    const SIPAGO_RECONCILE_INTERVAL_MS = Number(process.env.SIPAGO_RECONCILE_INTERVAL_MS || 120000);

    // Simple expiry worker for reservations: runs every 15s
    const { reservations: Reservation } = sequelize.models;
    setInterval(async () => {
      try {
        const now = dayjs().toDate();
        const expired = await Reservation.findAll({ where: { status: 'active', expires_at: { [Op.lt]: now } } });
        for (const r of expired) {
          // Before releasing an expired reservation, check for a pending SiPago attempt.
          // If the provider reports SUCCESS, finalize it. If verification is temporarily
          // unavailable, hold the reservation for a bounded grace period.
          try {
            const sipagoResult = await attemptSipagoFinalizationForReservation(r, io);
            if (sipagoResult?.finalized) {
              console.log(`[Worker] Reservation ${r.id} finalized by provider check, sale_id: ${sipagoResult.sale_id}`);
              continue;
            }
            if (sipagoResult?.status === 'verification_unavailable') {
              const expiredAgo = Date.now() - new Date(r.expires_at).getTime();
              if (expiredAgo < SIPAGO_EXPIRY_VERIFICATION_GRACE_MS) {
                console.log(`[Worker] Reservation ${r.id} verification temporarily unavailable, skipping expiry (grace period)`);
                continue;
              }
              console.log(`[Worker] Reservation ${r.id} verification unavailable but grace period expired, proceeding to expire`);
            }
          } catch (checkErr) {
            console.error(`[Worker] Error checking SiPago for reservation ${r.id}:`, checkErr);
          }

          await r.update({ status: 'expired' });
          
          // Release holds for expired reservation
          const sessionId = r.session_id;
          const items = Array.isArray(r.items) ? r.items : [];
          const seatMap = io.seatHolds?.get(sessionId);
          const palcoMap = io.palcoHolds?.get(sessionId);
          
          if (seatMap) {
            for (const item of items) {
              if (item.type === 'butaca' && item.seat_code) {
                seatMap.delete(item.seat_code);
                io.to(`session:${sessionId}`).emit('seat_released', { seatId: item.seat_code, reason: 'expired' });
              }
            }
          }
          
          if (palcoMap) {
            for (const item of items) {
              if (item.type === 'palco' && item.seat_code) {
                palcoMap.delete(item.seat_code);
                io.to(`session:${sessionId}`).emit('palco_released', { palco: item.seat_code, reason: 'expired' });
              }
            }
          }
          
          io.to(`session:${r.session_id}`).emit('reservation_expired', { reservation_id: r.id });
          console.log(`[Worker] Reservation ${r.id} expired and holds released`);
        }
      } catch (e) {
        console.error('[Worker] Error expiring reservations:', e);
      }
    }, 15000);

    // Periodic reconciliation for pending SiPago attempts: checks provider status
    // and finalizes SUCCESS payments without waiting for the browser to return.
    setInterval(() => {
      reconcileSipagoAttempts(io).catch(err => console.error('[SIPAGO_RECONCILE_WORKER] error', err));
    }, SIPAGO_RECONCILE_INTERVAL_MS);

    const port = process.env.PORT || 4000;
    server.listen(port, () => console.log(`API running on :${port}`));
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
})();
