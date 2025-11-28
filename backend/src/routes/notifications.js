import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { sendPurchaseConfirmation } from '../lib/emailService.js';

const router = Router();

/**
 * GET /api/notifications/status
 * Check SMTP configuration status
 */
router.get('/status', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const smtpConfigured = !!(
      process.env.EMAIL_HOST &&
      process.env.EMAIL_USER &&
      process.env.EMAIL_PASS
    );
    
    return res.json({
      smtp_configured: smtpConfigured,
      smtp_host: process.env.EMAIL_HOST || '',
      smtp_port: process.env.EMAIL_PORT || '587',
      smtp_user: process.env.EMAIL_USER || '',
      from_email: process.env.EMAIL_FROM || '',
      admin_emails: process.env.ADMIN_NOTIFICATION_EMAILS || ''
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error getting status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/notifications/test-email
 * Send a test email to verify configuration
 */
router.post('/test-email', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if SMTP is configured
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(400).json({ 
        error: 'SMTP no configurado. Por favor configurá las variables de entorno EMAIL_HOST, EMAIL_USER y EMAIL_PASS.'
      });
    }
    
    // Send test email using the purchase confirmation template
    await sendPurchaseConfirmation({
      customerEmail: email,
      customerName: 'Usuario de Prueba',
      showTitle: 'Email de Prueba',
      sessionDate: new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      sessionTime: new Date().toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
      tickets: [{
        seat_code: 'TEST-1',
        seat_location: 'Platea Baja - Fila A - Butaca 1',
        price: 5000
      }],
      subtotal: 5000,
      discountCode: null,
      discountAmount: 0,
      total: 5000,
      saleId: 'TEST-001'
    });
    
    return res.json({ 
      success: true, 
      message: `Email de prueba enviado a ${email}` 
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] Error sending test email:', error);
    return res.status(500).json({ 
      error: 'Error al enviar email de prueba: ' + error.message 
    });
  }
});

export default router;
