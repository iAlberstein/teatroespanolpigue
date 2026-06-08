import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { sequelize } from '../lib/sequelize.js';
import nodemailer from 'nodemailer';

const router = express.Router();

// Create email transporter
const createTransporter = () => {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    console.warn('[MAILING] SMTP not configured');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Extract base64 images from HTML and convert to CID attachments
const extractBase64Images = (html) => {
  const attachments = [];
  let processedHtml = html;
  
  // Match base64 images: src="data:image/xxx;base64,..."
  const base64Regex = /src=["']data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)["']/gi;
  let match;
  let imageIndex = 0;
  
  while ((match = base64Regex.exec(html)) !== null) {
    const mimeType = match[1];
    const base64Data = match[2];
    const cid = `image${imageIndex}@teatro.local`;
    const filename = `image${imageIndex}.${mimeType === 'jpeg' ? 'jpg' : mimeType}`;
    
    attachments.push({
      filename,
      content: Buffer.from(base64Data, 'base64'),
      cid,
      contentType: `image/${mimeType}`
    });
    
    // Replace base64 src with cid reference
    processedHtml = processedHtml.replace(
      match[0],
      `src="cid:${cid}"`
    );
    
    imageIndex++;
  }
  
  return { processedHtml, attachments };
};

// Get all newsletter subscribers
router.get(
  '/subscribers',
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const NewsletterSubscriber = sequelize.models.newsletter_subscribers;
      
      const subscribers = await NewsletterSubscriber.findAll({
        where: { active: true },
        attributes: ['id', 'name', 'email', 'created_at'],
        order: [['created_at', 'DESC']]
      });

      return res.json({
        total: subscribers.length,
        subscribers
      });
    } catch (error) {
      console.error('[MAILING] Error fetching subscribers:', error);
      return res.status(500).json({ error: 'Error al obtener suscriptores' });
    }
  }
);

// Send bulk email to all active subscribers
router.post(
  '/send',
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { subject, htmlContent, testEmail } = req.body;

      if (!subject || !htmlContent) {
        return res.status(400).json({ error: 'Asunto y contenido son requeridos' });
      }

      const transporter = createTransporter();
      if (!transporter) {
        return res.status(500).json({ error: 'SMTP no configurado' });
      }

      const NewsletterSubscriber = sequelize.models.newsletter_subscribers;

      // If testEmail is provided, only send to that email
      let recipients;
      if (testEmail) {
        recipients = [{ name: 'Test User', email: testEmail }];
      } else {
        recipients = await NewsletterSubscriber.findAll({
          where: { active: true },
          attributes: ['name', 'email']
        });
      }

      if (recipients.length === 0) {
        return res.status(400).json({ error: 'No hay destinatarios activos' });
      }

      const results = {
        total: recipients.length,
        sent: 0,
        failed: 0,
        errors: []
      };

      // Send emails with rate limiting (100ms between each)
      for (const recipient of recipients) {
        try {
          // Replace placeholders with actual values
          const personalizedHtml = htmlContent
            .replace(/\{\{nombre\}\}/gi, recipient.name || 'Amigo/a')
            .replace(/\{\{email\}\}/gi, recipient.email);

          // Add unsubscribe footer
          const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipient.email)}`;
          
          const rawHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              ${personalizedHtml}
              <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
                <p>Recibiste este email porque estás suscripto al newsletter del Teatro Español Pigüé.</p>
                <p><a href="${unsubscribeUrl}" style="color: #6b7280;">Desuscribirse</a></p>
              </div>
            </body>
            </html>
          `;

          // Extract base64 images and convert to CID attachments
          const { processedHtml: finalHtml, attachments } = extractBase64Images(rawHtml);

          await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"Teatro Español Pigüé" <${process.env.EMAIL_USER}>`,
            to: recipient.email,
            subject,
            html: finalHtml,
            attachments
          });

          results.sent++;
          console.log(`[MAILING] Email sent to ${recipient.email}`);

          // Rate limiting - wait 100ms between emails
          if (!testEmail) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (emailError) {
          results.failed++;
          results.errors.push({ email: recipient.email, error: emailError.message });
          console.error(`[MAILING] Failed to send to ${recipient.email}:`, emailError.message);
        }
      }

      return res.json({
        message: testEmail ? 'Email de prueba enviado' : 'Campaña de emails enviada',
        results
      });
    } catch (error) {
      console.error('[MAILING] Error sending bulk email:', error);
      return res.status(500).json({ error: 'Error al enviar emails' });
    }
  }
);

// Preview email (returns processed HTML)
router.post(
  '/preview',
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { htmlContent, previewName } = req.body;

      if (!htmlContent) {
        return res.status(400).json({ error: 'Contenido HTML requerido' });
      }

      const personalizedHtml = htmlContent
        .replace(/\{\{nombre\}\}/gi, previewName || 'Juan Pérez')
        .replace(/\{\{email\}\}/gi, 'ejemplo@email.com');

      return res.json({ html: personalizedHtml });
    } catch (error) {
      console.error('[MAILING] Error generating preview:', error);
      return res.status(500).json({ error: 'Error al generar preview' });
    }
  }
);

export default router;
