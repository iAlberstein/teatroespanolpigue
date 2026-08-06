import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';

/**
 * Email service using nodemailer
 * Configure SMTP credentials in .env:
 * EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
 */

const createTransporter = () => {
  const host = process.env.TICKETS_EMAIL_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
  const user = process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER;
  const pass = process.env.TICKETS_EMAIL_PASS || process.env.EMAIL_PASS;
  const port = parseInt(process.env.TICKETS_EMAIL_PORT || process.env.EMAIL_PORT || '465');
  const secure = (process.env.TICKETS_EMAIL_SECURE || process.env.EMAIL_SECURE || 'true') === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
};

/**
 * Generate HTML email template for tickets
 */
function generateTicketEmailHTML(tickets, sessionInfo, customerName) {
  const ticketRows = tickets.map(ticket => `
    <tr>
      <td style="padding: 15px; border-bottom: 1px solid #eee;">
        <strong>${ticket.location}</strong><br>
        <span style="color: #666; font-size: 14px;">${ticket.type === 'pullman' ? 'Pullman' : ticket.section}</span>
      </td>
      <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center;">
        <img src="cid:qr_${ticket.id}" alt="QR Code" style="width: 120px; height: 120px;">
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Entradas - Teatro Español Pigüé</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Teatro Español Pigüé</h1>
                  <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Tus entradas están listas</p>
                </td>
              </tr>
              
              <!-- Welcome -->
              <tr>
                <td style="padding: 30px;">
                  <h2 style="color: #333; margin: 0 0 10px 0;">¡Hola ${customerName}!</h2>
                  <p style="color: #666; line-height: 1.6; margin: 0;">
                    A continuación encontrarás tus entradas para:
                  </p>
                </td>
              </tr>
              
              <!-- Event Info -->
              <tr>
                <td style="padding: 0 30px 20px 30px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
                    <tr>
                      <td>
                        <h3 style="color: #333; margin: 0 0 10px 0;">${sessionInfo.showName || 'Espectáculo'}</h3>
                        <p style="color: #666; margin: 5px 0; font-size: 14px;">
                          ${sessionInfo.functionName ? `Función: ${sessionInfo.functionName}<br>` : ''}
                          📅 ${sessionInfo.date}<br>
                          🕐 ${sessionInfo.time}<br>
                          📍 ${sessionInfo.sala || 'Sala Principal'}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Tickets -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <h3 style="color: #333; margin: 0 0 15px 0;">Tus entradas:</h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
                    ${ticketRows}
                  </table>
                </td>
              </tr>
              
              <!-- Instructions -->
              <tr>
                <td style="padding: 0 30px 30px 30px;">
                  <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px;">
                    <strong style="color: #856404;">Instrucciones importantes:</strong>
                    <ul style="color: #856404; margin: 10px 0 0 0; padding-left: 20px;">
                      <li>Presentá el código QR en la entrada del teatro</li>
                      <li>Recordá llegar al menos 30 minutos antes, las funciones comienzan puntual</li>
                      <li>Podés mostrar este email o tus entradas desde tu perfil</li>
                      <li>Las entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo</li>
                    </ul>
                    <p style="color: #856404; margin: 15px 0 0 0; font-style: italic;">
                      ¡Nos vemos en el teatro!
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                  <p style="color: #999; margin: 0; font-size: 12px;">
                    Teatro Español Pigüé<br>
                    Este es un correo automático, por favor no responder.
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Send tickets by email
 */
export async function sendTicketsEmail({ to, tickets, sessionInfo, customerName }) {
  try {
    // Generate QR codes as base64
    const attachments = tickets.map(ticket => ({
      filename: `qr_${ticket.id}.png`,
      content: Buffer.from(ticket.qr_code.split(',')[1], 'base64'),
      cid: `qr_${ticket.id}` // Content ID for embedding
    }));

    const html = generateTicketEmailHTML(tickets, sessionInfo, customerName);

    const mailOptions = {
      from: process.env.TICKETS_EMAIL_FROM || process.env.EMAIL_FROM || `"Teatro Español Pigüé" <${process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER}>`,
      to,
      subject: `🎭 Tus entradas para ${sessionInfo.showName || 'el espectáculo'}`,
      html,
      attachments
    };

    const info = await createTransporter().sendMail(mailOptions);
    console.log('[EMAIL] Message sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] Error sending:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate PDF with tickets
 */
export async function generateTicketsPDF({ tickets, sessionInfo, customerName }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header
      doc.fontSize(24).fillColor('#667eea').text('🎭 Teatro Español', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).fillColor('#333').text('Tus Entradas', { align: 'center' });
      doc.moveDown(1);

      // Customer info
      doc.fontSize(12).fillColor('#666').text(`Hola ${customerName}!`, { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(
        `Te comparto tus entradas para ${sessionInfo.showName}${sessionInfo.functionName ? ` (${sessionInfo.functionName})` : ''} del día ${sessionInfo.date} a las ${sessionInfo.time}.`,
        { align: 'left' }
      );
      doc.fontSize(10).fillColor('#856404').text(
        'Recordá llegar al menos 30 minutos antes y mostrar el QR en el acceso.',
        { align: 'left' }
      );
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#666').text('¡Nos vemos!', { align: 'left', oblique: true });
      doc.moveDown(1.5);

      // Event details box
      doc.rect(50, doc.y, 495, 80).fillAndStroke('#f8f9fa', '#ddd');
      doc.fillColor('#333').fontSize(14).text(sessionInfo.showName || 'Espectáculo', 60, doc.y + 15);
      doc.fontSize(10).fillColor('#666');
      if (sessionInfo.functionName) doc.text(`Función: ${sessionInfo.functionName}`, 60, doc.y + 10);
      doc.text(`📅 ${sessionInfo.date}`, 60, doc.y + 10)
        .text(`🕐 ${sessionInfo.time}`, 60, doc.y + 5)
        .text(`📍 ${sessionInfo.sala || 'Sala Principal'}`, 60, doc.y + 5);
      
      doc.moveDown(3);

      // Tickets
      doc.fontSize(12).fillColor('#333').text('Tus entradas:', { underline: true });
      doc.moveDown(0.5);

      for (const ticket of tickets) {
        // Draw ticket box
        const startY = doc.y;
        doc.rect(50, startY, 495, 150).stroke('#ddd');
        
        // Ticket info
        doc.fontSize(11).fillColor('#333').text(ticket.location, 60, startY + 15, { width: 250 });
        doc.fontSize(9).fillColor('#666').text(ticket.section || 'Sector', 60, startY + 35);
        doc.fontSize(10).fillColor('#28a745').text(`$${Number(ticket.price).toLocaleString('es-AR')}`, 60, startY + 55);
        
        // QR Code
        try {
          const qrBase64 = ticket.qr_code.split(',')[1];
          const qrBuffer = Buffer.from(qrBase64, 'base64');
          doc.image(qrBuffer, 380, startY + 15, { width: 120, height: 120 });
        } catch (err) {
          console.error('[PDF] Error adding QR:', err);
        }
        
        doc.y = startY + 160;
        doc.moveDown(0.5);
      }

      // Footer
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#999').text(
        'Teatro Español - Pigüé',
        { align: 'center' }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Send single ticket by email
 */
export async function sendSingleTicketEmail({ to, ticket, sessionInfo, customerName }) {
  return sendTicketsEmail({ to, tickets: [ticket], sessionInfo, customerName });
}

/**
 * Send container QR by email
 */
export async function sendContainerQREmail({ to, containerQR, tickets, sessionInfo, customerName }) {
  try {
    const ticketsList = tickets.map(t => `<li style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>${t.location}</strong></li>`).join('');
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Entradas - Teatro Español Pigüé</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Teatro Español Pigüé</h1>
                    <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Te acercamos tus entradas</p>
                  </td>
                </tr>
                
                <!-- Welcome -->
                <tr>
                  <td style="padding: 30px;">
                    <h2 style="color: #333; margin: 0 0 10px 0;">¡Hola!</h2>
                  </td>
                </tr>
                
                <!-- Event Info -->
                <tr>
                  <td style="padding: 0 30px 20px 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
                      <tr>
                        <td>
                          <h3 style="color: #333; margin: 0 0 10px 0;">${sessionInfo.showName || 'Espectáculo'}</h3>
                          <p style="color: #666; margin: 5px 0; font-size: 14px;">
                            📅 ${sessionInfo.date}<br>
                            🕐 ${sessionInfo.time}<br>
                            📍 ${sessionInfo.sala || 'Sala Principal'}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Tickets List -->
                <tr>
                  <td style="padding: 0 30px 20px 30px;">
                    <h3 style="color: #333; margin: 0 0 15px 0;">Tus entradas:</h3>
                    <ul style="list-style: none; padding: 0; margin: 0; border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
                      ${ticketsList}
                    </ul>
                  </td>
                </tr>
                
                <!-- QR Container -->
                <tr>
                  <td style="padding: 0 30px 30px 30px; text-align: center;">
                    <img src="cid:container_qr" alt="QR Container" style="max-width: 300px; width: 100%; border: 4px solid #667eea; border-radius: 8px;">
                  </td>
                </tr>
                
                <!-- Instructions -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px;">
                      <strong style="color: #856404;">Instrucciones importantes:</strong>
                      <ul style="color: #856404; margin: 10px 0 0 0; padding-left: 20px;">
                        <li>Presentá este QR en la entrada del teatro</li>
                        <li>Se pueden validar entradas individuales</li>
                        <li>Recordá llegar al menos 30 minutos antes, las funciones comienzan puntual</li>
                        <li>Las entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo</li>
                      </ul>
                      <p style="color: #856404; margin: 15px 0 0 0; font-style: italic;">
                        ¡Nos vemos en el teatro!
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="color: #999; margin: 0; font-size: 12px;">
                      Teatro Español Pigüé<br>
                      Este es un correo automático, por favor no responder.
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
    
    const mailOptions = {
      from: process.env.TICKETS_EMAIL_FROM || process.env.EMAIL_FROM || `"Teatro Español Pigüé" <${process.env.TICKETS_EMAIL_USER || process.env.EMAIL_USER}>`,
      to,
      subject: `🎭 Tu QR para ${sessionInfo.showName || 'el espectáculo'}`,
      html,
      attachments: [{
        filename: 'qr_container.png',
        content: Buffer.from(containerQR.split(',')[1], 'base64'),
        cid: 'container_qr'
      }]
    };
    
    const info = await createTransporter().sendMail(mailOptions);
    console.log('[EMAIL] Container QR sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] Error sending container:', error);
    return { success: false, error: error.message };
  }
}

export default { sendTicketsEmail, sendSingleTicketEmail, sendContainerQREmail, generateTicketsPDF };
