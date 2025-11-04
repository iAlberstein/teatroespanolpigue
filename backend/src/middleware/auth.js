import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'iStein2513';

/**
 * Middleware to verify JWT token
 * Adds req.user with decoded token payload
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'auth_required', message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, email, role, name }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired', message: 'Token has expired' });
    }
    return res.status(403).json({ error: 'invalid_token', message: 'Invalid token' });
  }
}

/**
 * Middleware to check if user has one of the required roles
 * Must be used after authenticateToken
 * @param {string[]} allowedRoles - Array of roles that can access the route
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'auth_required', message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'forbidden', 
        message: `This route requires one of these roles: ${allowedRoles.join(', ')}` 
      });
    }

    next();
  };
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
