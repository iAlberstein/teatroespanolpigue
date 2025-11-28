import express from 'express';
import { sequelize } from '../lib/sequelize.js';

const router = express.Router();

// HTML template for ticket sharing
function generateTicketHTML(ticket, sessionInfo, customerName) {
  const location = ticket.location || 'Entrada';
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu Entrada - Teatro Español Pigüé</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 32px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    h1 {
      color: #667eea;
      margin-bottom: 8px;
      font-size: 24px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 24px;
      font-size: 16px;
    }
    .event-info {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
      text-align: left;
    }
    .event-title {
      font-size: 20px;
      font-weight: 700;
      color: #333;
      margin-bottom: 12px;
    }
    .event-detail {
      color: #666;
      margin: 8px 0;
      font-size: 14px;
    }
    .location {
      font-size: 18px;
      font-weight: 600;
      color: #667eea;
      margin: 16px 0;
      padding: 12px;
      background: #f0f4ff;
      border-radius: 8px;
    }
    .qr-container {
      margin: 24px 0;
      padding: 20px;
      background: white;
      border: 3px solid #667eea;
      border-radius: 12px;
    }
    .qr-container img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }
    .instructions {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 16px;
      border-radius: 8px;
      text-align: left;
      margin-top: 24px;
    }
    .instructions strong {
      color: #856404;
      display: block;
      margin-bottom: 8px;
    }
    .instructions ul {
      color: #856404;
      margin-left: 20px;
    }
    .instructions li {
      margin: 6px 0;
    }
    .footer {
      margin-top: 24px;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎭 Teatro Español Pigüé</h1>
    <p class="subtitle">Tu Entrada</p>
    
    <div class="event-info">
      <div class="event-title">${sessionInfo.showName}</div>
      <div class="event-detail">📅 ${sessionInfo.date}</div>
      <div class="event-detail">🕐 ${sessionInfo.time}</div>
      <div class="event-detail">📍 ${sessionInfo.sala || 'Sala Principal'}</div>
    </div>
    
    <div class="location">${location}</div>
    
    <div class="qr-container">
      <img src="${ticket.qr_code}" alt="QR Code" />
    </div>
    
    <div class="instructions">
      <strong>Instrucciones:</strong>
      <ul>
        <li>Presentá este QR en la entrada del teatro</li>
        <li>Recordá llegar al menos 30 minutos antes</li>
        <li>Guardá esta página o hacé una captura</li>
      </ul>
      <p style="margin-top: 12px; font-style: italic;">¡Nos vemos en el teatro!</p>
    </div>
    
    <div class="footer">
      Teatro Español Pigüé
    </div>
  </div>
</body>
</html>
  `;
}

// HTML template for container QR sharing
function generateContainerHTML(sale, tickets, sessionInfo, options = {}) {
  const mode = options.mode || 'view';
  const isPrint = mode === 'print';
  const ticketsList = tickets.map(t => `<li>${t.location}</li>`).join('');

  const bodyBackground = isPrint ? '#ffffff' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  const bodyPadding = isPrint ? '12px' : '20px';
  const alignItems = isPrint ? 'flex-start' : 'center';
  const containerWidth = isPrint ? '68mm' : '500px';
  const containerPadding = isPrint ? '18px 16px' : '32px';
  const containerShadow = isPrint ? 'none' : '0 20px 60px rgba(0,0,0,0.3)';
  const containerBorder = isPrint ? '1px solid #e5e7eb' : 'none';
  const titleColor = isPrint ? '#1f2937' : '#667eea';
  const subtitleColor = isPrint ? '#374151' : '#666';
  const qrBorder = isPrint ? '2px solid #667eea' : '3px solid #667eea';
  const instructionBg = isPrint ? '#fef3c7' : '#fff3cd';
  const instructionBorder = isPrint ? '1px solid #fbbf24' : 'none';
  const fontScale = isPrint ? 0.92 : 1;

  const printStyles = isPrint ? `
    @media print {
      @page {
        size: 70mm auto;
        margin: 0;
      }
      body {
        background: #ffffff !important;
        padding: 4mm !important;
        align-items: flex-start !important;
      }
      .container {
        width: 62mm !important;
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
      }
      .instructions {
        border-left: 3px solid #f59e0b !important;
      }
    }
  ` : '';

  const printScript = isPrint ? `
    <script>
      window.addEventListener('load', () => {
        setTimeout(() => {
          window.print();
          setTimeout(() => window.close(), 1200);
        }, 150);
      });
    </script>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tus Entradas - Teatro Español Pigüé</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${bodyBackground};
      min-height: 100vh;
      display: flex;
      align-items: ${alignItems};
      justify-content: center;
      padding: ${bodyPadding};
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: ${containerPadding};
      max-width: ${containerWidth};
      width: 100%;
      box-shadow: ${containerShadow};
      border: ${containerBorder};
      text-align: center;
    }
    h1 {
      color: ${titleColor};
      margin-bottom: 8px;
      font-size: ${24 * fontScale}px;
    }
    .subtitle {
      color: ${subtitleColor};
      margin-bottom: 20px;
      font-size: ${15 * fontScale}px;
    }
    .event-info {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      text-align: left;
      font-size: ${13 * fontScale}px;
    }
    .event-title {
      font-size: ${18 * fontScale}px;
      font-weight: 700;
      color: #333;
      margin-bottom: 10px;
    }
    .event-detail {
      color: #666;
      margin: 6px 0;
      font-size: ${12 * fontScale}px;
    }
    .tickets-list {
      background: #f8f9fa;
      border-radius: 10px;
      padding: 16px;
      margin: 14px 0;
      text-align: left;
      font-size: ${12 * fontScale}px;
    }
    .tickets-list h3 {
      color: #333;
      font-size: ${14 * fontScale}px;
      margin-bottom: 10px;
    }
    .tickets-list ul {
      list-style: none;
      padding: 0;
      display: grid;
      gap: ${6 * fontScale}px;
    }
    .tickets-list li {
      color: #374151;
      padding-bottom: 6px;
      border-bottom: 1px solid #e0e0e0;
      font-weight: 500;
    }
    .tickets-list li:last-child {
      border-bottom: none;
    }
    .qr-container {
      margin: 20px 0;
      padding: 18px;
      background: white;
      border: ${qrBorder};
      border-radius: 12px;
    }
    .qr-container img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }
    .instructions {
      background: ${instructionBg};
      border-left: 4px solid #f59e0b;
      border-radius: 10px;
      border: ${instructionBorder};
      padding: 16px;
      text-align: left;
      margin-top: 20px;
      font-size: ${12 * fontScale}px;
    }
    .instructions strong {
      color: #92400e;
      display: block;
      margin-bottom: 6px;
    }
    .instructions p {
      color: #92400e;
      margin: 4px 0;
      font-size: ${12 * fontScale}px;
    }
    .footer {
      margin-top: 18px;
      color: #9ca3af;
      font-size: ${10 * fontScale}px;
    }
    ${printStyles}
  </style>
</head>
<body>
  <div class="container">
    <h1>🎭 Teatro Español Pigüé</h1>
    <p class="subtitle">QR General de Entradas</p>
    
    <div class="event-info">
      <div class="event-title">${sessionInfo.showName}</div>
      <div class="event-detail">📅 ${sessionInfo.date}</div>
      <div class="event-detail">🕐 ${sessionInfo.time}</div>
      <div class="event-detail">📍 ${sessionInfo.sala || 'Sala Principal'}</div>
    </div>
    
    <div class="tickets-list">
      <h3>Tus entradas:</h3>
      <ul>
        ${ticketsList}
      </ul>
    </div>
    
    <div class="qr-container">
      <img src="${sale.container_qr_code}" alt="QR Code" />
    </div>
    
    <div class="instructions">
      <strong>Instrucciones:</strong>
      <p>• Presentá este QR en la entrada del teatro</p>
      <p>• Se pueden validar entradas individuales</p>
      <p>• Recordá llegar al menos 30 minutos antes</p>
      <p style="margin-top: 10px; font-style: italic;">¡Nos vemos en el teatro!</p>
    </div>
    
    <div class="footer">
      Teatro Español Pigüé
    </div>
  </div>
  ${printScript}
</body>
</html>
  `;
}

// Get ticket HTML page
router.get('/ticket/:ticket_id', async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { tickets: Ticket, sessions: Session, shows: Show, sales: Sale } = sequelize.models;
    
    const ticket = await Ticket.findByPk(ticket_id, {
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        },
        {
          model: Sale,
          as: 'sale'
        }
      ]
    });
    
    if (!ticket) return res.status(404).send('<h1>Entrada no encontrada</h1>');
    
    const session = ticket.session;
    if (!session) return res.status(404).send('<h1>Sesión no encontrada</h1>');
    
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const ticketData = {
      id: ticket.id,
      location: formatSeatLocation(ticket.type, ticket.section, ticket.seat_code, ticket.capacity || 1),
      qr_code: ticket.qr_code
    };
    
    const sessionInfo = {
      showName: session.show?.title || 'Espectáculo',
      date: new Date(session.starts_at).toLocaleDateString('es-AR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: new Date(session.starts_at).toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      sala: session.sala || 'Sala Principal'
    };
    
    const customerName = ticket.sale?.customer_name || 'Cliente';
    
    const html = generateTicketHTML(ticketData, sessionInfo, customerName);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[SHARE] Error generating ticket HTML:', e);
    res.status(500).send('<h1>Error al cargar la entrada</h1>');
  }
});

// Get container QR HTML page
router.get('/sale/:sale_id', async (req, res) => {
  try {
    const { sale_id } = req.params;
    const { sales: Sale, tickets: Ticket, sessions: Session, shows: Show } = sequelize.models;
    
    const sale = await Sale.findByPk(sale_id, {
      include: [
        {
          model: Session,
          as: 'session',
          include: [{ model: Show, as: 'show' }]
        }
      ]
    });
    
    if (!sale) return res.status(404).send('<h1>Compra no encontrada</h1>');
    if (!sale.container_qr_code) return res.status(404).send('<h1>QR no disponible</h1>');
    
    const tickets = await Ticket.findAll({ where: { sale_id } });
    const session = sale.session;
    if (!session) return res.status(404).send('<h1>Sesión no encontrada</h1>');
    
    const { formatSeatLocation, sortTicketsBySection } = await import('../lib/seatFormatter.js');
    
    // Ordenar tickets antes de formatear
    const sortedTickets = sortTicketsBySection(tickets.map(t => t.get ? t.get({ plain: true }) : t));
    
    const formattedTickets = sortedTickets.map(t => ({
      id: t.id,
      location: formatSeatLocation(t.type, t.section, t.seat_code, t.capacity || 1)
    }));
    
    const sessionInfo = {
      showName: session.show?.title || 'Espectáculo',
      date: new Date(session.starts_at).toLocaleDateString('es-AR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: new Date(session.starts_at).toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      sala: session.sala || 'Sala Principal'
    };
    
    const mode = req.query.mode === 'print' ? 'print' : 'view';
    const html = generateContainerHTML(sale, formattedTickets, sessionInfo, { mode });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[SHARE] Error generating sale HTML:', e);
    res.status(500).send('<h1>Error al cargar las entradas</h1>');
  }
});

export default router;
