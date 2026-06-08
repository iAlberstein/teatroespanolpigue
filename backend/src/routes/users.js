import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { Op } from 'sequelize';

function parseServiceItems(raw) {
  if (!raw) return [];
  try {
    let val = raw;
    if (typeof val === 'string') val = JSON.parse(val);
    if (typeof val === 'string') val = JSON.parse(val);
    return Array.isArray(val) ? val : [];
  } catch { return []; }
}

const router = Router();

// Helper: sync legacy users.role column from multi-role system
// Priority order: admin > boleteria > productor > premium > espectador
const ROLE_PRIORITY = ['admin', 'boleteria', 'productor', 'premium', 'espectador'];
async function syncLegacyRole(userId) {
  const rolesModel = sequelize.models.roles;
  const userRolesModel = sequelize.models.user_roles;
  const { users: User } = sequelize.models;
  if (!rolesModel || !userRolesModel) return;
  const userRoles = await userRolesModel.findAll({
    where: { user_id: userId },
    include: [{ model: rolesModel, as: 'role', attributes: ['nombre'] }]
  });
  const roleNames = userRoles.map(ur => ur.role?.nombre).filter(Boolean);
  // Pick highest priority legacy-compatible role
  const legacyRole = ROLE_PRIORITY.find(r => roleNames.includes(r)) || 'espectador';
  await User.update({ role: legacyRole }, { where: { id: userId } });
}

/**
 * GET /api/users/search-quick
 * Quick search for customers by name, email, or DNI
 * For box office use
 * Query params: q (search query)
 * Returns both registered users and guest customers (from sales without user_id)
 */
router.get('/search-quick', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const { users: User, sales: Sale } = sequelize.models;

    // 1. Search registered users
    const users = await User.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { email: { [Op.like]: `%${q}%` } },
          { dni: { [Op.like]: `%${q}%` } },
          { phone: { [Op.like]: `%${q}%` } }
        ]
      },
      attributes: ['id', 'name', 'email', 'phone', 'dni', 'provincia', 'localidad'],
      limit: 10,
      order: [['name', 'ASC']]
    });

    // 2. Search guest customers from sales (where user_id IS NULL)
    // Only include sales that have at least customer_name or customer_email or customer_dni
    let guestCustomers = [];
    if (Sale) {
      const guestSales = await Sale.findAll({
        where: {
          user_id: null,
          [Op.and]: [
            {
              [Op.or]: [
                { customer_name: { [Op.like]: `%${q}%` } },
                { customer_email: { [Op.like]: `%${q}%` } },
                { customer_dni: { [Op.like]: `%${q}%` } },
                { customer_phone: { [Op.like]: `%${q}%` } }
              ]
            },
            {
              // Must have at least name or email to be a valid customer record
              [Op.or]: [
                { customer_name: { [Op.ne]: null } },
                { customer_email: { [Op.ne]: null } }
              ]
            }
          ]
        },
        attributes: [
          'customer_name', 'customer_email', 'customer_phone', 'customer_dni',
          'customer_provincia', 'customer_localidad'
        ],
        limit: 20,
        order: [['created_at', 'DESC']]
      });

      // Deduplicate guest customers by DNI (prefer DNI) or email
      const seenDnis = new Set();
      const seenEmails = new Set();
      const seenGuestKeys = new Set();

      for (const sale of guestSales) {
        const dni = sale.customer_dni?.toLowerCase().trim();
        const email = sale.customer_email?.toLowerCase().trim();
        const key = dni || email || `${sale.customer_name?.toLowerCase().trim()}_${sale.customer_phone?.toLowerCase().trim()}`;

        // Skip if we've seen this DNI or email already
        if (dni && seenDnis.has(dni)) continue;
        if (email && seenEmails.has(email)) continue;
        if (seenGuestKeys.has(key)) continue;

        // Also skip if this DNI/email matches an existing registered user
        const matchesRegisteredUser = users.some(u =>
          (dni && u.dni?.toLowerCase() === dni) ||
          (email && u.email?.toLowerCase() === email)
        );
        if (matchesRegisteredUser) continue;

        if (dni) seenDnis.add(dni);
        if (email) seenEmails.add(email);
        seenGuestKeys.add(key);

        guestCustomers.push({
          id: `guest_${key.replace(/[^a-z0-9]/g, '_')}`,
          name: sale.customer_name,
          email: sale.customer_email,
          phone: sale.customer_phone,
          dni: sale.customer_dni,
          provincia: sale.customer_provincia,
          localidad: sale.customer_localidad,
          is_registered: false
        });
      }
    }

    // Combine and format results
    const registeredUsers = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      dni: u.dni,
      provincia: u.provincia,
      localidad: u.localidad,
      is_registered: true
    }));

    const combinedResults = [...registeredUsers, ...guestCustomers].slice(0, 10);

    return res.json({ users: combinedResults });
  } catch (error) {
    console.error('[USERS] Error searching users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all available roles (admin only) - MUST be before /:id routes
router.get('/meta/roles', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const rolesModel = sequelize.models.roles;
    if (!rolesModel) return res.json({ roles: [] });
    const roles = await rolesModel.findAll({ order: [['modulo', 'ASC'], ['nombre', 'ASC']] });
    res.json({ roles });
  } catch (error) {
    console.error('[USERS] Error fetching roles:', error);
    res.status(500).json({ error: 'server_error' });
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
    
    // Load multi-roles for each user
    const rolesModel = sequelize.models.roles;
    const userRolesModel = sequelize.models.user_roles;
    
    const usersWithRoles = await Promise.all(users.map(async (u) => {
      const userData = u.toJSON();
      if (isBoleteria) {
        return {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          dni: userData.dni,
          active: userData.active,
          createdAt: userData.createdAt,
          updatedAt: userData.updatedAt
        };
      }
      // Load roles from multi-role system
      let roles = [];
      if (userRolesModel && rolesModel) {
        const userRoles = await userRolesModel.findAll({
          where: { user_id: userData.id },
          include: [{ model: rolesModel, as: 'role', attributes: ['nombre'] }]
        });
        roles = userRoles.map(ur => ur.role?.nombre).filter(Boolean);
      }
      if (roles.length === 0 && userData.role) {
        roles = [userData.role];
      }
      return { ...userData, roles };
    }));

    res.json({
      users: usersWithRoles,
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
    const { name, email, phone, dni, provincia, localidad } = req.body;
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
      dni: dni !== undefined ? dni : user.dni,
      provincia: provincia !== undefined ? provincia : user.provincia,
      localidad: localidad !== undefined ? localidad : user.localidad
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

    // Sync multi-role system: ensure the new role exists in user_roles
    try {
      const rolesModel = sequelize.models.roles;
      const userRolesModel = sequelize.models.user_roles;
      if (rolesModel && userRolesModel) {
        const roleRecord = await rolesModel.findOne({ where: { nombre: role } });
        if (roleRecord) {
          await userRolesModel.findOrCreate({
            where: { user_id: user.id, role_id: roleRecord.id }
          });
        }
      }
    } catch (syncErr) {
      console.warn('[USERS] Unable to sync multi-role on legacy role change:', syncErr.message);
    }
    
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
    
    // Parse service_items per sale (once)
    const serviceItemsBySale = {};
    for (const sale of sales) {
      const items = parseServiceItems(sale.service_items);
      if (items.length > 0) serviceItemsBySale[sale.id] = items;
    }

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
        show_image_url: session?.show?.image_principal_mobile || session?.show?.image_url || null,
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
        }) : 'N/A',
        service_items: serviceItemsBySale[t.sale_id] || []
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

// Add role to user (admin only)
router.post('/:id/roles', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { role: roleName } = req.body;
    const rolesModel = sequelize.models.roles;
    const userRolesModel = sequelize.models.user_roles;
    const { users: User } = sequelize.models;

    if (!roleName) {
      return res.status(400).json({ error: 'role_required', message: 'El nombre del rol es requerido' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'not_found' });

    const role = await rolesModel.findOne({ where: { nombre: roleName } });
    if (!role) return res.status(400).json({ error: 'invalid_role', message: `Rol '${roleName}' no existe` });

    // Check if already has this role
    const existing = await userRolesModel.findOne({ where: { user_id: user.id, role_id: role.id } });
    if (existing) return res.status(400).json({ error: 'already_has_role', message: 'El usuario ya tiene este rol' });

    await userRolesModel.create({ user_id: user.id, role_id: role.id });

    // Sync legacy users.role column
    await syncLegacyRole(user.id);

    // Return updated roles
    const userRoles = await userRolesModel.findAll({
      where: { user_id: user.id },
      include: [{ model: rolesModel, as: 'role', attributes: ['nombre'] }]
    });
    const roles = userRoles.map(ur => ur.role?.nombre).filter(Boolean);

    res.json({ roles });
  } catch (error) {
    console.error('[USERS] Error adding role:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

// Remove role from user (admin only)
router.delete('/:id/roles/:roleName', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { roleName } = req.params;
    const rolesModel = sequelize.models.roles;
    const userRolesModel = sequelize.models.user_roles;
    const { users: User } = sequelize.models;

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'not_found' });

    const role = await rolesModel.findOne({ where: { nombre: roleName } });
    if (!role) return res.status(400).json({ error: 'invalid_role', message: `Rol '${roleName}' no existe` });

    await userRolesModel.destroy({ where: { user_id: user.id, role_id: role.id } });

    // Sync legacy users.role column
    await syncLegacyRole(user.id);

    // Return updated roles
    const userRoles = await userRolesModel.findAll({
      where: { user_id: user.id },
      include: [{ model: rolesModel, as: 'role', attributes: ['nombre'] }]
    });
    const roles = userRoles.map(ur => ur.role?.nombre).filter(Boolean);

    res.json({ roles });
  } catch (error) {
    console.error('[USERS] Error removing role:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
