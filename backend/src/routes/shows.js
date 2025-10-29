import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';

const router = Router();

router.get('/', async (req, res) => {
  const Show = sequelize.models.shows;
  const shows = await Show.findAll({ order: [['date','ASC'], ['time','ASC']] });
  res.json(shows);
});

export default router;
