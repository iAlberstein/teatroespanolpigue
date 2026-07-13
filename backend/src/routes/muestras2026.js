import express from 'express';
import nodemailer from 'nodemailer';
import { sequelize } from '../lib/sequelize.js';

const router = express.Router();

const createTransporter = () => {
  const host = process.env.TICKETS_EMAIL_HOST || process.env.EMAIL_HOST;
  const user = process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER;
  const pass = process.env.TICKETS_EMAIL_PASS || process.env.EMAIL_PASS;
  const port = parseInt(process.env.TICKETS_EMAIL_PORT || process.env.EMAIL_PORT || '465');
  const secure = (process.env.TICKETS_EMAIL_SECURE || process.env.EMAIL_SECURE || 'true') === 'true';

  if (!host || !user) {
    console.warn('[MUESTRAS2026] SMTP not configured. Emails will be logged only.');
    return null;
  }

  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
};

/**
 * POST /api/muestras2026/register
 * Register an institution for Muestras Fin de Año 2026
 */
router.post('/register', async (req, res) => {
  try {
    const { nombre_apellido, institucion, localidad, email, telefono } = req.body;

    if (!nombre_apellido || !institucion || !localidad || !email || !telefono) {
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'El email ingresado no es válido.' });
    }

    console.log('[MUESTRAS2026] New registration:', { nombre_apellido, institucion, localidad, email, telefono });

    const Muestras2026Inscripcion = sequelize.models.muestras2026_inscripciones;
    const inscripcion = await Muestras2026Inscripcion.create({
      nombre_apellido,
      institucion,
      localidad,
      email,
      telefono,
      email_enviado: false
    });

    const transporter = createTransporter();

    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background: #f9fafb;">
        <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="background: #2d6a4f; padding: 32px 40px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
              Muestras de Fin de Año 2026
            </h1>
            <p style="margin: 8px 0 0; color: #b7e4c7; font-size: 14px;">Teatro Español Pigüé</p>
          </div>
          <div style="padding: 40px;">
            <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px;">¡Confirmación de inscripción!</h2>
            <p style="margin: 0 0 24px; color: #475569; font-size: 15px; line-height: 1.6;">
              Tu inscripción se registró exitosamente. En breve recibirás más información sobre el sorteo de las fechas.
            </p>
            <div style="background: #f0fdf4; border-left: 4px solid #2d6a4f; border-radius: 4px; padding: 16px 20px; margin-bottom: 24px;">
              <p style="margin: 0 0 6px; color: #166534; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Datos registrados</p>
              <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Nombre:</strong> ${nombre_apellido}</p>
              <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Institución:</strong> ${institucion}</p>
              <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Localidad:</strong> ${localidad}</p>
              <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Teléfono:</strong> ${telefono}</p>
            </div>
            <p style="margin: 0; color: #94a3b8; font-size: 13px;">
              Si tenés alguna consulta, podés escribirnos a <a href="mailto:teatropigue@gmail.com" style="color: #2d6a4f;">teatropigue@gmail.com</a>
            </p>
          </div>
          <div style="background: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">© Teatro Español Pigüé · España 120, Pigüé, Buenos Aires</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const notificationHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; background: #f9fafb;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px; border: 1px solid #e2e8f0;">
          <h2 style="margin: 0 0 16px; color: #2d6a4f; font-size: 18px;">📋 Nueva inscripción - Muestras 2026</h2>
          <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Nombre:</strong> ${nombre_apellido}</p>
          <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Institución:</strong> ${institucion}</p>
          <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Localidad:</strong> ${localidad}</p>
          <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 4px 0; color: #374151; font-size: 14px;"><strong>Teléfono:</strong> ${telefono}</p>
        </div>
      </body>
      </html>
    `;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.TICKETS_EMAIL_FROM || process.env.EMAIL_FROM || `"Teatro Español Pigüé" <${process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER}>`,
          to: email,
          subject: 'Confirmación de inscripción a sorteo - Muestras 2026',
          html: confirmationHtml
        });
        console.log('[MUESTRAS2026] Confirmation email sent to:', email);
        await inscripcion.update({ email_enviado: true });
      } catch (emailErr) {
        console.error('[MUESTRAS2026] Error sending confirmation email:', emailErr.message);
      }

      try {
        await transporter.sendMail({
          from: process.env.TICKETS_EMAIL_FROM || process.env.EMAIL_FROM || `"Teatro Español Pigüé" <${process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER}>`,
          to: 'teatropigue@gmail.com',
          subject: `Nueva inscripción Muestras 2026: ${institucion} (${localidad})`,
          html: notificationHtml
        });
        console.log('[MUESTRAS2026] Notification email sent to teatropigue@gmail.com');
      } catch (notifErr) {
        console.error('[MUESTRAS2026] Error sending notification email:', notifErr.message);
      }
    } else {
      console.log('[MUESTRAS2026] Would send confirmation email to:', email);
      console.log('[MUESTRAS2026] Would send notification email to: teatropigue@gmail.com');
    }

    return res.json({ success: true, nombre_apellido });
  } catch (error) {
    console.error('[MUESTRAS2026] Error:', error);
    return res.status(500).json({ error: 'Error al procesar la inscripción.' });
  }
});

export default router;
