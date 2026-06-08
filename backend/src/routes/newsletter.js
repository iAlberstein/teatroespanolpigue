import { Router } from 'express';
import { sequelize } from '../lib/sequelize.js';

const router = Router();

// Subscribe to newsletter
router.post('/subscribe', async (req, res) => {
  try {
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ 
        error: 'missing_fields', 
        message: 'Nombre y email son requeridos' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'invalid_email', 
        message: 'El formato del email no es valido' 
      });
    }
    
    const NewsletterSubscriber = sequelize.models.newsletter_subscribers;
    
    // Check if already subscribed
    const existing = await NewsletterSubscriber.findOne({ where: { email } });
    
    if (existing) {
      if (existing.active) {
        return res.status(409).json({ 
          error: 'already_subscribed', 
          message: 'Este email ya esta suscrito al newsletter' 
        });
      } else {
        // Reactivate subscription
        await existing.update({ name, active: true });
        return res.json({ 
          success: true, 
          message: 'Suscripcion reactivada exitosamente',
          subscriber: { id: existing.id, name, email }
        });
      }
    }
    
    // Create new subscriber
    const subscriber = await NewsletterSubscriber.create({ name, email });
    
    console.log('[NEWSLETTER] New subscriber:', email);
    
    res.status(201).json({ 
      success: true, 
      message: 'Suscripcion exitosa',
      subscriber: { id: subscriber.id, name: subscriber.name, email: subscriber.email }
    });
    
  } catch (error) {
    console.error('[NEWSLETTER] Error subscribing:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        error: 'already_subscribed', 
        message: 'Este email ya esta suscrito al newsletter' 
      });
    }
    
    res.status(500).json({ error: 'internal_error', message: 'Error al procesar la suscripcion' });
  }
});

// Unsubscribe from newsletter
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'missing_email', 
        message: 'Email es requerido' 
      });
    }
    
    const NewsletterSubscriber = sequelize.models.newsletter_subscribers;
    
    const subscriber = await NewsletterSubscriber.findOne({ where: { email } });
    
    if (!subscriber) {
      return res.status(404).json({ 
        error: 'not_found', 
        message: 'Email no encontrado en la lista de suscriptores' 
      });
    }
    
    await subscriber.update({ active: false });
    
    console.log('[NEWSLETTER] Unsubscribed:', email);
    
    res.json({ 
      success: true, 
      message: 'Te has dado de baja del newsletter exitosamente' 
    });
    
  } catch (error) {
    console.error('[NEWSLETTER] Error unsubscribing:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error al procesar la solicitud' });
  }
});

export default router;
