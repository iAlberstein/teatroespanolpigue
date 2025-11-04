import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

console.log('[STARTUP] MP_ACCESS_TOKEN loaded:', !!process.env.MP_ACCESS_TOKEN);

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { sequelize } from './lib/sequelize.js';
import registerModels from './models/registerModels.js';
import apiRouter from './routes/index.js';
import dayjs from 'dayjs';
import { Op } from 'sequelize';

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
    if (!origin) return callback(null, true);
    if (originAllowed(origin)) return callback(null, true);
    console.warn('[CORS][express] denied origin:', origin, 'allowed:', allowedOrigins);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-socket-id'],
  exposedHeaders: ['Content-Length', 'X-JSON'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(express.json());
app.set('io', io);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', apiRouter);

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

  socket.on('join_session', async (data) => {
    const sessionId = typeof data === 'string' ? data : data.sessionId;
    const userId = typeof data === 'object' ? data.userId : null;
    
    socket.join(`session:${sessionId}`);
    socket.data.sessionId = sessionId;
    socket.data.userId = userId;
    
    // init pullman state if missing
    if (!pullmanState.has(sessionId)) {
      pullmanState.set(sessionId, { capacity: 92, heldBySocket: new Map() });
    }
    const st = pullmanState.get(sessionId);
    const totalHeld = Array.from(st.heldBySocket.values()).reduce((a,b)=>a+b,0);
    const available = Math.max(0, st.capacity - totalHeld);
    socket.emit('pullman_updated', { available, capacity: st.capacity });

    // ensure seat holds map exists
    if (!seatHolds.has(sessionId)) seatHolds.set(sessionId, new Map());
    if (!palcoHolds.has(sessionId)) palcoHolds.set(sessionId, new Map());
    
    // Re-asociar holds de reservas activas del usuario
    if (userId) {
      try {
        const { reservations: Reservation } = sequelize.models;
        const now = dayjs().toDate();
        const activeReservations = await Reservation.findAll({
          where: {
            user_id: userId,
            session_id: sessionId,
            status: 'active',
            expires_at: { [Op.gt]: now }
          }
        });
        
        if (activeReservations.length > 0) {
          const reservation = activeReservations[0];
          const items = Array.isArray(reservation.items) ? reservation.items : [];
          const seatMap = seatHolds.get(sessionId);
          const palcoMap = palcoHolds.get(sessionId);
          
          // Re-asociar butacas al nuevo socket (sin emitir eventos individuales)
          for (const it of items) {
            if (it.type === 'butaca' && it.seat_code) {
              seatMap.set(it.seat_code, socket.id);
            }
            if (it.type === 'palco' && it.seat_code) {
              palcoMap.set(it.seat_code, socket.id);
            }
          }
          
          // Emitir la reserva completa al cliente (esto actualiza toda la UI de una vez)
          socket.emit('reservation_restored', reservation);
        }
      } catch (err) {
        console.error('[Socket] Error restoring holds:', err);
      }
    }
  });

  // Toggle palco hold (PA/PB packs)
  socket.on('palco_toggle', ({ sessionId, palco }) => {
    if (!palco) return;
    if (!palcoHolds.has(sessionId)) palcoHolds.set(sessionId, new Map());
    const holds = palcoHolds.get(sessionId);
    const holder = holds.get(palco);
    if (!holder) {
      holds.set(palco, socket.id);
      io.to(`session:${sessionId}`).emit('palco_held', { palco, by: socket.id });
    } else if (holder === socket.id) {
      holds.delete(palco);
      io.to(`session:${sessionId}`).emit('palco_released', { palco, by: socket.id });
    } else {
      socket.emit('palco_denied', { palco, reason: 'held_by_other' });
    }
  });

  // Clear all seats held by this socket in a session
  socket.on('seat_clear', ({ sessionId }) => {
    const holds = seatHolds.get(sessionId);
    if (!holds) return;
    const toRelease = [];
    for (const [seatId, holder] of holds.entries()) {
      if (holder === socket.id) toRelease.push(seatId);
    }
    for (const seatId of toRelease) {
      holds.delete(seatId);
      io.to(`session:${sessionId}`).emit('seat_released', { seatId, by: socket.id });
    }
  });

  // Clear all palcos held by this socket in a session
  socket.on('palco_clear', ({ sessionId }) => {
    const holds = palcoHolds.get(sessionId);
    if (!holds) return;
    const toRelease = [];
    for (const [palco, holder] of holds.entries()) {
      if (holder === socket.id) toRelease.push(palco);
    }
    for (const palco of toRelease) {
      holds.delete(palco);
      io.to(`session:${sessionId}`).emit('palco_released', { palco, by: socket.id });
    }
  });

  // Toggle seat hold
  socket.on('seat_toggle', ({ sessionId, seatId }) => {
    if (!seatHolds.has(sessionId)) seatHolds.set(sessionId, new Map());
    const holds = seatHolds.get(sessionId);
    const holder = holds.get(seatId);
    if (!holder) {
      // hold seat
      holds.set(seatId, socket.id);
      io.to(`session:${sessionId}`).emit('seat_held', { seatId, by: socket.id });
    } else if (holder === socket.id) {
      // release by same socket
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
    const current = st.heldBySocket.get(socket.id) || 0;
    const totalHeldExcludingMe = Array.from(st.heldBySocket.entries())
      .filter(([sid]) => sid !== socket.id)
      .reduce((a, [, v]) => a + v, 0);
    const maxForMe = Math.max(0, st.capacity - totalHeldExcludingMe);
    let desired = current + (delta > 0 ? 1 : delta < 0 ? -1 : 0);
    desired = Math.max(0, Math.min(maxForMe, desired));
    if (desired === current) {
      const availableNoChange = Math.max(0, st.capacity - (totalHeldExcludingMe + current));
      socket.emit('pullman_confirmed', { selected: current, available: availableNoChange, capacity: st.capacity });
      return;
    }
    st.heldBySocket.set(socket.id, desired);
    const newTotal = totalHeldExcludingMe + desired;
    const available = Math.max(0, st.capacity - newTotal);
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
      const newTotal = Array.from(st.heldBySocket.values()).reduce((a,b)=>a+b,0);
      const available = Math.max(0, st.capacity - newTotal);
      socket.emit('pullman_confirmed', { selected: 0, available, capacity: st.capacity });
      io.to(`session:${sessionId}`).emit('pullman_updated', { available, capacity: st.capacity });
    }
  });

  socket.on('disconnect', async () => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) return;
    const st = pullmanState.get(sessionId);
    if (!st) return;
    if (st.heldBySocket.has(socket.id)) {
      st.heldBySocket.delete(socket.id);
      const newTotal = Array.from(st.heldBySocket.values()).reduce((a,b)=>a+b,0);
      const available = Math.max(0, st.capacity - newTotal);
      io.to(`session:${sessionId}`).emit('pullman_updated', { available, capacity: st.capacity });
    }
    // Release all seats held by this socket
    const holds = seatHolds.get(sessionId);
    if (holds) {
      const toRelease = [];
      for (const [seatId, holder] of holds.entries()) {
        if (holder === socket.id) toRelease.push(seatId);
      }
      // check active reservations to persist holds during payment/navigation
      try {
        const { reservations: Reservation } = sequelize.models;
        const now = dayjs().toDate();
        const actives = await Reservation.findAll({ where: { session_id: sessionId, status: 'active', expires_at: { [Op.gt]: now } } });
        for (const seatId of toRelease) {
          const keptByActive = actives.some(r => Array.isArray(r.items) && r.items.some(it => it.type === 'butaca' && it.seat_code === seatId));
          if (keptByActive) {
            // keep hold: do NOT delete or emit release
            continue;
          }
          holds.delete(seatId);
          io.to(`session:${sessionId}`).emit('seat_released', { seatId, by: socket.id });
        }
      } catch {
        // fallback: release all
        for (const seatId of toRelease) {
          holds.delete(seatId);
          io.to(`session:${sessionId}`).emit('seat_released', { seatId, by: socket.id });
        }
      }
    }
    // Release all palcos held by this socket
    const pHolds = palcoHolds.get(sessionId);
    if (pHolds) {
      const toReleasePalcos = [];
      for (const [palco, holder] of pHolds.entries()) {
        if (holder === socket.id) toReleasePalcos.push(palco);
      }
      try {
        const { reservations: Reservation } = sequelize.models;
        const now = dayjs().toDate();
        const actives = await Reservation.findAll({ where: { session_id: sessionId, status: 'active', expires_at: { [Op.gt]: now } } });
        for (const palco of toReleasePalcos) {
          const keptByActive = actives.some(r => Array.isArray(r.items) && r.items.some(it => it.type === 'palco' && it.seat_code === palco));
          if (keptByActive) continue;
          pHolds.delete(palco);
          io.to(`session:${sessionId}`).emit('palco_released', { palco, by: socket.id });
        }
      } catch {
        for (const palco of toReleasePalcos) {
          pHolds.delete(palco);
          io.to(`session:${sessionId}`).emit('palco_released', { palco, by: socket.id });
        }
      }
    }
  });
});

(async () => {
  try {
    registerModels(sequelize);
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
        if (t.type === 'pullman') s.pullman++;
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

    // Simple expiry worker for reservations: runs every 15s
    const { reservations: Reservation } = sequelize.models;
    setInterval(async () => {
      try {
        const now = dayjs().toDate();
        const expired = await Reservation.findAll({ where: { status: 'active', expires_at: { [Op.lt]: now } } });
        for (const r of expired) {
          await r.update({ status: 'expired' });
          io.to(`session:${r.session_id}`).emit('reservation_expired', { reservation_id: r.id });
        }
      } catch (e) {
        // swallow
      }
    }, 15000);

    const port = process.env.PORT || 4000;
    server.listen(port, () => console.log(`API running on :${port}`));
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
})();
