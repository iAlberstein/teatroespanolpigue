import express from 'express';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { sequelize } from '../lib/sequelize.js';
import { optionalAuth } from '../middleware/auth.js';
import { generateTicketQR } from '../lib/qr.js';
import dayjs from 'dayjs';

const router = express.Router();

// Create a preference for a reservation
// Body: { reservation_id: string }
router.post('/preference', optionalAuth, async (req, res) => {
  console.log('[DEBUG payments] MP_ACCESS_TOKEN present:', !!process.env.MP_ACCESS_TOKEN);
  console.log('[DEBUG payments] MP_ACCESS_TOKEN value:', process.env.MP_ACCESS_TOKEN ? 'SET (hidden)' : 'NOT SET');
  try {
    const { reservation_id } = req.body || {};
    if (!reservation_id) return res.status(400).json({ error: 'reservation_id required' });

    const Reservation = sequelize.models.reservations;
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) return res.status(404).json({ error: 'reservation not found' });
    if (reservation.status !== 'active') return res.status(409).json({ error: 'reservation_not_active' });
    if (dayjs(reservation.expires_at).isBefore(dayjs())) return res.status(409).json({ error: 'reservation_expired' });

    const items = Array.isArray(reservation.items) ? reservation.items : [];
    const mpItems = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code) {
        mpItems.push({ title: `Platea ${it.seat_code}`, quantity: 1, unit_price: 100 });
      } else if (it.type === 'palco' && it.seat_code) {
        mpItems.push({ title: `Palco ${it.seat_code}${it.quantity ? ` (pack ${it.quantity})` : ''}`, quantity: 1, unit_price: 100 });
      } else if (it.type === 'pullman' && it.quantity > 0) {
        mpItems.push({ title: `Pullman`, quantity: Number(it.quantity), unit_price: 100 });
      }
    }
    if (mpItems.length === 0) return res.status(400).json({ error: 'no_items' });

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
    const reqOrigin = req.headers.origin || '';
    const APP_URL = process.env.APP_URL || reqOrigin || FRONTEND_URL;
    console.log('[DEBUG payments] Using APP_URL:', APP_URL, 'FRONTEND_URL:', FRONTEND_URL, 'req.origin:', reqOrigin);
    const successUrl = `${APP_URL}/mp/success`;
    const pendingUrl = `${APP_URL}/mp/pending`;
    const failureUrl = `${APP_URL}/mp/failure`;
    const isAppPublic = !/^(http:\/\/localhost|http:\/\/127\.|https?:\/\/localhost|https?:\/\/127\.)/i.test(APP_URL || '');
    const isBackendPublic = !/^(http:\/\/localhost|http:\/\/127\.|https?:\/\/localhost|https?:\/\/127\.)/i.test(BASE_URL || '');

    const preference = {
      external_reference: String(reservation.id),
      items: mpItems,
      back_urls: {
        success: successUrl,
        pending: pendingUrl,
        failure: failureUrl,
      },
      metadata: {
        session_id: reservation.session_id,
        reservation_id: String(reservation.id),
      },
    };
    if (isBackendPublic) {
      const secret = process.env.MP_WEBHOOK_SECRET;
      const cb = `${BASE_URL}/api/payments/webhook`;
      preference.notification_url = secret ? `${cb}?secret=${encodeURIComponent(secret)}` : cb;
    } else {
      console.warn('[DEBUG payments] BASE_URL looks local; omitiendo notification_url para evitar fallas de entrega de webhook en desarrollo. BASE_URL:', BASE_URL);
    }
    if (isAppPublic) {
      preference.auto_return = 'approved';
    } else {
      console.warn('[DEBUG payments] APP_URL looks local; omitiendo auto_return para evitar error MP (back_urls success debe ser pública). APP_URL:', APP_URL);
    }
    console.log('[DEBUG payments] preference back_urls:', preference.back_urls);

    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(200).json({
        warning: 'MP_ACCESS_TOKEN not set. Provide sandbox credentials in backend .env to enable Checkout Pro.',
        preferenceId: null,
        init_point: null,
        preferenceDraft: preference,
      });
    }

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    console.log('[DEBUG payments] Creating preference with on-demand client');
    const preferenceClient = new Preference(client);
    const body = { ...preference };
    const requestOptions = { idempotencyKey: `${reservation.id}-${Date.now()}` };
    const result = await preferenceClient.create({ body, requestOptions });
    return res.json({
      preferenceId: result?.id || result?.body?.id || null,
      init_point: result?.init_point || result?.body?.init_point || result?.sandbox_init_point || result?.body?.sandbox_init_point || null,
    });
  } catch (e) {
    console.error('preference error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Simple health endpoint to verify env and SDK reachability (optional)
router.get('/health', async (req, res) => {
  const hasToken = !!process.env.MP_ACCESS_TOKEN;
  const baseUrl = process.env.BASE_URL;
  const feUrl = process.env.FRONTEND_URL;
  const note = hasToken ? 'token_present' : 'token_missing';
  res.json({ ok: true, note, BASE_URL: baseUrl, FRONTEND_URL: feUrl });
});

// Webhook receiver for Mercado Pago notifications
// notification_url: `${BASE_URL}/api/payments/webhook`
router.post('/webhook', async (req, res) => {
  try {
    // Optional simple secret validation (query param)
    const secret = req.query?.secret;
    if (process.env.MP_WEBHOOK_SECRET && secret !== process.env.MP_WEBHOOK_SECRET) {
      console.warn('[WEBHOOK] invalid secret');
      // still respond 200 to avoid retries storm but ignore content
      return res.status(200).json({ ignored: true });
    }

    const mpId = req.body?.data?.id || req.query?.id;
    if (!mpId) {
      console.warn('[WEBHOOK] missing payment id');
      return res.status(200).json({ ignored: true });
    }

    if (!process.env.MP_ACCESS_TOKEN) {
      console.warn('[WEBHOOK] MP_ACCESS_TOKEN missing, skipping fetch');
      return res.status(200).json({ ignored: true });
    }

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentClient = new Payment(client);
    let payment;
    try {
      payment = await paymentClient.get({ id: mpId });
    } catch (e) {
      console.error('[WEBHOOK] payment get error', e);
      return res.status(200).json({ ignored: true });
    }

    const status = payment?.status || payment?.body?.status;
    const md = payment?.metadata || payment?.body?.metadata || {};
    const metaReservation = md?.reservation_id || null;
    const externalRef = payment?.external_reference || payment?.body?.external_reference || null;
    const amount = Number(payment?.transaction_amount ?? payment?.body?.transaction_amount ?? 0);
    const paymentMethod = 'mp';

    if (!externalRef) {
      console.warn('[WEBHOOK] no external_reference');
      return res.status(200).json({ ignored: true });
    }

    const { reservations: Reservation, tickets: Ticket, sales: Sale } = sequelize.models;
    const reservationId = metaReservation || externalRef;
    const reservation = await Reservation.findByPk(reservationId);
    if (!reservation) {
      console.warn('[WEBHOOK] reservation not found for id (meta or externalRef)', reservationId);
      return res.status(200).json({ ignored: true });
    }

    if (status === 'approved') {
      // Idempotency: if already confirmed, just acknowledge
      if (reservation.status === 'confirmed') {
        return res.status(200).json({ ok: true, already_confirmed: true });
      }

      // Create Sale record
      const sale = await Sale.create({
        session_id: reservation.session_id,
        user_id: reservation.user_id || null,
        cashier_id: null,
        payment_method: paymentMethod,
        discount_id: null,
        total_amount: amount || 0,
      });

      // Generate tickets from reservation items
      const items = Array.isArray(reservation.items) ? reservation.items : [];
      const createdTickets = [];
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) {
          const t = await Ticket.create({
            session_id: reservation.session_id,
            user_id: reservation.user_id || null,
            seat_code: it.seat_code,
            section: 'platea',
            type: 'butaca',
            qr_code: null,
            status: 'sold',
          });
          const { qr_code, qr_data } = await generateTicketQR(t);
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        } else if (it.type === 'palco' && it.seat_code) {
          const t = await Ticket.create({
            session_id: reservation.session_id,
            user_id: reservation.user_id || null,
            seat_code: it.seat_code,
            section: 'palco',
            type: 'palco',
            qr_code: null,
            status: 'sold',
          });
          const { qr_code, qr_data } = await generateTicketQR(t);
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        } else if (it.type === 'pullman' && it.quantity > 0) {
          const qty = Number(it.quantity) || 0;
          for (let i = 0; i < qty; i++) {
            const t = await Ticket.create({
              session_id: reservation.session_id,
              user_id: reservation.user_id || null,
              seat_code: null,
              section: 'pullman',
              type: 'pullman',
              qr_code: null,
              status: 'sold',
            });
            const { qr_code, qr_data } = await generateTicketQR(t);
            await t.update({ qr_code, qr_data });
            createdTickets.push(t);
          }
        }
      }

      // Mark reservation as confirmed
      await reservation.update({ status: 'confirmed' });

      // Update in-memory sold maps for realtime consistency
      try {
        const io = req.app.get('io');
        io.soldSeats = io.soldSeats || new Map();
        io.soldPalcos = io.soldPalcos || new Map();
        io.pullmanSold = io.pullmanSold || new Map();
        const seatSet = io.soldSeats.get(reservation.session_id) || new Set();
        const palcoSet = io.soldPalcos.get(reservation.session_id) || new Set();
        let pullmanCount = io.pullmanSold.get(reservation.session_id) || 0;
        for (const it of items) {
          if (it.type === 'butaca' && it.seat_code) seatSet.add(it.seat_code);
          if (it.type === 'palco' && it.seat_code) palcoSet.add(it.seat_code);
          if (it.type === 'pullman' && it.quantity > 0) pullmanCount += Number(it.quantity) || 0;
        }
        io.soldSeats.set(reservation.session_id, seatSet);
        io.soldPalcos.set(reservation.session_id, palcoSet);
        io.pullmanSold.set(reservation.session_id, pullmanCount);
        // Emit granular events for realtime UI updates
        for (const it of items) {
          if (it.type === 'butaca' && it.seat_code) io.to(`session:${reservation.session_id}`).emit('seat_sold', { seatId: it.seat_code });
          if (it.type === 'palco' && it.seat_code) io.to(`session:${reservation.session_id}`).emit('palco_sold', { palco: it.seat_code });
          if (it.type === 'pullman' && it.quantity > 0) io.to(`session:${reservation.session_id}`).emit('pullman_sold', { sold: Number(it.quantity) || 0 });
        }
        io.to(`session:${reservation.session_id}`).emit('purchase_confirmed', { reservation_id: reservation.id });
      } catch {}

      return res.status(200).json({ ok: true, sale_id: sale.id });
    }

    // For non-approved statuses, just acknowledge
    return res.status(200).json({ ok: true, status });
  } catch (e) {
    console.error('[WEBHOOK] unexpected error', e);
    // Always 200 for webhook
    return res.status(200).json({ ok: true });
  }
});

// Request sending tickets by email (stub)
// Body: { reservation_id: string, email: string }
router.post('/email', async (req, res) => {
  try {
    const { reservation_id, email } = req.body || {};
    if (!reservation_id || !email) return res.status(400).json({ error: 'reservation_id and email required' });
    const { reservations: Reservation, tickets: Ticket } = sequelize.models;
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) return res.status(404).json({ error: 'reservation_not_found' });
    if (reservation.status !== 'confirmed') return res.status(409).json({ error: 'reservation_not_confirmed' });
    const tickets = await Ticket.findAll({ where: { session_id: reservation.session_id, user_id: reservation.user_id || null } });
    // Stub: here you would render PDFs / QR and send email via chosen provider
    console.log(`[EMAIL STUB] Would send ${tickets.length} tickets for reservation ${reservation_id} to ${email}`);
    return res.json({ ok: true, sent: true });
  } catch (e) {
    console.error('email stub error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Confirm purchase fallback (called from frontend success page)
// Body: { payment_id: string, user_id?: string }
router.post('/confirm', optionalAuth, async (req, res) => {
  try {
    const { payment_id } = req.body || {};
    if (!payment_id) return res.status(400).json({ error: 'payment_id required' });
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN not set' });

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentClient = new Payment(client);
    let payment;
    try {
      payment = await paymentClient.get({ id: payment_id });
    } catch (e) {
      return res.status(400).json({ error: 'payment_not_found' });
    }

    const status = payment?.status || payment?.body?.status;
    const md = payment?.metadata || payment?.body?.metadata || {};
    const metaReservation = md?.reservation_id || null;
    const externalRef = payment?.external_reference || payment?.body?.external_reference || null;
    const amount = Number(payment?.transaction_amount ?? payment?.body?.transaction_amount ?? 0);
    const paymentMethod = 'mp';

    const { reservations: Reservation, tickets: Ticket, sales: Sale, users: User } = sequelize.models;
    const reservationId = metaReservation || externalRef;
    if (!reservationId) return res.status(400).json({ error: 'reservation_id_missing' });
    const reservation = await Reservation.findByPk(reservationId);
    if (!reservation) return res.status(404).json({ error: 'reservation_not_found' });

    if (status !== 'approved') {
      return res.status(409).json({ error: 'payment_not_approved', status });
    }

    // Idempotency: check if tickets already exist for this exact reservation
    const resItems = Array.isArray(reservation.items) ? reservation.items : [];
    const seatCodes = resItems.filter(it=>it.type==='butaca' && it.seat_code).map(it=>it.seat_code);
    const palcoCodes = resItems.filter(it=>it.type==='palco' && it.seat_code).map(it=>it.seat_code);
    
    if (seatCodes.length > 0 || palcoCodes.length > 0) {
      const existingTickets = await Ticket.findAll({ 
        where: { 
          session_id: reservation.session_id,
          status: 'sold',
          [sequelize.Sequelize.Op.or]: [
            { seat_code: { [sequelize.Sequelize.Op.in]: [...seatCodes, ...palcoCodes] } }
          ]
        } 
      });
      
      if (existingTickets.length > 0) {
        if (reservation.status !== 'confirmed') await reservation.update({ status: 'confirmed' });
        return res.json({ ok: true, already_confirmed: true });
      }
    }
    
    // Idempotency by reservation status
    if (reservation.status === 'confirmed') {
      return res.json({ ok: true, already_confirmed: true });
    }

    // Determine effective user to link sale/tickets
    // Priority: JWT user > reservation.user_id > header > body
    let effUserId = req.user?.userId || reservation.user_id || req.header('x-user-id') || req.body?.user_id || null;
    if (effUserId) {
      const exists = await User.findByPk(effUserId);
      if (!exists) effUserId = null;
    }

    const sale = await Sale.create({
      session_id: reservation.session_id,
      user_id: effUserId,
      cashier_id: null,
      payment_method: paymentMethod,
      discount_id: null,
      total_amount: amount || 0,
    });

    const items = Array.isArray(reservation.items) ? reservation.items : [];
    const createdTickets = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code) {
        const t = await Ticket.create({
          session_id: reservation.session_id,
          user_id: effUserId,
          seat_code: it.seat_code,
          section: 'platea',
          type: 'butaca',
          qr_code: null,
          status: 'sold',
        });
        const { qr_code, qr_data } = await generateTicketQR(t);
        await t.update({ qr_code, qr_data });
        createdTickets.push(t);
      } else if (it.type === 'palco' && it.seat_code) {
        const t = await Ticket.create({
          session_id: reservation.session_id,
          user_id: effUserId,
          seat_code: it.seat_code,
          section: 'palco',
          type: 'palco',
          qr_code: null,
          status: 'sold',
        });
        const { qr_code, qr_data } = await generateTicketQR(t);
        await t.update({ qr_code, qr_data });
        createdTickets.push(t);
      } else if (it.type === 'pullman' && it.quantity > 0) {
        const qty = Number(it.quantity) || 0;
        for (let i = 0; i < qty; i++) {
          const t = await Ticket.create({
            session_id: reservation.session_id,
            user_id: effUserId,
            seat_code: null,
            section: 'pullman',
            type: 'pullman',
            qr_code: null,
            status: 'sold',
          });
          const { qr_code, qr_data } = await generateTicketQR(t);
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        }
      }
    }

    // Update reservation as confirmed and persist user if was null
    const patch = { status: 'confirmed' };
    if (!reservation.user_id && effUserId) patch.user_id = effUserId;
    await reservation.update(patch);

    try {
      const io = req.app.get('io');
      io.soldSeats = io.soldSeats || new Map();
      io.soldPalcos = io.soldPalcos || new Map();
      io.pullmanSold = io.pullmanSold || new Map();
      const seatSet = io.soldSeats.get(reservation.session_id) || new Set();
      const palcoSet = io.soldPalcos.get(reservation.session_id) || new Set();
      let pullmanCount = io.pullmanSold.get(reservation.session_id) || 0;
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) seatSet.add(it.seat_code);
        if (it.type === 'palco' && it.seat_code) palcoSet.add(it.seat_code);
        if (it.type === 'pullman' && it.quantity > 0) pullmanCount += Number(it.quantity) || 0;
      }
      io.soldSeats.set(reservation.session_id, seatSet);
      io.soldPalcos.set(reservation.session_id, palcoSet);
      io.pullmanSold.set(reservation.session_id, pullmanCount);
      // Emit granular events for realtime UI updates
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) io.to(`session:${reservation.session_id}`).emit('seat_sold', { seatId: it.seat_code });
        if (it.type === 'palco' && it.seat_code) io.to(`session:${reservation.session_id}`).emit('palco_sold', { palco: it.seat_code });
        if (it.type === 'pullman' && it.quantity > 0) io.to(`session:${reservation.session_id}`).emit('pullman_sold', { sold: Number(it.quantity) || 0 });
      }
      io.to(`session:${reservation.session_id}`).emit('purchase_confirmed', { reservation_id: reservation.id });
    } catch {}

    return res.json({ ok: true, sale_id: sale.id });
  } catch (e) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Diagnostic endpoint similar to docs/checkout-pro to validate token and preference creation
router.get('/mp-test', async (req, res) => {
  try {
    const token = process.env.MP_ACCESS_TOKEN;
    const appUrl = process.env.APP_URL || req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';
    if (!token) return res.status(500).json({ error: 'MP_ACCESS_TOKEN not set' });

    // users/me
    const meRes = await fetch('https://api.mercadopago.com/users/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'tep-backend/mp-test'
      }
    });
    const me = { status: meRes.status, body: await meRes.json().catch(()=>'<non-json>') };

    // create preference minimal
    const client = new MercadoPagoConfig({ accessToken: token, options: { timeout: 5000 } });
    const preferenceClient = new Preference(client);
    const body = {
      items: [{ id: 'diagnostic', unit_price: 100, quantity: 1, title: 'Diagnóstico' }],
      back_urls: {
        success: `${appUrl}/mp/success`,
        failure: `${appUrl}/mp/failure`,
        pending: `${appUrl}/mp/pending`,
      },
      auto_return: 'approved',
      metadata: { from: 'mp-test' },
    };
    let preference;
    try {
      const result = await preferenceClient.create({ body });
      preference = { ok: true, body: result };
    } catch (error) {
      preference = { ok: false, error: String(error) };
    }
    res.json({ me, preference });
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: String(e) });
  }
});

// Fetch payment details by ID (diagnóstico)
router.get('/fetch/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN not set' });
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id });
    return res.json({ status: payment?.status || payment?.body?.status, raw: payment });
  } catch (e) {
    return res.status(500).json({ error: 'fetch_error', detail: String(e) });
  }
});

export default router;
