import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';

const router = Router();

// Create user
router.post('/', async (req, res) => {
  const { id, name, email, password } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  const { users: User } = sequelize.models;
  try {
    // if email exists, return existing user
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(200).json(existing);
    const password_hash = password && String(password).length > 0 ? String(password) : 'nopass';
    const user = await User.create({ id: id || undefined, name, email, password_hash, role: 'espectador' });
    return res.status(201).json(user);
  } catch (e) {
    return res.status(500).json({ error: 'create_failed' });
  }
});

// Get user by id
router.get('/:id', async (req, res) => {
  const { users: User } = sequelize.models;
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  return res.json(user);
});

router.get('/', async (req, res) => {
  const User = sequelize.models.users;
  const users = await User.findAll({ limit: 50 });
  res.json(users);
});

router.get('/:id/tickets', async (req, res) => {
  const { tickets: Ticket, sessions: Session, shows: Show } = sequelize.models;
  const tickets = await Ticket.findAll({
    where: { user_id: req.params.id },
    include: [{ model: Session, include: [Show] }],
    order: [['createdAt', 'DESC']]
  });
  res.json(tickets);
});

router.get('/:id/sales', async (req, res) => {
  const { sales: Sale, sessions: Session, shows: Show } = sequelize.models;
  const sales = await Sale.findAll({
    where: { user_id: req.params.id },
    include: [{ model: Session, include: [Show] }],
    order: [['createdAt', 'DESC']]
  });
  res.json(sales);
});

export default router;
