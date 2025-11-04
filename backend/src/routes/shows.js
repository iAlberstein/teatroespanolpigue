import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const Show = sequelize.models.shows;
  const shows = await Show.findAll({ order: [['date','ASC'], ['time','ASC']] });
  res.json(shows);
});

// Get sessions for a specific show
router.get('/:id/sessions', async (req, res) => {
  try {
    const { sessions: Session } = sequelize.models;
    const { Op } = await import('sequelize');
    
    // Only return future or current sessions
    const now = new Date();
    const sessions = await Session.findAll({
      where: { 
        show_id: req.params.id,
        starts_at: {
          [Op.gte]: now
        }
      },
      order: [['starts_at', 'ASC']]
    });
    res.json(sessions);
  } catch (error) {
    console.error('[SHOWS] Error getting sessions:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Create a new show (admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const { title, description, duration_minutes, pricing_json, image_url, starts_at, ends_at } = req.body;
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title_required', message: 'El título es obligatorio' });
    }
    
    const show = await Show.create({
      title: title.trim(),
      description: description?.trim() || null,
      duration_minutes: duration_minutes || 120,
      pricing_json: pricing_json || {
        platea_general: 5000,
        palcos_bajos: 10000,
        palcos_altos: 8000,
        pullman: 3000
      },
      image_url: image_url?.trim() || null
    });
    
    res.status(201).json(show);
  } catch (error) {
    console.error('[SHOWS] Error creating show:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al crear espectáculo' });
  }
});

// Update a show (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const show = await Show.findByPk(req.params.id);
    
    if (!show) {
      return res.status(404).json({ error: 'not_found', message: 'Espectáculo no encontrado' });
    }
    
    const { title, description, duration_minutes, pricing_json, image_url, starts_at, ends_at } = req.body;
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title_required', message: 'El título es obligatorio' });
    }
    
    await show.update({
      title: title.trim(),
      description: description?.trim() || null,
      duration_minutes: duration_minutes || show.duration_minutes,
      pricing_json: pricing_json || show.pricing_json,
      image_url: image_url?.trim() || null
    });
    
    res.json(show);
  } catch (error) {
    console.error('[SHOWS] Error updating show:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al actualizar espectáculo' });
  }
});

// Delete a show (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const Session = sequelize.models.sessions;
    
    const show = await Show.findByPk(req.params.id);
    
    if (!show) {
      return res.status(404).json({ error: 'not_found', message: 'Espectáculo no encontrado' });
    }
    
    // Check if show has sessions
    const sessionCount = await Session.count({ where: { show_id: req.params.id } });
    if (sessionCount > 0) {
      return res.status(400).json({ 
        error: 'has_sessions', 
        message: 'No se puede eliminar un espectáculo con sesiones. Elimine las sesiones primero.' 
      });
    }
    
    await show.destroy();
    res.json({ success: true, message: 'Espectáculo eliminado exitosamente' });
  } catch (error) {
    console.error('[SHOWS] Error deleting show:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al eliminar espectáculo' });
  }
});

// Update pricing_json for a show (admin only)
// Body: { pricing_json: object }
router.put('/:id/pricing', authenticateToken, requireRole('admin'), async (req, res) => {
  const Show = sequelize.models.shows;
  const show = await Show.findByPk(req.params.id);
  if (!show) return res.status(404).json({ error: 'Not found' });
  const { pricing_json } = req.body || {};
  if (!pricing_json || typeof pricing_json !== 'object') {
    return res.status(400).json({ error: 'pricing_json object required' });
  }
  await show.update({ pricing_json });
  res.json(show);
});

export default router;
