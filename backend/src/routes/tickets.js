import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { validateQRData } from '../lib/qr.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/tickets/validate
 * Validate a ticket by QR code
 * Body: { qr_data: string, validation_type?: 'qr_scan' | 'manual' }
 * Requires: boleteria or admin role
 */
router.post('/validate', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { qr_data, validation_type = 'qr_scan' } = req.body;
    
    if (!qr_data) {
      return res.status(400).json({ error: 'qr_data required' });
    }

    const { tickets: Ticket, validations: Validation, sessions: Session, shows: Show } = sequelize.models;

    // Parse QR data to get ticket_id
    let ticketId;
    try {
      const parsed = JSON.parse(qr_data);
      ticketId = parsed.ticket_id;
    } catch (error) {
      return res.status(400).json({ error: 'invalid_qr_format', message: 'QR code format is invalid' });
    }

    if (!ticketId) {
      return res.status(400).json({ error: 'invalid_qr_data', message: 'Ticket ID not found in QR' });
    }

    // Find ticket
    const ticket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: Session,
          include: [{ model: Show }]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'ticket_not_found', message: 'Ticket not found' });
    }

    // Validate QR data matches ticket
    const isValid = validateQRData(qr_data, ticket);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'qr_mismatch', 
        message: 'QR code does not match ticket data',
        ticket_id: ticket.id
      });
    }

    // Check ticket status
    if (ticket.status === 'validated') {
      // Get validator info
      const { users: User } = sequelize.models;
      const validator = ticket.validated_by ? await User.findByPk(ticket.validated_by, {
        attributes: ['id', 'name', 'email']
      }) : null;
      
      return res.status(409).json({ 
        error: 'already_validated', 
        message: 'This ticket has already been validated',
        ticket,
        validated_at: ticket.validated_at,
        validated_by: validator ? {
          name: validator.name,
          email: validator.email
        } : null
      });
    }

    if (ticket.status !== 'sold') {
      return res.status(400).json({ 
        error: 'invalid_status', 
        message: `Ticket status is '${ticket.status}', expected 'sold'`,
        ticket
      });
    }

    // Check session time (optional warning, not blocking)
    const session = ticket.session;
    const now = new Date();
    const sessionStart = new Date(session.starts_at);
    const sessionEnd = new Date(session.ends_at);
    let timeWarning = null;

    if (now < sessionStart) {
      const hoursUntil = Math.round((sessionStart - now) / (1000 * 60 * 60));
      timeWarning = `Session starts in ${hoursUntil} hours`;
    } else if (now > sessionEnd) {
      timeWarning = 'Session has already ended';
    }

    // Validate ticket
    await ticket.update({
      status: 'validated',
      validated_at: now,
      validated_by: req.user.userId
    });

    // Create validation record
    await Validation.create({
      ticket_id: ticket.id,
      validated_by: req.user.userId,
      device_info: {
        userAgent: req.headers['user-agent'],
        platform: req.headers['sec-ch-ua-platform']
      },
      ip_address: req.ip || req.connection.remoteAddress,
      validation_type
    });

    // Get validator info
    const { users: User } = sequelize.models;
    const validator = await User.findByPk(req.user.userId, {
      attributes: ['id', 'name', 'email']
    });

    return res.json({
      success: true,
      message: 'Ticket validated successfully',
      ticket: {
        id: ticket.id,
        type: ticket.type,
        seat_code: ticket.seat_code,
        section: ticket.section,
        status: ticket.status,
        validated_at: ticket.validated_at
      },
      validated_by: validator ? {
        name: validator.name,
        email: validator.email
      } : null,
      show: {
        title: session.show.title,
        date: session.show.date,
        time: session.show.time
      },
      session: {
        starts_at: session.starts_at,
        ends_at: session.ends_at
      },
      time_warning: timeWarning
    });

  } catch (error) {
    console.error('[TICKETS] Validation error:', error);
    return res.status(500).json({ error: 'internal_error', message: 'Validation failed' });
  }
});

/**
 * GET /api/tickets/:id
 * Get ticket details (for debugging/admin)
 * Requires: authentication
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { tickets: Ticket, sessions: Session, shows: Show, users: User } = sequelize.models;
    
    const ticket = await Ticket.findByPk(req.params.id, {
      include: [
        {
          model: Session,
          include: [{ model: Show }]
        },
        {
          model: User,
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'ticket_not_found' });
    }

    // Only allow user to see their own tickets, or admin/boleteria to see all
    const isOwner = ticket.user_id === req.user.userId;
    const isStaff = ['admin', 'boleteria'].includes(req.user.role);

    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'forbidden', message: 'You can only view your own tickets' });
    }

    return res.json(ticket);
  } catch (error) {
    console.error('[TICKETS] Get ticket error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/tickets/:id/validations
 * Get validation history for a ticket
 * Requires: admin or boleteria
 */
router.get('/:id/validations', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { validations: Validation, users: User } = sequelize.models;
    
    const validations = await Validation.findAll({
      where: { ticket_id: req.params.id },
      include: [
        {
          model: User,
          as: 'validator',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(validations);
  } catch (error) {
    console.error('[TICKETS] Get validations error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
