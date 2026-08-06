import express from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../lib/sequelize.js';
import { validateQRData } from '../lib/qr.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { createActivityLog, ActionTypes, EntityTypes } from '../middleware/activityLogger.js';
import { getSeatPrice } from '../lib/seatPricing.js';
import { computePackTicketPrices, calculatePackTotals } from '../lib/packPricing.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * GET /api/tickets
 * Get tickets by sale_id
 * Query: sale_id
 * Requires: boleteria or admin role
 */
router.get('/', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { sale_id } = req.query;
    
    if (!sale_id) {
      return res.status(400).json({ error: 'sale_id es requerido' });
    }
    
    const { tickets: Ticket } = sequelize.models;
    
    const tickets = await Ticket.findAll({
      where: { sale_id },
      order: [['section', 'ASC'], ['seat_code', 'ASC']]
    });
    
    // Format tickets with location and extra fields useful for refunds/validation
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTickets = tickets.map(t => ({
      id: t.id,
      seat_code: t.seat_code,
      location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1),
      type: t.type,
      section: t.section,
      status: t.status,
      capacity: t.capacity || 1,
      capacity_validated: t.capacity_validated || 0,
      price: t.price,
      used: t.used,
      validated_at: t.validated_at
    }));
    
    return res.json({ tickets: formattedTickets });
  } catch (error) {
    console.error('[GET_TICKETS] Error:', error);
    return res.status(500).json({ error: 'Error al obtener tickets' });
  }
});

/**
 * POST /api/tickets/validate
 * Validate a ticket by QR code
 * Body: { qr_data: string, validation_type?: 'qr_scan' | 'manual' }
 * Requires: boleteria or admin role
 */
router.post('/validate', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { qr_data, validation_type = 'qr_scan' } = req.body;
    
    if (!qr_data) {
      return res.status(400).json({ error: 'qr_data required' });
    }

    const { tickets: Ticket, validations: Validation, sessions: Session, shows: Show } = sequelize.models;

    // Parse QR data to get ticket_id
    let ticketId;
    try {
      const parsed = JSON.parse(qr_data);
      ticketId = parsed.ticket_id;
    } catch (error) {
      return res.status(400).json({ error: 'invalid_qr_format', message: 'QR code format is invalid' });
    }

    if (!ticketId) {
      return res.status(400).json({ error: 'invalid_qr_data', message: 'Ticket ID not found in QR' });
    }

    // Find ticket
    const ticket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: Session,
          include: [{ model: Show, as: 'show' }]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'ticket_not_found', message: 'Ticket not found' });
    }

    // Validate QR data matches ticket
    const isValid = validateQRData(qr_data, ticket);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'qr_mismatch', 
        message: 'QR code does not match ticket data',
        ticket_id: ticket.id
      });
    }

    // Check ticket status
    if (ticket.status === 'validated') {
      // Get validator info
      const { users: User } = sequelize.models;
      const validator = ticket.validated_by ? await User.findByPk(ticket.validated_by, {
        attributes: ['id', 'name', 'email']
      }) : null;
      
      return res.status(409).json({ 
        error: 'already_validated', 
        message: 'This ticket has already been validated',
        ticket,
        validated_at: ticket.validated_at,
        validated_by: validator ? {
          name: validator.name,
          email: validator.email
        } : null
      });
    }

    if (ticket.status !== 'sold') {
      return res.status(400).json({ 
        error: 'invalid_status', 
        message: `Ticket status is '${ticket.status}', expected 'sold'`,
        ticket
      });
    }

    // Check session time (optional warning, not blocking)
    const session = ticket.session;
    const now = new Date();
    const sessionStart = new Date(session.starts_at);
    const sessionEnd = new Date(session.ends_at);
    let timeWarning = null;

    if (now < sessionStart) {
      const hoursUntil = Math.round((sessionStart - now) / (1000 * 60 * 60));
      timeWarning = `Session starts in ${hoursUntil} hours`;
    } else if (now > sessionEnd) {
      timeWarning = 'Session has already ended';
    }

    // Validate ticket
    await ticket.update({
      status: 'validated',
      validated_at: now,
      validated_by: req.user.userId
    });

    // Create validation record
    await Validation.create({
      ticket_id: ticket.id,
      validated_by: req.user.userId,
      device_info: {
        userAgent: req.headers['user-agent'],
        platform: req.headers['sec-ch-ua-platform']
      },
      ip_address: req.ip || req.connection.remoteAddress,
      validation_type
    });

    // Get validator info
    const { users: User } = sequelize.models;
    const validator = await User.findByPk(req.user.userId, {
      attributes: ['id', 'name', 'email']
    });

    return res.json({
      success: true,
      message: 'Ticket validated successfully',
      ticket: {
        id: ticket.id,
        type: ticket.type,
        seat_code: ticket.seat_code,
        section: ticket.section,
        status: ticket.status,
        validated_at: ticket.validated_at
      },
      validated_by: validator ? {
        name: validator.name,
        email: validator.email
      } : null,
      show: {
        title: session.show.title,
        date: session.show.date,
        time: session.show.time
      },
      session: {
        starts_at: session.starts_at,
        ends_at: session.ends_at
      },
      time_warning: timeWarning
    });

  } catch (error) {
    console.error('[TICKETS] Validation error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Validation failed' });
  }
});

/**
 * GET /api/tickets/admission-report
 * Returns admission stats for today's sessions: sold, entered, pending
 * Requires: boleteria or admin role
 */
router.get('/admission-report', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { sessions: Session, shows: Show, tickets: Ticket } = sequelize.models;
    const { Op } = await import('sequelize');

    // Today range in local time (Argentina UTC-3)
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Find sessions for today
    const sessions = await Session.findAll({
      where: {
        starts_at: { [Op.between]: [todayStart, todayEnd] }
      },
      include: [{ model: Show, as: 'show', attributes: ['id', 'title', 'venue_type'] }],
      order: [['starts_at', 'ASC']]
    });

    if (sessions.length === 0) {
      return res.json({ sessions: [], message: 'No hay funciones programadas para hoy' });
    }

    const result = [];

    for (const session of sessions) {
      const tickets = await Ticket.findAll({
        where: {
          session_id: session.id,
          status: { [Op.in]: ['sold', 'validated'] }
        },
        attributes: ['id', 'status', 'capacity', 'capacity_validated', 'type']
      });

      let totalSold = 0;
      let totalEntered = 0;

      for (const t of tickets) {
        const cap = t.capacity || 1;
        const capValidated = t.capacity_validated || 0;
        totalSold += cap;
        if (t.status === 'validated') {
          totalEntered += cap;
        } else {
          totalEntered += capValidated;
        }
      }

      const totalPending = totalSold - totalEntered;

      result.push({
        session_id: session.id,
        show_title: session.show?.title || 'Sin título',
        venue_type: session.show?.venue_type || 'sala_principal',
        starts_at: session.starts_at,
        total_sold: totalSold,
        total_entered: totalEntered,
        total_pending: totalPending
      });
    }

    return res.json({ sessions: result });
  } catch (error) {
    console.error('[ADMISSION_REPORT] Error:', error);
    return res.status(500).json({ error: 'Error al generar reporte', message: error.message });
  }
});

/**
 * GET /api/tickets/:id
 * Get ticket details (for debugging/admin)
 * Requires: authentication
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { tickets: Ticket, sessions: Session, shows: Show, users: User } = sequelize.models;
    
    const ticket = await Ticket.findByPk(req.params.id, {
      include: [
        {
          model: Session,
          include: [{ model: Show, as: 'show' }]
        },
        {
          model: User,
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'ticket_not_found' });
    }

    // Only allow user to see their own tickets, or admin/boleteria to see all
    const isOwner = ticket.user_id === req.user.userId;
    const isStaff = ['admin', 'boleteria'].includes(req.user.role);

    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'forbidden', message: 'You can only view your own tickets' });
    }

    return res.json(ticket);
  } catch (error) {
    console.error('[TICKETS] Get ticket error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/tickets/:id/validations
 * Get validation history for a ticket
 * Requires: admin or boleteria
 */
router.get('/:id/validations', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { validations: Validation, users: User } = sequelize.models;
    
    const validations = await Validation.findAll({
      where: { ticket_id: req.params.id },
      include: [
        {
          model: User,
          as: 'validator',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(validations);
  } catch (error) {
    console.error('[TICKETS] Get validations error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/box-office-pack-preview', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { selections, discount_id } = req.body || {};
    const { sessions: Session, shows: Show, discounts: Discount } = sequelize.models;
    if (!Array.isArray(selections) || selections.length === 0 || selections.some(selection => !selection?.session_id || !Array.isArray(selection.items))) {
      return res.status(400).json({ error: 'invalid_items', message: 'Seleccioná al menos una función' });
    }
    const sessionIds = selections.map(selection => selection.session_id);
    if (new Set(sessionIds).size !== sessionIds.length) {
      return res.status(400).json({ error: 'duplicated_session', message: 'No se puede repetir una función en el pack' });
    }
    const sessions = await Session.findAll({ where: { id: { [Op.in]: sessionIds } }, include: [{ model: Show, as: 'show' }] });
    if (sessions.length !== selections.length) {
      return res.status(404).json({ error: 'session_not_found', message: 'No se encontró una de las funciones seleccionadas' });
    }
    const show = sessions[0].show;
    if (!show?.pack_enabled || !show?.pack_pricing_json || sessions.some(session => session.show_id !== show.id)) {
      return res.status(400).json({ error: 'invalid_pack', message: 'Las funciones no pertenecen a un show con pack habilitado' });
    }
    if (selections.length > Number(show.pack_max_sessions || 3)) {
      return res.status(400).json({ error: 'pack_max_sessions_exceeded', message: 'Se superó el máximo de funciones permitido para el pack' });
    }
    const itemsBySession = Object.fromEntries(selections.map(selection => [selection.session_id, selection.items]));
    let packPricing = show.pack_pricing_json;
    if (typeof packPricing === 'string') packPricing = JSON.parse(packPricing);
    const pricedSlots = computePackTicketPrices(itemsBySession, packPricing, show.pack_max_sessions);
    const slotsBySession = pricedSlots.reduce((result, slot) => {
      if (!result[slot.session_id]) result[slot.session_id] = [];
      result[slot.session_id].push(slot);
      return result;
    }, {});

    let discountAmount = 0;
    let validDiscount = null;
    if (discount_id) {
      validDiscount = await Discount.findByPk(discount_id);
    }
    const subtotal = pricedSlots.reduce((sum, slot) => sum + Number(slot.finalPrice || 0), 0);
    if (validDiscount && validDiscount.active) {
      if (validDiscount.type === 'percentage') {
        discountAmount = Math.round(subtotal * (validDiscount.value / 100));
      } else if (validDiscount.type === 'fixed') {
        discountAmount = Math.round(validDiscount.value);
      } else if (validDiscount.type === 'internal') {
        discountAmount = subtotal;
      }
      discountAmount = Math.min(discountAmount, subtotal);
    }

    return res.json({
      priced_slots: pricedSlots,
      slots_by_session: slotsBySession,
      subtotal,
      original_subtotal: pricedSlots.reduce((sum, slot) => sum + Number(slot.originalPrice || 0), 0),
      discount_amount: discountAmount,
      total: subtotal - discountAmount
    });
  } catch (error) {
    console.error('[BOX_OFFICE_PACK_PREVIEW] Error:', error);
    return res.status(500).json({ error: 'server_error', message: 'No se pudo calcular el precio del pack' });
  }
});

router.post('/box-office-pack-sale', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { selections, customer, payment_method = 'cash', discount_id } = req.body || {};
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show, users: User, cash_register_shifts: CashRegisterShift, pack_sales: PackSale, discounts: Discount } = sequelize.models;

    if (!Array.isArray(selections) || selections.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'invalid_pack', message: 'Seleccioná al menos una función' });
    }
    if (!customer?.name?.trim()) {
      await transaction.rollback();
      return res.status(400).json({ error: 'invalid_customer', message: 'El nombre del cliente es obligatorio' });
    }
    if (selections.some(selection => !selection?.session_id || !Array.isArray(selection.items) || selection.items.length === 0)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'invalid_items', message: 'Cada función del pack debe tener al menos una entrada' });
    }

    const sessionIds = selections.map(selection => selection.session_id);
    if (new Set(sessionIds).size !== sessionIds.length) {
      await transaction.rollback();
      return res.status(400).json({ error: 'duplicated_session', message: 'No se puede repetir una función en el pack' });
    }

    const sessions = await Session.findAll({
      where: { id: { [Op.in]: sessionIds } },
      include: [{ model: Show, as: 'show' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (sessions.length !== selections.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'session_not_found', message: 'No se encontró una de las funciones seleccionadas' });
    }

    const show = sessions[0].show;
    if (!show?.pack_enabled || !show?.pack_pricing_json || sessions.some(session => session.show_id !== show.id)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'invalid_pack', message: 'Las funciones no pertenecen a un show con pack habilitado' });
    }
    if (selections.length > Number(show.pack_max_sessions || 3)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'pack_max_sessions_exceeded', message: 'Se superó el máximo de funciones permitido para el pack' });
    }

    const activeShift = await CashRegisterShift.findOne({
      where: { user_id: req.user.userId, status: 'open' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (req.user.role === 'boleteria' && !activeShift) {
      await transaction.rollback();
      return res.status(409).json({ error: 'cash_register_required', message: 'Debés abrir la caja antes de registrar ventas en boletería.' });
    }

    let existingUser = null;
    if (customer.email) existingUser = await User.findOne({ where: { email: customer.email }, transaction });
    if (!existingUser && customer.dni) existingUser = await User.findOne({ where: { dni: customer.dni }, transaction });
    if (!existingUser && customer.phone) existingUser = await User.findOne({ where: { phone: customer.phone }, transaction });

    for (const selection of selections) {
      const session = sessions.find(candidate => candidate.id === selection.session_id);
      const seatCodes = selection.items
        .filter(item => (item.type === 'butaca' || item.type === 'palco') && item.seat_code)
        .map(item => item.seat_code);
      if (seatCodes.length > 0) {
        const sold = await Ticket.findOne({
          where: { session_id: session.id, seat_code: { [Op.in]: seatCodes }, status: { [Op.in]: ['sold', 'validated'] } },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (sold) {
          await transaction.rollback();
          return res.status(409).json({ error: 'seat_unavailable', message: `La ubicación ${sold.seat_code} ya no está disponible` });
        }
      }
      const generalQuantity = selection.items
        .filter(item => item.type === 'general')
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      if (generalQuantity > 0) {
        const capacity = Number(session.capacity_override || session.show.general_capacity || 0);
        const soldCount = await Ticket.count({
          where: { session_id: session.id, type: 'general', status: { [Op.in]: ['sold', 'validated'] } },
          transaction
        });
        if (capacity > 0 && soldCount + generalQuantity > capacity) {
          await transaction.rollback();
          return res.status(409).json({ error: 'general_admission_unavailable', message: 'No hay suficientes localidades disponibles para esta función' });
        }
      }
    }

    let packPricing = show.pack_pricing_json;
    if (typeof packPricing === 'string') packPricing = JSON.parse(packPricing);
    const itemsBySession = Object.fromEntries(selections.map(selection => [selection.session_id, selection.items]));
    const pricedSlots = computePackTicketPrices(itemsBySession, packPricing, show.pack_max_sessions);
    const subtotal = pricedSlots.reduce((sum, slot) => sum + Number(slot.finalPrice || 0), 0);

    let validDiscount = null;
    let discountAmount = 0;
    if (discount_id) {
      validDiscount = await Discount.findByPk(discount_id, { transaction });
      if (!validDiscount || !validDiscount.active) {
        await transaction.rollback();
        return res.status(400).json({ error: 'invalid_discount', message: 'Cupón inválido o inactivo' });
      }
      if (validDiscount.usage_limit && validDiscount.used_count >= validDiscount.usage_limit) {
        await transaction.rollback();
        return res.status(400).json({ error: 'discount_limit_reached', message: 'El cupón alcanzó su límite de usos' });
      }
      if (validDiscount.type === 'percentage') {
        discountAmount = Math.round(subtotal * (validDiscount.value / 100));
      } else if (validDiscount.type === 'fixed') {
        discountAmount = Math.round(validDiscount.value);
      } else if (validDiscount.type === 'internal') {
        discountAmount = subtotal;
      }
      discountAmount = Math.min(discountAmount, subtotal);
    }

    const packSale = await PackSale.create({
      user_id: existingUser?.id || null,
      payment_method,
      payment_status: 'approved',
      subtotal,
      discount_amount: discountAmount,
      service_fee_percent: 0,
      service_fee_amount: 0,
      services_subtotal: 0,
      total_amount: subtotal - discountAmount,
      customer_name: customer.name.trim(),
      customer_email: customer.email || null,
      customer_phone: customer.phone || null,
      customer_dni: customer.dni || null,
      discount_id: discount_id || null,
      metadata: { source: 'box_office', session_ids: sessionIds, discount: validDiscount ? { id: validDiscount.id, code: validDiscount.code, type: validDiscount.type, value: validDiscount.value, discount_amount: discountAmount } : null },
    }, { transaction });

    if (validDiscount) {
      await validDiscount.increment('used_count', { transaction });
    }

    const discountBySession = new Map();
    let allocatedDiscount = 0;
    selections.forEach((selection, index) => {
      const sessionSubtotal = pricedSlots
        .filter(slot => slot.session_id === selection.session_id)
        .reduce((sum, slot) => sum + Number(slot.finalPrice || 0), 0);
      const sessionDiscount = index === selections.length - 1
        ? Math.min(sessionSubtotal, Math.max(0, discountAmount - allocatedDiscount))
        : Math.min(sessionSubtotal, Math.round(discountAmount * (sessionSubtotal / subtotal)));
      discountBySession.set(selection.session_id, sessionDiscount);
      allocatedDiscount += sessionDiscount;
    });

    const { generateContainerQR, generateIndividualQR } = await import('../lib/qrGenerator.js');
    const sales = [];
    const createdTickets = [];
    for (const selection of selections) {
      const sessionSlots = pricedSlots.filter(slot => slot.session_id === selection.session_id);
      const remainingSlots = [...sessionSlots];
      const takeSlots = item => {
        const matches = remainingSlots.filter(slot => slot.type === item.type && (item.seat_code ? slot.seat_code === item.seat_code : true));
        const count = item.type === 'pullman' || item.type === 'general' ? Number(item.quantity || 0) : 1;
        const taken = matches.slice(0, count);
        for (const slot of taken) remainingSlots.splice(remainingSlots.indexOf(slot), 1);
        return taken;
      };
      const ticketItems = selection.items.flatMap(item => takeSlots(item));
      const saleId = crypto.randomUUID();
      const containerQR = await generateContainerQR(saleId, ticketItems);
      const saleSubtotal = ticketItems.reduce((sum, slot) => sum + Number(slot.finalPrice || 0), 0);
      const saleDiscount = Number(discountBySession.get(selection.session_id) || 0);
      const saleTotal = saleSubtotal - saleDiscount;
      const sale = await Sale.create({
        id: saleId,
        session_id: selection.session_id,
        pack_sale_id: packSale.id,
        user_id: existingUser?.id || null,
        cashier_id: req.user.userId,
        cash_register_shift_id: activeShift?.id || null,
        payment_method,
        payment_status: 'approved',
        total_amount: saleTotal,
        discount_id: discount_id || null,
        customer_name: customer.name.trim(),
        customer_email: customer.email || null,
        customer_phone: customer.phone || null,
        customer_dni: customer.dni || null,
        sold_by: req.user.userId,
        container_qr_code: containerQR.qr_code,
        container_qr_data: containerQR.qr_data,
        total_capacity: containerQR.total_capacity,
        metadata: { source: 'box_office_pack', pack_sale_id: packSale.id, discount: validDiscount ? { id: validDiscount.id, code: validDiscount.code, type: validDiscount.type, value: validDiscount.value, amount: saleDiscount } : null },
      }, { transaction });

      for (const slot of ticketItems) {
        const isPalco = slot.type === 'palco';
        const isPB = /^PB/i.test(slot.seat_code || '');
        const capacity = isPalco ? (isPB ? 4 : 2) : 1;
        const section = slot.type === 'butaca' ? 'platea_general' : isPalco ? (isPB ? 'palcos_bajos' : 'palcos_altos') : slot.type;
        const ticket = await Ticket.create({
          session_id: selection.session_id,
          sale_id: sale.id,
          user_id: existingUser?.id || null,
          type: slot.type,
          seat_code: slot.seat_code || null,
          section,
          price: Number(slot.finalPrice || 0),
          status: 'sold',
          capacity,
          capacity_validated: 0,
        }, { transaction });
        const { qr_code, qr_data } = await generateIndividualQR(ticket.id, ticket.seat_code, ticket.type);
        await ticket.update({ qr_code, qr_data }, { transaction });
        createdTickets.push(ticket);
      }
      sales.push(sale);
    }

    await transaction.commit();

    const io = req.app.get('io');
    if (io) {
      io.soldSeats = io.soldSeats || new Map();
      io.soldPalcos = io.soldPalcos || new Map();
      io.pullmanSold = io.pullmanSold || new Map();
      for (const selection of selections) {
        const seatSet = io.soldSeats.get(selection.session_id) || new Set();
        const palcoSet = io.soldPalcos.get(selection.session_id) || new Set();
        let pullmanCount = io.pullmanSold.get(selection.session_id) || 0;
        for (const item of selection.items) {
          if (item.type === 'butaca' && item.seat_code) {
            seatSet.add(item.seat_code);
            io.to(`session:${selection.session_id}`).emit('seat_sold', { seatId: item.seat_code });
          }
          if (item.type === 'palco' && item.seat_code) {
            palcoSet.add(item.seat_code);
            io.to(`session:${selection.session_id}`).emit('palco_sold', { palco: item.seat_code });
          }
          if (item.type === 'pullman') pullmanCount += Number(item.quantity || 0);
          if (item.type === 'general') io.to(`session:${selection.session_id}`).emit('general-admission-update', { sessionId: selection.session_id });
        }
        io.soldSeats.set(selection.session_id, seatSet);
        io.soldPalcos.set(selection.session_id, palcoSet);
        io.pullmanSold.set(selection.session_id, pullmanCount);
        if (pullmanCount > 0) io.to(`session:${selection.session_id}`).emit('pullman_sold', { sold: pullmanCount });
      }
    }

    return res.json({
      success: true,
      pack_sale: { id: packSale.id, total_amount: packSale.total_amount },
      sales: sales.map(sale => ({ id: sale.id, session_id: sale.session_id, total_amount: sale.total_amount })),
      tickets_count: createdTickets.reduce((sum, ticket) => sum + Number(ticket.capacity || 1), 0)
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('[BOX_OFFICE_PACK_SALE] Error:', error);
    return res.status(500).json({ error: 'server_error', message: 'Error al registrar la venta del pack' });
  }
});

/**
 * POST /api/tickets/box-office-sale
 * Create a direct sale from box office (without Mercado Pago)
 * Body: { 
 *   session_id: string,
 *   items: [{ type: 'butaca'|'palco'|'pullman', seat_code?: string, quantity?: number, price: number }],
 *   customer: { name: string, email?: string, phone?: string },
 *   payment_method: 'cash' | 'card' | 'transfer'
 * }
 * Requires: boleteria or admin role
 */
router.post('/box-office-sale', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { session_id, items, customer, payment_method = 'cash', discount_id, service_items = [] } = req.body;
    const { reservations: Reservation, sales: Sale, tickets: Ticket, sessions: Session, users: User, discounts: Discount, cash_register_shifts: CashRegisterShift } = sequelize.models;

    // Validate session exists
    const { shows: Show } = sequelize.models;
    const session = await Session.findByPk(session_id, {
      include: [{ model: Show, as: 'show' }]
    });
    if (!session) {
      return res.status(404).json({ error: 'session_not_found', message: 'Session not found' });
    }
    
    // Validate discount if provided
    let validDiscount = null;
    if (discount_id) {
      validDiscount = await Discount.findByPk(discount_id);
      if (!validDiscount || !validDiscount.active) {
        return res.status(400).json({ error: 'invalid_discount', message: 'Cupón inválido o inactivo' });
      }
      if (validDiscount.usage_limit && validDiscount.used_count >= validDiscount.usage_limit) {
        return res.status(400).json({ error: 'discount_limit_reached', message: 'El cupón alcanzó su límite de usos' });
      }
    }

    // Validate items (allow empty items if there are service_items)
    const validServiceItems = Array.isArray(service_items) ? service_items.filter(s => s && s.service_id && Number(s.quantity) > 0) : [];
    if (!Array.isArray(items) || (items.length === 0 && validServiceItems.length === 0)) {
      return res.status(400).json({ error: 'invalid_items', message: 'Debe seleccionar al menos una entrada o un servicio' });
    }

    // Validate customer data
    if (!customer || !customer.name) {
      return res.status(400).json({ error: 'invalid_customer', message: 'Customer name is required' });
    }

    const userRole = req.user.role;
    const requiresShift = userRole === 'boleteria';
    let activeShift = null;

    if (['boleteria', 'admin'].includes(userRole)) {
      activeShift = await CashRegisterShift.findOne({
        where: {
          user_id: req.user.userId,
          status: 'open'
        }
      });
    }

    if (requiresShift && !activeShift) {
      return res.status(409).json({
        error: 'cash_register_required',
        message: 'Debés abrir la caja antes de registrar ventas en boletería.'
      });
    }

    // Search for existing user by email, phone, or DNI
    let existingUser = null;
    let userFoundBy = null;
    
    if (customer.email) {
      existingUser = await User.findOne({ 
        where: { email: customer.email },
        attributes: ['id', 'name', 'email', 'phone', 'dni', 'role']
      });
      if (existingUser) userFoundBy = 'email';
    }
    
    if (!existingUser && customer.dni) {
      existingUser = await User.findOne({ 
        where: { dni: customer.dni },
        attributes: ['id', 'name', 'email', 'phone', 'dni', 'role']
      });
      if (existingUser) userFoundBy = 'dni';
    }
    
    if (!existingUser && customer.phone) {
      existingUser = await User.findOne({ 
        where: { phone: customer.phone },
        attributes: ['id', 'name', 'email', 'phone', 'dni', 'role']
      });
      if (existingUser) userFoundBy = 'phone';
    }

    // Recalculate prices using seat pricing rules and calculate subtotal
    const pricing = session.pricing_json || session.show?.pricing_json || {};
    const sessionId = session.id;
    const showId = session.show_id;
    
    // Recalculate item prices with seat pricing rules
    const itemsWithCorrectPrices = [];
    for (const item of (items || [])) {
      let finalPrice = Number(item.price || 0);
      
      // For butacas and palcos, recalculate price using seat pricing rules
      if ((item.type === 'butaca' || item.type === 'palco') && item.seat_code) {
        const seatPriceResult = await getSeatPrice(sessionId, showId, item.seat_code, pricing);
        if (seatPriceResult && seatPriceResult.price !== undefined) {
          finalPrice = seatPriceResult.price;
          console.log(`[BOX_OFFICE] Recalculated price for ${item.seat_code}: ${finalPrice} (source: ${seatPriceResult.source})`);
        }
      }
      
      itemsWithCorrectPrices.push({
        ...item,
        price: finalPrice
      });
    }
    
    // Calculate subtotal (tickets + services)
    const ticketsSubtotal = itemsWithCorrectPrices.reduce((sum, item) => {
      if ((item.type === 'pullman' || item.type === 'general') && item.quantity > 0) {
        return sum + (Number(item.price || 0) * Number(item.quantity || 1));
      }
      return sum + Number(item.price || 0);
    }, 0);
    const servicesSubtotal = validServiceItems.reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);
    const subtotal = ticketsSubtotal + servicesSubtotal;
    
    // Apply discount FIRST (before any charges)
    let discountAmount = 0;
    let total = subtotal;
    
    if (validDiscount) {
      if (validDiscount.type === 'percentage') {
        discountAmount = Math.round(subtotal * (validDiscount.value / 100));
      } else if (validDiscount.type === 'fixed') {
        discountAmount = Math.round(validDiscount.value);
      }
      // Ensure discount doesn't exceed subtotal
      discountAmount = Math.min(discountAmount, subtotal);
      total = subtotal - discountAmount;
    }

    // Generate container QR for this sale (temporary ID)
    const tempSaleId = crypto.randomUUID();
    const { generateContainerQR } = await import('../lib/qrGenerator.js');
    const containerQR = await generateContainerQR(tempSaleId, items);

    // Create sale record with container QR
    const sale = await Sale.create({
      id: tempSaleId,
      session_id,
      user_id: existingUser ? existingUser.id : null,
      total_amount: total,
      discount_id: discount_id || null,
      payment_method,
      payment_status: 'approved',
      customer_name: customer.name,
      customer_email: customer.email || null,
      customer_phone: customer.phone || null,
      customer_dni: customer.dni || null,
      sold_by: req.user.userId,
      cashier_id: req.user.userId,
      cash_register_shift_id: activeShift ? activeShift.id : null,
      container_qr_code: containerQR.qr_code,
      container_qr_data: containerQR.qr_data,
      validated_count: 0,
      total_capacity: containerQR.total_capacity,
      service_items: validServiceItems.length > 0 ? validServiceItems : null,
      metadata: {
        source: 'box_office',
        items: itemsWithCorrectPrices,
        service_items: validServiceItems,
        discount_applied: validDiscount ? {
          code: validDiscount.code,
          type: validDiscount.type,
          value: validDiscount.value,
          discount_amount: discountAmount
        } : null,
        user_matched: existingUser ? { by: userFoundBy, user_id: existingUser.id } : null
      }
    });
    
    // Increment discount used_count if discount was applied
    if (validDiscount) {
      await validDiscount.increment('used_count');
      console.log('[BOX_OFFICE] Discount used_count incremented:', validDiscount.code);
    }

    // Create tickets
    const tickets = [];
    const ticketUserId = existingUser ? existingUser.id : null;
    
    for (const item of itemsWithCorrectPrices) {
      if (item.type === 'butaca' || item.type === 'palco') {
        // Determinar sección correcta y capacidad
        let section = 'platea_general'; // Por defecto para butacas
        let capacity = 1; // Por defecto para butacas
        if (item.type === 'palco' && item.seat_code) {
          const isPB = /^PB/i.test(item.seat_code);
          section = isPB ? 'palcos_bajos' : 'palcos_altos';
          capacity = isPB ? 4 : 2;
        }
        const ticket = await Ticket.create({
          session_id,
          sale_id: sale.id,
          user_id: ticketUserId, // Associate ticket directly to user if found
          type: item.type,
          seat_code: item.seat_code,
          section: section,
          price: Number(item.price || 0),
          status: 'sold',
          qr_data: null, // Will be generated later
          capacity: capacity,
          capacity_validated: 0
        });
        tickets.push(ticket);
      } else if (item.type === 'pullman') {
        const quantity = Number(item.quantity || 1);
        for (let i = 0; i < quantity; i++) {
          const ticket = await Ticket.create({
            session_id,
            sale_id: sale.id,
            user_id: ticketUserId, // Associate ticket directly to user if found
            type: 'pullman',
            seat_code: null,
            section: 'pullman',
            price: Number(item.price || 0),
            status: 'sold',
            qr_data: null
          });
          tickets.push(ticket);
        }
      } else if (item.type === 'general') {
        // General admission tickets (for el_tablado, las_gemelas)
        const quantity = Number(item.quantity || 1);
        for (let i = 0; i < quantity; i++) {
          const ticket = await Ticket.create({
            session_id,
            sale_id: sale.id,
            user_id: ticketUserId,
            type: 'general',
            seat_code: null,
            section: 'general',
            price: Number(item.price || 0),
            status: 'sold',
            qr_data: null,
            capacity: 1,
            capacity_validated: 0
          });
          tickets.push(ticket);
        }
      }
    }

    // Create service tickets (one per service item, capacity = quantity)
    for (const svc of validServiceItems) {
      const svcTicket = await Ticket.create({
        session_id,
        sale_id: sale.id,
        user_id: ticketUserId,
        type: 'service',
        seat_code: null,
        section: 'service',
        price: Number(svc.price || 0),
        status: 'sold',
        qr_data: null,
        capacity: Number(svc.quantity || 1),
        capacity_validated: 0
      });
      // Store name in metadata-style: we use seat_code field to hold service name for display
      await svcTicket.update({ seat_code: svc.name });
      tickets.push(svcTicket);
    }

    // Generate individual QR data for each ticket
    const { generateIndividualQR } = await import('../lib/qrGenerator.js');
    for (const ticket of tickets) {
      const { qr_code, qr_data } = await generateIndividualQR(
        ticket.id,
        ticket.seat_code,
        ticket.type
      );
      await ticket.update({ qr_code, qr_data });
      await ticket.reload(); // Reload to get fresh data including price
    }

    // Update in-memory sold state
    const io = req.app.get('io');
    if (io) {
      io.soldSeats = io.soldSeats || new Map();
      io.soldPalcos = io.soldPalcos || new Map();
      io.pullmanSold = io.pullmanSold || new Map();

      const seatSet = io.soldSeats.get(session_id) || new Set();
      const palcoSet = io.soldPalcos.get(session_id) || new Set();
      let pullmanCount = io.pullmanSold.get(session_id) || 0;

      let generalCount = 0;
      for (const item of itemsWithCorrectPrices) {
        if (item.type === 'butaca' && item.seat_code) {
          seatSet.add(item.seat_code);
          io.to(`session:${session_id}`).emit('seat_sold', { seatId: item.seat_code });
        }
        if (item.type === 'palco' && item.seat_code) {
          palcoSet.add(item.seat_code);
          io.to(`session:${session_id}`).emit('palco_sold', { palco: item.seat_code });
        }
        if (item.type === 'pullman') {
          pullmanCount += Number(item.quantity || 1);
        }
        if (item.type === 'general') {
          generalCount += Number(item.quantity || 1);
          console.log('[BOX_OFFICE] General admission item found:', item);
        }
      }
      
      console.log('[BOX_OFFICE] Total general count:', generalCount);

      io.soldSeats.set(session_id, seatSet);
      io.soldPalcos.set(session_id, palcoSet);
      io.pullmanSold.set(session_id, pullmanCount);

      if (pullmanCount > 0) {
        io.to(`session:${session_id}`).emit('pullman_sold', { sold: pullmanCount });
      }

      // Emit general admission update if applicable
      if (generalCount > 0) {
        const capacity = session.capacity_override || session.show.general_capacity;
        const soldCount = await Ticket.count({
          where: { session_id, type: 'general', status: { [Op.in]: ['sold', 'validated'] } }
        });
        const available = Math.max(0, capacity - soldCount);
        console.log('[BOX_OFFICE] Emitting general-admission-update:', {
          sessionId: session_id,
          sold: soldCount,
          available,
          capacity
        });
        io.to(`session:${session_id}`).emit('general-admission-update', {
          sessionId: session_id,
          sold: soldCount,
          available
        });
      }
    }

    // Get seller info
    const seller = await User.findByPk(req.user.userId, {
      attributes: ['id', 'name', 'email', 'role']
    });

    // Format tickets with seat locations
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTickets = tickets.map(t => {
      // Get plain values from Sequelize instance
      const ticketData = t.get ? t.get({ plain: true }) : t;
      return {
        id: ticketData.id,
        type: ticketData.type,
        seat_code: ticketData.seat_code,
        location: formatSeatLocation(ticketData.type, ticketData.section, ticketData.seat_code, ticketData.capacity || 1),
        section: ticketData.section,
        price: ticketData.price,
        capacity: ticketData.capacity || 1,
        qr_data: ticketData.qr_data
      };
    });

    // Send confirmation email if customer email is provided
    if (customer.email) {
      try {
        const { formatDateLong, formatTime } = await import('../lib/dateFormatter.js');
        const { sendPurchaseConfirmation } = await import('../lib/emailService.js');
        
        // Send customer confirmation
        await sendPurchaseConfirmation({
          customerEmail: customer.email,
          customerName: customer.name,
          showTitle: session.show.title,
          sessionDate: formatDateLong(session.starts_at),
          sessionTime: formatTime(session.starts_at),
          functionName: session.function_name || null,
          tickets: formattedTickets,
          saleId: sale.id,
          totalAmount: total,
          paymentMethod: payment_method,
          subtotal: validDiscount ? subtotal : null,
          discountCode: validDiscount ? validDiscount.code : null,
          discountAmount: validDiscount ? discountAmount : null
        });

      } catch (emailError) {
        console.error('[BOX_OFFICE_SALE] Error sending email:', emailError);
        // Don't fail the sale for email errors
      }
    }

    // Prepare share links and session info for response
    const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    const sessionDateObj = session.starts_at ? new Date(session.starts_at) : null;
    const sessionDate = sessionDateObj ? sessionDateObj.toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : null;
    const sessionTime = sessionDateObj ? sessionDateObj.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    }) : null;
    const shareUrl = `${baseUrl}/api/share/sale/${sale.id}`;
    const printUrl = `${shareUrl}?mode=print`;

    // Log activity
    await createActivityLog({
      userId: req.user.userId,
      actionType: ActionTypes.SALE_BOXOFFICE,
      entityType: EntityTypes.SALE,
      entityId: sale.id,
      details: {
        show_title: session.show.title,
        session_id: session_id,
        customer_name: customer.name,
        tickets_count: formattedTickets.length,
        total_amount: total,
        discount_code: validDiscount ? (validDiscount.alias || validDiscount.code) : null
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent']
    });

    return res.json({
      success: true,
      sale: {
        id: sale.id,
        total_amount: sale.total_amount,
        payment_method: sale.payment_method,
        customer_name: sale.customer_name,
        customer_email: sale.customer_email,
        customer_phone: sale.customer_phone,
        show_title: session.show?.title,
        session_date: sessionDate,
        session_time: sessionTime,
        share_url: shareUrl,
        print_url: printUrl,
        subtotal: subtotal,
        discount_amount: discountAmount
      },
      discount: validDiscount ? {
        code: validDiscount.code,
        alias: validDiscount.alias || null,
        type: validDiscount.type,
        value: validDiscount.value,
        amount: discountAmount
      } : null,
      seller: seller ? {
        name: seller.name,
        email: seller.email
      } : null,
      user_association: existingUser ? {
        found: true,
        matched_by: userFoundBy,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role
        },
        message: `Esta entrada se guardó automáticamente en el perfil del usuario ${existingUser.name}`
      } : null,
      tickets: formattedTickets
    });
  } catch (error) {
    console.error('[BOX_OFFICE_SALE] Error:', error);
    return res.status(500).json({ error: 'server_error', message: 'Error creating sale' });
  }
});

// Manual ticket lookup by DNI, email, apellido or phone (for lost QR cases)
// Body: { query: string }
router.post('/lookup-customer', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Se requiere al menos 2 caracteres para buscar' });
    }
    
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show, users: User } = sequelize.models;
    const { Op } = (await import('sequelize')).default || await import('sequelize');
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    
    const term = query.trim().toLowerCase();
    const like = { [Op.like]: `%${term}%` };
    
    // Only show sessions from today onwards (not past events)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Search sales by customer fields OR by associated user fields
    const sales = await Sale.findAll({
      where: {
        [Op.or]: [
          sequelize.where(sequelize.fn('LOWER', sequelize.col('sales.customer_name')), like),
          sequelize.where(sequelize.fn('LOWER', sequelize.col('sales.customer_email')), like),
          sequelize.where(sequelize.fn('LOWER', sequelize.col('sales.customer_dni')), like),
          sequelize.where(sequelize.fn('LOWER', sequelize.col('sales.customer_phone')), like),
          sequelize.where(sequelize.fn('LOWER', sequelize.col('user.name')), like),
          sequelize.where(sequelize.fn('LOWER', sequelize.col('user.email')), like),
          sequelize.where(sequelize.fn('LOWER', sequelize.fn('IFNULL', sequelize.col('user.dni'), '')), like)
        ]
      },
      include: [
        {
          model: Session,
          as: 'session',
          required: true,
          where: {
            starts_at: { [Op.gte]: today }
          },
          include: [{ model: Show, as: 'show', attributes: ['id', 'title', 'image_url'] }]
        },
        {
          model: User,
          as: 'user',
          required: false,
          attributes: ['id', 'name', 'email', 'dni', 'phone']
        }
      ],
      order: [[{ model: Session, as: 'session' }, 'starts_at', 'ASC']]
    });
    
    if (sales.length === 0) {
      return res.json({ results: [], message: 'No se encontraron entradas para este dato' });
    }
    
    // For each sale, get its tickets
    const results = [];
    for (const sale of sales) {
      const tickets = await Ticket.findAll({
        where: { sale_id: sale.id },
        order: [['type', 'ASC'], ['seat_code', 'ASC']]
      });
      
      if (tickets.length === 0) continue;
      
      // Check if sale is refunded
      const rawMetadata = sale.metadata || {};
      const refunded = !!rawMetadata.refunded;
      
      const ticketInfo = tickets.map(t => {
        let fullSection = t.section;
        if (t.section === 'platea' || t.section === 'platea_general') {
          fullSection = 'Platea Baja';
        } else if (t.section === 'palco') {
          const isPB = t.seat_code && /^PB/i.test(t.seat_code);
          fullSection = isPB ? 'Palco Bajo' : 'Palco Alto';
        } else if (t.section === 'palcos_bajos') {
          fullSection = 'Palco Bajo';
        } else if (t.section === 'palcos_altos') {
          fullSection = 'Palco Alto';
        } else if (t.section === 'pullman') {
          fullSection = 'Pullman';
        }
        
        let location = '';
        if (t.type === 'service') {
          fullSection = 'Servicio';
          location = t.seat_code || 'Servicio';
        } else if (t.type === 'butaca') {
          const fila = t.seat_code ? t.seat_code.charAt(0).toUpperCase() : '';
          const asiento = t.seat_code ? t.seat_code.substring(1) : '';
          location = `${fullSection} - Fila ${fila} - Asiento ${asiento}`;
        } else if (t.type === 'palco') {
          const numero = t.seat_code ? t.seat_code.replace(/^(PB|PA)\s*/i, '') : '';
          location = `${fullSection} - Número ${numero}`;
        } else if (t.type === 'pullman') {
          location = 'Pullman';
        } else if (t.type === 'general') {
          location = 'Entrada General';
        }
        
        return {
          id: t.id,
          type: t.type,
          seat_code: t.seat_code,
          section: fullSection,
          location,
          status: t.status,
          validated_at: t.validated_at,
          price: t.price,
          capacity: t.capacity || 1,
          capacity_validated: t.capacity_validated || 0
        };
      });
      
      results.push({
        sale_id: sale.id,
        customer_name: sale.customer_name || sale.user?.name || 'Sin nombre',
        customer_dni: sale.customer_dni || sale.user?.dni || '',
        customer_email: sale.customer_email || sale.user?.email || '',
        customer_phone: sale.customer_phone || sale.user?.phone || '',
        show_name: sale.session?.show?.title || 'Espectáculo',
        show_image: sale.session?.show?.image_url || null,
        session_date: sale.session?.starts_at,
        session_id: sale.session_id,
        refunded,
        total_tickets: ticketInfo.length,
        validated_tickets: ticketInfo.filter(t => t.status === 'validated').length,
        tickets: ticketInfo
      });
    }
    
    return res.json({ results });
  } catch (error) {
    console.error('[LOOKUP_CUSTOMER] Error:', error);
    return res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// Scan QR and get ticket information (without validating)
// Body: { qr_data: string }
router.post('/scan-qr', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { qr_data } = req.body;
    
    if (!qr_data) {
      return res.status(400).json({ error: 'qr_data required' });
    }
    
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show } = sequelize.models;
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    
    // Check if it's a container QR
    if (qr_data.startsWith('CONTAINER:')) {
      const sale = await Sale.findOne({ 
        where: { container_qr_data: qr_data },
        include: [{
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        }]
      });
      
      if (!sale) {
        return res.status(404).json({ error: 'sale_not_found', message: 'No se encontró la venta con este QR' });
      }
      
      // Get all tickets for this sale
      const tickets = await Ticket.findAll({
        where: { sale_id: sale.id },
        order: [['type', 'ASC'], ['seat_code', 'ASC']]
      });
      
      // Format ticket info with location
      const ticketInfo = tickets.map(t => {
        // Detectar sección completa
        let fullSection = t.section;
        if (t.section === 'platea' || t.section === 'platea_general') {
          fullSection = 'Platea Baja';
        } else if (t.section === 'palco') {
          const isPB = t.seat_code && /^PB/i.test(t.seat_code);
          fullSection = isPB ? 'Palco Bajo' : 'Palco Alto';
        } else if (t.section === 'palcos_bajos') {
          fullSection = 'Palco Bajo';
        } else if (t.section === 'palcos_altos') {
          fullSection = 'Palco Alto';
        } else if (t.section === 'pullman') {
          fullSection = 'Pullman';
        }
        
        // Formatear ubicación detallada
        let location = '';
        if (t.type === 'service') {
          fullSection = 'Servicio';
          location = t.seat_code || 'Servicio';
        } else if (t.type === 'butaca') {
          const fila = t.seat_code ? t.seat_code.charAt(0).toUpperCase() : '';
          const asiento = t.seat_code ? t.seat_code.substring(1) : '';
          location = `${fullSection} - Fila ${fila} - Asiento ${asiento}`;
        } else if (t.type === 'palco') {
          const numero = t.seat_code ? t.seat_code.replace(/^(PB|PA)\s*/i, '') : '';
          location = `${fullSection} - Número ${numero}`;
        } else if (t.type === 'pullman') {
          location = 'Pullman';
        }
        
        return {
          id: t.id,
          type: t.type,
          seat_code: t.seat_code,
          section: fullSection,
          location,
          status: t.status,
          validated_at: t.validated_at,
          price: t.price,
          capacity: t.capacity || 1,
          capacity_validated: t.capacity_validated || 0
        };
      });
      
      const rawMetadata = sale.metadata || {};
      const refunded = !!rawMetadata.refunded;
      const refundSnapshot = rawMetadata.refund_snapshot || null;
      const refundReason = rawMetadata.refund_reason || rawMetadata.reason || null;
      const refundedAt = rawMetadata.refunded_at || null;
      
      let refundLocations = null;
      let refundTicketsCount = null;
      let refundPeopleCount = null;
      
      if (refundSnapshot && Array.isArray(refundSnapshot.locations)) {
        refundLocations = refundSnapshot.locations;
        refundTicketsCount = refundSnapshot.tickets_count || refundSnapshot.locations.length;
        refundPeopleCount = refundSnapshot.people_count || refundTicketsCount;
      }
      
      return res.json({
        qr_type: 'container',
        sale_info: {
          sale_id: sale.id,
          session_id: sale.session_id,
          show_name: sale.session?.show?.title || 'Espectáculo',
          session_date: sale.session?.starts_at,
          total_capacity: sale.total_capacity,
          validated_count: sale.validated_count,
          remaining: sale.total_capacity - sale.validated_count,
          customer_name: sale.customer_name,
          refunded,
          refunded_at: refundedAt,
          refund_reason: refundReason,
          refund_locations: refundLocations,
          refund_tickets_count: refundTicketsCount,
          refund_people_count: refundPeopleCount,
          original_amount: Number(sale.total_amount || 0)
        },
        tickets: ticketInfo
      });
    }
    
    // Check if it's an individual ticket QR
    if (qr_data.startsWith('TICKET:')) {
      // Nuevo formato: TICKET:<ticketId>:<seatOrType>:<timestamp>:<random>
      let ticketId = null;
      try {
        const parts = qr_data.split(':');
        if (parts.length >= 2) {
          ticketId = parts[1];
        }
      } catch (e) {
        // ignore, ticketId seguirá siendo null
      }

      if (!ticketId) {
        return res.status(400).json({ error: 'invalid_ticket_qr', message: 'QR de entrada inválido' });
      }

      const ticket = await Ticket.findByPk(ticketId, {
        include: [
          {
            model: Session,
            as: 'session',
            include: [{ model: Show, as: 'show' }]
          }
        ]
      });

      if (!ticket) {
        return res.status(404).json({ error: 'ticket_not_found', message: 'No se encontró la entrada con este QR' });
      }

      // Detectar si la entrada pertenece a una compra reintegrada
      let refunded = false;
      let refundReason = null;
      let refundedAt = null;
      let refundLocations = null;
      let refundTicketsCount = null;
      let refundPeopleCount = null;
      let originalAmount = null;

      try {
        // Primero, intentar inferir la ubicación tal como se guardó en refund_snapshot
        const locationKey = formatSeatLocation(
          ticket.type,
          ticket.section,
          ticket.seat_code,
          ticket.capacity || 1
        );

        // Buscar ventas de la misma función que tengan refund_snapshot con esta ubicación
        const candidateSales = await Sale.findAll({
          where: { session_id: ticket.session_id },
          attributes: ['id', 'metadata', 'total_amount', 'createdAt']
        });

        let matchedSale = null;
        let matchedMeta = null;

        for (const sale of candidateSales) {
          const meta = sale.metadata || {};
          const snapshot = meta.refund_snapshot;

          if (!meta.refunded || !snapshot || !Array.isArray(snapshot.locations)) {
            continue;
          }

          if (snapshot.locations.includes(locationKey)) {
            if (!matchedSale) {
              matchedSale = sale;
              matchedMeta = meta;
            } else {
              const currentTs = new Date(matchedMeta.refunded_at || matchedSale.createdAt).getTime();
              const candidateTs = new Date(meta.refunded_at || sale.createdAt).getTime();
              if (candidateTs > currentTs) {
                matchedSale = sale;
                matchedMeta = meta;
              }
            }
          }
        }

        if (matchedSale && matchedMeta) {
          refunded = true;
          const snapshot = matchedMeta.refund_snapshot || {};
          refundLocations = Array.isArray(snapshot.locations) ? snapshot.locations : null;
          refundTicketsCount = snapshot.tickets_count || (refundLocations ? refundLocations.length : null);
          refundPeopleCount = snapshot.people_count || refundTicketsCount;
          refundReason = matchedMeta.refund_reason || matchedMeta.reason || null;
          refundedAt = matchedMeta.refunded_at || null;
          originalAmount = Number(matchedSale.total_amount || 0);
        } else if (
          ticket.status === 'available' &&
          !ticket.sale_id &&
          !ticket.qr_code &&
          !ticket.qr_data
        ) {
          // Caso heurístico: ticket que fue vendido y luego liberado (muy probablemente por reintegro)
          refunded = true;
        }
      } catch (lookupError) {
        console.error('[SCAN_QR] Error buscando venta reintegrada para ticket:', lookupError);
      }

      // Detectar sección completa para visualización
      let fullSection = ticket.section;
      if (ticket.section === 'platea' || ticket.section === 'platea_general') {
        fullSection = 'Platea Baja';
      } else if (ticket.section === 'palco') {
        const isPB = ticket.seat_code && /^PB/i.test(ticket.seat_code);
        fullSection = isPB ? 'Palco Bajo' : 'Palco Alto';
      } else if (ticket.section === 'palcos_bajos') {
        fullSection = 'Palco Bajo';
      } else if (ticket.section === 'palcos_altos') {
        fullSection = 'Palco Alto';
      } else if (ticket.section === 'pullman') {
        fullSection = 'Pullman';
      }

      // Formatear ubicación detallada para mostrar al boletero
      let location = '';
      if (ticket.type === 'service') {
        fullSection = 'Servicio';
        location = ticket.seat_code || 'Servicio';
      } else if (ticket.type === 'butaca') {
        const fila = ticket.seat_code ? ticket.seat_code.charAt(0).toUpperCase() : '';
        const asiento = ticket.seat_code ? ticket.seat_code.substring(1) : '';
        location = `${fullSection} - Fila ${fila} - Asiento ${asiento}`;
      } else if (ticket.type === 'palco') {
        const numero = ticket.seat_code ? ticket.seat_code.replace(/^(PB|PA)\s*/i, '') : '';
        location = `${fullSection} - Número ${numero}`;
      } else if (ticket.type === 'pullman') {
        location = 'Pullman';
      }

      return res.json({
        qr_type: 'individual',
        sale_info: {
          show_name: ticket.session?.show?.title || 'Espectáculo',
          session_date: ticket.session?.starts_at,
          refunded,
          refunded_at: refundedAt,
          refund_reason: refundReason,
          refund_locations: refundLocations,
          refund_tickets_count: refundTicketsCount,
          refund_people_count: refundPeopleCount,
          original_amount: originalAmount
        },
        tickets: [{
          id: ticket.id,
          type: ticket.type,
          seat_code: ticket.seat_code,
          section: fullSection,
          location,
          status: ticket.status,
          validated_at: ticket.validated_at,
          price: ticket.price,
          capacity: ticket.capacity || 1,
          capacity_validated: ticket.capacity_validated || 0
        }]
      });
    }
    
    return res.status(400).json({ error: 'invalid_qr', message: 'QR no reconocido' });
  } catch (error) {
    console.error('[SCAN_QR] Error:', error);
    return res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// Validate multiple tickets by IDs (con soporte para validación parcial de palcos)
// Body: { validations: [{ ticket_id: string, quantity?: number }] }
router.post('/validate-tickets', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { validations } = req.body;
    
    if (!validations || !Array.isArray(validations) || validations.length === 0) {
      return res.status(400).json({ error: 'validations array required' });
    }
    
    const { tickets: Ticket, validations: Validation, sales: Sale } = sequelize.models;
    
    // Get all ticket IDs
    const ticketIds = validations.map(v => v.ticket_id);
    
    // Get all tickets
    const tickets = await Ticket.findAll({
      where: { id: ticketIds }
    });
    
    if (tickets.length === 0) {
      return res.status(404).json({ error: 'tickets_not_found' });
    }
    
    // Create a map for quick lookup
    const ticketMap = new Map(tickets.map(t => [t.id, t]));
    
    const results = {
      validated: [],
      partially_validated: [],
      already_validated: [],
      errors: []
    };
    
    for (const validation of validations) {
      const ticket = ticketMap.get(validation.ticket_id);
      if (!ticket) {
        results.errors.push({
          id: validation.ticket_id,
          error: 'Ticket no encontrado'
        });
        continue;
      }
      
      const quantity = validation.quantity || ticket.capacity || 1;
      const currentValidated = ticket.capacity_validated || 0;
      const totalCapacity = ticket.capacity || 1;
      
      // Check if already fully validated
      if (currentValidated >= totalCapacity) {
        results.already_validated.push({
          id: ticket.id,
          location: ticket.seat_code || ticket.type,
          validated_at: ticket.validated_at,
          capacity: totalCapacity,
          capacity_validated: currentValidated
        });
        continue;
      }
      
      if (ticket.status !== 'sold' && ticket.status !== 'validated') {
        results.errors.push({
          id: ticket.id,
          location: ticket.seat_code || ticket.type,
          error: `Estado inválido: ${ticket.status}`
        });
        continue;
      }
      
      // Calculate how many can be validated
      const remaining = totalCapacity - currentValidated;
      const toValidate = Math.min(quantity, remaining);
      const newValidatedCount = currentValidated + toValidate;
      
      // Update ticket
      const isFullyValidated = newValidatedCount >= totalCapacity;
      await ticket.update({
        capacity_validated: newValidatedCount,
        status: isFullyValidated ? 'validated' : 'sold',
        validated_at: isFullyValidated ? new Date() : ticket.validated_at,
        validated_by: isFullyValidated ? req.user.userId : ticket.validated_by
      });
      
      // Create validation record
      await Validation.create({
        ticket_id: ticket.id,
        validated_by: req.user.userId,
        device_info: {
          userAgent: req.headers['user-agent'],
          platform: req.headers['sec-ch-ua-platform']
        },
        ip_address: req.ip || req.connection.remoteAddress,
        validation_type: 'qr_scan'
      });
      
      if (isFullyValidated) {
        results.validated.push({
          id: ticket.id,
          location: ticket.seat_code || ticket.type,
          validated_at: ticket.validated_at,
          quantity: toValidate,
          capacity: totalCapacity,
          capacity_validated: newValidatedCount
        });
      } else {
        results.partially_validated.push({
          id: ticket.id,
          location: ticket.seat_code || ticket.type,
          quantity: toValidate,
          capacity: totalCapacity,
          capacity_validated: newValidatedCount,
          remaining: totalCapacity - newValidatedCount
        });
      }
    }
    
    // Update sale validated_count if tickets belong to a sale
    const saleIds = [...new Set(tickets.map(t => t.sale_id).filter(Boolean))];
    const affectedUserIds = new Set();
    
    for (const saleId of saleIds) {
      const sale = await Sale.findByPk(saleId);
      if (sale) {
        const validatedCount = await Ticket.count({
          where: { sale_id: saleId, status: 'validated' }
        });
        await sale.update({ validated_count: validatedCount });
        
        // Track user IDs for socket notification
        if (sale.user_id) {
          affectedUserIds.add(sale.user_id);
        }
      }
    }
    
    // Emit socket event to notify users their tickets were validated or partially validated
    try {
      const io = req.app.get('io');
      if (io) {
        for (const userId of affectedUserIds) {
          const allTicketIds = [
            ...results.validated.map(t => t.id),
            ...results.partially_validated.map(t => t.id)
          ];
          io.emit('tickets_validated', { 
            user_id: userId,
            ticket_ids: allTicketIds
          });
        }
      }
    } catch (ioErr) {
      console.warn('[VALIDATE_TICKETS] Socket.io error (non-critical):', ioErr.message);
    }
    
    return res.json({
      ok: true,
      total_requested: validations.length,
      validated_count: results.validated.length,
      partially_validated_count: results.partially_validated.length,
      already_validated_count: results.already_validated.length,
      error_count: results.errors.length,
      results
    });
  } catch (error) {
    console.error('[VALIDATE_TICKETS] Error:', error);
    return res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// Validate container QR (allows partial validations)
// Body: { qr_data: string, count?: number }
router.post('/validate-container', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { qr_data, count = 1 } = req.body;
    
    if (!qr_data) {
      return res.status(400).json({ error: 'qr_data required' });
    }
    
    // Check if it's a container QR
    if (!qr_data.startsWith('CONTAINER:')) {
      return res.status(400).json({ error: 'invalid_container_qr', message: 'This is not a container QR code' });
    }
    
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show } = sequelize.models;
    
    // Find sale by container QR
    const sale = await Sale.findOne({ 
      where: { container_qr_data: qr_data },
      include: [{
        model: Session,
        as: 'session',
        include: [{ model: Show, as: 'show' }]
      }]
    });
    
    if (!sale) {
      return res.status(404).json({ error: 'sale_not_found', message: 'No se encontró la venta con este QR' });
    }
    
    // Get all tickets for this sale
    const tickets = await Ticket.findAll({
      where: { sale_id: sale.id, status: 'sold' },
      attributes: ['id', 'type', 'seat_code', 'section', 'status', 'price', 'capacity']
    });
    
    const validatedTickets = await Ticket.findAll({
      where: { sale_id: sale.id, status: 'validated' }
    });
    
    // Calculate remaining capacity
    const remainingCapacity = sale.total_capacity - sale.validated_count;
    
    if (remainingCapacity <= 0) {
      return res.status(409).json({ 
        error: 'fully_validated', 
        message: 'Todas las entradas de esta compra ya fueron validadas',
        sale_info: {
          sale_id: sale.id,
          total_capacity: sale.total_capacity,
          validated_count: sale.validated_count,
          remaining: 0
        }
      });
    }
    
    // Validate requested count
    const toValidate = Math.min(count, remainingCapacity);
    
    // Mark tickets as validated (up to toValidate count)
    const ticketsToValidate = tickets.slice(0, toValidate);
    
    for (const ticket of ticketsToValidate) {
      await ticket.update({
        status: 'validated',
        validated_at: new Date(),
        validated_by: req.user.userId
      });
    }
    
    // Update sale validated_count
    await sale.update({
      validated_count: sale.validated_count + toValidate
    });
    
    // Format tickets info
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const ticketInfo = tickets.map(t => ({
      id: t.id,
      type: t.type,
      seat_code: t.seat_code,
      location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1),
      status: t.status,
      price: t.price
    }));
    
    return res.json({
      ok: true,
      validated: toValidate,
      sale_info: {
        sale_id: sale.id,
        session_id: sale.session_id,
        show_name: sale.session?.show?.name || 'Espectáculo',
        session_date: sale.session?.starts_at,
        total_capacity: sale.total_capacity,
        validated_count: sale.validated_count + toValidate,
        remaining: sale.total_capacity - (sale.validated_count + toValidate),
        customer_name: sale.customer_name
      },
      tickets: ticketInfo
    });
  } catch (error) {
    console.error('[VALIDATE_CONTAINER] Error:', error);
    return res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// Validate individual ticket QR
// Body: { qr_data: string }
router.post('/validate-individual', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { qr_data } = req.body;
    
    if (!qr_data) {
      return res.status(400).json({ error: 'qr_data required' });
    }
    
    // Check if it's an individual ticket QR
    if (!qr_data.startsWith('TICKET:')) {
      return res.status(400).json({ error: 'invalid_ticket_qr', message: 'This is not an individual ticket QR code' });
    }
    
    const { tickets: Ticket, sessions: Session, shows: Show } = sequelize.models;
    
    // Find ticket by QR data
    const ticket = await Ticket.findOne({
      where: { qr_data },
      include: [{
        model: Session,
        as: 'session',
        include: [{ model: Show, as: 'show' }]
      }]
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'ticket_not_found', message: 'No se encontró la entrada con este QR' });
    }
    
    if (ticket.status === 'validated') {
      return res.status(409).json({
        error: 'already_validated',
        message: 'Esta entrada ya fue validada',
        validated_at: ticket.validated_at,
        ticket_info: {
          id: ticket.id,
          type: ticket.type,
          seat_code: ticket.seat_code,
          location: ticket.seat_code || ticket.type
        }
      });
    }
    
    if (ticket.status !== 'sold') {
      return res.status(409).json({
        error: 'invalid_status',
        message: `Esta entrada no puede ser validada (status: ${ticket.status})`
      });
    }
    
    // Validate ticket
    await ticket.update({
      status: 'validated',
      validated_at: new Date(),
      validated_by: req.user.userId
    });
    
    // Log activity
    await createActivityLog({
      userId: req.user.userId,
      actionType: ActionTypes.TICKET_VALIDATE,
      entityType: EntityTypes.TICKET,
      entityId: ticket.id,
      details: {
        show_title: ticket.session?.show?.title,
        session_id: ticket.session_id,
        seat_code: ticket.seat_code,
        ticket_type: ticket.type
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent']
    });
    
    // Format location
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const location = formatSeatLocation(ticket.type, ticket.section, ticket.seat_code, ticket.capacity || 1);
    
    return res.json({
      ok: true,
      message: 'Entrada validada exitosamente',
      ticket_info: {
        id: ticket.id,
        type: ticket.type,
        seat_code: ticket.seat_code,
        location,
        show_name: ticket.session?.show?.name || 'Espectáculo',
        session_date: ticket.session?.starts_at,
        validated_at: ticket.validated_at
      }
    });
  } catch (error) {
    console.error('[VALIDATE_INDIVIDUAL] Error:', error);
    return res.status(500).json({ error: 'server_error', message: error.message });
  }
});

/**
 * POST /api/tickets/resend
 * Resend tickets to customer via email or WhatsApp
 * Body: { sale_id: string, email?: string, phone?: string }
 * Requires: boleteria or admin role
 */
router.post('/resend', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { sale_id, email, phone } = req.body;
    
    if (!sale_id) {
      return res.status(400).json({ error: 'sale_id es requerido' });
    }
    
    if (!email && !phone) {
      return res.status(400).json({ error: 'Se requiere email o teléfono para reenviar' });
    }
    
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show, users: User } = sequelize.models;
    
    // Get sale with full details
    const sale = await Sale.findByPk(sale_id, {
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        },
        {
          model: User,
          as: 'user'
        }
      ]
    });
    
    if (!sale) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    
    // Get tickets
    const tickets = await Ticket.findAll({ 
      where: { sale_id },
      order: [['section', 'ASC'], ['seat_code', 'ASC']]
    });
    
    if (!tickets || tickets.length === 0) {
      return res.status(404).json({ error: 'No se encontraron entradas para esta venta' });
    }
    
    const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:5173';
    const ticketsUrl = `${baseUrl}/api/share/sale/${sale_id}`;
    
    // Prepare session info
    const sessionDate = new Date(sale.session.starts_at).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const sessionTime = new Date(sale.session.starts_at).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const customerName = sale.customer_name || sale.user?.name || 'Cliente';
    const showTitle = sale.session?.show?.title || 'Espectáculo';
    
    // Format tickets for display
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTickets = tickets.map(t => ({
      location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1),
      price: t.price
    }));
    
    let result = { success: false };
    
    // Send via email if provided
    if (email) {
      const { sendPurchaseConfirmation } = await import('../lib/emailService.js');
      
      result = await sendPurchaseConfirmation({
        customerEmail: email,
        customerName,
        showTitle,
        sessionDate,
        sessionTime,
        functionName: sale.session?.function_name || null,
        tickets: formattedTickets,
        saleId: sale_id,
        totalAmount: sale.total_amount,
        paymentMethod: sale.payment_method,
        subtotal: sale.total_amount,
        discountCode: null,
        discountAmount: 0
      });
      
      if (!result.success) {
        return res.status(500).json({ 
          error: 'Error al enviar email', 
          details: result.error 
        });
      }
    }
    
    // Send via WhatsApp if provided
    if (phone) {
      // Format WhatsApp message
      const ticketCount = tickets.length;
      const ticketWord = ticketCount === 1 ? 'entrada' : 'entradas';
      
      const whatsappMessage = `Hola ${customerName}! Te enviamos ${ticketCount === 1 ? 'tu' : 'tus'} ${ticketWord} para ${showTitle}.
      
Función: ${sessionDate} a las ${sessionTime}

Podés ver ${ticketCount === 1 ? 'tu entrada' : 'tus entradas'} aquí: ${ticketsUrl}

Recordá llegar al menos 30 minutos antes de la función. Una vez comenzada la misma, la ubicación pierde validez y el personal del teatro te asignará un nuevo lugar.

Las entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo.

Teatro Español Pigüé

(Para acceder al link, tenés que tener agendado este contacto)`;
      
      // WhatsApp URL (opens WhatsApp Web/App with pre-filled message)
      const whatsappUrl = `https://wa.me/549${phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;
      
      result.whatsappUrl = whatsappUrl;
    }
    
    // Log activity
    await createActivityLog({
      userId: req.user.id,
      actionType: ActionTypes.RESEND_TICKETS,
      entityType: EntityTypes.SALE,
      entityId: sale_id,
      details: JSON.stringify({
        email: email || null,
        phone: phone || null,
        ticket_count: tickets.length,
        customer_name: customerName
      }),
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent']
    });
    
    return res.json({
      success: true,
      message: email ? 'Entradas reenviadas por email exitosamente' : 'Link de WhatsApp generado',
      tickets_url: ticketsUrl,
      whatsapp_url: result.whatsappUrl,
      ticket_count: tickets.length
    });
    
  } catch (error) {
    console.error('[RESEND_TICKETS] Error:', error);
    return res.status(500).json({ 
      error: 'Error al reenviar entradas', 
      message: error.message 
    });
  }
});

export default router;
