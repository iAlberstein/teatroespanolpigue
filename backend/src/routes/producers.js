import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { createActivityLog, ActionTypes, EntityTypes } from '../middleware/activityLogger.js';

const router = Router();

/**
 * GET /api/producers
 * List all producers (users with role='productor')
 * Requires: admin or boleteria role
 */
router.get('/', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { users: User } = sequelize.models;
    
    // Obtener usuarios con rol productor que estén activos
    const producers = await User.findAll({
      where: { 
        role: 'productor',
        active: true
      },
      attributes: ['id', 'name', 'email', 'phone', 'active'],
      order: [['name', 'ASC']]
    });
    
    console.log('[PRODUCERS] Fetched producers:', producers.length);
    return res.json({ producers });
  } catch (error) {
    console.error('[PRODUCERS] Error fetching producers:', error);
    return res.status(500).json({ error: 'Error al obtener productores' });
  }
});

/**
 * GET /api/producers/:id
 * Get single producer
 * Requires: admin role
 */
router.get('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { producer: Producer, users: User, shows: Show } = sequelize.models;
    
    const producer = await Producer.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: Show,
          as: 'shows',
          attributes: ['id', 'title'],
          through: { attributes: [] }
        }
      ]
    });
    
    if (!producer) {
      return res.status(404).json({ error: 'Productor no encontrado' });
    }
    
    return res.json({ producer });
  } catch (error) {
    console.error('[GET_PRODUCER] Error:', error);
    return res.status(500).json({ error: 'Error al obtener productor' });
  }
});

/**
 * POST /api/producers
 * Create new producer
 * Body: { name, email, phone, user_id? }
 * Requires: admin role
 */
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, phone, user_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    
    const { producer: Producer } = sequelize.models;
    
    // Check if email already exists
    if (email) {
      const existing = await Producer.findOne({ where: { email } });
      if (existing) {
        return res.status(400).json({ error: 'Ya existe un productor con ese email' });
      }
    }
    
    const producer = await Producer.create({
      name,
      email: email || null,
      phone: phone || null,
      user_id: user_id || null,
      active: true
    });
    
    // Log activity
    await createActivityLog({
      userId: req.user.id,
      actionType: 'producer_create',
      entityType: 'producer',
      entityId: producer.id,
      details: JSON.stringify({ name, email }),
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent']
    });
    
    return res.status(201).json({ producer });
  } catch (error) {
    console.error('[CREATE_PRODUCER] Error:', error);
    return res.status(500).json({ error: 'Error al crear productor' });
  }
});

/**
 * PATCH /api/producers/:id
 * Update producer
 * Body: { name?, email?, phone?, active? }
 * Requires: admin role
 */
router.patch('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, active } = req.body;
    
    const { producer: Producer } = sequelize.models;
    
    const producer = await Producer.findByPk(id);
    if (!producer) {
      return res.status(404).json({ error: 'Productor no encontrado' });
    }
    
    // Check if email already exists (excluding current producer)
    if (email && email !== producer.email) {
      const existing = await Producer.findOne({ 
        where: { 
          email,
          id: { [sequelize.Sequelize.Op.ne]: id }
        } 
      });
      if (existing) {
        return res.status(400).json({ error: 'Ya existe un productor con ese email' });
      }
    }
    
    // Update fields
    if (name !== undefined) producer.name = name;
    if (email !== undefined) producer.email = email || null;
    if (phone !== undefined) producer.phone = phone || null;
    if (active !== undefined) producer.active = active;
    
    await producer.save();
    
    // Log activity
    await createActivityLog({
      userId: req.user.id,
      actionType: 'producer_update',
      entityType: 'producer',
      entityId: producer.id,
      details: JSON.stringify({ name, email, active }),
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent']
    });
    
    return res.json({ producer });
  } catch (error) {
    console.error('[UPDATE_PRODUCER] Error:', error);
    return res.status(500).json({ error: 'Error al actualizar productor' });
  }
});

/**
 * DELETE /api/producers/:id
 * Deactivate producer
 * Requires: admin role
 */
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { producer: Producer } = sequelize.models;
    
    const producer = await Producer.findByPk(id);
    if (!producer) {
      return res.status(404).json({ error: 'Productor no encontrado' });
    }
    
    producer.active = false;
    await producer.save();
    
    // Log activity
    await createActivityLog({
      userId: req.user.id,
      actionType: 'producer_delete',
      entityType: 'producer',
      entityId: producer.id,
      details: JSON.stringify({ name: producer.name }),
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent']
    });
    
    return res.json({ message: 'Productor desactivado correctamente' });
  } catch (error) {
    console.error('[DELETE_PRODUCER] Error:', error);
    return res.status(500).json({ error: 'Error al desactivar productor' });
  }
});

export default router;
