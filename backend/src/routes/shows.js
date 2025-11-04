import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';

const router = Router();

router.get('/', async (req, res) => {
  const Show = sequelize.models.shows;
  const shows = await Show.findAll({ order: [['date','ASC'], ['time','ASC']] });
  res.json(shows);
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
