import { Router } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

const BILL_CONFIG = [
  { key: 'bill20000', value: 20000, openingField: 'opening_bill_20000', closingField: 'closing_bill_20000' },
  { key: 'bill10000', value: 10000, openingField: 'opening_bill_10000', closingField: 'closing_bill_10000' },
  { key: 'bill2000', value: 2000, openingField: 'opening_bill_2000', closingField: 'closing_bill_2000' },
  { key: 'bill1000', value: 1000, openingField: 'opening_bill_1000', closingField: 'closing_bill_1000' },
  { key: 'bill500', value: 500, openingField: 'opening_bill_500', closingField: 'closing_bill_500' }
];

const CASH_METHODS = new Set(['cash', 'efectivo']);

const parseCount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
};

const normalizeBills = (raw = {}) => {
  const counts = {};
  BILL_CONFIG.forEach(({ key }) => {
    counts[key] = parseCount(raw[key]);
  });
  return counts;
};

const assignBillFields = (target, counts, type) => {
  BILL_CONFIG.forEach(({ key, openingField, closingField }) => {
    const fieldName = type === 'opening' ? openingField : closingField;
    const value = counts[key] ?? 0;
    if (typeof target.set === 'function') {
      target.set(fieldName, value);
    } else {
      target[fieldName] = value;
    }
  });
};

const extractBillCounts = (source, type) => {
  const counts = {};
  BILL_CONFIG.forEach(({ key, openingField, closingField }) => {
    const fieldName = type === 'opening' ? openingField : closingField;
    counts[key] = Number(source[fieldName] || 0);
  });
  return counts;
};

const calculateTotal = (counts) => {
  return BILL_CONFIG.reduce((total, { key, value }) => {
    return total + Number(counts[key] || 0) * value;
  }, 0);
};

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
};

const shiftToPayload = (shiftInstance) => {
  const plain = shiftInstance.get({ plain: true });
  const openingBills = extractBillCounts(plain, 'opening');
  const closingBills = extractBillCounts(plain, 'closing');

  const openingTotal = toNumber(plain.opening_total_cash);
  const closingTotal = toNumber(plain.closing_total_cash);
  const cashSalesTotal = toNumber(plain.cash_sales_total);
  const nonCashSalesTotal = toNumber(plain.non_cash_sales_total);
  const adjustmentsAmount = toNumber(plain.cash_adjustments_amount);
  const discrepancy = toNumber(plain.discrepancy_amount);

  const expectedCash = Math.round((openingTotal + cashSalesTotal + adjustmentsAmount) * 100) / 100;

  const summary = {
    opening_total_cash: openingTotal,
    closing_total_cash: closingTotal,
    cash_sales_total: cashSalesTotal,
    non_cash_sales_total: nonCashSalesTotal,
    cash_sales_count: Number(plain.cash_sales_count || 0),
    adjustments_amount: adjustmentsAmount,
    expected_cash: expectedCash,
    discrepancy_amount: discrepancy || Math.round((closingTotal - expectedCash) * 100) / 100
  };

  return {
    ...plain,
    opening_bills: openingBills,
    closing_bills: closingBills,
    summary,
    closing_summary: plain.closing_summary || summary
  };
};

// Helper: calcular personas reales considerando palcos y pullman
const calculateRealPeople = (tickets = []) => {
  let totalPeople = 0;

  tickets.forEach((ticket) => {
    if (ticket.type === 'palco') {
      if (ticket.seat_code?.startsWith('PB')) {
        totalPeople += 4;
      } else if (ticket.seat_code?.startsWith('PA')) {
        totalPeople += 2;
      } else {
        totalPeople += 1;
      }
    } else if (ticket.type === 'pullman') {
      totalPeople += ticket.capacity || 1;
    } else {
      totalPeople += 1;
    }
  });

  return totalPeople;
};

router.post(
  '/open',
  authenticateToken,
  requireRole('boleteria', 'admin'),
  async (req, res) => {
    try {
      const { cash_register_shifts: CashRegisterShift, users: User } = sequelize.models;
      const isAdmin = req.user.role === 'admin';
      const targetUserId = isAdmin && req.body.user_id ? req.body.user_id : req.user.userId;

      const activeShift = await CashRegisterShift.findOne({
        where: { user_id: targetUserId, status: 'open' }
      });

      if (activeShift) {
        return res.status(409).json({
          error: 'shift_already_open',
          message: 'Ya tenés una caja abierta. Cerrala antes de abrir una nueva.'
        });
      }

      const openingBills = normalizeBills(req.body.openingBills);
      const openingNote = req.body.opening_note?.trim() || null;

      const shiftData = {
        user_id: targetUserId,
        status: 'open',
        opening_note: openingNote,
        cash_adjustments_amount: 0,
        cash_adjustments_note: null,
        opening_total_cash: calculateTotal(openingBills)
      };

      assignBillFields(shiftData, openingBills, 'opening');

      const shift = await CashRegisterShift.create(shiftData);

      const createdShift = await CashRegisterShift.findByPk(shift.id, {
        include: [{ model: User, as: 'cashier', attributes: ['id', 'name', 'email'] }]
      });

      return res.status(201).json({ shift: shiftToPayload(createdShift) });
    } catch (error) {
      console.error('[CASH REGISTER] Open shift error:', error);
      return res.status(500).json({ error: 'internal_error', message: 'No se pudo abrir la caja' });
    }
  }
);

router.post(
  '/close',
  authenticateToken,
  requireRole('boleteria', 'admin'),
  async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { cash_register_shifts: CashRegisterShift, sales: Sale, users: User } = sequelize.models;
      const isAdmin = req.user.role === 'admin';
      const targetUserId = isAdmin && req.body.user_id ? req.body.user_id : req.user.userId;
      const shiftId = req.body.shift_id;

      const shift = await CashRegisterShift.findOne({
        where: shiftId
          ? { id: shiftId }
          : { user_id: targetUserId, status: 'open' },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!shift) {
        await transaction.rollback();
        return res.status(404).json({
          error: 'shift_not_found',
          message: 'No se encontró una caja abierta para cerrar.'
        });
      }

      if (!isAdmin && shift.user_id !== req.user.userId) {
        await transaction.rollback();
        return res.status(403).json({ error: 'forbidden', message: 'No podés cerrar una caja de otro usuario.' });
      }

      if (shift.status !== 'open') {
        await transaction.rollback();
        return res.status(400).json({ error: 'shift_already_closed', message: 'Esta caja ya fue cerrada.' });
      }

      const closingBills = normalizeBills(req.body.closingBills);
      const closingNote = req.body.closing_note?.trim() || null;
      const adjustmentsAmount = toNumber(req.body.cash_adjustments_amount);
      const adjustmentsNote = req.body.cash_adjustments_note?.trim() || null;
      const closedAt = new Date();

      const closingTotalCash = calculateTotal(closingBills);

      const sales = await Sale.findAll({
        where: {
          [Op.or]: [
            { cash_register_shift_id: shift.id },
            {
              cash_register_shift_id: null,
              sold_by: shift.user_id,
              createdAt: {
                [Op.between]: [shift.opened_at, closedAt]
              }
            }
          ]
        },
        transaction
      });

      let cashSalesTotal = 0;
      let cashSalesCount = 0;
      let nonCashSalesTotal = 0;
      let lastSaleAt = null;
      const orphanSalesToUpdate = [];

      sales.forEach((sale) => {
        const amount = toNumber(sale.total_amount);
        const method = (sale.payment_method || '').toLowerCase();
        const createdAt = sale.createdAt ? new Date(sale.createdAt) : null;

        if (CASH_METHODS.has(method)) {
          cashSalesTotal += amount;
          cashSalesCount += 1;
        } else {
          nonCashSalesTotal += amount;
        }

        if (createdAt && (!lastSaleAt || createdAt > lastSaleAt)) {
          lastSaleAt = createdAt;
        }

        if (!sale.cash_register_shift_id) {
          sale.cash_register_shift_id = shift.id;
          orphanSalesToUpdate.push(sale.save({ transaction }));
        }
      });

      const openingTotal = toNumber(shift.opening_total_cash);
      const expectedCash = Math.round((openingTotal + cashSalesTotal + adjustmentsAmount) * 100) / 100;
      const discrepancyAmount = Math.round((closingTotalCash - expectedCash) * 100) / 100;

      assignBillFields(shift, closingBills, 'closing');

      shift.status = 'closed';
      shift.closed_at = closedAt;
      shift.closing_note = closingNote;
      shift.cash_adjustments_amount = adjustmentsAmount;
      shift.cash_adjustments_note = adjustmentsNote;
      shift.closing_total_cash = closingTotalCash;
      shift.cash_sales_total = cashSalesTotal;
      shift.cash_sales_count = cashSalesCount;
      shift.non_cash_sales_total = nonCashSalesTotal;
      shift.discrepancy_amount = discrepancyAmount;
      shift.last_sale_at = lastSaleAt;
      shift.closing_summary = {
        opening_total_cash: openingTotal,
        cash_sales_total: cashSalesTotal,
        cash_sales_count: cashSalesCount,
        non_cash_sales_total: nonCashSalesTotal,
        adjustments_amount: adjustmentsAmount,
        expected_cash: expectedCash,
        closing_total_cash: closingTotalCash,
        discrepancy_amount: discrepancyAmount
      };

      await shift.save({ transaction });
      await Promise.all(orphanSalesToUpdate);
      await transaction.commit();

      const reloadedShift = await CashRegisterShift.findByPk(shift.id, {
        include: [{ model: User, as: 'cashier', attributes: ['id', 'name', 'email'] }]
      });

      return res.json({ shift: shiftToPayload(reloadedShift) });
    } catch (error) {
      await transaction.rollback();
      console.error('[CASH REGISTER] Close shift error:', error);
      return res.status(500).json({ error: 'internal_error', message: 'No se pudo cerrar la caja' });
    }
  }
);

router.get(
  '/current',
  authenticateToken,
  requireRole('boleteria', 'admin'),
  async (req, res) => {
    try {
      const { cash_register_shifts: CashRegisterShift, users: User, sales: Sale } = sequelize.models;
      const isAdmin = req.user.role === 'admin';
      const listAllOpen = isAdmin && req.query.all === 'true';
      const targetUserId = isAdmin && req.query.user_id ? req.query.user_id : req.user.userId;

      const include = [{ model: User, as: 'cashier', attributes: ['id', 'name', 'email'] }];

      if (listAllOpen) {
        const shifts = await CashRegisterShift.findAll({
          where: { status: 'open' },
          order: [['opened_at', 'DESC']],
          include
        });
        return res.json({ shifts: shifts.map(shiftToPayload) });
      }

      const shift = await CashRegisterShift.findOne({
        where: { user_id: targetUserId, status: 'open' },
        include
      });

      if (!shift) {
        return res.json({ shift: null });
      }

      // Payload base con totales almacenados
      let payload = shiftToPayload(shift);

      // Para turnos abiertos, recalcular dinámicamente el efectivo esperado
      // en base a las ventas en efectivo asociadas al turno (incluye reintegros como montos negativos)
      if (shift.status === 'open') {
        const now = new Date();

        const sales = await Sale.findAll({
          where: {
            [Op.or]: [
              { cash_register_shift_id: shift.id },
              {
                cash_register_shift_id: null,
                sold_by: shift.user_id,
                createdAt: {
                  [Op.between]: [shift.opened_at, now]
                }
              }
            ]
          }
        });

        let cashSalesTotal = 0;
        let nonCashSalesTotal = 0;
        let cashSalesCount = 0;

        sales.forEach((sale) => {
          const amount = toNumber(sale.total_amount);
          const method = (sale.payment_method || '').toLowerCase();

          if (CASH_METHODS.has(method)) {
            cashSalesTotal += amount;
            cashSalesCount += 1;
          } else {
            nonCashSalesTotal += amount;
          }
        });

        const openingTotal = payload.summary?.opening_total_cash ?? toNumber(shift.opening_total_cash);
        const adjustmentsAmount = payload.summary?.adjustments_amount ?? toNumber(shift.cash_adjustments_amount);
        const expectedCash = Math.round((openingTotal + cashSalesTotal + adjustmentsAmount) * 100) / 100;

        payload = {
          ...payload,
          summary: {
            ...(payload.summary || {}),
            opening_total_cash: openingTotal,
            cash_sales_total: cashSalesTotal,
            non_cash_sales_total: nonCashSalesTotal,
            cash_sales_count: cashSalesCount,
            adjustments_amount: adjustmentsAmount,
            expected_cash: expectedCash
          }
        };
      }

      return res.json({ shift: payload });
    } catch (error) {
      console.error('[CASH REGISTER] Current shift error:', error);
      return res.status(500).json({ error: 'internal_error', message: 'No se pudo obtener el estado de caja' });
    }
  }
);

router.post(
  '/refund',
  authenticateToken,
  requireRole('boleteria', 'admin'),
  async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const {
        sales: Sale,
        tickets: Ticket,
        cash_register_shifts: CashRegisterShift,
        sessions: Session,
        shows: Show,
        users: User
      } = sequelize.models;

      const { sale_id, reason, notify_email, ticket_ids } = req.body || {};

      if (!sale_id) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'sale_id_required',
          message: 'sale_id es requerido'
        });
      }

      const sale = await Sale.findByPk(sale_id, {
        include: [{ model: Ticket, as: 'tickets' }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!sale) {
        await transaction.rollback();
        return res.status(404).json({
          error: 'sale_not_found',
          message: 'Venta no encontrada'
        });
      }

      const method = (sale.payment_method || '').toLowerCase();
      if (method === 'mp') {
        await transaction.rollback();
        return res.status(400).json({
          error: 'online_refund_not_supported',
          message: 'Las devoluciones de ventas online deben gestionarse directamente en Mercado Pago'
        });
      }

      const currentMetadata = sale.metadata || {};

      const allTickets = sale.tickets || [];
      const isPartial = Array.isArray(ticket_ids) && ticket_ids.length > 0;

      if (!isPartial && currentMetadata.refunded) {
        await transaction.rollback();
        return res.status(409).json({
          error: 'already_refunded',
          message: 'Esta venta ya fue devuelta'
        });
      }

      // Determinar el conjunto de tickets a devolver
      let ticketsToRefund = allTickets;
      if (isPartial) {
        const idSet = new Set(ticket_ids.map(String));
        ticketsToRefund = allTickets.filter((t) => idSet.has(String(t.id)));

        if (ticketsToRefund.length === 0) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'no_tickets_to_refund',
            message: 'No se encontraron entradas válidas para devolver'
          });
        }

        if (ticketsToRefund.length !== idSet.size) {
          await transaction.rollback();
          return res.status(400).json({
            error: 'tickets_mismatch',
            message: 'Algunas entradas no pertenecen a esta venta'
          });
        }
      }

      const { formatSeatLocation } = await import('../lib/seatFormatter.js');
      const snapshotLocations = ticketsToRefund.map((t) =>
        formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1)
      );
      const snapshotTicketsCount = ticketsToRefund.length;
      const snapshotPeopleCount = calculateRealPeople(ticketsToRefund);

      // No permitir devolución de entradas validadas (totales o parciales)
      const hasValidated = ticketsToRefund.some(
        (t) => t.status === 'validated' || (t.capacity_validated && t.capacity_validated > 0)
      );
      if (hasValidated) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'validated_tickets',
          message: 'No se pueden devolver entradas que ya tengan ingresos registrados'
        });
      }

      const shift = await CashRegisterShift.findOne({
        where: { user_id: req.user.userId, status: 'open' },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!shift) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'shift_required',
          message: 'Necesitás tener una caja abierta para registrar una devolución'
        });
      }

      for (const ticket of ticketsToRefund) {
        ticket.status = 'available';
        ticket.sale_id = null;
        ticket.qr_code = null;
        ticket.qr_data = null;
        ticket.validated_at = null;
        ticket.validated_by = null;
        ticket.capacity_validated = 0;
        await ticket.save({ transaction });
      }

      const now = new Date().toISOString();
      const refundSnapshot = {
        locations: snapshotLocations,
        tickets_count: snapshotTicketsCount,
        people_count: snapshotPeopleCount
      };
      const updatedMetadata = {
        ...currentMetadata,
        // Solo marcar refunded=true en devoluciones totales
        ...(isPartial
          ? {}
          : {
              refunded: true,
              refunded_at: now,
              refunded_by: req.user.userId,
              refund_shift_id: shift.id,
              refund_snapshot: refundSnapshot,
              refund_reason: reason || null
            })
      };

      if (notify_email && (!sale.customer_email || String(sale.customer_email).trim() === '')) {
        sale.customer_email = notify_email.trim();
      }

      sale.metadata = updatedMetadata;

      // Calcular monto a devolver
      let refundAmount = 0;
      if (isPartial) {
        const ticketsAmount = ticketsToRefund.reduce((sum, t) => sum + toNumber(t.price), 0);
        refundAmount = -ticketsAmount;

        // Ajustar capacidad total de la venta si aplica
        const totalCapacityToRefund = ticketsToRefund.reduce(
          (sum, t) => sum + (t.capacity || 1),
          0
        );
        const newTotalCapacity = Math.max(0, (sale.total_capacity || 0) - totalCapacityToRefund);
        sale.total_capacity = newTotalCapacity;
      } else {
        refundAmount = -toNumber(sale.total_amount);
      }

      await sale.save({ transaction });

      const refundSale = await Sale.create(
        {
          session_id: sale.session_id,
          user_id: sale.user_id,
          cashier_id: shift.user_id,
          cash_register_shift_id: shift.id,
          payment_method: sale.payment_method,
          payment_status: 'approved',
          discount_id: null,
          total_amount: refundAmount,
          customer_name: sale.customer_name,
          customer_email: sale.customer_email,
          customer_phone: sale.customer_phone,
          customer_dni: sale.customer_dni,
          sold_by: shift.user_id,
          metadata: {
            type: 'refund',
            refund_of: sale.id,
            original_amount: isPartial
              ? ticketsToRefund.reduce((sum, t) => sum + toNumber(t.price), 0)
              : toNumber(sale.total_amount),
            reason: reason || null,
            refund_snapshot: refundSnapshot
          },
          container_qr_code: null,
          container_qr_data: null,
          validated_count: 0,
          total_capacity: 0
        },
        { transaction }
      );

      await transaction.commit();

      try {
        const io = req.app.get('io');
        if (io && sale.session_id && ticketsToRefund.length > 0) {
          io.soldSeats = io.soldSeats || new Map();
          io.soldPalcos = io.soldPalcos || new Map();
          io.pullmanSold = io.pullmanSold || new Map();

          const sessionId = sale.session_id;
          const seatSet = io.soldSeats.get(sessionId) || new Set();
          const palcoSet = io.soldPalcos.get(sessionId) || new Set();
          let pullmanCount = io.pullmanSold.get(sessionId) || 0;

          ticketsToRefund.forEach((t) => {
            if (t.type === 'butaca' && t.seat_code) {
              seatSet.delete(t.seat_code);
              io.to(`session:${sessionId}`).emit('seat_released', { seatId: t.seat_code, by: 'refund' });
            }
            if (t.type === 'palco' && t.seat_code) {
              palcoSet.delete(t.seat_code);
              io.to(`session:${sessionId}`).emit('palco_released', { palco: t.seat_code, by: 'refund' });
            }
            if (t.type === 'pullman') {
              pullmanCount = Math.max(0, pullmanCount - 1);
            }
          });

          io.soldSeats.set(sessionId, seatSet);
          io.soldPalcos.set(sessionId, palcoSet);
          io.pullmanSold.set(sessionId, pullmanCount);

          const pullmanState = io.pullmanState?.get(sessionId) || { capacity: 92, heldBySocket: new Map() };
          const totalHeld = Array.from(pullmanState.heldBySocket?.values?.() || []).reduce((a, b) => a + b, 0);
          const available = Math.max(0, (pullmanState.capacity || 92) - totalHeld - pullmanCount);
          io.to(`session:${sessionId}`).emit('pullman_updated', {
            available,
            capacity: pullmanState.capacity || 92
          });
        }
      } catch (ioError) {
        console.error('[CASH REGISTER] Refund socket update error:', ioError);
      }

      // Send refund email notification (best-effort, after commit)
      try {
        const { sendRefundNotification } = await import('../lib/emailService.js');

        let targetEmail = (notify_email && notify_email.trim()) || null;
        let customerName = sale.customer_name || null;

        if (!targetEmail && sale.user_id) {
          const saleUser = await User.findByPk(sale.user_id, {
            attributes: ['email', 'name']
          });
          if (saleUser?.email) {
            targetEmail = saleUser.email;
            if (!customerName) customerName = saleUser.name;
          }
        }

        if (!targetEmail && sale.customer_email) {
          targetEmail = sale.customer_email;
        }

        if (targetEmail) {
          const session = await Session.findByPk(sale.session_id, {
            include: [{ model: Show, as: 'show' }]
          });

          const sessionDateObj = session?.starts_at ? new Date(session.starts_at) : null;
          const sessionDate = sessionDateObj
            ? sessionDateObj.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })
            : null;
          const sessionTime = sessionDateObj
            ? sessionDateObj.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              })
            : null;

          await sendRefundNotification({
            customerEmail: targetEmail,
            customerName: customerName || 'Espectador',
            showTitle: session?.show?.title || 'Espectáculo',
            sessionDate,
            sessionTime,
            locations: refundSnapshot.locations || [],
            refundAmount: refundAmount,
            originalAmount: isPartial
              ? ticketsToRefund.reduce((sum, t) => sum + toNumber(t.price), 0)
              : toNumber(sale.total_amount),
            saleId: sale.id,
            reason: reason || null,
            channel: (sale.payment_method || '').toLowerCase() === 'mp' ? 'Online' : 'Boletería'
          });
        }
      } catch (emailError) {
        console.error('[CASH REGISTER] Refund email send error:', emailError);
      }

      return res.status(201).json({
        ok: true,
        refund: {
          id: refundSale.id,
          refund_of: sale.id,
          total_amount: refundSale.total_amount
        }
      });
    } catch (error) {
      await transaction.rollback();
      console.error('[CASH REGISTER] Refund error:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'No se pudo registrar la devolución'
      });
    }
  }
);

router.get(
  '/current/operations',
  authenticateToken,
  requireRole('boleteria', 'admin'),
  async (req, res) => {
    try {
      const {
        cash_register_shifts: CashRegisterShift,
        sales: Sale,
        sessions: Session,
        shows: Show,
        tickets: Ticket,
        discounts: Discount,
        users: User
      } = sequelize.models;

      const isAdmin = req.user.role === 'admin';
      const targetUserId = isAdmin && req.query.user_id ? req.query.user_id : req.user.userId;

      const shift = await CashRegisterShift.findOne({
        where: { user_id: targetUserId, status: 'open' }
      });

      if (!shift) {
        return res.json({ operations: [] });
      }

      const now = new Date();

      const sales = await Sale.findAll({
        where: {
          [Op.or]: [
            { cash_register_shift_id: shift.id },
            {
              cash_register_shift_id: null,
              sold_by: shift.user_id,
              createdAt: {
                [Op.between]: [shift.opened_at, now]
              }
            }
          ]
        },
        include: [
          {
            model: Session,
            as: 'session',
            include: [
              {
                model: Show,
                as: 'show',
                attributes: ['id', 'title']
              }
            ]
          },
          {
            model: Ticket,
            as: 'tickets',
            required: false
          },
          {
            model: Discount,
            as: 'discount',
            required: false
          },
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email', 'phone', 'dni'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      const { formatSeatLocation } = await import('../lib/seatFormatter.js');

      const operations = sales.map((sale) => {
        const saleTickets = sale.tickets || [];
        const rawMetadata = sale.metadata || {};
        const refundSnapshot = rawMetadata.refund_snapshot || null;

        let effectiveLocations = [];
        let effectiveTicketsCount = 0;
        let effectivePeopleCount = 0;

        if (saleTickets.length > 0) {
          effectiveLocations = saleTickets.map((ticket) =>
            formatSeatLocation(
              ticket.type,
              ticket.section,
              ticket.seat_code,
              ticket.capacity || 1
            )
          );
          effectiveTicketsCount = saleTickets.length;
          effectivePeopleCount = calculateRealPeople(saleTickets);
        } else if (refundSnapshot && Array.isArray(refundSnapshot.locations) && refundSnapshot.locations.length > 0) {
          effectiveLocations = refundSnapshot.locations;
          effectiveTicketsCount = refundSnapshot.tickets_count || refundSnapshot.locations.length;
          effectivePeopleCount = refundSnapshot.people_count || effectiveTicketsCount;
        }

        const isRefundOperation = rawMetadata.type === 'refund';
        const refunded = !!rawMetadata.refunded;
        const refundReason = rawMetadata.refund_reason || rawMetadata.reason || null;
        const refundedAt = rawMetadata.refunded_at || null;

        const customerName =
          sale.customer_name || sale.user?.name || 'N/A';
        const customerEmail =
          sale.customer_email || sale.user?.email || null;
        const customerPhone =
          (sale.customer_phone !== undefined
            ? sale.customer_phone
            : null) || sale.user?.phone || null;
        const customerDni =
          (sale.customer_dni !== undefined ? sale.customer_dni : null) ||
          sale.user?.dni || null;

        const discountCode = sale.discount?.code || null;
        const discountValue = sale.discount
          ? sale.discount.type === 'percentage'
            ? `${sale.discount.value}%`
            : `$${sale.discount.value}`
          : null;

        const peopleCount = effectivePeopleCount;

        return {
          id: sale.id,
          sale_date: sale.createdAt,
          session_date: sale.session?.starts_at || null,
          show_title: sale.session?.show?.title || null,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          customer_dni: customerDni,
          locations: effectiveLocations.join(', '),
          tickets_count: effectiveTicketsCount,
          people_count: peopleCount,
          payment_method: sale.payment_method || 'N/A',
          discount_code: discountCode,
          discount_value: discountValue,
          total_amount: toNumber(sale.total_amount),
          channel: (sale.payment_method || '').toLowerCase() === 'mp'
            ? 'online'
            : 'boleteria',
          refunded,
          is_refund_operation: isRefundOperation,
          refund_reason: refundReason,
          refunded_at: refundedAt
        };
      });

      return res.json({ operations });
    } catch (error) {
      console.error('[CASH REGISTER] Current shift operations error:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'No se pudieron obtener las operaciones de la caja actual'
      });
    }
  }
);

router.get(
  '/history',
  authenticateToken,
  requireRole('boleteria', 'admin'),
  async (req, res) => {
    try {
      const { cash_register_shifts: CashRegisterShift, users: User } = sequelize.models;
      const isAdmin = req.user.role === 'admin';
      const scopeAll = isAdmin && req.query.scope === 'all';
      const targetUserId = isAdmin && req.query.user_id ? req.query.user_id : req.user.userId;
      const status = req.query.status;
      const limit = Math.min(Number(req.query.limit) || 25, 200);

      const where = {};

      if (scopeAll) {
        if (targetUserId) {
          where.user_id = targetUserId;
        }
      } else {
        where.user_id = targetUserId;
      }

      if (status) {
        where.status = status;
      }

      const shifts = await CashRegisterShift.findAll({
        where,
        order: [['opened_at', 'DESC']],
        limit,
        include: [{ model: User, as: 'cashier', attributes: ['id', 'name', 'email'] }]
      });

      return res.json({ shifts: shifts.map(shiftToPayload) });
    } catch (error) {
      console.error('[CASH REGISTER] History error:', error);
      return res.status(500).json({ error: 'internal_error', message: 'No se pudo obtener el historial de cajas' });
    }
  }
);

export default router;
