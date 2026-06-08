import jwt from 'jsonwebtoken';
import { sequelize } from '../lib/sequelize.js';

const JWT_SECRET = process.env.JWT_SECRET || 'iStein2513';

/**
 * Middleware to verify JWT token and load user roles
 * Adds req.user with decoded token payload + roles array
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'auth_required', message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, email, role (legacy), name }
    
    // Cargar roles desde la base de datos (async)
    loadUserRoles(decoded.userId)
      .then(roles => {
        req.user.roles = roles; // Array de nombres de rol ['admin', 'alumno_ateneo', ...]
        // Mantener compatibilidad con role legacy
        if (!req.user.role && roles.length > 0) {
          req.user.role = roles[0];
        }
        next();
      })
      .catch(err => {
        console.error('[Auth] Error loading roles:', err);
        // En caso de error, usar rol legacy del token
        req.user.roles = req.user.role ? [req.user.role] : [];
        next();
      });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired', message: 'Token has expired' });
    }
    return res.status(403).json({ error: 'invalid_token', message: 'Invalid token' });
  }
}

/**
 * Carga los roles de un usuario desde la base de datos
 * @param {string} userId - UUID del usuario
 * @returns {Promise<string[]>} - Array de nombres de rol
 */
async function loadUserRoles(userId) {
  const roles = sequelize.models.roles;
  const user_roles = sequelize.models.user_roles;
  
  if (!user_roles || !roles) {
    // Si los modelos no existen aún (migración pendiente), retornar vacío
    return [];
  }

  const userRoles = await user_roles.findAll({
    where: { user_id: userId },
    include: [{
      model: roles,
      as: 'role',
      attributes: ['nombre']
    }]
  });

  return userRoles.map(ur => ur.role?.nombre).filter(Boolean);
}

/**
 * Middleware to check if user has one of the required roles
 * Must be used after authenticateToken
 * Soporta multi-rol: verifica si el usuario tiene AL MENOS UNO de los roles requeridos
 * @param {...string} allowedRoles - Roles que pueden acceder a la ruta
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'auth_required', message: 'Authentication required' });
    }

    const userRoles = req.user.roles || (req.user.role ? [req.user.role] : []);
    
    // Verificar si el usuario tiene alguno de los roles permitidos
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ 
        error: 'forbidden', 
        message: `This route requires one of these roles: ${allowedRoles.join(', ')}` 
      });
    }

    next();
  };
}

/**
 * Helper function to check if user has a specific role
 * Puede usarse dentro de los handlers
 * @param {Object} user - req.user object
 * @param {string} roleName - Nombre del rol a verificar
 * @returns {boolean}
 */
export function hasRole(user, roleName) {
  if (!user) return false;
  const userRoles = user.roles || (user.role ? [user.role] : []);
  return userRoles.includes(roleName);
}

/**
 * Helper function to check if user has any of the specified roles
 * @param {Object} user - req.user object
 * @param {...string} roleNames - Nombres de roles a verificar
 * @returns {boolean}
 */
export function hasAnyRole(user, ...roleNames) {
  if (!user) return false;
  const userRoles = user.roles || (user.role ? [user.role] : []);
  return roleNames.some(role => userRoles.includes(role));
}

/**
 * Optional auth: adds req.user if token is present, but doesn't fail if missing
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    req.user = null;
  }
  
  next();
}
