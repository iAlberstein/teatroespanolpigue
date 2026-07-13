import nodemailer from 'nodemailer';

// Create email transporter
const createTransporter = () => {
  const host = process.env.TICKETS_EMAIL_HOST || process.env.EMAIL_HOST;
  const user = process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER;
  const pass = process.env.TICKETS_EMAIL_PASS || process.env.EMAIL_PASS;
  const port = parseInt(process.env.TICKETS_EMAIL_PORT || process.env.EMAIL_PORT || '465');
  const secure = (process.env.TICKETS_EMAIL_SECURE || process.env.EMAIL_SECURE || 'true') === 'true';

  if (!host || !user) {
    console.warn('[APORTES-EMAIL] SMTP not configured. Emails will be logged only.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
};

/**
 * Send email with retry logic
 */
async function sendEmail({ to, subject, html, attachments = [] }) {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.log('[APORTES-EMAIL] Would send email:', { to, subject });
    return { success: false, logged: true };
  }

  try {
    const mailOptions = {
      from: process.env.TICKETS_EMAIL_FROM || process.env.EMAIL_FROM || `"Teatro Español" <${process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[APORTES-EMAIL] Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[APORTES-EMAIL] Error sending email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send aporte confirmation email
 */
export async function sendAporteConfirmation({
  email,
  nombre,
  numero_aporte,
  monto,
  payment_method
}) {
  const baseUrl = process.env.FRONTEND_URL || 'https://www.teatropigue.com.ar';
  const methodText = payment_method === 'mercadopago' ? 'Mercado Pago' : 
                     payment_method === 'transferencia' ? 'Transferencia Bancaria' : 'Otro';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirmación de Aporte Solidario</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Teatro Español Pigüé</h1>
          <p style="color: #d1fae5; margin: 10px 0 0 0; font-size: 16px;">Aporte Solidario Confirmado</p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 20px;">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">¡Gracias, ${nombre}!</h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
            Tu aporte solidario al Teatro Español Pigüé ha sido confirmado. Con tu contribución, nos ayudás a seguir llevando arte y cultura a nuestra comunidad.
          </p>

          <!-- Aporte Info -->
          <div style="background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
            <p style="color: #065f46; margin: 0 0 8px 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              Tu número de aporte
            </p>
            <h3 style="color: #059669; margin: 0; font-size: 48px; font-weight: 700; letter-spacing: 2px;">
              ${numero_aporte}
            </h3>
            <p style="color: #065f46; margin: 16px 0 0 0; font-size: 14px;">
              Guardá este número, ¡es tu chance para ganar!
            </p>
          </div>

          <!-- Details -->
          <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Monto:</td>
                <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">$${monto.toLocaleString('es-AR')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Método de pago:</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right;">${methodText}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Estado:</td>
                <td style="padding: 8px 0; color: #059669; font-weight: 600; text-align: right;">✓ Confirmado</td>
              </tr>
            </table>
          </div>

          <!-- Benefits Info -->
          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 24px;">
            <h4 style="color: #1e40af; margin: 0 0 12px 0; font-size: 16px;">¿Qué beneficios tenés?</h4>
            <ul style="color: #1e40af; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
              <li><strong>Participás en el sorteo</strong> de los premios especiales entre todos los aportantes</li>
              <li><strong>Acumulás aportes</strong> para obtener tickets extras en tus compras</li>
              <li><strong>Invitá a tus amigos</strong> usando tu DNI como código de referido y ganá aportes extras</li>
            </ul>
          </div>

          <!-- Referral CTA -->
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
            <h4 style="color: #ffffff; margin: 0 0 12px 0; font-size: 18px;">¡Ganá más chances!</h4>
            <p style="color: #e9d5ff; margin: 0 0 16px 0; font-size: 14px;">
              Compartí tu DNI (<strong>${numero_aporte}</strong>) con amigos para que te usen como referido. 
              Por cada persona que aporte usando tu DNI, ¡ambos ganan aportes extras!
            </p>
            <a href="${baseUrl}/aportes" style="display: inline-block; background-color: #ffffff; color: #7c3aed; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Ver mis aportes
            </a>
          </div>

          <!-- Important Info -->
          <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
              <strong>📅 Sorteo en vivo:</strong> El sorteo se realizará en vivo por YouTube. ¡No te lo pierdas!
            </p>
          </div>

          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 24px 0 0 0;">
            Guardá este email con tu número de aporte. <br>
            Si tenés alguna duda, respondé a este correo o escribinos por WhatsApp.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 24px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
            Teatro Español Pigüé
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Este es un email automático, por favor no respondas a este mensaje.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `¡Aporte Solidario Confirmado! - Número ${numero_aporte}`,
    html
  });
}

/**
 * Send referido notification email
 */
export async function sendReferidoNotification({
  email,
  nombre,
  referido_nombre,
  referido_dni,
  bonus_ganado
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>¡Nuevo Referido!</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">¡Felicitaciones!</h1>
          <p style="color: #e9d5ff; margin: 10px 0 0 0; font-size: 16px;">Alguien usó tu código de referido</p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 20px;">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">¡Hola ${nombre}!</h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
            <strong>${referido_nombre}</strong> (DNI: ${referido_dni}) acaba de realizar un aporte usando tu DNI como código de referido.
          </p>

          <!-- Bonus Info -->
          <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
            <p style="color: #92400e; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
              🎁 APORTES EXTRA GANADOS
            </p>
            <h3 style="color: #b45309; margin: 0; font-size: 36px; font-weight: 700;">
              +${bonus_ganado}
            </h3>
            <p style="color: #92400e; margin: 8px 0 0 0; font-size: 14px;">
              aporte${bonus_ganado > 1 ? 's' : ''} extra${bonus_ganado > 1 ? 's' : ''} para el sorteo
            </p>
          </div>

          <!-- Motivation -->
          <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin-bottom: 24px;">
            <p style="color: #065f46; margin: 0; font-size: 14px; line-height: 1.6;">
              <strong>¡Seguí así!</strong> Cuántos más amigos invites, más chances tenés de ganar. 
              Cada persona que use tu DNI como referido te da aportes extras y también les da aportes extras a ellos.
            </p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">
              Tu DNI de referido:
            </p>
            <div style="display: inline-block; background-color: #1f2937; color: #ffffff; padding: 16px 32px; border-radius: 8px; font-size: 20px; font-weight: 700; letter-spacing: 2px;">
              ${referido_dni}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 24px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
            Teatro Español Pigüé - Aportes Solidarios
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Este es un email automático, por favor no respondas a este mensaje.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `¡${referido_nombre} usó tu código de referido! +${bonus_ganado} aportes extra`,
    html
  });
}

export default {
  sendAporteConfirmation,
  sendReferidoNotification
};
