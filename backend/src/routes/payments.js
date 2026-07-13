import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { Op } from 'sequelize';
import { optionalAuth, authenticateToken } from '../middleware/auth.js';
import dayjs from 'dayjs';
import crypto from 'crypto';
import { computePackTicketPrices, calculatePackTotals, parseServiceItems as parsePackServiceItems } from '../lib/packPricing.js';

const router = express.Router();
import { createSipagoOrder, getSipagoOrder } from '../lib/sipago.js';

// Helper to safely parse service_items from DB (handles plain array, JSON string, or double-encoded string)
function parseServiceItems(raw) {
  if (!raw) return [];
  try {
    let val = raw;
    if (typeof val === 'string') val = JSON.parse(val);
    if (typeof val === 'string') val = JSON.parse(val); // double-encoded
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}

// Helper to get service fee percent from settings
async function getServiceFeePercent() {
  try {
    const { system_settings: SystemSettings } = sequelize.models;
    if (!SystemSettings) return 10; // Default if model not loaded
    const setting = await SystemSettings.findOne({ where: { key: 'service_fee_percent' } });
    return setting ? parseFloat(setting.value) : 10;
  } catch (e) {
    console.error('[PAYMENTS] Error getting service fee:', e);
    return 10; // Default fallback
  }
}

// Helper: compute discount amount respecting per-ticket usage_limit
// Returns { discountAmount, discountedTicketCount }
function computeDiscountAmount(items, discount) {
  const baseSubtotal = items.reduce((sum, it) => {
    if (it.type === 'butaca' || it.type === 'palco') return sum + Number(it.price || 0);
    if (it.type === 'pullman' || it.type === 'general') return sum + (Number(it.unit_price || it.price || 0) * Number(it.quantity || 1));
    return sum;
  }, 0);

  const dtype = String(discount.type || '').toLowerCase();
  const dval = Number(discount.value || 0);
  // 'internal' type = cortesía = 100% discount
  const effectivePercent = dtype === 'internal' ? 100 : dval;
  const usageLimit = discount.usage_limit ? Number(discount.usage_limit) : null;
  const usedCount = Number(discount.used_count || 0);
  const remainingUses = usageLimit != null ? Math.max(0, usageLimit - usedCount) : null;

  let discountAmount = 0;
  let discountedTicketCount = 0;

  if ((dtype === 'percentage' || dtype === 'internal') && remainingUses != null) {
    // Expand items into individual ticket prices
    // Palcos expand to their seat count: PB (Palcos Bajos) = 4 seats, PA (Palcos Altos) = 2 seats
    const individualPrices = [];
    for (const it of items) {
      if (it.type === 'palco') {
        const sec = String(it.section || it.seat_code || '').toLowerCase();
        const palcoSeats = sec.includes('bajo') || sec.startsWith('pb') ? 4 : 2;
        const perSeatPrice = Number(it.price || 0) / palcoSeats;
        for (let i = 0; i < palcoSeats; i++) individualPrices.push(perSeatPrice);
      } else if (it.type === 'butaca') {
        individualPrices.push(Number(it.price || 0));
      } else if (it.type === 'pullman' || it.type === 'general') {
        const qty = Number(it.quantity || 1);
        const unitPrice = Number(it.unit_price || it.price || 0);
        for (let i = 0; i < qty; i++) individualPrices.push(unitPrice);
      }
    }
    discountedTicketCount = Math.min(individualPrices.length, remainingUses);
    // Sort descending so most expensive tickets get discounted first
    individualPrices.sort((a, b) => b - a);
    const discountableSubtotal = individualPrices.slice(0, discountedTicketCount).reduce((s, p) => s + p, 0);
    discountAmount = Math.round(discountableSubtotal * (effectivePercent / 100));
  } else if (dtype === 'percentage' || dtype === 'internal') {
    discountAmount = Math.round(baseSubtotal * (effectivePercent / 100));
    // Count all tickets for used_count increment (palcos count as their seat count)
    discountedTicketCount = items.reduce((sum, it) => {
      if (it.type === 'palco') {
        const sec = String(it.section || it.seat_code || '').toLowerCase();
        return sum + (sec.includes('bajo') || sec.startsWith('pb') ? 4 : 2);
      }
      if (it.type === 'butaca') return sum + 1;
      return sum + (Number(it.quantity || 1));
    }, 0);
  } else if (dtype === 'fixed') {
    discountAmount = Math.round(dval);
    discountedTicketCount = 1; // Fixed discounts count as 1 use
  }

  if (discountAmount > baseSubtotal) discountAmount = baseSubtotal;
  return { discountAmount, discountedTicketCount, baseSubtotal };
}

// Helper: compute discount amount for pack priced slots.
// Each priced slot counts as one discounted unit (butaca=1, palco=1 box, pullman/general=1 person).
function computePackDiscountAmount(pricedSlots, discount) {
  const dtype = String(discount.type || '').toLowerCase();
  const dval = Number(discount.value || 0);
  const effectivePercent = dtype === 'internal' ? 100 : dval;
  const usageLimit = discount.usage_limit != null ? Number(discount.usage_limit) : null;
  const usedCount = Number(discount.used_count || 0);
  const remainingUses = usageLimit != null ? Math.max(0, usageLimit - usedCount) : null;
  const minSeats = discount.min_seats != null ? Number(discount.min_seats) : null;
  const maxSeats = discount.max_seats != null ? Number(discount.max_seats) : null;

  const totalSlots = pricedSlots.length;
  if (minSeats != null && totalSlots < minSeats) return { discountAmount: 0, discountedTicketCount: 0 };

  let discountAmount = 0;
  let discountedTicketCount = 0;

  if (dtype === 'fixed') {
    discountAmount = Math.round(dval);
    discountedTicketCount = 1;
  } else if (dtype === 'percentage' || dtype === 'internal') {
    const sortedPrices = [...pricedSlots].map(s => Number(s.finalPrice || 0)).sort((a, b) => b - a);
    const eligibleCount = remainingUses != null ? Math.min(sortedPrices.length, remainingUses) : sortedPrices.length;
    const cappedCount = maxSeats != null ? Math.min(eligibleCount, maxSeats) : eligibleCount;
    const discountableSubtotal = sortedPrices.slice(0, cappedCount).reduce((s, p) => s + p, 0);
    discountAmount = Math.round(discountableSubtotal * (effectivePercent / 100));
    discountedTicketCount = cappedCount;
  }

  const baseSubtotal = pricedSlots.reduce((s, slot) => s + Number(slot.finalPrice || 0), 0);
  if (discountAmount > baseSubtotal) discountAmount = baseSubtotal;
  return { discountAmount, discountedTicketCount, baseSubtotal };
}

// POST /api/payments/pack-preview
// Returns the authoritative pack breakdown without creating a pack sale or payment order.
router.post('/pack-preview', optionalAuth, async (req, res) => {
  try {
    const { reservation_ids, discount_id } = req.body || {};
    if (!Array.isArray(reservation_ids) || reservation_ids.length < 2) {
      return res.status(400).json({ error: 'At least 2 reservations are required for a pack' });
    }
    const { reservations: Reservation, sessions: Session, shows: Show, discounts: Discount } = sequelize.models;

    const reservations = await Reservation.findAll({
      where: { id: { [Op.in]: reservation_ids } },
      include: [{ model: Session, as: 'session', include: [{ model: Show, as: 'show' }] }]
    });

    if (reservations.length !== reservation_ids.length) {
      return res.status(404).json({ error: 'One or more reservations not found' });
    }

    const now = dayjs();
    for (const r of reservations) {
      if (r.status !== 'active' || dayjs(r.expires_at).isBefore(now)) {
        return res.status(409).json({ error: 'reservation_not_active', reservation_id: r.id });
      }
    }

    const showId = reservations[0].session?.show_id;
    if (!showId || reservations.some(r => r.session?.show_id !== showId)) {
      return res.status(400).json({ error: 'All reservations must belong to the same show' });
    }

    const show = reservations[0].session?.show;
    if (!show?.pack_enabled || !show?.pack_pricing_json) {
      return res.status(400).json({ error: 'Pack not enabled for this show' });
    }

    if (reservations.length > show.pack_max_sessions) {
      return res.status(400).json({ error: 'pack_max_sessions_exceeded', max: show.pack_max_sessions });
    }

    const itemsBySession = {};
    const serviceItemsByReservation = [];
    for (const r of reservations) {
      const items = Array.isArray(r.items) ? r.items : [];
      itemsBySession[r.session_id] = items;
      serviceItemsByReservation.push({ reservation_id: r.id, service_items: parsePackServiceItems(r.service_items) });
    }

    const packPricing = show.pack_pricing_json;
    const pricedSlots = computePackTicketPrices(itemsBySession, packPricing, show.pack_max_sessions);

    let discountAmount = 0;
    let discountedTicketCount = 0;
    let discount = null;
    if (discount_id) {
      discount = await Discount.findByPk(discount_id);
      if (discount && discount.active !== false) {
        const result = computePackDiscountAmount(pricedSlots, discount);
        discountAmount = result.discountAmount;
        discountedTicketCount = result.discountedTicketCount;
      }
    }

    const allServiceItems = serviceItemsByReservation.flatMap(r => r.service_items);
    const serviceFeePercent = await getServiceFeePercent();
    const totals = calculatePackTotals(pricedSlots, serviceFeePercent, allServiceItems, discountAmount);

    const slotsBySession = {};
    for (const slot of pricedSlots) {
      if (!slotsBySession[slot.session_id]) slotsBySession[slot.session_id] = [];
      slotsBySession[slot.session_id].push(slot);
    }

    return res.json({
      pack_id: null,
      show_id: showId,
      pack_size: reservations.length,
      max_pack_size: show.pack_max_sessions,
      priced_slots: pricedSlots,
      slots_by_session: slotsBySession,
      service_items_by_reservation: serviceItemsByReservation,
      discount: discount ? { id: discount.id, code: discount.code, amount: discountAmount, discounted_ticket_count: discountedTicketCount } : null,
      ...totals
    });
  } catch (e) {
    console.error('[PACK_PREVIEW] error', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// Crear intención de pago Sipago
// Body: { reservation_id: string, discount_id?: string, customer_name?, customer_email?, customer_phone?, customer_dni?, customer_provincia?, customer_localidad? }
router.post('/sipago-intent', optionalAuth, async (req, res) => {
  try {
    const { reservation_id, discount_id, customer_name, customer_email, customer_phone, customer_dni, customer_provincia, customer_localidad, service_items } = req.body || {};
    if (!reservation_id) return res.status(400).json({ error: 'reservation_id required' });
    const Reservation = sequelize.models.reservations;
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) return res.status(404).json({ error: 'reservation not found' });
    if (reservation.status !== 'active') return res.status(409).json({ error: 'reservation_not_active' });
    // Extender la reserva mientras el usuario está activamente pagando en SiPago (+5 min)
    await reservation.update({ expires_at: dayjs(reservation.expires_at).add(5, 'minute').toDate() });
    // Calcular total a partir de los items + descuento + cargo por servicio
    const items = Array.isArray(reservation.items) ? reservation.items : [];
    let subtotal = items.reduce((sum, it) => {
      if (it.type === 'butaca' || it.type === 'palco') return sum + Number(it.price || 0);
      if (it.type === 'pullman' || it.type === 'general') return sum + (Number(it.unit_price || it.price || 0) * Number(it.quantity || 1));
      return sum;
    }, 0);
    let discountAmount = 0;
    if (discount_id) {
      const { discounts: Discount } = sequelize.models;
      const disc = await Discount.findByPk(discount_id).catch(()=>null);
      if (disc && disc.active !== false) {
        const result = computeDiscountAmount(items, disc);
        discountAmount = result.discountAmount;
        subtotal = result.baseSubtotal;
      }
    }
    const validServiceItems = Array.isArray(service_items) ? service_items.filter(s => s && s.service_id && Number(s.quantity) > 0) : [];
    const servicesSubtotal = validServiceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);
    const serviceFeePercent = await getServiceFeePercent();
    const subtotalAfterDiscount = subtotal - discountAmount;
    const serviceFeeAmount = Math.round((subtotalAfterDiscount + servicesSubtotal) * (serviceFeePercent / 100));
    const total = subtotalAfterDiscount + serviceFeeAmount + servicesSubtotal;

    // Save service_items to reservation for webhook to retrieve (store as JSON string since column is longtext)
    const serviceItemsToSave = validServiceItems.length > 0 ? JSON.stringify(validServiceItems) : null;
    await reservation.update({ service_items: serviceItemsToSave });
    console.log('[SIPAGO_INTENT] Saved service_items to reservation:', reservation.id, validServiceItems);
    console.log('[SIPAGO_INTENT] service_items saved as:', serviceItemsToSave);
    if (!total || total <= 0) return res.status(400).json({ error: 'invalid_total' });
    // Sipago espera montos en centavos (ej: $34 -> 3400)
    const totalCentavos = Math.round(total * 100);

    // Build descriptive items for Sipago checkout
    const { sessions: Session, shows: Show } = sequelize.models;
    const session = await Session.findByPk(reservation.session_id, {
      include: [{ model: Show, as: 'show', attributes: ['title'] }]
    });
    const showTitle = session?.show?.title || 'Teatro';
    // Count seats (palco bajo = 4, palco alto = 2)
    let ticketCount = 0;
    for (const it of items) {
      if (it.type === 'butaca') ticketCount += 1;
      else if (it.type === 'palco' && it.seat_code) {
        ticketCount += /^PB/i.test(it.seat_code) ? 4 : 2;
      }
      else if ((it.type === 'pullman' || it.type === 'general') && it.quantity > 0) ticketCount += Number(it.quantity);
    }
    const sipagoItems = [{
      id: `entradas_${reservation.id}`,
      name: `${showTitle} (x${ticketCount})`,
      unitPrice: { currency: '032', amount: totalCentavos },
      quantity: 1
    }];

    // URLs de retorno
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
    const reqOrigin = req.headers.origin || '';
    const APP_URL = process.env.APP_URL || reqOrigin || FRONTEND_URL;
    const redirectBaseSuccess = new URL(`${APP_URL}/sipago/success`);
    redirectBaseSuccess.searchParams.set('reservation_id', String(reservation.id));
    if (discount_id) redirectBaseSuccess.searchParams.set('discount_id', String(discount_id));
    const redirectBaseFailure = new URL(`${APP_URL}/sipago/failure`);
    redirectBaseFailure.searchParams.set('reservation_id', String(reservation.id));
    if (discount_id) redirectBaseFailure.searchParams.set('discount_id', String(discount_id));
    const redirect_urls = {
      success: redirectBaseSuccess.toString(),
      failed: redirectBaseFailure.toString()
    };
    const hookParams = new URLSearchParams({ reservation_id: String(reservation.id) });
    if (discount_id) hookParams.set('discount_id', String(discount_id));
    if (customer_name) hookParams.set('customer_name', String(customer_name));
    if (customer_email) hookParams.set('customer_email', String(customer_email));
    if (customer_phone) hookParams.set('customer_phone', String(customer_phone));
    if (customer_dni) hookParams.set('customer_dni', String(customer_dni));
    if (customer_provincia) hookParams.set('customer_provincia', String(customer_provincia));
    if (customer_localidad) hookParams.set('customer_localidad', String(customer_localidad));
    if (validServiceItems.length > 0) hookParams.set('service_items', JSON.stringify(validServiceItems));
    if (process.env.SIPAGO_WEBHOOK_SECRET) hookParams.set('secret', process.env.SIPAGO_WEBHOOK_SECRET);
    const webhookUrl = `${BASE_URL}/api/payments/sipago-webhook?${hookParams.toString()}`;
    console.log('[SIPAGO_INTENT] Webhook URL:', webhookUrl);
    const order = await createSipagoOrder({ total: totalCentavos, redirect_urls, items: sipagoItems, webhookUrl });
    const checkoutUrl = order?.data?.attributes?.links?.checkout || order?.data?.links?.checkout;
    if (!checkoutUrl) return res.status(500).json({ error: 'sipago_checkout_missing', debug: order });
    return res.json({ checkout_url: checkoutUrl, order });
  } catch (e) {
    console.error('[SIPAGO_INTENT] error', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// Crear intención de pago Sipago para un pack de funciones
// Body: { reservation_ids: string[], discount_id?: string, service_items?: array, customer_name?, customer_email?, customer_phone?, customer_dni?, customer_provincia?, customer_localidad? }
router.post('/sipago-pack-intent', optionalAuth, async (req, res) => {
  try {
    const {
      reservation_ids,
      discount_id,
      customer_name,
      customer_email,
      customer_phone,
      customer_dni,
      customer_provincia,
      customer_localidad,
      service_items
    } = req.body || {};

    if (!Array.isArray(reservation_ids) || reservation_ids.length < 2) {
      return res.status(400).json({ error: 'At least 2 reservations are required for a pack' });
    }

    const { reservations: Reservation, sessions: Session, shows: Show, discounts: Discount, pack_sales: PackSale } = sequelize.models;

    const reservations = await Reservation.findAll({
      where: { id: { [Op.in]: reservation_ids } },
      include: [{ model: Session, as: 'session', include: [{ model: Show, as: 'show' }] }]
    });

    if (reservations.length !== reservation_ids.length) {
      return res.status(404).json({ error: 'One or more reservations not found' });
    }

    const now = dayjs();
    for (const r of reservations) {
      if (r.status !== 'active' || dayjs(r.expires_at).isBefore(now)) {
        return res.status(409).json({ error: 'reservation_not_active', reservation_id: r.id });
      }
    }

    const showId = reservations[0].session?.show_id;
    if (!showId || reservations.some(r => r.session?.show_id !== showId)) {
      return res.status(400).json({ error: 'All reservations must belong to the same show' });
    }

    const show = reservations[0].session?.show;
    if (!show?.pack_enabled || !show?.pack_pricing_json) {
      return res.status(400).json({ error: 'Pack not enabled for this show' });
    }

    if (reservations.length > show.pack_max_sessions) {
      return res.status(400).json({ error: 'pack_max_sessions_exceeded', max: show.pack_max_sessions });
    }

    // Generate pack_id and assign to all reservations
    const packId = crypto.randomUUID();
    await Reservation.update(
      { pack_id: packId },
      { where: { id: { [Op.in]: reservation_ids } } }
    );

    // Recalculate expiration for all reservations in the pack
    const newExpiresAt = dayjs().add(15, 'minute').toDate();
    await Reservation.update(
      { expires_at: newExpiresAt },
      { where: { pack_id: packId, status: 'active' } }
    );

    // Compute pack pricing
    const itemsBySession = {};
    const serviceItemsByReservation = [];
    for (const r of reservations) {
      itemsBySession[r.session_id] = Array.isArray(r.items) ? r.items : [];
      serviceItemsByReservation.push({ reservation_id: r.id, service_items: parsePackServiceItems(r.service_items) });
    }

    const packPricing = show.pack_pricing_json;
    const pricedSlots = computePackTicketPrices(itemsBySession, packPricing, show.pack_max_sessions);

    let discountAmount = 0;
    let discountedTicketCount = 0;
    let discount = null;
    if (discount_id) {
      discount = await Discount.findByPk(discount_id);
      if (discount && discount.active !== false) {
        const result = computePackDiscountAmount(pricedSlots, discount);
        discountAmount = result.discountAmount;
        discountedTicketCount = result.discountedTicketCount;
      }
    }

    const validServiceItems = Array.isArray(service_items)
      ? service_items.filter(s => s && s.service_id && Number(s.quantity) > 0)
      : serviceItemsByReservation.flatMap(r => r.service_items);
    const servicesSubtotal = validServiceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);
    const serviceFeePercent = await getServiceFeePercent();
    const subtotalAfterDiscount = pricedSlots.reduce((s, slot) => s + Number(slot.finalPrice || 0), 0) - discountAmount;
    const serviceFeeAmount = Math.round((subtotalAfterDiscount + servicesSubtotal) * (serviceFeePercent / 100));
    const total = subtotalAfterDiscount + serviceFeeAmount + servicesSubtotal;

    if (!total || total <= 0) {
      return res.status(400).json({ error: 'invalid_total' });
    }

    // Save pack sale record
    const packSale = await PackSale.create({
      id: packId,
      user_id: req.user?.userId || reservations[0].user_id || null,
      discount_id: discount_id || null,
      payment_method: 'card',
      payment_status: 'pending',
      subtotal: pricedSlots.reduce((s, slot) => s + Number(slot.finalPrice || 0), 0),
      discount_amount: discountAmount,
      service_fee_percent: serviceFeePercent,
      service_fee_amount: serviceFeeAmount,
      services_subtotal: servicesSubtotal,
      total_amount: total,
      service_items: validServiceItems.length > 0 ? validServiceItems : null,
      customer_name: customer_name || null,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      customer_dni: customer_dni || null,
      customer_provincia: customer_provincia || null,
      customer_localidad: customer_localidad || null,
      metadata: { reservation_ids, discounted_ticket_count: discountedTicketCount }
    });

    // Build Sipago order
    const totalCentavos = Math.round(total * 100);
    const sipagoItems = [{
      id: `pack_${packId}`,
      name: `${show.title || 'Teatro'} - Pack ${reservations.length} funciones`,
      unitPrice: { currency: '032', amount: totalCentavos },
      quantity: 1
    }];

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
    const reqOrigin = req.headers.origin || '';
    const APP_URL = process.env.APP_URL || reqOrigin || FRONTEND_URL;
    const redirectBaseSuccess = new URL(`${APP_URL}/sipago/success`);
    redirectBaseSuccess.searchParams.set('pack_id', packId);
    if (discount_id) redirectBaseSuccess.searchParams.set('discount_id', String(discount_id));
    const redirectBaseFailure = new URL(`${APP_URL}/sipago/failure`);
    redirectBaseFailure.searchParams.set('pack_id', packId);
    if (discount_id) redirectBaseFailure.searchParams.set('discount_id', String(discount_id));
    const redirect_urls = {
      success: redirectBaseSuccess.toString(),
      failed: redirectBaseFailure.toString()
    };

    const hookParams = new URLSearchParams({ pack_id: packId });
    if (process.env.SIPAGO_WEBHOOK_SECRET) hookParams.set('secret', process.env.SIPAGO_WEBHOOK_SECRET);
    const webhookUrl = `${BASE_URL}/api/payments/sipago-pack-webhook?${hookParams.toString()}`;
    console.log('[SIPAGO_PACK_INTENT] Webhook URL:', webhookUrl);

    const order = await createSipagoOrder({ total: totalCentavos, redirect_urls, items: sipagoItems, webhookUrl });
    const checkoutUrl = order?.data?.attributes?.links?.checkout || order?.data?.links?.checkout;
    if (!checkoutUrl) {
      await packSale.update({ payment_status: 'rejected' });
      return res.status(500).json({ error: 'sipago_checkout_missing', debug: order });
    }

    // Store Sipago order id if available
    const sipagoOrderId = order?.data?.id || order?.data?.attributes?.id || null;
    if (sipagoOrderId) await packSale.update({ sipago_order_id: String(sipagoOrderId) });

    return res.json({ checkout_url: checkoutUrl, pack_id: packId, order });
  } catch (e) {
    console.error('[SIPAGO_PACK_INTENT] error', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});


// Webhook Sipago: recibe notificaciones del estado de la orden
router.post('/sipago-webhook', async (req, res) => {
  console.log('[SIPAGO_WEBHOOK] 🔔 Received webhook call');
  try {
    // SiPago puede enviar el secret en query params o en body
    const secret = req.query?.secret || req.body?.secret;
    console.log('[SIPAGO_WEBHOOK] Received secret:', secret);
    console.log('[SIPAGO_WEBHOOK] Expected secret:', process.env.SIPAGO_WEBHOOK_SECRET);
    if (process.env.SIPAGO_WEBHOOK_SECRET && secret !== process.env.SIPAGO_WEBHOOK_SECRET) {
      console.warn('[SIPAGO_WEBHOOK] invalid secret');
      return res.status(200).json({ ignored: true });
    }

    const reservationId = req.query?.reservation_id || req.body?.reservation_id;
    console.log('[SIPAGO_WEBHOOK] req.query:', JSON.stringify(req.query));
    console.log('[SIPAGO_WEBHOOK] req.body:', JSON.stringify(req.body));
    if (!reservationId) {
      console.warn('[SIPAGO_WEBHOOK] missing reservation_id');
      return res.status(200).json({ ignored: true });
    }

    const { reservations: Reservation, tickets: Ticket, sales: Sale, discounts: Discount, users: User } = sequelize.models;
    const reservation = await Reservation.findByPk(reservationId);
    if (!reservation) {
      console.warn('[SIPAGO_WEBHOOK] reservation not found:', reservationId);
      return res.status(200).json({ ignored: true });
    }

    console.log('[SIPAGO_WEBHOOK] reservation found, service_items type:', typeof reservation.service_items, 'value:', reservation.service_items);

    const payload = req.body || {};
    const orderStatus = (payload?.data?.order?.status || '').toString().toUpperCase();
    console.log('[SIPAGO_WEBHOOK] order.status =', orderStatus);

    if (orderStatus !== 'SUCCESS') {
      return res.status(200).json({ ok: true, status: orderStatus });
    }

    // PROTECCIÓN CONTRA DOBLE VENTA
    // 1. Verificar que la reserva no esté ya confirmada
    if (reservation.status === 'confirmed') {
      console.log('[SIPAGO_WEBHOOK] Reservation already confirmed, skipping');
      return res.status(200).json({ ok: true, already_confirmed: true });
    }

    // 2. Verificar que la reserva no esté expirada o cancelada
    if (reservation.status === 'expired' || reservation.status === 'canceled') {
      console.warn('[SIPAGO_WEBHOOK] ⚠️ Reservation expired/canceled, rejecting payment:', reservation.status);
      return res.status(200).json({ ok: false, error: 'reservation_expired', status: reservation.status });
    }

    // 3. Verificar que las butacas/palcos NO estén ya vendidos (tickets existentes)
    const items = Array.isArray(reservation.items) ? reservation.items : [];
    const seatCodes = items.filter(it => it.type === 'butaca' && it.seat_code).map(it => it.seat_code);
    const palcoCodes = items.filter(it => it.type === 'palco' && it.seat_code).map(it => it.seat_code);
    
    if (seatCodes.length > 0 || palcoCodes.length > 0) {
      const orConditions = [];
      if (seatCodes.length > 0) orConditions.push({ seat_code: { [Op.in]: seatCodes }, type: 'butaca' });
      if (palcoCodes.length > 0) orConditions.push({ seat_code: { [Op.in]: palcoCodes }, type: 'palco' });
      const existingTickets = await Ticket.findAll({
        where: {
          session_id: reservation.session_id,
          status: 'sold',
          [Op.or]: orConditions
        }
      });
      
      if (existingTickets.length > 0) {
        const soldSeats = existingTickets.map(t => t.seat_code);
        console.error('[SIPAGO_WEBHOOK] ❌ DOBLE VENTA PREVENIDA! Butacas ya vendidas:', soldSeats);
        return res.status(200).json({ 
          ok: false, 
          error: 'seats_already_sold', 
          sold_seats: soldSeats,
          message: 'Algunas butacas ya fueron vendidas a otro usuario'
        });
      }
    }

    // Re-fetch reservation fresh to catch race condition with /sipago-confirm
    const freshReservation = await Reservation.findByPk(reservationId);
    if (freshReservation?.sale_id) {
      console.log('[SIPAGO_WEBHOOK] /sipago-confirm already processed this reservation, sale_id:', freshReservation.sale_id);
      return res.status(200).json({ ok: true, already_confirmed: true, sale_id: freshReservation.sale_id });
    }

    const tempSaleId = crypto.randomUUID();
    await reservation.update({ status: 'confirmed', sale_id: tempSaleId });

    // items ya fue declarado arriba para la validación
    const { generateContainerQR } = await import('../lib/qrGenerator.js');
    const containerQR = await generateContainerQR(tempSaleId, items);

    let customerName = req.query?.customer_name || null;
    let customerEmail = req.query?.customer_email || null;
    let customerPhone = req.query?.customer_phone || null;
    let customerDni = req.query?.customer_dni || null;
    let customerProvincia = req.query?.customer_provincia || null;
    let customerLocalidad = req.query?.customer_localidad || null;
    const metaDiscountId = req.query?.discount_id || null;
    let webhookServiceItems = [];
    try {
      // Try to get service_items from reservation first (SiPago strips them from query params)
      // Use freshReservation for service_items (re-fetched after race condition check)
      const rawServiceItems = freshReservation?.service_items ?? reservation.service_items;
      console.log('[SIPAGO_WEBHOOK] service_items type:', typeof rawServiceItems, 'value:', rawServiceItems);
      if (rawServiceItems) {
        if (typeof rawServiceItems === 'string') {
          webhookServiceItems = JSON.parse(rawServiceItems);
          console.log('[SIPAGO_WEBHOOK] Parsed service_items from string:', webhookServiceItems);
        } else if (Array.isArray(rawServiceItems)) {
          webhookServiceItems = rawServiceItems;
          console.log('[SIPAGO_WEBHOOK] Retrieved service_items from reservation (array):', webhookServiceItems);
        } else {
          console.log('[SIPAGO_WEBHOOK] service_items is neither string nor array:', rawServiceItems);
        }
      } else if (req.query?.service_items) {
        webhookServiceItems = JSON.parse(req.query.service_items);
        console.log('[SIPAGO_WEBHOOK] Received service_items from query:', webhookServiceItems);
      } else {
        console.log('[SIPAGO_WEBHOOK] No service_items in reservation or request');
      }
    } catch (e) {
      console.error('[SIPAGO_WEBHOOK] Error parsing service_items:', e);
    }

    // Safety net: if no customer data but reservation has user_id, look up user profile
    if (!customerName && reservation.user_id) {
      try {
        const { users: User } = sequelize.models;
        const u = await User.findByPk(reservation.user_id, { attributes: ['name', 'email', 'phone', 'dni', 'provincia', 'localidad'], raw: true });
        if (u) {
          customerName = u.name || customerName;
          customerEmail = u.email || customerEmail;
          customerPhone = u.phone || customerPhone;
          customerDni = u.dni || customerDni;
          customerProvincia = u.provincia || customerProvincia;
          customerLocalidad = u.localidad || customerLocalidad;
        }
      } catch (e) { console.warn('[SIPAGO_WEBHOOK] Could not fetch user data:', e.message); }
    }

    // Try to link to an existing user by DNI when the reservation has no user_id
    let finalUserId = reservation.user_id || null;
    if (!finalUserId && customerDni) {
      try {
        const existingUser = await User.findOne({ where: { dni: customerDni } });
        if (existingUser) {
          finalUserId = existingUser.id;
          console.log('[SIPAGO_WEBHOOK] Found existing user by DNI:', customerDni, '-> user_id:', finalUserId);
          await reservation.update({ user_id: finalUserId });
        }
      } catch (e) { console.warn('[SIPAGO_WEBHOOK] Could not find user by DNI:', e.message); }
    }

    // Compute final amount from reservation items + discount + service fee
    const baseItems = Array.isArray(reservation.items) ? reservation.items : [];
    let webhookDiscountAmount = 0;
    let webhookDiscountedTicketCount = 0;
    let webhookBaseSubtotal = baseItems.reduce((sum, it) => {
      if (it.type === 'butaca' || it.type === 'palco') return sum + Number(it.price || 0);
      if (it.type === 'pullman' || it.type === 'general') return sum + (Number(it.unit_price || it.price || 0) * Number(it.quantity || 1));
      return sum;
    }, 0);
    if (metaDiscountId) {
      try {
        const { discounts: Discount } = sequelize.models;
        const d = await Discount.findByPk(metaDiscountId);
        if (d && d.active !== false) {
          const result = computeDiscountAmount(baseItems, d);
          webhookDiscountAmount = result.discountAmount;
          webhookDiscountedTicketCount = result.discountedTicketCount;
          webhookBaseSubtotal = result.baseSubtotal;
        }
      } catch {}
    }
    // Calculate subtotal after discount (this is what we store - NO service fee)
    const webhookSubtotalAfterDiscount = webhookBaseSubtotal - webhookDiscountAmount;
    const webhookServicesSubtotal = webhookServiceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);
    const paymentMethod = 'card';

    const sale = await Sale.create({
      id: tempSaleId,
      session_id: reservation.session_id,
      user_id: finalUserId,
      cashier_id: null,
      payment_method: paymentMethod,
      discount_id: metaDiscountId || null,
      total_amount: (webhookSubtotalAfterDiscount || 0) + webhookServicesSubtotal,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      customer_dni: customerDni,
      customer_provincia: customerProvincia,
      customer_localidad: customerLocalidad,
      container_qr_code: containerQR.qr_code,
      container_qr_data: containerQR.qr_data,
      validated_count: 0,
      total_capacity: containerQR.total_capacity,
      service_items: Array.isArray(webhookServiceItems) && webhookServiceItems.length > 0 ? webhookServiceItems : null,
    });
    console.log('[SIPAGO_WEBHOOK] Sale created with service_items:', sale.service_items);

    if (metaDiscountId) {
      try {
        const discount = await Discount.findByPk(metaDiscountId);
        if (discount) await discount.increment('used_count', { by: webhookDiscountedTicketCount || 1 });
      } catch {}
    }

    const { generateIndividualQR } = await import('../lib/qrGenerator.js');
    const createdTickets = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code) {
        console.log('[SIPAGO_WEBHOOK] Creating butaca ticket for seat:', it.seat_code);
        const t = await Ticket.create({
          session_id: reservation.session_id,
          sale_id: sale.id,
          user_id: finalUserId,
          seat_code: it.seat_code,
          section: 'platea_general',
          type: 'butaca',
          price: Number(it.price || 0),
          qr_code: null,
          status: 'sold',
          capacity: 1,
          capacity_validated: 0
        });
        console.log('[SIPAGO_WEBHOOK] Ticket created with status:', t.status, 'for seat:', it.seat_code);
        const { qr_code, qr_data } = await generateIndividualQR(t.id, it.seat_code, 'butaca');
        await t.update({ qr_code, qr_data });
        createdTickets.push(t);
      } else if (it.type === 'palco' && it.seat_code) {
        const isPB = /^PB/i.test(it.seat_code);
        const palcoSection = isPB ? 'palcos_bajos' : 'palcos_altos';
        const palcoCapacity = isPB ? 4 : 2;
        const t = await Ticket.create({
          session_id: reservation.session_id,
          sale_id: sale.id,
          user_id: finalUserId,
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
        const ticketPrice = Number(it.unit_price || it.price || 0);
        for (let i = 0; i < qty; i++) {
          const t = await Ticket.create({
            session_id: reservation.session_id,
            sale_id: sale.id,
            user_id: finalUserId,
            seat_code: null,
            section: 'pullman',
            type: 'pullman',
            price: ticketPrice,
            qr_code: null,
            status: 'sold',
          });
          const { qr_code, qr_data } = await generateIndividualQR(t.id, null, 'pullman');
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        }
      } else if (it.type === 'general' && it.quantity > 0) {
        const qty = Number(it.quantity) || 0;
        const ticketPrice = Number(it.unit_price || it.price || 0);
        for (let i = 0; i < qty; i++) {
          const t = await Ticket.create({
            session_id: reservation.session_id,
            sale_id: sale.id,
            user_id: finalUserId,
            seat_code: null,
            section: 'general',
            type: 'general',
            price: ticketPrice,
            qr_code: null,
            status: 'sold',
            capacity: 1,
            capacity_validated: 0
          });
          const { qr_code, qr_data } = await generateIndividualQR(t.id, null, 'general');
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        }
      }
    }

    // Create service tickets (one per service item, capacity = quantity)
    for (const svc of webhookServiceItems) {
      const svcT = await Ticket.create({
        session_id: reservation.session_id,
        sale_id: sale.id,
        user_id: finalUserId,
        seat_code: svc.name,
        section: 'service',
        type: 'service',
        price: Number(svc.price || 0),
        qr_code: null,
        status: 'sold',
        capacity: Number(svc.quantity || 1),
        capacity_validated: 0
      });
      const { qr_code: sQr, qr_data: sQd } = await generateIndividualQR(svcT.id, svc.name, 'service');
      await svcT.update({ qr_code: sQr, qr_data: sQd });
      createdTickets.push(svcT);
    }

    try {
      const io = req.app.get('io');
      io.soldSeats = io.soldSeats || new Map();
      io.soldPalcos = io.soldPalcos || new Map();
      io.pullmanSold = io.pullmanSold || new Map();
      const seatSet = io.soldSeats.get(reservation.session_id) || new Set();
      const palcoSet = io.soldPalcos.get(reservation.session_id) || new Set();
      let pullmanCount = io.pullmanSold.get(reservation.session_id) || 0;
      let generalCount = 0;
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) seatSet.add(it.seat_code);
        if (it.type === 'palco' && it.seat_code) palcoSet.add(it.seat_code);
        if (it.type === 'pullman' && it.quantity > 0) pullmanCount += Number(it.quantity) || 0;
        if (it.type === 'general' && it.quantity > 0) generalCount += Number(it.quantity) || 0;
      }
      io.soldSeats.set(reservation.session_id, seatSet);
      io.soldPalcos.set(reservation.session_id, palcoSet);
      io.pullmanSold.set(reservation.session_id, pullmanCount);
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) io.to(`session:${reservation.session_id}`).emit('seat_sold', { seatId: it.seat_code });
        if (it.type === 'palco' && it.seat_code) io.to(`session:${reservation.session_id}`).emit('palco_sold', { palco: it.seat_code });
        if (it.type === 'pullman' && it.quantity > 0) io.to(`session:${reservation.session_id}`).emit('pullman_sold', { sold: Number(it.quantity) || 0 });
      }
      if (generalCount > 0) {
        const { sessions: Session, shows: Show, tickets: Ticket } = sequelize.models;
        const session = await Session.findByPk(reservation.session_id, { include: [{ model: Show, as: 'show' }] });
        if (session && session.show) {
          const capacity = session.capacity_override || session.show.general_capacity;
          const soldCount = await Ticket.count({ where: { session_id: reservation.session_id, type: 'general', status: { [Op.in]: ['sold', 'validated'] } } });
          const available = Math.max(0, capacity - soldCount);
          io.to(`session:${reservation.session_id}`).emit('general-admission-update', { sessionId: reservation.session_id, sold: soldCount, available });
        }
      }
      io.to(`session:${reservation.session_id}`).emit('purchase_confirmed', { reservation_id: reservation.id });
    } catch {}

    try {
      const { users: User, sessions: Session, shows: Show } = sequelize.models;
      const user = finalUserId ? await User.findByPk(finalUserId) : null;
      const session = await Session.findByPk(reservation.session_id, { include: [{ model: Show, as: 'show' }] });
      const emailToSend = user?.email || customerEmail;
      const nameToSend = user?.name || customerName;
      if (emailToSend && session) {
        const { formatDateLong, formatTime } = await import('../lib/dateFormatter.js');
        const { sendPurchaseConfirmation } = await import('../lib/emailService.js');
        const { formatSeatLocation } = await import('../lib/seatFormatter.js');
        const formattedTicketsForEmail = createdTickets.map(t => ({
          ...t.get ? t.get({ plain: true }) : t,
          location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1)
        }));

        // Calculate totals for email (exclude service-type tickets from ticketsSubtotal)
        const serviceFeePercent = await getServiceFeePercent();
        const regularTicketsForEmail = formattedTicketsForEmail.filter(t => t.type !== 'service');
        const ticketsSubtotal = regularTicketsForEmail.reduce((sum, t) => sum + Number(t.price || 0), 0);
        const servicesSubtotal = webhookServiceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);
        const serviceFeeAmount = Math.round((ticketsSubtotal + servicesSubtotal) * (serviceFeePercent / 100));

        // Get discount info if available
        let discountCode = null;
        let discountAmount = 0;
        if (metaDiscountId) {
          try {
            const disc = await Discount.findByPk(metaDiscountId);
            if (disc) {
              discountCode = disc.alias || disc.code;
              const dtype = String(disc.type || '').toLowerCase();
              const dval = Number(disc.value || 0);
              if (dtype === 'percentage') discountAmount = Math.round(ticketsSubtotal * (dval / 100));
              else if (dtype === 'fixed') discountAmount = Math.round(dval);
            }
          } catch {}
        }

        await sendPurchaseConfirmation({
          customerEmail: emailToSend,
          customerName: nameToSend,
          showTitle: session.show.title,
          sessionDate: formatDateLong(session.starts_at),
          sessionTime: formatTime(session.starts_at),
          tickets: regularTicketsForEmail,
          saleId: sale.id,
          totalAmount: sale.total_amount,
          paymentMethod: sale.payment_method || 'card',
          subtotal: ticketsSubtotal,
          discountCode,
          discountAmount: discountAmount > 0 ? discountAmount : null,
          serviceFeePercent,
          serviceFeeAmount,
          serviceItems: webhookServiceItems,
          servicesSubtotal
        });
        console.log('[SIPAGO_WEBHOOK] Email sent successfully');
      }
    } catch (emailErr) {
      console.error('[SIPAGO_WEBHOOK] Email error:', emailErr);
    }

    return res.status(200).json({ ok: true, sale_id: reservation.sale_id });
  } catch (e) {
    console.error('[SIPAGO_WEBHOOK] unexpected error', e);
    return res.status(200).json({ ok: true });
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
          code: sale.discount.alias || sale.discount.code,
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

// Mercado Pago webhook removed after migration to Sipago

// Get sale_id and full purchase breakdown for a reservation
router.get('/sale/:reservation_id', async (req, res) => {
  try {
    const { reservation_id } = req.params;
    const { reservations: Reservation, sales: Sale, discounts: Discount } = sequelize.models;
    
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) return res.status(404).json({ error: 'reservation_not_found' });
    
    const saleId = reservation.sale_id || null;
    
    // Compute full breakdown from reservation items
    const items = Array.isArray(reservation.items) ? reservation.items : [];
    const subtotal = items.reduce((sum, it) => {
      if (it.type === 'butaca' || it.type === 'palco') return sum + Number(it.price || 0);
      if (it.type === 'pullman' || it.type === 'general') return sum + (Number(it.unit_price || it.price || 0) * Number(it.quantity || 1));
      return sum;
    }, 0);
    
    // Get discount info and customer email from the sale
    let discountInfo = null;
    let discountAmount = 0;
    let customerEmail = null;
    let emailAutoSent = false;
    let saleServiceItems = [];
    if (saleId) {
      const { users: User } = sequelize.models;
      const sale = await Sale.findByPk(saleId, {
        attributes: { include: ['service_items'] },
        include: [{ model: Discount, as: 'discount', required: false }]
      });
      if (sale) {
        // Get the email that was used for auto-send
        if (sale.user_id) {
          const user = await User.findByPk(sale.user_id);
          if (user?.email) customerEmail = user.email;
        }
        if (!customerEmail && sale.customer_email) customerEmail = sale.customer_email;
        emailAutoSent = !!customerEmail;
        
        if (sale.discount) {
          discountInfo = {
            code: sale.discount.alias || sale.discount.code,
            type: sale.discount.type,
            value: sale.discount.value
          };
          const dtype = String(sale.discount.type || '').toLowerCase();
          const dval = Number(sale.discount.value || 0);
          if (dtype === 'percentage') discountAmount = Math.round(subtotal * (dval / 100));
          else if (dtype === 'fixed') discountAmount = Math.round(dval);
          if (discountAmount > subtotal) discountAmount = subtotal;
        }

        // Parse service_items stored in the sale
        saleServiceItems = parseServiceItems(sale.service_items);
        if (saleServiceItems.length > 0) {
          console.log('[SALE_ID] Parsed service_items from sale:', saleServiceItems);
        } else {
          console.log('[SALE_ID] No service_items in sale');
        }
      }
    }

    // Ensure saleServiceItems is always an array
    if (!Array.isArray(saleServiceItems)) {
      saleServiceItems = [];
      console.log('[SALE_ID] saleServiceItems was not an array, set to empty array');
    }

    const servicesSubtotal = saleServiceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);
    const serviceFeePercent = await getServiceFeePercent();
    const subtotalAfterDiscount = subtotal - discountAmount;
    const serviceFeeAmount = Math.round((subtotalAfterDiscount + servicesSubtotal) * (serviceFeePercent / 100));
    const total = subtotalAfterDiscount + serviceFeeAmount + servicesSubtotal;
    
    return res.json({
      sale_id: saleId,
      subtotal,
      discount: discountInfo,
      discount_amount: discountAmount,
      service_fee_percent: serviceFeePercent,
      service_fee_amount: serviceFeeAmount,
      services_subtotal: servicesSubtotal,
      service_items: saleServiceItems,
      total,
      customer_email: customerEmail,
      email_auto_sent: emailAutoSent
    });
  } catch (error) {
    console.error('[SALE_ID] Error:', error);
    return res.status(500).json({ error: 'server_error' });
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
    
    // Get sale_id from reservation
    const saleId = reservation.sale_id;
    if (!saleId) {
      return res.status(400).json({ error: 'sale_not_completed' });
    }
    
    // Get sale with container QR and discount
    const { discounts: Discount } = sequelize.models;
    const sale = await Sale.findByPk(saleId, {
      include: [{ model: Discount, as: 'discount', required: false }]
    });
    if (!sale) {
      return res.status(404).json({ error: 'sale_not_found' });
    }
    
    // Get tickets for this sale
    const tickets = await Ticket.findAll({ 
      where: { 
        sale_id: saleId,
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
    
    // Format tickets with location (for display, not QR)
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTickets = tickets.map(t => {
      const ticketData = t.get ? t.get({ plain: true }) : t;
      return {
        id: ticketData.id,
        type: ticketData.type,
        seat_code: ticketData.seat_code,
        location: formatSeatLocation(ticketData.type, ticketData.section, ticketData.seat_code, ticketData.capacity || 1),
        section: ticketData.section,
        price: ticketData.price
      };
    });
    
    // Calculate discount amount from sale's discount
    const subtotal = formattedTickets.reduce((sum, t) => sum + Number(t.price || 0), 0);
    let emailDiscountAmount = 0;
    let emailDiscountCode = null;
    if (sale.discount) {
      emailDiscountCode = sale.discount.alias || sale.discount.code;
      const dtype = String(sale.discount.type || '').toLowerCase();
      const dval = Number(sale.discount.value || 0);
      if (dtype === 'percentage') emailDiscountAmount = Math.round(subtotal * (dval / 100));
      else if (dtype === 'fixed') emailDiscountAmount = Math.round(dval);
      if (emailDiscountAmount > subtotal) emailDiscountAmount = subtotal;
    }

    // Parse service_items from sale
    const serviceItems = parseServiceItems(sale.service_items);
    const servicesSubtotal = serviceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);

    // Calculate total with dynamic service fee (after discount, including services)
    const serviceFeePercent = await getServiceFeePercent();
    const subtotalAfterDiscount = subtotal - emailDiscountAmount;
    const serviceCharge = Math.round((subtotalAfterDiscount + servicesSubtotal) * (serviceFeePercent / 100));
    const totalAmount = subtotalAfterDiscount + serviceCharge + servicesSubtotal;

    // Get customer name
    const customerName = sale.customer_name || 'Cliente';

    // Send email using the same function as webhook (with container QR)
    const { formatDateLong, formatTime } = await import('../lib/dateFormatter.js');
    const { sendPurchaseConfirmation } = await import('../lib/emailService.js');

    await sendPurchaseConfirmation({
      customerEmail: email,
      customerName: customerName,
      showTitle: session.show.title,
      sessionDate: formatDateLong(session.starts_at),
      sessionTime: formatTime(session.starts_at),
      tickets: formattedTickets,
      saleId: sale.id,
      totalAmount: totalAmount,
      paymentMethod: sale.payment_method || 'mp',
      subtotal: subtotal,
      discountCode: emailDiscountCode,
      discountAmount: emailDiscountAmount > 0 ? emailDiscountAmount : null,
      serviceFeePercent,
      serviceFeeAmount: serviceCharge,
      serviceItems,
      servicesSubtotal
    });
    
    console.log(`[EMAIL] Sent container QR for sale ${saleId} to ${email}`);
    return res.json({ ok: true, sent: true });
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
    
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show, discounts: Discount } = sequelize.models;
    
    const sale = await Sale.findByPk(sale_id, {
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        },
        { model: Discount, as: 'discount', required: false }
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
    
    // Calculate discount from sale
    const subtotal = formattedTickets.reduce((sum, t) => sum + Number(t.price || 0), 0);
    let saleDiscountAmount = 0;
    let saleDiscountCode = null;
    if (sale.discount) {
      saleDiscountCode = sale.discount.alias || sale.discount.code;
      const dtype = String(sale.discount.type || '').toLowerCase();
      const dval = Number(sale.discount.value || 0);
      if (dtype === 'percentage') saleDiscountAmount = Math.round(subtotal * (dval / 100));
      else if (dtype === 'fixed') saleDiscountAmount = Math.round(dval);
      if (saleDiscountAmount > subtotal) saleDiscountAmount = subtotal;
    }

    // Parse service_items from sale
    const serviceItems = parseServiceItems(sale.service_items);
    const servicesSubtotal = serviceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);

    // Calculate total with dynamic service fee (after discount, including services)
    const serviceFeePercent = await getServiceFeePercent();
    const subtotalAfterDiscount = subtotal - saleDiscountAmount;
    const serviceCharge = Math.round((subtotalAfterDiscount + servicesSubtotal) * (serviceFeePercent / 100));
    const total = subtotalAfterDiscount + serviceCharge + servicesSubtotal;

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

    // Send email using sendPurchaseConfirmation (same as other endpoints)
    const { formatDateLong, formatTime } = await import('../lib/dateFormatter.js');
    const { sendPurchaseConfirmation } = await import('../lib/emailService.js');

    await sendPurchaseConfirmation({
      customerEmail: email,
      customerName: customerName,
      showTitle: session.show.title,
      sessionDate: formatDateLong(session.starts_at),
      sessionTime: formatTime(session.starts_at),
      tickets: formattedTickets,
      saleId: sale.id,
      totalAmount: total,
      paymentMethod: sale.payment_method || 'mp',
      subtotal: subtotal,
      discountCode: saleDiscountCode,
      discountAmount: saleDiscountAmount > 0 ? saleDiscountAmount : null,
      serviceFeePercent,
      serviceFeeAmount: serviceCharge,
      serviceItems,
      servicesSubtotal
    });

    console.log(`[EMAIL-SALE] Sent email for sale ${sale_id} to ${email}`);
    return res.json({ ok: true, sent: true });
  } catch (e) {
    console.error('[EMAIL-SALE] Error:', e);
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
router.post('/sipago-confirm', optionalAuth, async (req, res) => {
  console.log('[SIPAGO_CONFIRM] 📋 Confirm endpoint called');
  try {
    const { reservation_id, order_uuid, discount_id, service_items, customer_name, customer_email, customer_phone, customer_dni, customer_provincia, customer_localidad } = req.body || {};
    if (!reservation_id) return res.status(400).json({ error: 'reservation_id required' });

    const { reservations: Reservation, tickets: Ticket, sales: Sale, users: User, discounts: Discount } = sequelize.models;
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) return res.status(404).json({ error: 'reservation_not_found' });

    // If we have order_uuid, verify with Sipago that it's SUCCESS
    if (order_uuid) {
      try {
        const order = await getSipagoOrder(order_uuid);
        const status = (order?.data?.order?.status || '').toString().toUpperCase();
        if (status !== 'SUCCESS') {
          return res.status(409).json({ error: 'order_not_success', status });
        }
      } catch (err) {
        console.warn('[SIPAGO_CONFIRM] Could not verify order status:', err?.message || err);
        // Proceed idempotently without blocking, as fallback
      }
    }

    // Reject if the reservation has expired or been canceled
    if (reservation.status === 'expired' || reservation.status === 'canceled') {
      console.warn('[SIPAGO_CONFIRM] ⚠️ Reservation expired/canceled, rejecting:', reservation.status);
      return res.status(409).json({ error: 'reservation_expired', status: reservation.status });
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
      console.log('[SIPAGO_CONFIRM] ✓ Already confirmed by webhook, skipping email');
      return res.json({ ok: true, already_confirmed: true });
    }

    console.log('[SIPAGO_CONFIRM] Creating sale and tickets...');
    
    // Determine effective user to link sale/tickets
    // Priority: JWT user > reservation.user_id > header > body
    let effUserId = req.user?.userId || reservation.user_id || req.header('x-user-id') || req.body?.user_id || null;
    if (effUserId) {
      const exists = await User.findByPk(effUserId);
      if (!exists) effUserId = null;
    }
    console.log('[SIPAGO_CONFIRM] User ID:', effUserId);

    // Generate container QR for this sale
    const items = Array.isArray(reservation.items) ? reservation.items : [];
    console.log('[SIPAGO_CONFIRM] Items:', items.length);
    
    const tempSaleId = crypto.randomUUID();
    const { generateContainerQR } = await import('../lib/qrGenerator.js');
    const containerQR = await generateContainerQR(tempSaleId, items);
    console.log('[SIPAGO_CONFIRM] Container QR generated, capacity:', containerQR.total_capacity);

    // Safety net: if no customer data but user_id exists, look up user profile
    let finalCustomerName = customer_name || null;
    let finalCustomerEmail = customer_email || null;
    let finalCustomerPhone = customer_phone || null;
    let finalCustomerDni = customer_dni || null;
    let finalCustomerProvincia = customer_provincia || null;
    let finalCustomerLocalidad = customer_localidad || null;

    if (!finalCustomerName && (effUserId || reservation.user_id)) {
      try {
        const lookupId = effUserId || reservation.user_id;
        const u = await User.findByPk(lookupId, { attributes: ['name', 'email', 'phone', 'dni', 'provincia', 'localidad'], raw: true });
        if (u) {
          finalCustomerName = u.name || finalCustomerName;
          finalCustomerEmail = u.email || finalCustomerEmail;
          finalCustomerPhone = u.phone || finalCustomerPhone;
          finalCustomerDni = u.dni || finalCustomerDni;
          finalCustomerProvincia = u.provincia || finalCustomerProvincia;
          finalCustomerLocalidad = u.localidad || finalCustomerLocalidad;
        }
      } catch (e) { console.warn('[SIPAGO_CONFIRM] Could not fetch user data:', e.message); }
    }

    // Try to find user by DNI if provided and no user_id
    let finalUserId = effUserId;
    if (!finalUserId && finalCustomerDni) {
      const existingUser = await User.findOne({ where: { dni: finalCustomerDni } });
      if (existingUser) {
        finalUserId = existingUser.id;
        console.log('[CONFIRM] Found existing user by DNI:', finalCustomerDni, '-> user_id:', finalUserId);
      }
    }

    console.log('[SIPAGO_CONFIRM] Creating Sale record...');
    // Compute final amount for confirm flow using shared helper
    const confirmBaseItems = Array.isArray(items) ? items : [];
    let confirmDiscountAmount = 0;
    let confirmDiscountedTicketCount = 0;
    let confirmBaseSubtotal = confirmBaseItems.reduce((sum, it) => {
      if (it.type === 'butaca' || it.type === 'palco') return sum + Number(it.price || 0);
      if (it.type === 'pullman' || it.type === 'general') return sum + (Number(it.unit_price || it.price || 0) * Number(it.quantity || 1));
      return sum;
    }, 0);
    if (discount_id) {
      try {
        const d = await Discount.findByPk(discount_id);
        if (d && d.active !== false) {
          const result = computeDiscountAmount(confirmBaseItems, d);
          confirmDiscountAmount = result.discountAmount;
          confirmDiscountedTicketCount = result.discountedTicketCount;
          confirmBaseSubtotal = result.baseSubtotal;
        }
      } catch {}
    }
    // Calculate subtotal after discount (this is what we store - NO service fee)
    const confirmSubtotalAfterDiscount = confirmBaseSubtotal - confirmDiscountAmount;
    const confirmServicesSubtotal = Array.isArray(service_items) ? service_items.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0) : 0;

    // Check if sale already exists (webhook may have created it)
    // Use reservation.sale_id first (set by webhook), fallback to tempSaleId match
    let existingSale = null;
    if (reservation.sale_id) {
      existingSale = await Sale.findByPk(reservation.sale_id);
      console.log('[SIPAGO_CONFIRM] Found sale via reservation.sale_id:', existingSale?.id);
    }
    
    let sale;
    if (existingSale) {
      // Check if sale has tickets (webhook may have failed after creating sale)
      const { tickets: Ticket } = sequelize.models;
      const existingTickets = await Ticket.findAll({
        where: { sale_id: existingSale.id }
      });
      console.log('[SIPAGO_CONFIRM] Sale already exists from webhook. Tickets count:', existingTickets.length);

      if (existingTickets.length > 0) {
        // Webhook already processed everything - skip email (webhook sends it)
        console.log('[SIPAGO_CONFIRM] Sale already has tickets, webhook already processed. Skipping.');
        await reservation.update({ status: 'confirmed', sale_id: existingSale.id });
        return res.json({ ok: true, already_confirmed: true, sale_id: existingSale.id });
      }
      
      // Sale exists but no tickets - webhook failed after creating sale
      console.log('[SIPAGO_CONFIRM] Sale exists but has no tickets, webhook failed. Using existing sale');
      sale = existingSale;
    } else {
      // Sale doesn't exist, create it
      sale = await Sale.create({
        id: tempSaleId,
        session_id: reservation.session_id,
        user_id: finalUserId,
        cashier_id: null,
        payment_method: 'card',
        discount_id: discount_id || null,
        total_amount: (confirmSubtotalAfterDiscount || 0) + confirmServicesSubtotal,
        customer_name: finalCustomerName,
        customer_email: finalCustomerEmail,
        customer_phone: finalCustomerPhone,
        customer_dni: finalCustomerDni,
        customer_provincia: finalCustomerProvincia,
        customer_localidad: finalCustomerLocalidad,
        container_qr_code: containerQR.qr_code,
        container_qr_data: containerQR.qr_data,
        validated_count: 0,
        total_capacity: containerQR.total_capacity,
        service_items: Array.isArray(service_items) && service_items.length > 0 ? service_items : null,
      });
      console.log('[SIPAGO_CONFIRM] ✅ Sale created:', sale.id);
    }

    // Increment discount used_count by number of discounted tickets
    if (discount_id) {
      const discount = await Discount.findByPk(discount_id);
      if (discount) {
        await discount.increment('used_count', { by: confirmDiscountedTicketCount || 1 });
        console.log('[SIPAGO_CONFIRM] Discount used_count incremented by', confirmDiscountedTicketCount, ':', discount.code);
      }
    }

    console.log('[SIPAGO_CONFIRM] Creating tickets...');
    const { generateIndividualQR } = await import('../lib/qrGenerator.js');
    const createdTickets = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code) {
        const t = await Ticket.create({
          session_id: reservation.session_id,
          sale_id: sale.id,
          user_id: finalUserId,
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
          user_id: finalUserId,
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
            user_id: finalUserId,
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
      } else if (it.type === 'general' && it.quantity > 0) {
        // General admission tickets (for el_tablado, las_gemelas)
        const qty = Number(it.quantity) || 0;
        for (let i = 0; i < qty; i++) {
          const t = await Ticket.create({
            session_id: reservation.session_id,
            sale_id: sale.id,
            user_id: finalUserId,
            seat_code: null,
            section: 'general',
            type: 'general',
            price: Number(it.price || 0),
            qr_code: null,
            status: 'sold',
            capacity: 1,
            capacity_validated: 0
          });
          const { qr_code, qr_data } = await generateIndividualQR(t.id, null, 'general');
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        }
      }
    }

    // Create service tickets (one per service item, capacity = quantity)
    const confirmServiceItems = Array.isArray(service_items) ? service_items : [];
    for (const svc of confirmServiceItems) {
      const svcT = await Ticket.create({
        session_id: reservation.session_id,
        sale_id: sale.id,
        user_id: finalUserId,
        seat_code: svc.name,
        section: 'service',
        type: 'service',
        price: Number(svc.price || 0),
        qr_code: null,
        status: 'sold',
        capacity: Number(svc.quantity || 1),
        capacity_validated: 0
      });
      const { qr_code: sQr, qr_data: sQd } = await generateIndividualQR(svcT.id, svc.name, 'service');
      await svcT.update({ qr_code: sQr, qr_data: sQd });
      createdTickets.push(svcT);
    }
    console.log('[SIPAGO_CONFIRM] ✅ Created', createdTickets.length, 'tickets');

    // Update reservation as confirmed and persist user if was null
    console.log('[SIPAGO_CONFIRM] Updating reservation status to confirmed...');
    const patch = { status: 'confirmed', sale_id: sale.id };
    if (!reservation.user_id && effUserId) patch.user_id = effUserId;
    await reservation.update(patch);
    console.log('[SIPAGO_CONFIRM] ✅ Reservation confirmed');

    try {
      const io = req.app.get('io');
      io.soldSeats = io.soldSeats || new Map();
      io.soldPalcos = io.soldPalcos || new Map();
      io.pullmanSold = io.pullmanSold || new Map();
      const seatSet = io.soldSeats.get(reservation.session_id) || new Set();
      const palcoSet = io.soldPalcos.get(reservation.session_id) || new Set();
      let pullmanCount = io.pullmanSold.get(reservation.session_id) || 0;
      let generalCount = 0;
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) seatSet.add(it.seat_code);
        if (it.type === 'palco' && it.seat_code) palcoSet.add(it.seat_code);
        if (it.type === 'pullman' && it.quantity > 0) pullmanCount += Number(it.quantity) || 0;
        if (it.type === 'general' && it.quantity > 0) generalCount += Number(it.quantity) || 0;
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
      // Emit general admission update if applicable
      if (generalCount > 0) {
        const { sessions: Session, shows: Show, tickets: Ticket } = sequelize.models;
        const session = await Session.findByPk(reservation.session_id, {
          include: [{ model: Show, as: 'show' }]
        });
        if (session && session.show) {
          const capacity = session.capacity_override || session.show.general_capacity;
          const soldCount = await Ticket.count({
            where: { session_id: reservation.session_id, type: 'general', status: { [Op.in]: ['sold', 'validated'] } }
          });
          const available = Math.max(0, capacity - soldCount);
          io.to(`session:${reservation.session_id}`).emit('general-admission-update', {
            sessionId: reservation.session_id,
            sold: soldCount,
            available
          });
        }
      }
      io.to(`session:${reservation.session_id}`).emit('purchase_confirmed', { reservation_id: reservation.id });
    } catch (ioErr) {
      console.warn('[SIPAGO_CONFIRM] Socket.io error (non-critical):', ioErr.message);
    }

    // Send automatic purchase confirmation email (with idempotency check)
    try {
      const { users: User, sessions: Session, shows: Show } = sequelize.models;
      const session = await Session.findByPk(reservation.session_id, {
        include: [{ model: Show, as: 'show' }]
      });
      const user = finalUserId ? await User.findByPk(finalUserId) : null;
      const emailToSend = user?.email || customer_email || sale.customer_email;
      const nameToSend = user?.name || customer_name || sale.customer_name || 'Cliente';

      if (emailToSend && session) {
        const { formatDateLong, formatTime } = await import('../lib/dateFormatter.js');
        const { sendPurchaseConfirmation } = await import('../lib/emailService.js');
        const { formatSeatLocation } = await import('../lib/seatFormatter.js');

        const formattedTicketsForEmail = createdTickets.map(ticket => {
          const plainTicket = ticket.get ? ticket.get({ plain: true }) : ticket;
          return {
            ...plainTicket,
            location: formatSeatLocation(
              plainTicket.type,
              plainTicket.section,
              plainTicket.seat_code,
              plainTicket.capacity || 1
            )
          };
        });

        const serviceFeePercent = await getServiceFeePercent();
        const ticketsSubtotal = formattedTicketsForEmail.reduce((sum, t) => sum + Number(t.price || 0), 0);
        const confirmSubtotalAfterDiscountForEmail = ticketsSubtotal - confirmDiscountAmount;
        const confirmServicesSubtotalForEmail = confirmServicesSubtotal;
        const serviceFeeAmount = Math.round((confirmSubtotalAfterDiscountForEmail + confirmServicesSubtotalForEmail) * (serviceFeePercent / 100));
        let confirmDiscountCode = null;
        if (discount_id) {
          try {
            const disc = await Discount.findByPk(discount_id);
            if (disc) confirmDiscountCode = disc.alias || disc.code;
          } catch {}
        }

        await sendPurchaseConfirmation({
          customerEmail: emailToSend,
          customerName: nameToSend,
          showTitle: session.show.title,
          sessionDate: formatDateLong(session.starts_at),
          sessionTime: formatTime(session.starts_at),
          tickets: formattedTicketsForEmail,
          saleId: sale.id,
          totalAmount: sale.total_amount,
          paymentMethod: sale.payment_method || 'card',
          subtotal: ticketsSubtotal,
          discountCode: confirmDiscountCode,
          discountAmount: confirmDiscountAmount > 0 ? confirmDiscountAmount : null,
          serviceFeePercent,
          serviceFeeAmount,
          serviceItems: confirmServiceItems,
          servicesSubtotal: confirmServicesSubtotal
        });
      }
    } catch (emailErr) {
      console.error('[SIPAGO_CONFIRM] Email error:', emailErr);
    }

    console.log('[SIPAGO_CONFIRM] 🎉 SUCCESS! Sale created with', createdTickets.length, 'tickets');
    return res.json({ ok: true, sale_id: sale.id, tickets_created: createdTickets.length });
  } catch (e) {
    console.error('[SIPAGO_CONFIRM] ❌ ERROR:', e);
    console.error('[SIPAGO_CONFIRM] Stack:', e.stack);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// Free emission: emit tickets when total is $0 (courtesy via discount code)
// Body: { reservation_id, discount_id, customer_name?, customer_email?, customer_phone?, customer_dni?, customer_provincia?, customer_localidad? }
router.post('/free-emission', optionalAuth, async (req, res) => {
  console.log('[FREE_EMISSION] 🎫 Free emission endpoint called');
  try {
    const { reservation_id, discount_id, customer_name, customer_email, customer_phone, customer_dni, customer_provincia, customer_localidad, service_items } = req.body || {};
    if (!reservation_id) return res.status(400).json({ error: 'reservation_id required' });

    const { reservations: Reservation, tickets: Ticket, sales: Sale, users: User, discounts: Discount } = sequelize.models;    
    const freeServiceItems = Array.isArray(service_items) ? service_items.filter(s => s && s.service_id && Number(s.quantity) > 0) : [];
    const freeServicesSubtotal = freeServiceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) return res.status(404).json({ error: 'reservation_not_found' });

    // Must have a discount that brings total to $0
    if (!discount_id) return res.status(400).json({ error: 'discount_id required for free emission' });

    // Idempotency
    if (reservation.status === 'confirmed') {
      console.log('[FREE_EMISSION] ✓ Already confirmed');
      return res.json({ ok: true, already_confirmed: true });
    }

    if (reservation.status === 'expired' || reservation.status === 'canceled') {
      return res.status(409).json({ error: 'reservation_expired', status: reservation.status });
    }

    // Validate discount and compute amounts using shared helper
    const items = Array.isArray(reservation.items) ? reservation.items : [];

    const discount = await Discount.findByPk(discount_id);
    if (!discount || discount.active === false) {
      return res.status(400).json({ error: 'invalid_discount' });
    }

    const { discountAmount, discountedTicketCount, baseSubtotal } = computeDiscountAmount(items, discount);
    const subtotalAfterDiscount = baseSubtotal - discountAmount;

    // Apply service fee on discounted subtotal
    const serviceFeePercent = await getServiceFeePercent();
    const serviceFee = Math.round(subtotalAfterDiscount * (serviceFeePercent / 100));
    const finalTotal = subtotalAfterDiscount + serviceFee;

    if (finalTotal > 0) {
      return res.status(400).json({ error: 'total_not_zero', message: 'El total debe ser $0 para emisión gratuita', total: finalTotal });
    }

    // Check for double sale (seats already sold)
    const seatCodes = items.filter(it => it.type === 'butaca' && it.seat_code).map(it => it.seat_code);
    const palcoCodes = items.filter(it => it.type === 'palco' && it.seat_code).map(it => it.seat_code);
    if (seatCodes.length > 0 || palcoCodes.length > 0) {
      const existingTickets = await Ticket.findAll({
        where: {
          session_id: reservation.session_id,
          status: 'sold',
          [Op.or]: [
            ...(seatCodes.length > 0 ? [{ seat_code: { [Op.in]: seatCodes }, type: 'butaca' }] : []),
            ...(palcoCodes.length > 0 ? [{ seat_code: { [Op.in]: palcoCodes }, type: 'palco' }] : [])
          ]
        }
      });
      if (existingTickets.length > 0) {
        return res.status(409).json({ error: 'seats_already_sold', sold_seats: existingTickets.map(t => t.seat_code) });
      }
    }

    // Determine user
    let effUserId = req.user?.userId || reservation.user_id || null;
    if (effUserId) {
      const exists = await User.findByPk(effUserId);
      if (!exists) effUserId = null;
    }
    let finalUserId = effUserId;
    if (!finalUserId && customer_dni) {
      const existingUser = await User.findOne({ where: { dni: customer_dni } });
      if (existingUser) finalUserId = existingUser.id;
    }

    // Create sale
    const tempSaleId = crypto.randomUUID();
    const { generateContainerQR } = await import('../lib/qrGenerator.js');
    const containerQR = await generateContainerQR(tempSaleId, items);

    const sale = await Sale.create({
      id: tempSaleId,
      session_id: reservation.session_id,
      user_id: finalUserId,
      cashier_id: null,
      payment_method: 'courtesy',
      discount_id: discount_id,
      total_amount: freeServicesSubtotal,
      customer_name: customer_name || null,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      customer_dni: customer_dni || null,
      customer_provincia: customer_provincia || null,
      customer_localidad: customer_localidad || null,
      container_qr_code: containerQR.qr_code,
      container_qr_data: containerQR.qr_data,
      validated_count: 0,
      total_capacity: containerQR.total_capacity,
      service_items: freeServiceItems.length > 0 ? freeServiceItems : null,
    });

    // Increment discount usage by number of discounted tickets
    await discount.increment('used_count', { by: discountedTicketCount || 1 });

    // Create tickets
    const { generateIndividualQR } = await import('../lib/qrGenerator.js');
    const createdTickets = [];
    for (const it of items) {
      if (it.type === 'butaca' && it.seat_code) {
        const t = await Ticket.create({
          session_id: reservation.session_id, sale_id: sale.id, user_id: finalUserId,
          seat_code: it.seat_code, section: 'platea_general', type: 'butaca',
          price: 0, qr_code: null, status: 'sold', capacity: 1, capacity_validated: 0
        });
        const { qr_code, qr_data } = await generateIndividualQR(t.id, it.seat_code, 'butaca');
        await t.update({ qr_code, qr_data });
        createdTickets.push(t);
      } else if (it.type === 'palco' && it.seat_code) {
        const isPB = /^PB/i.test(it.seat_code);
        const palcoSection = isPB ? 'palcos_bajos' : 'palcos_altos';
        const palcoCapacity = isPB ? 4 : 2;
        const t = await Ticket.create({
          session_id: reservation.session_id, sale_id: sale.id, user_id: finalUserId,
          seat_code: it.seat_code, section: palcoSection, type: 'palco',
          price: 0, qr_code: null, status: 'sold', capacity: palcoCapacity, capacity_validated: 0
        });
        const { qr_code, qr_data } = await generateIndividualQR(t.id, it.seat_code, 'palco');
        await t.update({ qr_code, qr_data });
        createdTickets.push(t);
      } else if (it.type === 'pullman' && it.quantity > 0) {
        const qty = Number(it.quantity) || 0;
        for (let i = 0; i < qty; i++) {
          const t = await Ticket.create({
            session_id: reservation.session_id, sale_id: sale.id, user_id: finalUserId,
            seat_code: null, section: 'pullman', type: 'pullman',
            price: 0, qr_code: null, status: 'sold'
          });
          const { qr_code, qr_data } = await generateIndividualQR(t.id, null, 'pullman');
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        }
      } else if (it.type === 'general' && it.quantity > 0) {
        const qty = Number(it.quantity) || 0;
        for (let i = 0; i < qty; i++) {
          const t = await Ticket.create({
            session_id: reservation.session_id, sale_id: sale.id, user_id: finalUserId,
            seat_code: null, section: 'general', type: 'general',
            price: 0, qr_code: null, status: 'sold', capacity: 1, capacity_validated: 0
          });
          const { qr_code, qr_data } = await generateIndividualQR(t.id, null, 'general');
          await t.update({ qr_code, qr_data });
          createdTickets.push(t);
        }
      }
    }

    // Create service tickets (one per service item, capacity = quantity)
    for (const svc of freeServiceItems) {
      const svcT = await Ticket.create({
        session_id: reservation.session_id, sale_id: sale.id, user_id: finalUserId,
        seat_code: svc.name, section: 'service', type: 'service',
        price: Number(svc.price || 0), qr_code: null, status: 'sold',
        capacity: Number(svc.quantity || 1), capacity_validated: 0
      });
      const { qr_code: sQr, qr_data: sQd } = await generateIndividualQR(svcT.id, svc.name, 'service');
      await svcT.update({ qr_code: sQr, qr_data: sQd });
      createdTickets.push(svcT);
    }

    // Update reservation
    const patch = { status: 'confirmed', sale_id: sale.id };
    if (!reservation.user_id && finalUserId) patch.user_id = finalUserId;
    await reservation.update(patch);

    // Socket events
    try {
      const io = req.app.get('io');
      io.soldSeats = io.soldSeats || new Map();
      io.soldPalcos = io.soldPalcos || new Map();
      io.pullmanSold = io.pullmanSold || new Map();
      const seatSet = io.soldSeats.get(reservation.session_id) || new Set();
      const palcoSet = io.soldPalcos.get(reservation.session_id) || new Set();
      let pullmanCount = io.pullmanSold.get(reservation.session_id) || 0;
      let generalCount = 0;
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) seatSet.add(it.seat_code);
        if (it.type === 'palco' && it.seat_code) palcoSet.add(it.seat_code);
        if (it.type === 'pullman' && it.quantity > 0) pullmanCount += Number(it.quantity) || 0;
        if (it.type === 'general' && it.quantity > 0) generalCount += Number(it.quantity) || 0;
      }
      io.soldSeats.set(reservation.session_id, seatSet);
      io.soldPalcos.set(reservation.session_id, palcoSet);
      io.pullmanSold.set(reservation.session_id, pullmanCount);
      for (const it of items) {
        if (it.type === 'butaca' && it.seat_code) io.to(`session:${reservation.session_id}`).emit('seat_sold', { seatId: it.seat_code });
        if (it.type === 'palco' && it.seat_code) io.to(`session:${reservation.session_id}`).emit('palco_sold', { palco: it.seat_code });
        if (it.type === 'pullman' && it.quantity > 0) io.to(`session:${reservation.session_id}`).emit('pullman_sold', { sold: Number(it.quantity) || 0 });
      }
      if (generalCount > 0) {
        const { sessions: Session, shows: Show } = sequelize.models;
        const session = await Session.findByPk(reservation.session_id, { include: [{ model: Show, as: 'show' }] });
        if (session && session.show) {
          const capacity = session.capacity_override || session.show.general_capacity;
          const soldCount = await Ticket.count({ where: { session_id: reservation.session_id, type: 'general', status: { [Op.in]: ['sold', 'validated'] } } });
          const available = Math.max(0, capacity - soldCount);
          io.to(`session:${reservation.session_id}`).emit('general-admission-update', { sessionId: reservation.session_id, sold: soldCount, available });
        }
      }
      io.to(`session:${reservation.session_id}`).emit('purchase_confirmed', { reservation_id: reservation.id });
    } catch {}

    // Send confirmation email
    try {
      const { sessions: Session, shows: Show } = sequelize.models;
      const session = await Session.findByPk(reservation.session_id, { include: [{ model: Show, as: 'show' }] });
      const user = finalUserId ? await User.findByPk(finalUserId) : null;
      const emailToSend = user?.email || customer_email || sale.customer_email;
      const nameToSend = user?.name || customer_name || sale.customer_name || 'Cliente';
      if (emailToSend && session) {
        const { formatDateLong, formatTime } = await import('../lib/dateFormatter.js');
        const { sendPurchaseConfirmation } = await import('../lib/emailService.js');
        const { formatSeatLocation } = await import('../lib/seatFormatter.js');
        const formattedTicketsForEmail = createdTickets.map(t => ({
          ...t.get ? t.get({ plain: true }) : t,
          location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1)
        }));
        await sendPurchaseConfirmation({
          customerEmail: emailToSend, customerName: nameToSend,
          showTitle: session.show.title,
          sessionDate: formatDateLong(session.starts_at), sessionTime: formatTime(session.starts_at),
          tickets: formattedTicketsForEmail, saleId: sale.id,
          totalAmount: 0, paymentMethod: 'courtesy',
          subtotal: baseSubtotal,
          discountCode: discount.alias || discount.code,
          discountAmount: discountAmount > 0 ? discountAmount : null,
          serviceFeePercent: 0, serviceFeeAmount: 0
        });
      }
    } catch (emailErr) {
      console.error('[FREE_EMISSION] Email error:', emailErr);
    }

    console.log('[FREE_EMISSION] 🎉 SUCCESS! Sale created with', createdTickets.length, 'courtesy tickets');
    return res.json({ ok: true, sale_id: sale.id, tickets_created: createdTickets.length });
  } catch (e) {
    console.error('[FREE_EMISSION] ❌ ERROR:', e);
    return res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

export default router;
