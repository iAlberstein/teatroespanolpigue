import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Filas válidas de platea baja (A-M)
const PLATEA_BAJA_ROWS = 'ABCDEFGHIJKLM';

function isValidRow(row) {
  return typeof row === 'string' && row.length === 1 && PLATEA_BAJA_ROWS.includes(row.toUpperCase());
}

// Normaliza y valida el par row_start/row_end.
// Devuelve { rowStart, rowEnd } o lanza error con mensaje.
function normalizeRowRange(rowStart, rowEnd) {
  let rs = rowStart ? String(rowStart).trim().toUpperCase() : null;
  let re = rowEnd ? String(rowEnd).trim().toUpperCase() : null;
  if (rs !== null && rs !== '') {
    if (!isValidRow(rs)) throw new Error('La fila inicial debe ser una letra entre A y M');
  } else {
    rs = null;
  }
  if (re !== null && re !== '') {
    if (!isValidRow(re)) throw new Error('La fila final debe ser una letra entre A y M');
  } else {
    re = null;
  }
  if (rs && re && rs > re) {
    throw new Error('La fila inicial no puede ser mayor que la fila final');
  }
  return { rowStart: rs, rowEnd: re };
}

// Valida que todos los items sean butacas de platea baja dentro del rango.
// Devuelve null si ok, o un mensaje de error si no cumple.
function validateItemsForPlateaBaja(items, rowStart, rowEnd) {
  const rs = rowStart || 'A';
  const re = rowEnd || 'M';
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item) continue;
    const type = item.type;
    // Solo se permiten butacas (platea baja). Palcos, pullman y general quedan excluidos.
    if (type !== 'butaca') {
      return `El código aplicado solo es válido de la fila ${rs} a la fila ${re} de la platea baja`;
    }
    const seatCode = item.seat_code;
    if (!seatCode) {
      return `El código aplicado solo es válido de la fila ${rs} a la fila ${re} de la platea baja`;
    }
    const match = String(seatCode).match(/^([A-Z])(\d+)$/);
    if (!match) {
      return `El código aplicado solo es válido de la fila ${rs} a la fila ${re} de la platea baja`;
    }
    const rowLetter = match[1];
    if (rowLetter < rs || rowLetter > re) {
      return `El código aplicado solo es válido de la fila ${rs} a la fila ${re} de la platea baja`;
    }
  }
  return null;
}

// ADMIN: Get all discounts
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { discounts: Discount, shows: Show } = sequelize.models;
    const { role } = req.user;
    
    // Only admin can view all discounts
    if (role !== 'admin') {
      return res.status(403).json({ message: 'No autorizado' });
    }

    const discounts = await Discount.findAll({
        include: [{
          model: Show,
          as: 'show',
          attributes: ['id', 'title'],
          required: false
        }],
        order: [['createdAt', 'DESC']]
      });

      res.json(discounts);
    } catch (error) {
      console.error('Error fetching discounts:', error);
      res.status(500).json({ message: 'Error al cargar descuentos' });
    }
  });

// ADMIN: Create discount
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { discounts: Discount, shows: Show } = sequelize.models;
    const { role } = req.user;
      
      if (role !== 'admin') {
        return res.status(403).json({ message: 'No autorizado' });
      }

      const { code, alias, show_id, type, value, usage_limit, active, min_seats, max_seats, require_even, platea_baja_only, row_start, row_end } = req.body;

      // Validate required fields
      if (!code || !type) {
        return res.status(400).json({ message: 'Código y tipo son obligatorios' });
      }

      // Validate type
      if (!['percentage', 'fixed', 'internal'].includes(type)) {
        return res.status(400).json({ message: 'Tipo inválido. Debe ser: percentage, fixed, o internal' });
      }

      // Validate value for percentage and fixed types
      if ((type === 'percentage' || type === 'fixed') && !value) {
        return res.status(400).json({ message: 'El valor es obligatorio para descuentos de tipo percentage o fixed' });
      }

      // Validate percentage range
      if (type === 'percentage' && (value <= 0 || value > 100)) {
        return res.status(400).json({ message: 'El porcentaje debe estar entre 1 y 100' });
      }

      // Check if code already exists
      const existingDiscount = await Discount.findOne({ where: { code } });
      if (existingDiscount) {
        return res.status(400).json({ message: 'Ya existe un descuento con ese código' });
      }

      // Verify show exists if show_id provided
      if (show_id) {
        const show = await Show.findByPk(show_id);
        if (!show) {
          return res.status(404).json({ message: 'Show no encontrado' });
        }
      }

      let minSeatsValue = null;
      if (min_seats !== undefined && min_seats !== null && min_seats !== '') {
        const parsedMin = parseInt(min_seats, 10);
        if (Number.isNaN(parsedMin) || parsedMin < 1) {
          return res.status(400).json({ message: 'El mínimo de localidades debe ser un entero mayor o igual a 1' });
        }
        minSeatsValue = parsedMin;
      }

      let maxSeatsValue = null;
      if (max_seats !== undefined && max_seats !== null && max_seats !== '') {
        const parsedMax = parseInt(max_seats, 10);
        if (Number.isNaN(parsedMax) || parsedMax < 1) {
          return res.status(400).json({ message: 'El máximo de localidades debe ser un entero mayor o igual a 1' });
        }
        maxSeatsValue = parsedMax;
      }

      if (minSeatsValue && maxSeatsValue && maxSeatsValue < minSeatsValue) {
        return res.status(400).json({ message: 'El máximo de localidades no puede ser menor al mínimo' });
      }

      // Restricción de platea baja con rango de filas
      let rowStartValue = null;
      let rowEndValue = null;
      if (platea_baja_only) {
        try {
          const range = normalizeRowRange(row_start, row_end);
          rowStartValue = range.rowStart;
          rowEndValue = range.rowEnd;
        } catch (rangeErr) {
          return res.status(400).json({ message: rangeErr.message });
        }
      }

      const discount = await Discount.create({
        code: code.trim().toUpperCase(),
        alias: alias ? alias.trim() : null,
        show_id: show_id || null,
        type,
        value: value || null,
        min_seats: minSeatsValue,
        max_seats: maxSeatsValue,
        require_even: !!require_even,
        usage_limit: usage_limit || null,
        used_count: 0,
        active: active !== undefined ? active : true,
        platea_baja_only: !!platea_baja_only,
        row_start: rowStartValue,
        row_end: rowEndValue
      });

      // Load with show relation
      const discountWithShow = await Discount.findByPk(discount.id, {
        include: [{
          model: Show,
          as: 'show',
          attributes: ['id', 'title'],
          required: false
        }]
      });

      res.status(201).json(discountWithShow);
    } catch (error) {
      console.error('Error creating discount:', error);
      res.status(500).json({ message: 'Error al crear descuento' });
    }
  });

// ADMIN: Update discount
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { discounts: Discount, shows: Show } = sequelize.models;
    const { role } = req.user;
      
      if (role !== 'admin') {
        return res.status(403).json({ message: 'No autorizado' });
      }

      const { id } = req.params;
      const { code, alias, show_id, type, value, usage_limit, active, min_seats, max_seats, require_even, platea_baja_only, row_start, row_end } = req.body;

      const discount = await Discount.findByPk(id);
      if (!discount) {
        return res.status(404).json({ message: 'Descuento no encontrado' });
      }

      // Validate type if provided
      if (type && !['percentage', 'fixed', 'internal'].includes(type)) {
        return res.status(400).json({ message: 'Tipo inválido' });
      }

      // Validate percentage range if applicable
      if (type === 'percentage' && value && (value <= 0 || value > 100)) {
        return res.status(400).json({ message: 'El porcentaje debe estar entre 1 y 100' });
      }

      // Check if new code already exists (excluding current discount)
      if (code && code !== discount.code) {
        const existingDiscount = await Discount.findOne({ where: { code } });
        if (existingDiscount) {
          return res.status(400).json({ message: 'Ya existe un descuento con ese código' });
        }
      }

      // Verify show exists if show_id provided
      if (show_id) {
        const show = await Show.findByPk(show_id);
        if (!show) {
          return res.status(404).json({ message: 'Show no encontrado' });
        }
      }

      // Update fields
      if (code !== undefined) discount.code = code.trim().toUpperCase();
      if (show_id !== undefined) discount.show_id = show_id || null;
      if (type !== undefined) discount.type = type;
      if (value !== undefined) discount.value = value;
      if (usage_limit !== undefined) discount.usage_limit = usage_limit;
      if (min_seats !== undefined) {
        if (min_seats === null || min_seats === '') {
          discount.min_seats = null;
        } else {
          const parsedMin = parseInt(min_seats, 10);
          if (Number.isNaN(parsedMin) || parsedMin < 1) {
            return res.status(400).json({ message: 'El mínimo de localidades debe ser un entero mayor o igual a 1' });
          }
          discount.min_seats = parsedMin;
        }
      }
      if (max_seats !== undefined) {
        if (max_seats === null || max_seats === '') {
          discount.max_seats = null;
        } else {
          const parsedMax = parseInt(max_seats, 10);
          if (Number.isNaN(parsedMax) || parsedMax < 1) {
            return res.status(400).json({ message: 'El máximo de localidades debe ser un entero mayor o igual a 1' });
          }
          discount.max_seats = parsedMax;
        }
      }
      if (require_even !== undefined) discount.require_even = !!require_even;
      if (alias !== undefined) discount.alias = alias ? alias.trim() : null;
      if (active !== undefined) discount.active = active;
      if (platea_baja_only !== undefined) {
        discount.platea_baja_only = !!platea_baja_only;
        if (platea_baja_only) {
          try {
            const range = normalizeRowRange(row_start, row_end);
            discount.row_start = range.rowStart;
            discount.row_end = range.rowEnd;
          } catch (rangeErr) {
            return res.status(400).json({ message: rangeErr.message });
          }
        } else {
          discount.row_start = null;
          discount.row_end = null;
        }
      } else if (row_start !== undefined || row_end !== undefined) {
        // Permitir actualizar solo el rango si la restricción ya está activa
        if (discount.platea_baja_only) {
          try {
            const range = normalizeRowRange(
              row_start !== undefined ? row_start : discount.row_start,
              row_end !== undefined ? row_end : discount.row_end
            );
            discount.row_start = range.rowStart;
            discount.row_end = range.rowEnd;
          } catch (rangeErr) {
            return res.status(400).json({ message: rangeErr.message });
          }
        }
      }

      // Cross-validate min/max
      const finalMin = discount.min_seats;
      const finalMax = discount.max_seats;
      if (finalMin && finalMax && finalMax < finalMin) {
        return res.status(400).json({ message: 'El máximo de localidades no puede ser menor al mínimo' });
      }

      await discount.save();

      // Load with show relation
      const discountWithShow = await Discount.findByPk(discount.id, {
        include: [{
          model: Show,
          as: 'show',
          attributes: ['id', 'title'],
          required: false
        }]
      });

      res.json(discountWithShow);
    } catch (error) {
      console.error('Error updating discount:', error);
      res.status(500).json({ message: 'Error al actualizar descuento' });
    }
  });

// ADMIN: Delete discount
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { discounts: Discount, sales: Sale } = sequelize.models;
    const { role } = req.user;
      
      if (role !== 'admin') {
        return res.status(403).json({ message: 'No autorizado' });
      }

      const { id } = req.params;

      const discount = await Discount.findByPk(id);
      if (!discount) {
        return res.status(404).json({ message: 'Descuento no encontrado' });
      }

      // Check if discount has been used
      const usageCount = await Sale.count({ where: { discount_id: id } });
      if (usageCount > 0) {
        return res.status(400).json({ 
          message: 'No se puede eliminar un descuento que ya ha sido utilizado. Considere desactivarlo en su lugar.',
          usage_count: usageCount
        });
      }

      await discount.destroy();

      res.json({ message: 'Descuento eliminado exitosamente' });
    } catch (error) {
      console.error('Error deleting discount:', error);
      res.status(500).json({ message: 'Error al eliminar descuento' });
    }
  });

// ADMIN/BOLETERIA: Get upcoming sessions with CUPO-DISCAPACIDAD usage count
router.get('/disability-quota', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { discounts: Discount, sales: Sale, sessions: Session, shows: Show } = sequelize.models;
    const { Op } = await import('sequelize');

    const discount = await Discount.findOne({
      where: { code: 'CUPO-DISCAPACIDAD' }
    });

    const now = new Date();

    const upcomingSessions = await Session.findAll({
      where: { starts_at: { [Op.gt]: now } },
      include: [{ model: Show, as: 'show', attributes: ['id', 'title'] }],
      order: [['starts_at', 'ASC']]
    });

    const results = await Promise.all(upcomingSessions.map(async (session) => {
      let ticketCount = 0;
      if (discount) {
        const salesWithDiscount = await Sale.findAll({
          where: { session_id: session.id, discount_id: discount.id },
          attributes: ['id', 'total_capacity']
        });
        ticketCount = salesWithDiscount.reduce((sum, s) => sum + (Number(s.total_capacity) || 0), 0);
      }
      return {
        session_id: session.id,
        starts_at: session.starts_at,
        show_title: session.show?.title || 'Show',
        ticket_count: ticketCount
      };
    }));

    res.json({ results, discount_exists: !!discount });
  } catch (error) {
    console.error('Error fetching disability quota:', error);
    res.status(500).json({ message: 'Error al cargar cupo discapacidad' });
  }
});

// PUBLIC: Validate discount code
router.post('/validate', async (req, res) => {
  try {
    const { discounts: Discount } = sequelize.models;
    const { code, show_id, seat_count, items } = req.body;

      if (!code) {
        return res.status(400).json({ message: 'Código es obligatorio' });
      }

      const discount = await Discount.findOne({
        where: { code: code.trim().toUpperCase() }
      });

      if (!discount) {
        return res.status(404).json({ message: 'Código de descuento inválido' });
      }

      // Check if discount is active
      if (!discount.active) {
        return res.status(400).json({ message: 'Este código de descuento ya no está activo' });
      }

      // Check usage limit
      if (discount.usage_limit && discount.used_count >= discount.usage_limit) {
        return res.status(400).json({ message: 'Este código de descuento ha alcanzado su límite de uso' });
      }

      // Check if discount is for a specific show
      if (discount.show_id && show_id && discount.show_id !== show_id) {
        return res.status(400).json({ message: 'Este código de descuento no es válido para este show' });
      }

      if (discount.min_seats) {
        const seatCountNumber = Number(seat_count || 0);
        if (!seatCountNumber || seatCountNumber < discount.min_seats) {
          return res.status(400).json({ 
            error: 'min_seats_required', 
            message: `Debes seleccionar ${discount.min_seats} localidades como mínimo`
          });
        }
      }

      if (discount.max_seats) {
        const seatCountNumber = Number(seat_count || 0);
        if (seatCountNumber > discount.max_seats) {
          return res.status(400).json({ 
            error: 'max_seats_exceeded', 
            message: `No podés seleccionar más de ${discount.max_seats} localidades con este cupón`
          });
        }
      }

      if (discount.require_even) {
        const seatCountNumber = Number(seat_count || 0);
        if (seatCountNumber % 2 !== 0) {
          return res.status(400).json({ 
            error: 'even_seats_required', 
            message: 'Este cupón requiere seleccionar un número par de localidades'
          });
        }
      }

      // Restricción de platea baja con rango de filas
      if (discount.platea_baja_only) {
        const rowErrorMsg = validateItemsForPlateaBaja(items, discount.row_start, discount.row_end);
        if (rowErrorMsg) {
          return res.status(400).json({
            error: 'platea_baja_only',
            message: rowErrorMsg
          });
        }
      }

      let multiplierHint = 1;
      if (discount.type === 'fixed' && discount.min_seats) {
        const seatCountNumber = Number(seat_count || 0);
        multiplierHint = Math.max(1, Math.floor(seatCountNumber / discount.min_seats));
      }

      // Return discount info without exposing sensitive data
      const remainingUses = discount.usage_limit ? Math.max(0, discount.usage_limit - (discount.used_count || 0)) : null;
      res.json({
        valid: true,
        id: discount.id,
        type: discount.type,
        value: discount.value,
        alias: discount.alias || null,
        show_id: discount.show_id,
        min_seats: discount.min_seats,
        max_seats: discount.max_seats,
        require_even: discount.require_even,
        platea_baja_only: !!discount.platea_baja_only,
        row_start: discount.row_start || 'A',
        row_end: discount.row_end || 'M',
        usage_limit: discount.usage_limit || null,
        remaining_uses: remainingUses,
        multiplier_hint: multiplierHint
      });
    } catch (error) {
      console.error('Error validating discount:', error);
      res.status(500).json({ message: 'Error al validar descuento' });
    }
  });

// ADMIN: Get discount usage stats
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { discounts: Discount, sales: Sale } = sequelize.models;
    const { role } = req.user;
      
      if (role !== 'admin') {
        return res.status(403).json({ message: 'No autorizado' });
      }

      const { id } = req.params;

      const discount = await Discount.findByPk(id);
      if (!discount) {
        return res.status(404).json({ message: 'Descuento no encontrado' });
      }

      // Get sales using this discount
      const sales = await Sale.findAll({
        where: { discount_id: id },
        attributes: ['id', 'total_amount', 'createdAt'],
        order: [['createdAt', 'DESC']]
      });

      const totalSales = sales.length;
      const totalRevenue = sales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0);

      res.json({
        discount,
        stats: {
          total_uses: totalSales,
          total_revenue: totalRevenue.toFixed(2),
          remaining_uses: discount.usage_limit ? Math.max(0, discount.usage_limit - discount.used_count) : null
        },
        recent_sales: sales.slice(0, 10)
      });
    } catch (error) {
      console.error('Error fetching discount stats:', error);
      res.status(500).json({ message: 'Error al cargar estadísticas' });
    }
  });

export default router;
