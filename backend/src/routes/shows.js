import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';

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

// Update pricing_json for a show
// Body: { pricing_json: object }
router.put('/:id/pricing', async (req, res) => {
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
