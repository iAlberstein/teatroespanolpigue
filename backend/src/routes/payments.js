import express from 'express';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { sequelize } from '../lib/sequelize.js';
import { optionalAuth, authenticateToken } from '../middleware/auth.js';
import dayjs from 'dayjs';
import crypto from 'crypto';

const router = express.Router();

// Create a preference for a reservation
// Body: { reservation_id: string }
router.post('/preference', optionalAuth, async (req, res) => {
  console.log('[DEBUG payments] MP_ACCESS_TOKEN present:', !!process.env.MP_ACCESS_TOKEN);
  console.log('[DEBUG payments] MP_ACCESS_TOKEN value:', process.env.MP_ACCESS_TOKEN ? 'SET (hidden)' : 'NOT SET');
  try {
    const { reservation_id, discount_id } = req.body || {};
    if (!reservation_id) return res.status(400).json({ error: 'reservation_id required' });

    const Reservation = sequelize.models.reservations;
    const Discount = sequelize.models.discounts;
    
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) return res.status(404).json({ error: 'reservation not found' });
    if (reservation.status !== 'active') return res.status(409).json({ error: 'reservation_not_active' });
    if (dayjs(reservation.expires_at).isBefore(dayjs())) return res.status(409).json({ error: 'reservation_expired' });
    
    // Validate discount if provided
    let validDiscount = null;
    if (discount_id) {
      validDiscount = await Discount.findByPk(discount_id);
      if (!validDiscount || !validDiscount.active) {
        return res.status(400).json({ error: 'invalid_discount' });
      }
      if (validDiscount.usage_limit && validDiscount.used_count >= validDiscount.usage_limit) {
        return res.status(400).json({ error: 'discount_limit_reached' });
      }
    }

    const items = Array.isArray(reservation.items) ? reservation.items : [];
    const mpItems = [];
    let subtotal = 0;
    
    for (const it of items) {
      const price = Number(it.price || it.unit_price || 0);
      
      if (it.type === 'butaca' && it.seat_code) {
        mpItems.push({ 
          title: `Platea ${it.seat_code}`, 
          quantity: 1, 
          unit_price: price 
        });
        subtotal += price;
      } else if (it.type === 'palco' && it.seat_code) {
        mpItems.push({ 
          title: `Palco ${it.seat_code}${it.quantity ? ` (pack ${it.quantity})` : ''}`, 
          quantity: 1, 
          unit_price: price 
        });
        subtotal += price;
      } else if (it.type === 'pullman' && it.quantity > 0) {
        const quantity = Number(it.quantity);
        console.log('[DEBUG pullman] item:', JSON.stringify(it));
        console.log('[DEBUG pullman] price:', price, 'quantity:', quantity);
        
        if (price <= 0) {
          console.error('[ERROR pullman] Invalid price for pullman:', price);
          return res.status(400).json({ error: 'invalid_pullman_price', details: 'El precio de Pullman debe ser mayor a 0' });
        }
        
        mpItems.push({ 
          title: `Pullman`, 
          quantity, 
          unit_price: price 
        });
        subtotal += price * quantity;
      }
    }
    
    if (mpItems.length === 0) return res.status(400).json({ error: 'no_items' });
    
    // Apply discount FIRST (before service charge)
    let subtotalAfterDiscount = subtotal;
    let discountAmount = 0;
    
    if (validDiscount) {
      if (validDiscount.type === 'percentage') {
        discountAmount = Math.round(subtotal * (validDiscount.value / 100));
      } else if (validDiscount.type === 'fixed') {
        discountAmount = Math.round(validDiscount.value);
      }
      // Ensure discount doesn't exceed subtotal
      discountAmount = Math.min(discountAmount, subtotal);
      
      if (discountAmount > 0) {
        mpItems.push({
          title: `Descuento: ${validDiscount.code}`,
          quantity: 1,
          unit_price: -discountAmount
        });
        subtotalAfterDiscount = subtotal - discountAmount;
      }
    }
    
    // Add 10% service charge AFTER discount
    const serviceCharge = Math.round(subtotalAfterDiscount * 0.10);
    if (serviceCharge > 0) {
      mpItems.push({
        title: 'Cargo por servicio (10%)',
        quantity: 1,
        unit_price: serviceCharge
      });
    }

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
        discount_id: discount_id || null,
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

// Fetch payment details from Mercado Pago
router.get('/fetch/:payment_id', async (req, res) => {
  try {
    const { payment_id } = req.params;
    
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN not set' });
    }
    
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentClient = new Payment(client);
    
    try {
      const payment = await paymentClient.get({ id: payment_id });
      return res.json({ 
        ok: true, 
        raw: payment 
      });
    } catch (e) {
      console.error('[FETCH] Error fetching payment:', e);
      return res.status(404).json({ error: 'payment_not_found' });
    }
  } catch (e) {
    console.error('[FETCH] Error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Get discount info for a reservation
router.get('/discount/:reservation_id', async (req, res) => {
  try {
    const { reservation_id } = req.params;
    const { reservations: Reservation, sales: Sale, discounts: Discount } = sequelize.models;
    
    // Get reservation to find session_id
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) {
      return res.json({ discount: null });
    }
    
    // Find sale for this session
    const sale = await Sale.findOne({
      where: { session_id: reservation.session_id },
      include: [{
        model: Discount,
        as: 'discount',
        required: false
      }],
      order: [['createdAt', 'DESC']]
    });
    
    if (sale && sale.discount) {
      return res.json({
        discount: {
          code: sale.discount.code,
          type: sale.discount.type,
          value: sale.discount.value
        }
      });
    }
    
    res.json({ discount: null });
  } catch (e) {
    console.error('[DISCOUNT INFO] Error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Webhook receiver for Mercado Pago notifications
// notification_url: `${BASE_URL}/api/payments/webhook`
router.post('/webhook', async (req, res) => {
  console.log('[WEBHOOK] 🔔 Received webhook call');
  console.log('[WEBHOOK] Body:', JSON.stringify(req.body, null, 2));
  console.log('[WEBHOOK] Query:', JSON.stringify(req.query, null, 2));
  
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
    console.log('[WEBHOOK] Payment ID:', mpId);

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
    const metaDiscountId = md?.discount_id || null;
    const externalRef = payment?.external_reference || payment?.body?.external_reference || null;
    const amount = Number(payment?.transaction_amount ?? payment?.body?.transaction_amount ?? 0);
    const paymentMethod = 'mp';

    if (!externalRef) {
      console.warn('[WEBHOOK] no external_reference');
      return res.status(200).json({ ignored: true });
    }

    const { reservations: Reservation, tickets: Ticket, sales: Sale, discounts: Discount } = sequelize.models;
    const reservationId = metaReservation || externalRef;
    const reservation = await Reservation.findByPk(reservationId);
    if (!reservation) {
      console.warn('[WEBHOOK] reservation not found for id (meta or externalRef)', reservationId);
      return res.status(200).json({ ignored: true });
    }

    if (status === 'approved') {
      console.log('[WEBHOOK] Payment approved, processing...');
      
      // Idempotency: if already confirmed, just acknowledge
      if (reservation.status === 'confirmed') {
        console.log('[WEBHOOK] Reservation already confirmed, skipping');
        return res.status(200).json({ ok: true, already_confirmed: true });
      }

      // CRITICAL: Mark as confirmed IMMEDIATELY to prevent duplicate processing
      // if another webhook arrives while we're still processing
      // Also generate temp sale ID now so we can store it in reservation
      const tempSaleId = crypto.randomUUID();
      await reservation.update({ status: 'confirmed', sale_id: tempSaleId });
      console.log('[WEBHOOK] Reservation marked as confirmed to prevent duplicates');

      // Generate container QR for this sale
      const items = Array.isArray(reservation.items) ? reservation.items : [];
      console.log('[WEBHOOK] Generating QR for', items.length, 'items');
      
      const { generateContainerQR } = await import('../lib/qrGenerator.js');
      const containerQR = await generateContainerQR(tempSaleId, items);
      console.log('[WEBHOOK] Container QR generated, capacity:', containerQR.total_capacity);

      // Create Sale record with container QR
      const sale = await Sale.create({
        id: tempSaleId,
        session_id: reservation.session_id,
        user_id: reservation.user_id || null,
        cashier_id: null,
        payment_method: paymentMethod,
        discount_id: metaDiscountId || null,
        total_amount: amount || 0,
        container_qr_code: containerQR.qr_code,
        container_qr_data: containerQR.qr_data,
        validated_count: 0,
        total_capacity: containerQR.total_capacity,
      });
      
      // Increment discount used_count if discount was applied
      if (metaDiscountId) {
        const discount = await Discount.findByPk(metaDiscountId);
        if (discount) {
          await discount.increment('used_count');
          console.log('[WEBHOOK] Discount used_count incremented:', discount.code);
        }
      }

      // Generate tickets from reservation items
      const { generateIndividualQR } = await import('../lib/qrGenerator.js');
      const createdTickets = [];
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) {
          const t = await Ticket.create({
            session_id: reservation.session_id,
            sale_id: sale.id,
            user_id: reservation.user_id || null,
            seat_code: it.seat_code,
            section: 'platea_general',
            type: 'butaca',
            price: Number(it.price || 0),
            qr_code: null,
            status: 'sold',
            capacity: 1,
            capacity_validated: 0
          });
          const { qr_code, qr_data } = await generateIndividualQR(t.id, it.seat_code, 'butaca');
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        } else if (it.type === 'palco' && it.seat_code) {
          // Determinar si es Palco Bajo (PB) o Palco Alto (PA)
          const isPB = /^PB/i.test(it.seat_code);
          const palcoSection = isPB ? 'palcos_bajos' : 'palcos_altos';
          const palcoCapacity = isPB ? 4 : 2;
          const t = await Ticket.create({
            session_id: reservation.session_id,
            sale_id: sale.id,
            user_id: reservation.user_id || null,
            seat_code: it.seat_code,
            section: palcoSection,
            type: 'palco',
            price: Number(it.price || 0),
            qr_code: null,
            status: 'sold',
            capacity: palcoCapacity,
            capacity_validated: 0
          });
          const { qr_code, qr_data } = await generateIndividualQR(t.id, it.seat_code, 'palco');
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        } else if (it.type === 'pullman' && it.quantity > 0) {
          const qty = Number(it.quantity) || 0;
          for (let i = 0; i < qty; i++) {
            const t = await Ticket.create({
              session_id: reservation.session_id,
              sale_id: sale.id,
              user_id: reservation.user_id || null,
              seat_code: null,
              section: 'pullman',
              type: 'pullman',
              price: Number(it.price || 0),
              qr_code: null,
              status: 'sold',
            });
            const { qr_code, qr_data } = await generateIndividualQR(t.id, null, 'pullman');
            await t.update({ qr_code, qr_data });
            createdTickets.push(t);
          }
        }
      }

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

      // Send confirmation email
      try {
        const { users: User, sessions: Session, shows: Show } = sequelize.models;
        const user = reservation.user_id ? await User.findByPk(reservation.user_id) : null;
        const session = await Session.findByPk(reservation.session_id, {
          include: [{ model: Show, as: 'show' }]
        });

        // Get discount info if applied
        let discountInfo = null;
        if (metaDiscountId) {
          const discount = await Discount.findByPk(metaDiscountId);
          if (discount && metaSubtotal) {
            const discountAmount = Number(metaSubtotal) - amount;
            discountInfo = {
              code: discount.code,
              amount: discountAmount
            };
          }
        }

        if (user && user.email && session) {
          const { formatDateLong, formatTime } = await import('../lib/dateFormatter.js');
          const { sendPurchaseConfirmation, sendAdminNotification } = await import('../lib/emailService.js');
          
          // Send customer confirmation
          await sendPurchaseConfirmation({
            customerEmail: user.email,
            customerName: user.name,
            showTitle: session.show.title,
            sessionDate: formatDateLong(session.starts_at),
            sessionTime: formatTime(session.starts_at),
            tickets: createdTickets,
            saleId: sale.id,
            totalAmount: amount,
            paymentMethod: 'mp',
            subtotal: discountInfo ? Number(metaSubtotal) : null,
            discountCode: discountInfo ? discountInfo.code : null,
            discountAmount: discountInfo ? discountInfo.amount : null
          });

          // Send admin notification
          const adminEmails = process.env.ADMIN_NOTIFICATION_EMAILS?.split(',').filter(e => e.trim());
          if (adminEmails && adminEmails.length > 0) {
            await sendAdminNotification({
              adminEmails,
              showTitle: session.show.title,
              sessionDate: formatDateLong(session.starts_at),
              sessionTime: formatTime(session.starts_at),
              customerName: user.name,
              ticketsCount: createdTickets.length,
              totalAmount: amount,
              channel: 'Online'
            });
          }
        }
      } catch (emailError) {
        console.error('[WEBHOOK] Error sending email:', emailError);
        // Don't fail the webhook for email errors
      }

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

// Send tickets by email
// Body: { reservation_id: string, email: string }
router.post('/email', async (req, res) => {
  try {
    const { reservation_id, email } = req.body || {};
    if (!reservation_id || !email) return res.status(400).json({ error: 'reservation_id and email required' });
    
    const { reservations: Reservation, tickets: Ticket, sessions: Session, shows: Show, sales: Sale } = sequelize.models;
    
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) return res.status(404).json({ error: 'reservation_not_found' });
    
    // Get tickets for this reservation (if they exist with status 'sold', the purchase was successful)
    const tickets = await Ticket.findAll({ 
      where: { 
        session_id: reservation.session_id, 
        user_id: reservation.user_id || null,
        status: 'sold'
      } 
    });
    
    if (tickets.length === 0) {
      return res.status(404).json({ error: 'no_tickets_found' });
    }
    
    // Get session and show info
    const session = await Session.findByPk(reservation.session_id, {
      include: [{ model: Show, as: 'show' }]
    });
    
    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }
    
    // Format tickets with location
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTickets = tickets.map(t => {
      const ticketData = t.get ? t.get({ plain: true }) : t;
      return {
        id: ticketData.id,
        type: ticketData.type,
        seat_code: ticketData.seat_code,
        location: formatSeatLocation(ticketData.type, ticketData.section, ticketData.seat_code, ticketData.capacity || 1),
        section: ticketData.section,
        price: ticketData.price,
        qr_code: ticketData.qr_code
      };
    });
    
    // Calculate total
    const subtotal = formattedTickets.reduce((sum, t) => sum + Number(t.price || 0), 0);
    const serviceCharge = Math.round(subtotal * 0.10);
    const total = subtotal + serviceCharge;
    
    // Session info for email
    const sessionInfo = {
      showName: session.show?.title || 'Espectáculo',
      date: new Date(session.starts_at).toLocaleDateString('es-AR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: new Date(session.starts_at).toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      sala: session.sala || 'Sala Principal'
    };
    
    // Get customer name (from reservation items if available)
    const customerName = reservation.items?.[0]?.customer_name || 'Cliente';
    
    // Send email
    const { sendTicketsEmail } = await import('../lib/emailer.js');
    const result = await sendTicketsEmail({
      to: email,
      tickets: formattedTickets,
      sessionInfo,
      customerName,
      total
    });
    
    if (result.success) {
      console.log(`[EMAIL] Sent ${formattedTickets.length} tickets for reservation ${reservation_id} to ${email}`);
      return res.json({ ok: true, sent: true, messageId: result.messageId });
    } else {
      return res.status(500).json({ error: 'email_send_failed', message: result.error });
    }
  } catch (e) {
    console.error('[EMAIL] Error:', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// Send tickets by email using sale_id
// Body: { sale_id: string, email: string }
router.post('/email-sale', async (req, res) => {
  try {
    const { sale_id, email } = req.body || {};
    if (!sale_id || !email) return res.status(400).json({ error: 'sale_id and email required' });
    
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show } = sequelize.models;
    
    const sale = await Sale.findByPk(sale_id, {
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        }
      ]
    });
    
    if (!sale) return res.status(404).json({ error: 'sale_not_found' });
    
    // Get tickets
    const tickets = await Ticket.findAll({ where: { sale_id } });
    if (tickets.length === 0) return res.status(404).json({ error: 'no_tickets_found' });
    
    const session = sale.session;
    if (!session) return res.status(404).json({ error: 'session_not_found' });
    
    // Format tickets with locations
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTickets = tickets.map(t => ({
      id: t.id,
      location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1),
      section: t.section,
      type: t.type,
      price: t.price,
      qr_code: t.qr_code
    }));
    
    // Calculate total
    const subtotal = formattedTickets.reduce((sum, t) => sum + Number(t.price || 0), 0);
    const serviceCharge = Math.round(subtotal * 0.10);
    const total = subtotal + serviceCharge;
    
    // Session info for email
    const sessionInfo = {
      showName: session.show?.title || 'Espectáculo',
      date: new Date(session.starts_at).toLocaleDateString('es-AR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: new Date(session.starts_at).toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      sala: session.sala || 'Sala Principal'
    };
    
    // Get customer name
    const customerName = sale.customer_name || 'Cliente';
    
    // Send email
    const { sendTicketsEmail } = await import('../lib/emailer.js');
    const result = await sendTicketsEmail({
      to: email,
      tickets: formattedTickets,
      sessionInfo,
      customerName
    });
    
    if (result.success) {
      console.log(`[EMAIL-SALE] SUCCESS: Sent ${formattedTickets.length} tickets for sale ${sale_id} to ${email}`);
      return res.json({ ok: true, sent: true, messageId: result.messageId });
    } else {
      return res.status(500).json({ error: 'email_send_failed', message: result.error });
    }
  } catch (e) {
    console.error('[EMAIL] Error:', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// Send container QR by email
// Body: { sale_id: string, email: string }
router.post('/email-container', async (req, res) => {
  try {
    const { sale_id, email } = req.body || {};
    if (!sale_id || !email) return res.status(400).json({ error: 'sale_id and email required' });
    
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show } = sequelize.models;
    
    const sale = await Sale.findByPk(sale_id, {
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        }
      ]
    });
    
    if (!sale) return res.status(404).json({ error: 'sale_not_found' });
    if (!sale.container_qr_code) return res.status(404).json({ error: 'container_qr_not_available' });
    
    const tickets = await Ticket.findAll({ where: { sale_id } });
    if (tickets.length === 0) return res.status(404).json({ error: 'no_tickets_found' });
    
    const session = sale.session;
    if (!session) return res.status(404).json({ error: 'session_not_found' });
    
    // Format tickets with locations
    const { formatSeatLocation, sortTicketsBySection } = await import('../lib/seatFormatter.js');
    
    // Ordenar tickets antes de formatear
    const sortedTickets = sortTicketsBySection(tickets.map(t => t.get ? t.get({ plain: true }) : t));
    
    const formattedTickets = sortedTickets.map(t => ({
      id: t.id,
      location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1)
    }));
    
    // Session info
    const sessionInfo = {
      showName: session.show?.title || 'Espectáculo',
      date: new Date(session.starts_at).toLocaleDateString('es-AR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: new Date(session.starts_at).toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      sala: session.sala || 'Sala Principal'
    };
    
    const customerName = sale.customer_name || 'Cliente';
    
    // Send email
    const { sendContainerQREmail } = await import('../lib/emailer.js');
    const result = await sendContainerQREmail({
      to: email,
      containerQR: sale.container_qr_code,
      tickets: formattedTickets,
      sessionInfo,
      customerName
    });
    
    if (result.success) {
      console.log(`[EMAIL-CONTAINER] SUCCESS: Sent container QR for sale ${sale_id} to ${email}`);
      return res.json({ ok: true, sent: true, messageId: result.messageId });
    } else {
      return res.status(500).json({ error: 'email_send_failed', message: result.error });
    }
  } catch (e) {
    console.error('[EMAIL] Error:', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// Send single ticket by email
// Body: { ticket_id: string, email: string }
router.post('/email-ticket', async (req, res) => {
  try {
    const { ticket_id, email } = req.body || {};
    if (!ticket_id || !email) return res.status(400).json({ error: 'ticket_id and email required' });
    
    const { tickets: Ticket, sessions: Session, shows: Show, sales: Sale } = sequelize.models;
    
    const ticket = await Ticket.findByPk(ticket_id, {
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        },
        {
          model: Sale,
          as: 'sale'
        }
      ]
    });
    
    if (!ticket) return res.status(404).json({ error: 'ticket_not_found' });
    
    const session = ticket.session;
    if (!session) return res.status(404).json({ error: 'session_not_found' });
    
    // Format ticket
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTicket = {
      id: ticket.id,
      location: formatSeatLocation(ticket.type, ticket.section, ticket.seat_code, ticket.capacity || 1),
      section: ticket.section,
      type: ticket.type,
      qr_code: ticket.qr_code
    };
    
    // Session info
    const sessionInfo = {
      showName: session.show?.title || 'Espectáculo',
      date: new Date(session.starts_at).toLocaleDateString('es-AR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: new Date(session.starts_at).toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      sala: session.sala || 'Sala Principal'
    };
    
    const customerName = ticket.sale?.customer_name || 'Cliente';
    
    // Send email
    const { sendSingleTicketEmail } = await import('../lib/emailer.js');
    const result = await sendSingleTicketEmail({
      to: email,
      ticket: formattedTicket,
      sessionInfo,
      customerName
    });
    
    if (result.success) {
      console.log(`[EMAIL-TICKET] SUCCESS: Sent ticket ${ticket_id} to ${email}`);
      return res.json({ ok: true, sent: true, messageId: result.messageId });
    } else {
      return res.status(500).json({ error: 'email_send_failed', message: result.error });
    }
  } catch (e) {
    console.error('[EMAIL] Error:', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// Generate PDF for WhatsApp sharing
// Query params: sale_id=xxx
// Returns PDF as base64 data URL for direct sharing
router.get('/generate-pdf/:sale_id', async (req, res) => {
  try {
    const { sale_id } = req.params;
    if (!sale_id) return res.status(400).json({ error: 'sale_id required' });
    
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show } = sequelize.models;
    
    const sale = await Sale.findByPk(sale_id, {
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        }
      ]
    });
    
    if (!sale) return res.status(404).json({ error: 'sale_not_found' });
    
    // Get tickets
    const tickets = await Ticket.findAll({ where: { sale_id } });
    if (tickets.length === 0) return res.status(404).json({ error: 'no_tickets_found' });
    
    const session = sale.session;
    if (!session) return res.status(404).json({ error: 'session_not_found' });
    
    // Format tickets with locations
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTickets = tickets.map(t => ({
      id: t.id,
      location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1),
      section: t.section,
      type: t.type,
      price: t.price,
      qr_code: t.qr_code
    }));
    
    // Session info
    const sessionInfo = {
      showName: session.show?.title || 'Espectáculo',
      date: new Date(session.starts_at).toLocaleDateString('es-AR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: new Date(session.starts_at).toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      sala: session.sala || 'Sala Principal'
    };
    
    // Get customer name
    const customerName = sale.customer_name || 'Cliente';
    
    // Generate PDF
    const { generateTicketsPDF } = await import('../lib/emailer.js');
    const pdfBuffer = await generateTicketsPDF({
      tickets: formattedTickets,
      sessionInfo,
      customerName
    });
    
    // Return PDF directly for download/sharing
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="entradas-${sessionInfo.showName.replace(/\s+/g, '-')}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(pdfBuffer);
    
    console.log(`[PDF] Generated PDF for sale ${sale_id} with ${formattedTickets.length} tickets`);
  } catch (e) {
    console.error('[PDF] Error:', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// Confirm purchase fallback (called from frontend success page)
// Body: { payment_id: string, user_id?: string }
router.post('/confirm', optionalAuth, async (req, res) => {
  console.log('[CONFIRM] 📋 Confirm endpoint called');
  console.log('[CONFIRM] Body:', req.body);
  
  try {
    const { payment_id } = req.body || {};
    if (!payment_id) {
      console.log('[CONFIRM] ❌ Missing payment_id');
      return res.status(400).json({ error: 'payment_id required' });
    }
    if (!process.env.MP_ACCESS_TOKEN) {
      console.log('[CONFIRM] ❌ MP_ACCESS_TOKEN not set');
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN not set' });
    }

    console.log('[CONFIRM] Fetching payment from MP:', payment_id);
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentClient = new Payment(client);
    let payment;
    try {
      payment = await paymentClient.get({ id: payment_id });
      console.log('[CONFIRM] Payment fetched, status:', payment?.status || payment?.body?.status);
    } catch (e) {
      console.error('[CONFIRM] ❌ Error fetching payment:', e.message);
      return res.status(400).json({ error: 'payment_not_found' });
    }

    const status = payment?.status || payment?.body?.status;
    const md = payment?.metadata || payment?.body?.metadata || {};
    const metaReservation = md?.reservation_id || null;
    const metaDiscountId = md?.discount_id || null;
    const externalRef = payment?.external_reference || payment?.body?.external_reference || null;
    const amount = Number(payment?.transaction_amount ?? payment?.body?.transaction_amount ?? 0);
    const paymentMethod = 'mp';

    const { reservations: Reservation, tickets: Ticket, sales: Sale, users: User, discounts: Discount } = sequelize.models;
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
      console.log('[CONFIRM] ✓ Already confirmed');
      return res.json({ ok: true, already_confirmed: true });
    }

    console.log('[CONFIRM] Creating sale and tickets...');
    
    // Determine effective user to link sale/tickets
    // Priority: JWT user > reservation.user_id > header > body
    let effUserId = req.user?.userId || reservation.user_id || req.header('x-user-id') || req.body?.user_id || null;
    if (effUserId) {
      const exists = await User.findByPk(effUserId);
      if (!exists) effUserId = null;
    }
    console.log('[CONFIRM] User ID:', effUserId);

    // Generate container QR for this sale
    const items = Array.isArray(reservation.items) ? reservation.items : [];
    console.log('[CONFIRM] Items:', items.length);
    
    const tempSaleId = crypto.randomUUID();
    const { generateContainerQR } = await import('../lib/qrGenerator.js');
    const containerQR = await generateContainerQR(tempSaleId, items);
    console.log('[CONFIRM] Container QR generated, capacity:', containerQR.total_capacity);

    console.log('[CONFIRM] Creating Sale record...');
    const sale = await Sale.create({
      id: tempSaleId,
      session_id: reservation.session_id,
      user_id: effUserId,
      cashier_id: null,
      payment_method: paymentMethod,
      discount_id: metaDiscountId || null,
      total_amount: amount || 0,
      container_qr_code: containerQR.qr_code,
      container_qr_data: containerQR.qr_data,
      validated_count: 0,
      total_capacity: containerQR.total_capacity,
    });
    console.log('[CONFIRM] ✅ Sale created:', sale.id);
    
    // Increment discount used_count if discount was applied
    if (metaDiscountId) {
      const discount = await Discount.findByPk(metaDiscountId);
      if (discount) {
        await discount.increment('used_count');
        console.log('[CONFIRM] Discount used_count incremented:', discount.code);
      }
    }

    console.log('[CONFIRM] Creating tickets...');
    const { generateIndividualQR } = await import('../lib/qrGenerator.js');
    const createdTickets = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code) {
        const t = await Ticket.create({
          session_id: reservation.session_id,
          sale_id: sale.id,
          user_id: effUserId,
          seat_code: it.seat_code,
          section: 'platea_general',
          type: 'butaca',
          price: Number(it.price || 0),
          qr_code: null,
          status: 'sold',
          capacity: 1,
          capacity_validated: 0
        });
        const { qr_code, qr_data } = await generateIndividualQR(t.id, it.seat_code, 'butaca');
        await t.update({ qr_code, qr_data });
        createdTickets.push(t);
      } else if (it.type === 'palco' && it.seat_code) {
        // Determinar si es Palco Bajo (PB) o Palco Alto (PA)
        const isPB = /^PB/i.test(it.seat_code);
        const palcoSection = isPB ? 'palcos_bajos' : 'palcos_altos';
        const palcoCapacity = isPB ? 4 : 2;
        const t = await Ticket.create({
          session_id: reservation.session_id,
          sale_id: sale.id,
          user_id: effUserId,
          seat_code: it.seat_code,
          section: palcoSection,
          type: 'palco',
          price: Number(it.price || 0),
          qr_code: null,
          status: 'sold',
          capacity: palcoCapacity,
          capacity_validated: 0
        });
        const { qr_code, qr_data } = await generateIndividualQR(t.id, it.seat_code, 'palco');
        await t.update({ qr_code, qr_data });
        createdTickets.push(t);
      } else if (it.type === 'pullman' && it.quantity > 0) {
        const qty = Number(it.quantity) || 0;
        for (let i = 0; i < qty; i++) {
          const t = await Ticket.create({
            session_id: reservation.session_id,
            sale_id: sale.id,
            user_id: effUserId,
            seat_code: null,
            section: 'pullman',
            type: 'pullman',
            price: Number(it.price || 0),
            qr_code: null,
            status: 'sold',
          });
          const { qr_code, qr_data } = await generateIndividualQR(t.id, null, 'pullman');
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        }
      }
    }
    console.log('[CONFIRM] ✅ Created', createdTickets.length, 'tickets');

    // Update reservation as confirmed and persist user if was null
    console.log('[CONFIRM] Updating reservation status to confirmed...');
    const patch = { status: 'confirmed' };
    if (!reservation.user_id && effUserId) patch.user_id = effUserId;
    await reservation.update(patch);
    console.log('[CONFIRM] ✅ Reservation confirmed');

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
    } catch (ioErr) {
      console.warn('[CONFIRM] Socket.io error (non-critical):', ioErr.message);
    }

    console.log('[CONFIRM] 🎉 SUCCESS! Sale created with', createdTickets.length, 'tickets');
    return res.json({ ok: true, sale_id: sale.id, tickets_created: createdTickets.length });
  } catch (e) {
    console.error('[CONFIRM] ❌ ERROR:', e);
    console.error('[CONFIRM] Stack:', e.stack);
    return res.status(500).json({ error: 'internal_error', message: e.message });
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
