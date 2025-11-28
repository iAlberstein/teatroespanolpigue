import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

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

      const { code, show_id, type, value, usage_limit, active } = req.body;

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

      const discount = await Discount.create({
        code: code.trim().toUpperCase(),
        show_id: show_id || null,
        type,
        value: value || null,
        usage_limit: usage_limit || null,
        used_count: 0,
        active: active !== undefined ? active : true
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
      const { code, show_id, type, value, usage_limit, active } = req.body;

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
      if (active !== undefined) discount.active = active;

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

// PUBLIC: Validate discount code
router.post('/validate', async (req, res) => {
  try {
    const { discounts: Discount } = sequelize.models;
    const { code, show_id } = req.body;

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

      // Return discount info without exposing sensitive data
      res.json({
        valid: true,
        id: discount.id,
        type: discount.type,
        value: discount.value,
        show_id: discount.show_id
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
