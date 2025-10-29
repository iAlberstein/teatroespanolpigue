import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';

const router = Router();

router.get('/', async (req, res) => {
  const User = sequelize.models.users;
  const users = await User.findAll({ limit: 50 });
  res.json(users);
});

export default router;
