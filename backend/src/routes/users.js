import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { Op } from 'sequelize';

const router = Router();

/**
 * GET /api/users/search-quick
 * Quick search for customers by name, email, or DNI
 * For box office use
 * Query params: q (search query)
 */
router.get('/search-quick', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }
    
    const { users: User } = sequelize.models;
    
    // Search by name, email, or DNI
    const users = await User.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { email: { [Op.like]: `%${q}%` } },
          { dni: { [Op.like]: `%${q}%` } },
          { phone: { [Op.like]: `%${q}%` } }
        ]
      },
      attributes: ['id', 'name', 'email', 'phone', 'dni'],
      limit: 10,
      order: [['name', 'ASC']]
    });
    
    return res.json({ users });
  } catch (error) {
    console.error('[USERS] Error searching users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// List all users with filters and pagination (admin and limited boleteria access)
router.get('/', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search, role, active } = req.query;
    const User = sequelize.models.users;
    
    const where = {};

    const isBoleteria = req.user?.role === 'boleteria';
    if (isBoleteria) {
      where.role = { [Op.in]: ['espectador', 'productor'] };
    }
    
    // Search filter (name or email)
    if (search && search.trim()) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search.trim()}%` } },
        { email: { [Op.like]: `%${search.trim()}%` } }
      ];
    }
    
    // Role filter
    if (!isBoleteria && role) {
      where.role = role;
    }
    
    // Active/inactive filter
    if (active !== undefined) {
      where.active = active === 'true' || active === true;
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { count, rows: users } = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      attributes: isBoleteria
        ? { exclude: ['password_hash', 'role'] }
        : { exclude: ['password_hash'] }
    });
    
    const safeUsers = isBoleteria
      ? users.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          dni: user.dni,
          active: user.active,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }))
      : users;

    res.json({
      users: safeUsers,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit))
    });
  } catch (error) {
    console.error('[USERS] Error listing users:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

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
  const user = await User.findByPk(req.params.id, {
    attributes: { exclude: ['password_hash'] }
  });
  if (!user) return res.status(404).json({ error: 'not_found' });
  return res.json(user);
});

// Update user (admin and boleteria)
router.put('/:id', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { name, email, phone, dni } = req.body;
    const { users: User } = sequelize.models;
    
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'not_found' });
    }
    
    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing && existing.id !== user.id) {
        return res.status(400).json({ error: 'email_taken', message: 'Este email ya está en uso' });
      }
    }
    
    await user.update({
      name: name || user.name,
      email: email || user.email,
      phone: phone !== undefined ? phone : user.phone,
      dni: dni !== undefined ? dni : user.dni
    });
    
    const updated = await User.findByPk(user.id, {
      attributes: { exclude: ['password_hash'] }
    });
    
    res.json(updated);
  } catch (error) {
    console.error('[USERS] Error updating user:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

// Change user role (admin only)
router.patch('/:id/role', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const { users: User } = sequelize.models;
    
    if (!role || !['admin', 'boleteria', 'productor', 'espectador'].includes(role)) {
      return res.status(400).json({ error: 'invalid_role', message: 'Rol inválido' });
    }
    
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'not_found' });
    }
    
    // Prevent changing own role
    if (user.id === req.user.userId) {
      return res.status(403).json({ error: 'cannot_change_own_role', message: 'No podés cambiar tu propio rol' });
    }
    
    await user.update({ role });
    
    const updated = await User.findByPk(user.id, {
      attributes: { exclude: ['password_hash'] }
    });
    
    res.json(updated);
  } catch (error) {
    console.error('[USERS] Error changing role:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

// Toggle user active status (admin only)
router.patch('/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { active } = req.body;
    const { users: User } = sequelize.models;
    
    if (active === undefined) {
      return res.status(400).json({ error: 'active_required', message: 'El campo active es requerido' });
    }
    
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'not_found' });
    }
    
    // Prevent deactivating own account
    if (user.id === req.user.userId) {
      return res.status(403).json({ error: 'cannot_deactivate_self', message: 'No podés desactivar tu propia cuenta' });
    }
    
    await user.update({ active: Boolean(active) });
    
    const updated = await User.findByPk(user.id, {
      attributes: { exclude: ['password_hash'] }
    });
    
    res.json(updated);
  } catch (error) {
    console.error('[USERS] Error changing status:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

// REMOVIDOS: Endpoints duplicados sin autenticación

/**
 * GET /api/users/:id/tickets
 * Get all tickets for a user (separated by active and used)
 * Requires: boleteria, admin, productor role OR the user requesting their own tickets
 */
router.get('/:id/tickets', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user.userId; // El JWT guarda como userId, no id
    const requestingUserRole = req.user.role;
    
    // Allow if: admin, boleteria, productor OR requesting own tickets
    const isAuthorized = 
      ['admin', 'boleteria', 'productor'].includes(requestingUserRole) ||
      requestingUserId === id; // Comparar como strings (UUIDs)
    
    if (!isAuthorized) {
      console.log('[USERS] Unauthorized: User', requestingUserId, 'trying to access tickets of user', id);
      return res.status(403).json({ error: 'No autorizado para ver estos tickets' });
    }
    
    const { tickets: Ticket, sales: Sale, sessions: Session, shows: Show } = sequelize.models;
    
    console.log('[USERS] Getting tickets for user:', id, '(requested by user:', requestingUserId, 'role:', requestingUserRole, ')');
    
    // Get all sales for this user
    const sales = await Sale.findAll({
      where: { user_id: id },
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        }
      ]
    });
    
    console.log('[USERS] Found sales:', sales.length);
    
    if (!sales || sales.length === 0) {
      console.log('[USERS] No sales found for user');
      return res.json({ active: [], used: [] });
    }
    
    // Get all tickets from these sales
    const saleIds = sales.map(s => s.id);
    const tickets = await Ticket.findAll({
      where: { sale_id: saleIds },
      order: [['createdAt', 'DESC']]
    });
    
    // Format and categorize tickets
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const now = new Date();
    
    const formattedTickets = tickets.map(t => {
      const sale = sales.find(s => s.id === t.sale_id);
      const session = sale?.session;
      const sessionDate = session ? new Date(session.starts_at) : null;
      const isPast = sessionDate && sessionDate < now;
      
      const isUsed = Boolean(t.used || t.validated_at || isPast);
      
      console.log(`[USERS] Ticket ${t.id}: used=${t.used}, validated_at=${t.validated_at}, isPast=${isPast}, final isUsed=${isUsed}`);
      
      return {
        id: t.id,
        sale_id: t.sale_id,
        seat_code: t.seat_code,
        type: t.type,
        section: t.section,
        capacity: t.capacity,
        capacity_validated: t.capacity_validated,
        status: t.status,
        qr_code: t.qr_code, // QR code para mostrar en modal
        container_qr_code: sale?.container_qr_code || null,
        location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1),
        price: t.price,
        used: isUsed,
        validated_at: t.validated_at,
        show_title: session?.show?.title || 'N/A',
        show_image_url: session?.show?.image_url || null,
        session_starts_at: sessionDate ? sessionDate.toISOString() : null,
        session_date: sessionDate ? sessionDate.toLocaleDateString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) : 'N/A',
        session_time: sessionDate ? sessionDate.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }) : 'N/A'
      };
    });
    
    // Separate active and used
    const active = formattedTickets.filter(t => !t.used);
    const used = formattedTickets.filter(t => t.used);
    
    console.log('[USERS] Returning tickets - Active:', active.length, 'Used:', used.length);
    
    return res.json({ active, used });
  } catch (error) {
    console.error('[GET_USER_TICKETS] Error:', error);
    return res.status(500).json({ error: 'Error al obtener entradas del usuario' });
  }
});

export default router;
