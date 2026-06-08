import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken } from '../middleware/auth.js';
import { createActivityLog, ActionTypes, EntityTypes } from '../middleware/activityLogger.js';
import { linkTicketsToUserByDni } from '../lib/linkTicketsByDni.js';

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
    const { name, email, password, phone, dni, role, provincia, localidad } = req.body;

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

    // Provincia and localidad are required
    if (!provincia) {
      return res.status(400).json({ error: 'validation_error', message: 'Provincia is required' });
    }
    if (!localidad) {
      return res.status(400).json({ error: 'validation_error', message: 'Localidad is required' });
    }

    const { users: User } = sequelize.models;

    // Check if email already exists
    const existingEmail = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingEmail) {
      return res.status(409).json({ error: 'email_exists', message: 'Email already registered' });
    }

    // Check if DNI already exists (if provided)
    if (dni) {
      const existingDni = await User.findOne({ where: { dni: dni } });
      if (existingDni) {
        return res.status(409).json({ error: 'dni_exists', message: 'DNI already registered' });
      }
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
      role: userRole,
      provincia: provincia || null,
      localidad: localidad || null
    });

    if (dni) {
      try {
        await linkTicketsToUserByDni(user.id, dni);
      } catch (linkErr) {
        console.warn('[AUTH] Unable to link past tickets by DNI during register:', linkErr.message);
      }
    }

    // Assign multi-roles: espectador only (alumno_ateneo is assigned on course inscription)
    try {
      const rolesModelReg = sequelize.models.roles;
      const userRolesModelReg = sequelize.models.user_roles;
      if (rolesModelReg && userRolesModelReg) {
        const rolEspectador = await rolesModelReg.findOne({
          where: { nombre: 'espectador' }
        });
        if (rolEspectador) {
          await userRolesModelReg.findOrCreate({
            where: { user_id: user.id, role_id: rolEspectador.id }
          });
        }
      }
    } catch (roleErr) {
      console.warn('[AUTH] Unable to assign roles during register:', roleErr.message);
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
      actionType: ActionTypes.REGISTER,
      entityType: EntityTypes.USER,
      entityId: user.id,
      details: { email: user.email, role: user.role },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    // Load multi-roles
    let roles = [];
    const rolesModel = sequelize.models.roles;
    const userRolesModel = sequelize.models.user_roles;
    if (userRolesModel && rolesModel) {
      const userRoles = await userRolesModel.findAll({
        where: { user_id: user.id },
        include: [{ model: rolesModel, as: 'role', attributes: ['nombre'] }]
      });
      roles = userRoles.map(ur => ur.role?.nombre).filter(Boolean);
    }
    if (roles.length === 0 && user.role) {
      roles = [user.role];
    }

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        dni: user.dni,
        provincia: user.provincia,
        localidad: user.localidad,
        role: user.role,
        roles
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

    // Load multi-roles
    let roles = [];
    const rolesModel = sequelize.models.roles;
    const userRolesModel = sequelize.models.user_roles;
    if (userRolesModel && rolesModel) {
      const userRoles = await userRolesModel.findAll({
        where: { user_id: user.id },
        include: [{ model: rolesModel, as: 'role', attributes: ['nombre'] }]
      });
      roles = userRoles.map(ur => ur.role?.nombre).filter(Boolean);
    }
    if (roles.length === 0 && user.role) {
      roles = [user.role];
    }

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        dni: user.dni,
        provincia: user.provincia,
        localidad: user.localidad,
        role: user.role,
        roles
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
    const rolesModel = sequelize.models.roles;
    const userRolesModel = sequelize.models.user_roles;
    
    const user = await User.findByPk(req.user.userId, {
      attributes: ['id', 'name', 'email', 'phone', 'dni', 'provincia', 'localidad', 'role', 'createdAt']
    });

    if (!user) {
      return res.status(404).json({ error: 'user_not_found', message: 'User not found' });
    }

    // Load multi-roles
    let roles = [];
    if (userRolesModel && rolesModel) {
      const userRoles = await userRolesModel.findAll({
        where: { user_id: user.id },
        include: [{ model: rolesModel, as: 'role', attributes: ['nombre'] }]
      });
      roles = userRoles.map(ur => ur.role?.nombre).filter(Boolean);
    }
    // Fallback: if no roles in DB, use legacy role
    if (roles.length === 0 && user.role) {
      roles = [user.role];
    }

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      dni: user.dni,
      provincia: user.provincia,
      localidad: user.localidad,
      role: user.role,
      roles,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('[AUTH] /me error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Failed to get user info' });
  }
});

/**
 * POST /api/auth/check-user
 * Check if user exists by email or DNI (public endpoint for guest checkout)
 */
router.post('/check-user', async (req, res) => {
  try {
    const { email, dni } = req.body;
    
    if (!email || !dni) {
      return res.status(400).json({ error: 'validation_error', message: 'Both email and DNI required' });
    }

    const { users: User } = sequelize.models;
    
    // Check if BOTH email AND DNI match the SAME user
    const user = await User.findOne({ 
      where: { 
        email: email.toLowerCase(),
        dni: dni
      },
      attributes: ['id', 'name', 'email', 'dni', 'phone', 'provincia', 'localidad']
    });
    
    if (user) {
      return res.json({ 
        exists: true, 
        user: {
          name: user.name,
          email: user.email,
          dni: user.dni,
          phone: user.phone || '',
          provincia: user.provincia || '',
          localidad: user.localidad || ''
        }
      });
    }
    
    return res.json({ exists: false });
  } catch (error) {
    console.error('[AUTH] /check-user error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Failed to check user' });
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

/**
 * POST /api/auth/forgot-password
 * Request password reset token
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'validation_error', message: 'Email required' });
    }

    const { users: User } = sequelize.models;
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    
    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If the email exists, a reset link will be sent' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await user.update({
      reset_token: resetToken,
      reset_token_expiry: resetTokenExpiry
    });

    // Send email with reset link
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const resetUrl = `${process.env.FRONTEND_URL}/restablecer-contrasena?token=${resetToken}`;
    
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: user.email,
      subject: 'Restablecer contraseña - Teatro Español',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Restablecer contraseña</h2>
          <p>Hola ${user.name},</p>
          <p>Recibimos una solicitud para restablecer tu contraseña. Hacé clic en el siguiente enlace para crear una nueva contraseña:</p>
          <p style="margin: 30px 0;">
            <a href="${resetUrl}" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Restablecer contraseña
            </a>
          </p>
          <p>Este enlace expirará en 1 hora.</p>
          <p>Si no solicitaste restablecer tu contraseña, podés ignorar este email.</p>
          <p>Saludos,<br>Teatro Español</p>
        </div>
      `
    });

    console.log(`[AUTH] Password reset requested for: ${email}`);
    return res.json({ message: 'If the email exists, a reset link will be sent' });
  } catch (error) {
    console.error('[AUTH] /forgot-password error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Failed to process request' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: 'validation_error', message: 'Token and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'validation_error', message: 'Password must be at least 6 characters' });
    }

    const { users: User } = sequelize.models;
    const user = await User.findOne({ 
      where: { 
        reset_token: token,
        reset_token_expiry: { [sequelize.Sequelize.Op.gt]: new Date() }
      } 
    });
    
    if (!user) {
      return res.status(400).json({ error: 'invalid_token', message: 'Invalid or expired reset token' });
    }

    // Hash new password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    await user.update({
      password_hash,
      reset_token: null,
      reset_token_expiry: null
    });

    console.log(`[AUTH] Password reset successful for: ${user.email}`);
    return res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('[AUTH] /reset-password error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Failed to reset password' });
  }
});

export default router;
