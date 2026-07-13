import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Configuración de multer para subida de imágenes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../media/showsimg'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'show-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
    }
  }
});

router.get('/', async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const User = sequelize.models.users;
    const ShowProducer = sequelize.models.show_producer;
    const Session = sequelize.models.sessions;
    const Bordereaux = sequelize.models.bordereaux;
    
    // Check if request has admin token (optional - public endpoint)
    const isAdmin = req.query.admin === 'true';
    const statusFilter = req.query.status; // 'active', 'finished', or undefined for all
    
    // Filter by visibility: only show visible shows to non-admin requests
    const whereClause = isAdmin ? {} : { is_visible: true };
    
    // Obtener shows con bordereaux cerrado
    const closedBordereaux = await Bordereaux.findAll({
      where: { status: 'cerrado' },
      attributes: ['show_id'],
      raw: true
    });
    const showsWithClosedBordereaux = closedBordereaux.map(b => b.show_id);
    
    const shows = await Show.findAll({ 
      where: whereClause,
      order: [['date','ASC'], ['time','ASC']] 
    });
    
    console.log('[SHOWS] Sample show pricing_json:', shows[0]?.pricing_json, 'type:', typeof shows[0]?.pricing_json);
    
    // Obtener productores y primera sesión para cada show
    for (let show of shows) {
      // Productores
      const producerLinks = await ShowProducer.findAll({
        where: { show_id: show.id },
        attributes: ['producer_id']
      });
      
      if (producerLinks.length > 0) {
        const producerIds = producerLinks.map(link => link.producer_id);
        const producers = await User.findAll({
          where: { 
            id: producerIds,
            role: 'productor'
          },
          attributes: ['id', 'name', 'email']
        });
        show.dataValues.producers = producers;
      } else {
        show.dataValues.producers = [];
      }
      
      // Todas las sesiones (incluir pricing_json para calcular precio mínimo)
      const sessions = await Session.findAll({
        where: { show_id: show.id },
        order: [['starts_at', 'ASC']],
        attributes: ['id', 'starts_at', 'pricing_json']
      });
      
      show.dataValues.sessions = sessions;
      // Use next upcoming session (from today) for ordering and display
      const todayForSession = new Date();
      todayForSession.setHours(0, 0, 0, 0);
      const nextSession = sessions.find(s => new Date(s.starts_at) >= todayForSession);
      show.dataValues.first_session = nextSession || sessions[0] || null;
      
      // Calcular precio mínimo desde las sesiones (no del show)
      let minPriceFromSessions = null;
      for (const session of sessions) {
        let sessionPricing = session.pricing_json;
        if (typeof sessionPricing === 'string') {
          try { sessionPricing = JSON.parse(sessionPricing); } catch { continue; }
        }
        if (sessionPricing && typeof sessionPricing === 'object') {
          const prices = Object.values(sessionPricing).filter(p => typeof p === 'number' && p > 0);
          const sessionMin = prices.length > 0 ? Math.min(...prices) : null;
          if (sessionMin !== null && (minPriceFromSessions === null || sessionMin < minPriceFromSessions)) {
            minPriceFromSessions = sessionMin;
          }
        }
      }
      show.dataValues.min_price = minPriceFromSessions;
      
      // Determinar estado del show (activo o finalizado)
      // Sessions from today are still considered active (allows selling at the door)
      const hasBordereauxClosed = showsWithClosedBordereaux.includes(show.id);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const hasAllSessionsPast = sessions.length > 0 && sessions.every(s => new Date(s.starts_at) < todayStart);
      const isFinished = hasBordereauxClosed || hasAllSessionsPast;
      show.dataValues.show_status = isFinished ? 'finalizado' : 'activo';
    }
    
    // Filtrar por estado si se especifica
    let filteredShows = shows;
    if (statusFilter === 'active') {
      filteredShows = shows.filter(s => s.dataValues.show_status === 'activo');
    } else if (statusFilter === 'finished') {
      filteredShows = shows.filter(s => s.dataValues.show_status === 'finalizado');
    }
    
    // Ordenar por fecha de primera sesión
    filteredShows.sort((a, b) => {
      const dateA = a.dataValues.first_session?.starts_at || new Date(a.date || 0);
      const dateB = b.dataValues.first_session?.starts_at || new Date(b.date || 0);
      return new Date(dateA) - new Date(dateB);
    });
    
    res.json(filteredShows);
  } catch (error) {
    console.error('[SHOWS] Error getting shows:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

const IMAGE_SLOTS = new Set(['principal_web', 'secundaria_web', 'principal_mobile']);

const sanitizeImagePath = (value) => {
  if (!value || typeof value !== 'string') return null;
  return value.startsWith('/media/showsimg/') ? value : null;
};

// Upload image for show
router.post('/upload-image', authenticateToken, requireRole('admin', 'productor'), (req, res) => {
  console.log('[SHOWS] Upload image request received, user:', req.user);
  
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('[SHOWS] Multer error:', err);
      return res.status(400).json({ error: 'upload_failed', message: err.message });
    }
    
    const slot = req.body?.slot;
    if (!slot || !IMAGE_SLOTS.has(slot)) {
      console.error('[SHOWS] Invalid slot provided:', slot);
      return res.status(400).json({ error: 'invalid_slot', message: 'Slot inválido. Use principal_web, secundaria_web o principal_mobile.' });
    }
    
    if (!req.file) {
      console.error('[SHOWS] No file received in request');
      return res.status(400).json({ error: 'no_file', message: 'No se recibió ningún archivo' });
    }
    
    console.log('[SHOWS] File uploaded successfully:', req.file.filename, 'slot:', slot);
    
    // Devolver la ruta relativa de la imagen
    const imagePath = `/media/showsimg/${req.file.filename}`;
    res.json({ image_url: imagePath, slot });
  });
});

// Get a single show by ID
router.get('/:id', async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const User = sequelize.models.users;
    const ShowProducer = sequelize.models.show_producer;
    const Session = sequelize.models.sessions;
    const Bordereaux = sequelize.models.bordereaux;
    
    const show = await Show.findByPk(req.params.id);
    
    if (!show) {
      return res.status(404).json({ error: 'not_found', message: 'Espectáculo no encontrado' });
    }
    
    // Get producers
    const producerLinks = await ShowProducer.findAll({
      where: { show_id: show.id },
      attributes: ['producer_id']
    });
    
    if (producerLinks.length > 0) {
      const producerIds = producerLinks.map(link => link.producer_id);
      const producers = await User.findAll({
        where: { 
          id: producerIds,
          role: 'productor'
        },
        attributes: ['id', 'name', 'email']
      });
      show.dataValues.producers = producers;
    } else {
      show.dataValues.producers = [];
    }
    
    // Determinar estado del show (activo o finalizado)
    // Sessions from today are still considered active (allows selling at the door)
    const closedBordereaux = await Bordereaux.findOne({
      where: { show_id: show.id, status: 'cerrado' }
    });
    const sessions = await Session.findAll({
      where: { show_id: show.id },
      attributes: ['starts_at']
    });
    const hasBordereauxClosed = !!closedBordereaux;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const hasAllSessionsPast = sessions.length > 0 && sessions.every(s => new Date(s.starts_at) < todayStart);
    const isFinished = hasBordereauxClosed || hasAllSessionsPast;
    show.dataValues.show_status = isFinished ? 'finalizado' : 'activo';
    
    res.json(show);
  } catch (error) {
    console.error('[SHOWS] Error getting show:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Get sessions for a specific show
router.get('/:id/sessions', async (req, res) => {
  try {
    const { sessions: Session, shows: Show, tickets: Ticket } = sequelize.models;
    const { Op } = await import('sequelize');
    
    // Return sessions from today onwards (including sessions that already started today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sessions = await Session.findAll({
      where: { 
        show_id: req.params.id,
        starts_at: {
          [Op.gte]: today
        }
      },
      order: [['starts_at', 'ASC']]
    });

    // Enrich each session with is_sold_out
    const show = await Show.findByPk(req.params.id);
    const enriched = await Promise.all(sessions.map(async (session) => {
      let capacity;
      if (session.capacity_override) {
        capacity = session.capacity_override;
      } else if (show && (show.venue_type === 'el_tablado' || show.venue_type === 'las_gemelas')) {
        capacity = show.general_capacity || null;
      } else {
        capacity = 446;
      }
      const isGeneralAdmission = show && (show.venue_type === 'el_tablado' || show.venue_type === 'las_gemelas');
      const soldCount = await Ticket.count({
        where: {
          session_id: session.id,
          ...(isGeneralAdmission ? { type: 'general' } : {}),
          status: { [Op.in]: ['sold', 'validated'] }
        }
      });
      const is_sold_out = capacity !== null && soldCount >= capacity;
      return { ...session.toJSON(), is_sold_out };
    }));

    res.json(enriched);
  } catch (error) {
    console.error('[SHOWS] Error getting sessions:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Create a new show (admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const ShowProducer = sequelize.models.show_producer;
    const User = sequelize.models.users;
    const { 
      title, 
      description, 
      duration_minutes, 
      venue_type, 
      general_capacity, 
      pricing_json, 
      image_url,
      image_principal_web,
      image_secundaria_web,
      image_principal_mobile,
      producer_ids,
      is_visible,
      external_sale,
      external_sale_link,
      palcos_individual_seats
    } = req.body;
    
    console.log('[SHOWS] Creating show with data:', { title, venue_type, general_capacity, pricing_json, producer_ids, is_visible, external_sale, palcos_individual_seats });
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title_required', message: 'El título es obligatorio' });
    }
    
    // Validate pricing_json (skip if external_sale is true)
    if (!external_sale && (!pricing_json || typeof pricing_json !== 'object' || Object.keys(pricing_json).length === 0)) {
      return res.status(400).json({ 
        error: 'pricing_required', 
        message: 'Los precios son obligatorios' 
      });
    }
    
    // Validate external_sale_link if external_sale is true
    if (external_sale && (!external_sale_link || !external_sale_link.trim())) {
      return res.status(400).json({ 
        error: 'external_link_required', 
        message: 'El link de venta externa es obligatorio cuando se usa venta por terceros' 
      });
    }
    
    const sanitizedImages = {
      image_url: sanitizeImagePath(image_url?.trim()) || null,
      image_principal_web: sanitizeImagePath(image_principal_web?.trim()) || sanitizeImagePath(image_url?.trim()) || null,
      image_secundaria_web: sanitizeImagePath(image_secundaria_web?.trim()) || null,
      image_principal_mobile: sanitizeImagePath(image_principal_mobile?.trim()) || sanitizeImagePath(image_principal_web?.trim()) || null
    };
    
    const show = await Show.create({
      title: title.trim(),
      description: description?.trim() || null,
      duration_minutes: duration_minutes || 120,
      venue_type: venue_type || 'sala_principal',
      general_capacity: general_capacity || null,
      pricing_json: external_sale ? {} : pricing_json,
      is_visible: is_visible !== undefined ? is_visible : true,
      external_sale: external_sale || false,
      external_sale_link: external_sale ? external_sale_link?.trim() : null,
      palcos_individual_seats: palcos_individual_seats || false,
      ...sanitizedImages
    });
    
    console.log('[SHOWS] Show created:', { 
      id: show.id, 
      venue_type: show.venue_type, 
      general_capacity: show.general_capacity,
      image_url: show.image_url 
    });
    
    // Asociar productores si se proporcionaron
    if (producer_ids && Array.isArray(producer_ids) && producer_ids.length > 0) {
      console.log('[SHOWS] Creating show with producer_ids:', producer_ids);
      // Verificar que los IDs sean de usuarios con rol productor
      const producers = await User.findAll({
        where: { 
          id: producer_ids,
          role: 'productor'
        }
      });
      
      console.log('[SHOWS] Found producers:', producers.length);
      
      // Crear registros en show_producers
      for (let producer of producers) {
        await ShowProducer.create({
          show_id: show.id,
          producer_id: producer.id
        });
      }
    }
    
    res.status(201).json(show);
  } catch (error) {
    console.error('[SHOWS] Error creating show:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al crear espectáculo' });
  }
});

// Update a show (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const ShowProducer = sequelize.models.show_producer;
    const User = sequelize.models.users;
    const show = await Show.findByPk(req.params.id);
    
    if (!show) {
      return res.status(404).json({ error: 'not_found', message: 'Espectáculo no encontrado' });
    }
    
    const { 
      title, 
      description, 
      duration_minutes, 
      venue_type, 
      general_capacity, 
      pricing_json, 
      image_url,
      image_principal_web,
      image_secundaria_web,
      image_principal_mobile,
      producer_ids,
      is_visible,
      external_sale,
      external_sale_link,
      palcos_individual_seats
    } = req.body;
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title_required', message: 'El título es obligatorio' });
    }
    
    // Validate external_sale_link if external_sale is true
    if (external_sale && (!external_sale_link || !external_sale_link.trim())) {
      return res.status(400).json({ 
        error: 'external_link_required', 
        message: 'El link de venta externa es obligatorio cuando se usa venta por terceros' 
      });
    }
    
    const sanitizedImages = {
      image_url: sanitizeImagePath(image_url?.trim()) ?? show.image_url,
      image_principal_web:
        sanitizeImagePath(image_principal_web?.trim()) ??
        show.image_principal_web ??
        sanitizeImagePath(image_url?.trim()) ??
        show.image_url,
      image_secundaria_web:
        sanitizeImagePath(image_secundaria_web?.trim()) ?? show.image_secundaria_web,
      image_principal_mobile:
        sanitizeImagePath(image_principal_mobile?.trim()) ??
        show.image_principal_mobile ??
        sanitizeImagePath(image_principal_web?.trim()) ??
        show.image_principal_web
    };
    
    const oldCapacity = show.general_capacity;
    
    await show.update({
      title: title.trim(),
      description: description?.trim() || null,
      duration_minutes: duration_minutes || show.duration_minutes,
      venue_type: venue_type || show.venue_type,
      general_capacity: general_capacity !== undefined ? general_capacity : show.general_capacity,
      pricing_json: external_sale ? {} : (pricing_json || show.pricing_json),
      is_visible: is_visible !== undefined ? is_visible : show.is_visible,
      external_sale: external_sale !== undefined ? external_sale : show.external_sale,
      external_sale_link: external_sale ? external_sale_link?.trim() : null,
      palcos_individual_seats: palcos_individual_seats !== undefined ? palcos_individual_seats : show.palcos_individual_seats,
      ...sanitizedImages
    });
    
    // If general_capacity changed, update in-memory pullmanState for all sessions of this show
    const newCapacity = show.general_capacity;
    if (newCapacity && newCapacity !== oldCapacity) {
      const io = req.app.get('io');
      if (io && io.pullmanState) {
        const Session = sequelize.models.sessions;
        const sessions = await Session.findAll({ where: { show_id: show.id } });
        for (const session of sessions) {
          const st = io.pullmanState.get(session.id);
          if (st) {
            st.capacity = newCapacity;
            const soldCount = io.pullmanSold?.get(session.id) || 0;
            const blockedCount = io.blockedGeneral?.get(session.id) || 0;
            const totalHeld = Array.from(st.heldBySocket.values()).reduce((a, b) => a + b, 0);
            const available = Math.max(0, newCapacity - totalHeld - soldCount - blockedCount);
            io.to(`session:${session.id}`).emit('pullman_updated', { available, capacity: newCapacity });
            console.log(`[SHOWS] Updated pullmanState capacity for session ${session.id}: ${oldCapacity} -> ${newCapacity}, available=${available}`);
          }
        }
      }
    }
    
    // Actualizar productores si se proporcionaron
    if (producer_ids !== undefined && Array.isArray(producer_ids)) {
      // Eliminar productores existentes
      await ShowProducer.destroy({
        where: { show_id: show.id }
      });
      
      // Verificar que los IDs sean de usuarios con rol productor
      const producers = await User.findAll({
        where: { 
          id: producer_ids,
          role: 'productor'
        }
      });
      
      
      // Crear nuevos registros en show_producers
      for (let producer of producers) {
        await ShowProducer.create({
          show_id: show.id,
          producer_id: producer.id
        });
      }
      console.log('[SHOWS] Created new producer associations');
    }
    
    res.json(show);
  } catch (error) {
    console.error('[SHOWS] Error updating show:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al actualizar espectáculo' });
  }
});

// Delete a show (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const Session = sequelize.models.sessions;
    
    const show = await Show.findByPk(req.params.id);
    
    if (!show) {
      return res.status(404).json({ error: 'not_found', message: 'Espectáculo no encontrado' });
    }
    
    // Check if show has sessions
    const sessionCount = await Session.count({ where: { show_id: req.params.id } });
    if (sessionCount > 0) {
      return res.status(400).json({ 
        error: 'has_sessions', 
        message: 'No se puede eliminar un espectáculo con sesiones. Elimine las sesiones primero.' 
      });
    }
    
    await show.destroy();
    res.json({ success: true, message: 'Espectáculo eliminado exitosamente' });
  } catch (error) {
    console.error('[SHOWS] Error deleting show:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al eliminar espectáculo' });
  }
});

// Update pricing_json for a show (admin only)
// Body: { pricing_json: object }
router.put('/:id/pricing', authenticateToken, requireRole('admin'), async (req, res) => {
  const Show = sequelize.models.shows;
  const show = await Show.findByPk(req.params.id);
  if (!show) return res.status(404).json({ error: 'Not found' });
  const { pricing_json } = req.body || {};
  if (!pricing_json || typeof pricing_json !== 'object') {
    return res.status(400).json({ error: 'pricing_json object required' });
  }
  await show.update({ pricing_json });
  res.json(show);
});

// =====================================================
// SERVICIOS ASOCIADOS A SHOWS
// =====================================================

// GET /api/shows/:id/services - Obtener servicios de un show (público)
router.get('/:id/services', async (req, res) => {
  try {
    const ShowService = sequelize.models.show_services;
    const services = await ShowService.findAll({
      where: { show_id: req.params.id, active: true },
      order: [['created_at', 'ASC']]
    });
    res.json(services);
  } catch (error) {
    console.error('[SHOWS] Error getting services:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al obtener servicios' });
  }
});

// POST /api/shows/:id/services - Agregar servicio a un show (admin only)
router.post('/:id/services', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Show = sequelize.models.shows;
    const ShowService = sequelize.models.show_services;
    const show = await Show.findByPk(req.params.id);
    if (!show) return res.status(404).json({ error: 'not_found', message: 'Show no encontrado' });
    const { name, description, price, include_in_bordereaux } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'invalid_data', message: 'El nombre del servicio es requerido' });
    }
    if (price === undefined || price === null || isNaN(Number(price))) {
      return res.status(400).json({ error: 'invalid_data', message: 'El precio es requerido' });
    }
    const service = await ShowService.create({
      show_id: req.params.id,
      name: name.trim(),
      description: description?.trim() || null,
      price: Number(price),
      include_in_bordereaux: include_in_bordereaux === true || include_in_bordereaux === 'true' || include_in_bordereaux === 1
    });
    res.status(201).json(service);
  } catch (error) {
    console.error('[SHOWS] Error creating service:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al crear servicio' });
  }
});

// PUT /api/shows/:id/services/:serviceId - Actualizar servicio (admin only)
router.put('/:id/services/:serviceId', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const ShowService = sequelize.models.show_services;
    const service = await ShowService.findOne({ where: { id: req.params.serviceId, show_id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'not_found', message: 'Servicio no encontrado' });
    const { name, description, price, include_in_bordereaux } = req.body;
    await service.update({
      name: name?.trim() || service.name,
      description: description !== undefined ? (description?.trim() || null) : service.description,
      price: price !== undefined ? Number(price) : service.price,
      include_in_bordereaux: include_in_bordereaux !== undefined ? (include_in_bordereaux === true || include_in_bordereaux === 'true' || include_in_bordereaux === 1) : service.include_in_bordereaux
    });
    res.json(service);
  } catch (error) {
    console.error('[SHOWS] Error updating service:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al actualizar servicio' });
  }
});

// DELETE /api/shows/:id/services/:serviceId - Eliminar servicio (admin only)
router.delete('/:id/services/:serviceId', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const ShowService = sequelize.models.show_services;
    const service = await ShowService.findOne({ where: { id: req.params.serviceId, show_id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'not_found', message: 'Servicio no encontrado' });
    await service.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('[SHOWS] Error deleting service:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al eliminar servicio' });
  }
});

export default router;
