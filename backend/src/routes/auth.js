import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken } from '../middleware/auth.js';
import { createActivityLog, ActionTypes, EntityTypes } from '../middleware/activityLogger.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'iStein2513';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * POST /api/auth/register
 * Register a new user
 * Body: { name, email, password, phone?, dni?, role? }
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, dni, role } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'validation_error', message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'validation_error', message: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'validation_error', message: 'Invalid email format' });
    }

    const { users: User } = sequelize.models;

    // Check if email already exists
    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'email_exists', message: 'Email already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Default role is 'espectador' unless specified
    const validRoles = ['admin', 'boleteria', 'productor', 'espectador', 'premium'];
    const userRole = role && validRoles.includes(role) ? role : 'espectador';

    // Create user
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone: phone || null,
      dni: dni || null,
      password_hash,
      role: userRole
    });

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Log activity
    await createActivityLog({
      userId: user.id,
      actionType: ActionTypes.REGISTER,
      entityType: EntityTypes.USER,
      entityId: user.id,
      details: { email: user.email, role: user.role },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'validation_error', message: 'Email and password are required' });
    }

    const { users: User } = sequelize.models;

    // Find user by email
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Log activity
    await createActivityLog({
      userId: user.id,
      actionType: ActionTypes.LOGIN,
      entityType: EntityTypes.USER,
      entityId: user.id,
      details: { email: user.email, role: user.role },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user from token
 * Requires: Authorization header with Bearer token
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { users: User } = sequelize.models;
    
    const user = await User.findByPk(req.user.userId, {
      attributes: ['id', 'name', 'email', 'role', 'createdAt']
    });

    if (!user) {
      return res.status(404).json({ error: 'user_not_found', message: 'User not found' });
    }

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('[AUTH] /me error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Failed to get user info' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, this is just for logging)
 */
router.post('/logout', authenticateToken, (req, res) => {
  // JWT is stateless, so logout is handled client-side by removing the token
  // This endpoint is mainly for logging purposes
  console.log(`[AUTH] User ${req.user.email} logged out`);
  return res.json({ message: 'Logout successful' });
});

export default router;
