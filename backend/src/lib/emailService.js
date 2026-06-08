import nodemailer from 'nodemailer';
import { formatDateTime } from './dateFormatter.js';

// Create email transporter
const createTransporter = () => {
  const host = process.env.TICKETS_EMAIL_HOST || process.env.EMAIL_HOST;
  const user = process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER;
  const pass = process.env.TICKETS_EMAIL_PASS || process.env.EMAIL_PASS;
  const port = parseInt(process.env.TICKETS_EMAIL_PORT || process.env.EMAIL_PORT || '465');
  const secure = (process.env.TICKETS_EMAIL_SECURE || process.env.EMAIL_SECURE || 'true') === 'true';

  if (!host || !user) {
    console.warn('[EMAIL] SMTP not configured. Emails will be logged only.');
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
  
  // If no transporter, just log the email
  if (!transporter) {
    console.log('[EMAIL] Would send email:', { to, subject });
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
    console.log('[EMAIL] Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] Error sending email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send purchase confirmation email with tickets QR
 */
export async function sendPurchaseConfirmation({
  customerEmail,
  customerName,
  showTitle,
  sessionDate,
  sessionTime,
  tickets,
  saleId,
  totalAmount,
  paymentMethod,
  subtotal,
  discountCode,
  discountAmount,
  serviceFeePercent,
  serviceFeeAmount,
  serviceItems,
  servicesSubtotal
}) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const ticketsUrl = `${baseUrl}/api/share/sale/${saleId}`;

  // Format tickets list (exclude service tickets)
  const regularTickets = tickets.filter(t => t.type !== 'service');
  const ticketsList = regularTickets.map((ticket, index) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${ticket.location || ticket.type}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${Number(ticket.price || 0).toLocaleString('es-AR')}</td>
    </tr>
  `).join('');

  // Calculate subtotal for regular tickets only (exclude services)
  const ticketsSubtotal = regularTickets.reduce((sum, t) => sum + Number(t.price || 0), 0);

  // Calculate correct total (ticketsSubtotal - discount + service fee + services)
  const calculatedTotal = (Number(ticketsSubtotal) || 0) - (Number(discountAmount) || 0) + (Number(serviceFeeAmount) || 0) + (Number(servicesSubtotal) || 0);

  // Format services list
  const servicesList = (serviceItems || []).map((service, index) => {
    const qty = Number(service.quantity || 1);
    const price = Number(service.price || 0);
    const total = qty * price;
    return `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${service.name || 'Servicio'} (x${qty})</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${total.toLocaleString('es-AR')}</td>
    </tr>
  `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirmación de Compra</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Teatro Español Pigüé</h1>
          <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 16px;">Confirmación de Compra</p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 20px;">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">¡Hola${customerName && customerName !== 'Cliente' ? ` ${customerName}` : ''}!</h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
            Tu compra se ha realizado con éxito. A continuación encontrarás los detalles de tus entradas:
          </p>

          <!-- Show Info -->
          <div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #1f2937; margin: 0 0 12px 0; font-size: 18px;">${showTitle}</h3>
            <p style="color: #6b7280; margin: 0; font-size: 14px;">
              <strong>📅 Fecha:</strong> ${sessionDate}<br>
              <strong>🕐 Hora:</strong> ${sessionTime}
            </p>
          </div>

          <!-- Tickets Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 12px; text-align: left; color: #1f2937; font-weight: 600; border-bottom: 2px solid #e5e7eb;">#</th>
                <th style="padding: 12px; text-align: left; color: #1f2937; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Ubicación</th>
                <th style="padding: 12px; text-align: right; color: #1f2937; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Precio</th>
              </tr>
            </thead>
            <tbody>
              ${ticketsList}
            </tbody>
            <tfoot>
              ${ticketsSubtotal ? `
              <tr style="background-color: #f9fafb;">
                <td colspan="2" style="padding: 12px; color: #6b7280;">Subtotal</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">$${Number(ticketsSubtotal).toLocaleString('es-AR')}</td>
              </tr>
              ` : ''}
            </tfoot>
          </table>

          ${servicesList ? `
          <!-- Services Table -->
          <h3 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">Servicios Adicionales</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 12px; text-align: left; color: #1f2937; font-weight: 600; border-bottom: 2px solid #e5e7eb;">#</th>
                <th style="padding: 12px; text-align: left; color: #1f2937; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Servicio</th>
                <th style="padding: 12px; text-align: right; color: #1f2937; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${servicesList}
            </tbody>
            <tfoot>
              ${servicesSubtotal ? `
              <tr style="background-color: #f9fafb;">
                <td colspan="2" style="padding: 12px; color: #6b7280;">Subtotal Servicios</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">$${Number(servicesSubtotal).toLocaleString('es-AR')}</td>
              </tr>
              ` : ''}
            </tfoot>
          </table>
          ` : ''}

          <!-- Totals Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tfoot>
              ${discountAmount ? `
              <tr style="background-color: #fef3c7;">
                <td colspan="2" style="padding: 12px; color: #92400e; font-weight: 600;">Descuento ${discountCode ? `(${discountCode})` : ''}</td>
                <td style="padding: 12px; text-align: right; color: #92400e; font-weight: 600;">-$${Number(discountAmount).toLocaleString('es-AR')}</td>
              </tr>
              ` : ''}
              ${serviceFeeAmount ? `
              <tr style="background-color: #f9fafb;">
                <td colspan="2" style="padding: 12px; color: #6b7280;">Cargo por servicio</td>
                <td style="padding: 12px; text-align: right; color: #6b7280;">$${Number(serviceFeeAmount).toLocaleString('es-AR')}</td>
              </tr>
              ` : ''}
              <tr style="background-color: #f9fafb;">
                <td colspan="2" style="padding: 16px; font-weight: 600; color: #1f2937;">TOTAL</td>
                <td style="padding: 16px; text-align: right; font-weight: 700; color: #059669; font-size: 18px;">$${Number(calculatedTotal).toLocaleString('es-AR')}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Important Info -->
          <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
              <strong>⚠️ Importante:</strong><br>
              • Llegá al menos 30 minutos antes de la función.<br>
              • Mostrá el código QR de tus entradas al ingresar.<br>
              • Se puede validar ingresos parciales de una misma compra (compartile el QR a quienes llegan después)<br>
              • Las funciones comienzan puntual. Una vez comenzada, la ubicación pierde validez. El personal del teatro te indicará tu nuevo lugar.<br>
            </p>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${ticketsUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Ver Mis Entradas
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 0 0 24px 0; font-style: italic;">
            Las entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo.
          </p>

          <!-- Sale Info -->
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              <strong>ID de Compra:</strong> ${saleId}<br>
              <strong>Método de Pago:</strong> ${paymentMethod === 'mp' ? 'Mercado Pago' : paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'card' ? 'Tarjeta' : 'Otro'}
            </p>
          </div>
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
    to: customerEmail,
    subject: `Confirmación de Compra - ${showTitle}`,
    html
  });
}

/**
 * Send refund notification email
 */
export async function sendRefundNotification({
  customerEmail,
  customerName,
  showTitle,
  sessionDate,
  sessionTime,
  locations = [],
  refundAmount,
  originalAmount,
  saleId,
  reason,
  channel
}) {
  const amount = Math.abs(Number(refundAmount || 0));
  const original = Number(originalAmount || 0);

  const locationsList = (locations || []).map((loc, index) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${loc}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirmación de Devolución</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background: linear-gradient(135deg, #b91c1c 0%, #f97316 100%); padding: 32px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Devolución registrada</h1>
          <p style="color: #fee2e2; margin: 8px 0 0 0; font-size: 14px;">Teatro Español Pigüé</p>
        </div>

        <div style="padding: 32px 20px;">
          <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">Hola ${customerName || ''},</h2>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
            Registramos la devolución de tu compra para el siguiente espectáculo:
          </p>

          <div style="background-color: #f9fafb; border-left: 4px solid #f97316; padding: 16px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; margin: 0 0 8px 0; font-size: 16px;">${showTitle}</h3>
            <p style="color: #6b7280; margin: 0; font-size: 13px;">
              <strong>📅 Fecha:</strong> ${sessionDate || '-'}<br>
              <strong>🕐 Hora:</strong> ${sessionTime || '-'}
            </p>
          </div>

          ${locationsList ? `
          <h4 style="color: #1f2937; margin: 0 0 8px 0; font-size: 14px;">Entradas devueltas</h4>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">#</th>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb;">Ubicación</th>
              </tr>
            </thead>
            <tbody>
              ${locationsList}
            </tbody>
          </table>
          ` : ''}

          <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 16px; font-size: 14px; color: #92400e;">
            <p style="margin: 0 0 8px 0;"><strong>Monto original:</strong> $${original.toLocaleString('es-AR')}</p>
            <p style="margin: 0 0 8px 0;"><strong>Monto devuelto:</strong> $${amount.toLocaleString('es-AR')}</p>
            <p style="margin: 0;"><strong>Canal:</strong> ${channel || 'Boletería'}</p>
          </div>

          ${reason ? `
          <div style="background-color: #eff6ff; border-radius: 8px; padding: 16px; margin-bottom: 16px; font-size: 13px; color: #1f2937;">
            <strong>Motivo informado:</strong>
            <p style="margin: 8px 0 0 0; white-space: pre-line;">${reason}</p>
          </div>
          ` : ''}

          <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 16px 0 0 0;">
            Ante cualquier duda sobre esta devolución podés responder a este correo o comunicarte con la boletería del teatro.
          </p>

          <div style="margin-top: 16px; font-size: 12px; color: #9ca3af;">
            <p style="margin: 0;">
              <strong>ID de la compra original:</strong> ${saleId}
            </p>
          </div>
        </div>

        <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">Teatro Español Pigüé</p>
          <p style="color: #9ca3af; font-size: 11px; margin: 0;">Este es un email automático, por favor no respondas a este mensaje.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: customerEmail,
    subject: `Confirmación de devolución - ${showTitle}`,
    html
  });
}

/**
 * Send reminder email 24h before the show
 */
export async function sendShowReminder({
  customerEmail,
  customerName,
  showTitle,
  sessionDate,
  sessionTime,
  ticketsCount,
  saleId
}) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const ticketsUrl = `${baseUrl}/api/share/sale/${saleId}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Recordatorio de Función</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); padding: 40px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">¡Te esperamos mañana!</h1>
        </div>

        <!-- Content -->
        <div style="padding: 40px 20px;">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Hola ${customerName},</h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
            Te recordamos que mañana tenés función en el Teatro Español Pigüé:
          </p>

          <!-- Show Info -->
          <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
            <h3 style="color: #1f2937; margin: 0 0 16px 0; font-size: 22px; font-weight: 700;">${showTitle}</h3>
            <div style="display: inline-block; background-color: #ffffff; border-radius: 8px; padding: 16px 24px; margin: 8px 0;">
              <p style="color: #7c3aed; margin: 0; font-size: 18px; font-weight: 600;">
                📅 ${sessionDate}
              </p>
              <p style="color: #7c3aed; margin: 8px 0 0 0; font-size: 18px; font-weight: 600;">
                🕐 ${sessionTime}
              </p>
            </div>
            <p style="color: #92400e; margin: 16px 0 0 0; font-size: 14px;">
              <strong>${ticketsCount}</strong> entrada${ticketsCount > 1 ? 's' : ''}
            </p>
          </div>

          <!-- Reminders -->
          <div style="background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <h4 style="color: #065f46; margin: 0 0 12px 0; font-size: 16px;">✅ Recordá:</h4>
            <ul style="color: #065f46; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
              <li>Llegá al menos <strong>30 minutos antes</strong> de la función</li>
              <li>Mostrá el <strong>código QR</strong> de tus entradas</li>
              <li>Se puede validar ingresos parciales de una misma compra (compartile el QR a quienes llegan después)</li>
              <li>La funcion comienza puntual. Una vez comenzada, la ubicación pierde validez. El personal del teatro te indicará tu nuevo lugar.</li>
            </ul>
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${ticketsUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(124, 58, 237, 0.3);">
              Ver Mis Entradas
            </a>
          </div>

          <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 24px 0 0 0;">
            ¡Nos vemos en el teatro!
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
    to: customerEmail,
    subject: `Recordatorio: Mañana tenés función - ${showTitle}`,
    html
  });
}

/**
 * Send admin notification for new sale
 */
export async function sendAdminNotification({
  adminEmails,
  showTitle,
  sessionDate,
  sessionTime,
  customerName,
  ticketsCount,
  totalAmount,
  channel
}) {
  if (!adminEmails || adminEmails.length === 0) {
    console.log('[EMAIL] No admin emails configured');
    return { success: false };
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0;">
      <title>Nueva Venta</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background-color: #059669; padding: 24px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">💰 Nueva Venta Realizada</h1>
        </div>

        <div style="padding: 32px 20px;">
          <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 16px; margin-bottom: 20px;">
            <p style="color: #065f46; margin: 0; font-size: 16px; font-weight: 600;">
              Canal: ${channel === 'Online' ? '🌐 Venta Online' : '🎫 Venta en Boletería'}
            </p>
          </div>

          <table style="width: 100%; font-size: 14px; color: #374151;">
            <tr>
              <td style="padding: 8px 0; font-weight: 600;">Show:</td>
              <td style="padding: 8px 0;">${showTitle}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600;">Fecha:</td>
              <td style="padding: 8px 0;">${sessionDate} - ${sessionTime}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600;">Cliente:</td>
              <td style="padding: 8px 0;">${customerName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600;">Entradas:</td>
              <td style="padding: 8px 0;">${ticketsCount}</td>
            </tr>
            <tr style="border-top: 2px solid #e5e7eb;">
              <td style="padding: 12px 0; font-weight: 700; font-size: 16px;">Total:</td>
              <td style="padding: 12px 0; font-weight: 700; font-size: 16px; color: #059669;">$${Number(totalAmount).toLocaleString('es-AR')}</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #f9fafb; padding: 16px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            Teatro Español Pigüé - Notificación Automática
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Send to all admin emails
  const promises = adminEmails.map(email => 
    sendEmail({
      to: email,
      subject: `💰 Nueva Venta - ${showTitle}`,
      html
    })
  );

  const results = await Promise.allSettled(promises);
  return {
    success: results.some(r => r.status === 'fulfilled' && r.value.success),
    results
  };
}

export default {
  sendPurchaseConfirmation,
  sendShowReminder,
  sendAdminNotification,
  sendRefundNotification
};
