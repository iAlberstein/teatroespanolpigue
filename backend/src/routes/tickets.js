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
          include: [{ model: Show, as: 'show' }]
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
          include: [{ model: Show, as: 'show' }]
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

/**
 * POST /api/tickets/box-office-sale
 * Create a direct sale from box office (without Mercado Pago)
 * Body: { 
 *   session_id: string,
 *   items: [{ type: 'butaca'|'palco'|'pullman', seat_code?: string, quantity?: number, price: number }],
 *   customer: { name: string, email?: string, phone?: string },
 *   payment_method: 'cash' | 'card' | 'transfer'
 * }
 * Requires: boleteria or admin role
 */
router.post('/box-office-sale', authenticateToken, requireRole('boleteria', 'admin'), async (req, res) => {
  try {
    const { session_id, items, customer, payment_method = 'cash' } = req.body;
    console.log('[BOX_OFFICE] Received items:', JSON.stringify(items, null, 2));
    const { reservations: Reservation, sales: Sale, tickets: Ticket, sessions: Session, users: User } = sequelize.models;

    // Validate session exists
    const session = await Session.findByPk(session_id);
    if (!session) {
      return res.status(404).json({ error: 'session_not_found', message: 'Session not found' });
    }

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'invalid_items', message: 'Items array is required' });
    }

    // Validate customer data
    if (!customer || !customer.name) {
      return res.status(400).json({ error: 'invalid_customer', message: 'Customer name is required' });
    }

    // Search for existing user by email or phone
    let existingUser = null;
    let userFoundBy = null;
    
    if (customer.email) {
      existingUser = await User.findOne({ 
        where: { email: customer.email },
        attributes: ['id', 'name', 'email', 'phone', 'role']
      });
      if (existingUser) userFoundBy = 'email';
    }
    
    if (!existingUser && customer.phone) {
      existingUser = await User.findOne({ 
        where: { phone: customer.phone },
        attributes: ['id', 'name', 'email', 'phone', 'role']
      });
      if (existingUser) userFoundBy = 'phone';
    }

    // Calculate total
    const total = items.reduce((sum, item) => {
      if (item.type === 'pullman') {
        return sum + (Number(item.price || 0) * Number(item.quantity || 1));
      }
      return sum + Number(item.price || 0);
    }, 0);

    // Create sale record
    const sale = await Sale.create({
      session_id,
      user_id: existingUser ? existingUser.id : null,
      total_amount: total,
      payment_method,
      payment_status: 'approved',
      customer_name: customer.name,
      customer_email: customer.email || null,
      customer_phone: customer.phone || null,
      sold_by: req.user.userId,
      metadata: {
        source: 'box_office',
        items,
        user_matched: existingUser ? { by: userFoundBy, user_id: existingUser.id } : null
      }
    });

    // Create tickets
    const tickets = [];
    const ticketUserId = existingUser ? existingUser.id : null;
    
    for (const item of items) {
      if (item.type === 'butaca' || item.type === 'palco') {
        const ticket = await Ticket.create({
          session_id,
          sale_id: sale.id,
          user_id: ticketUserId, // Associate ticket directly to user if found
          type: item.type,
          seat_code: item.seat_code,
          section: item.type === 'butaca' ? 'platea' : 'palco',
          price: Number(item.price || 0),
          status: 'sold',
          qr_data: null // Will be generated later
        });
        tickets.push(ticket);
      } else if (item.type === 'pullman') {
        const quantity = Number(item.quantity || 1);
        for (let i = 0; i < quantity; i++) {
          const ticket = await Ticket.create({
            session_id,
            sale_id: sale.id,
            user_id: ticketUserId, // Associate ticket directly to user if found
            type: 'pullman',
            seat_code: null,
            section: 'pullman',
            price: Number(item.price || 0),
            status: 'sold',
            qr_data: null
          });
          tickets.push(ticket);
        }
      }
    }

    // Generate QR data for each ticket
    const { generateTicketQR } = await import('../lib/qr.js');
    for (const ticket of tickets) {
      const { qr_code, qr_data } = await generateTicketQR({
        id: ticket.id,
        session_id: ticket.session_id,
        user_id: ticket.user_id, // Use the ticket's user_id
        type: ticket.type,
        seat_code: ticket.seat_code
      });
      await ticket.update({ qr_code, qr_data });
    }

    // Update in-memory sold state
    const io = req.app.get('io');
    if (io) {
      io.soldSeats = io.soldSeats || new Map();
      io.soldPalcos = io.soldPalcos || new Map();
      io.pullmanSold = io.pullmanSold || new Map();

      const seatSet = io.soldSeats.get(session_id) || new Set();
      const palcoSet = io.soldPalcos.get(session_id) || new Set();
      let pullmanCount = io.pullmanSold.get(session_id) || 0;

      for (const item of items) {
        if (item.type === 'butaca' && item.seat_code) {
          seatSet.add(item.seat_code);
          io.to(`session:${session_id}`).emit('seat_sold', { seatId: item.seat_code });
        }
        if (item.type === 'palco' && item.seat_code) {
          palcoSet.add(item.seat_code);
          io.to(`session:${session_id}`).emit('palco_sold', { palco: item.seat_code });
        }
        if (item.type === 'pullman') {
          pullmanCount += Number(item.quantity || 1);
        }
      }

      io.soldSeats.set(session_id, seatSet);
      io.soldPalcos.set(session_id, palcoSet);
      io.pullmanSold.set(session_id, pullmanCount);

      if (pullmanCount > 0) {
        io.to(`session:${session_id}`).emit('pullman_sold', { sold: pullmanCount });
      }
    }

    // Get seller info
    const seller = await User.findByPk(req.user.userId, {
      attributes: ['id', 'name', 'email', 'role']
    });

    // Format tickets with seat locations
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const formattedTickets = tickets.map(t => {
      console.log('[BOX_OFFICE] Formatting ticket:', { id: t.id, type: t.type, seat_code: t.seat_code, price: t.price });
      return {
        id: t.id,
        type: t.type,
        seat_code: t.seat_code,
        location: formatSeatLocation(t.seat_code, t.type),
        section: t.section,
        price: t.price,
        qr_data: t.qr_data
      };
    });
    console.log('[BOX_OFFICE] Formatted tickets:', JSON.stringify(formattedTickets, null, 2));

    return res.json({
      success: true,
      sale: {
        id: sale.id,
        total_amount: sale.total_amount,
        payment_method: sale.payment_method,
        customer_name: sale.customer_name,
        customer_email: sale.customer_email,
        customer_phone: sale.customer_phone
      },
      seller: seller ? {
        name: seller.name,
        email: seller.email
      } : null,
      user_association: existingUser ? {
        found: true,
        matched_by: userFoundBy,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role
        },
        message: `Esta entrada se guardó automáticamente en el perfil del usuario ${existingUser.name}`
      } : null,
      tickets: formattedTickets
    });
  } catch (error) {
    console.error('[BOX_OFFICE_SALE] Error:', error);
    return res.status(500).json({ error: 'server_error', message: 'Error creating sale' });
  }
});

export default router;
