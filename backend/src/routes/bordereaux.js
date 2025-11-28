import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken } from '../middleware/auth.js';
import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';

const router = express.Router();

/**
 * Función auxiliar para calcular las personas reales según el tipo de ticket
 */
function calculateRealPeople(tickets) {
  return tickets.reduce((sum, ticket) => {
    if (ticket.type === 'palco') {
      if (ticket.seat_code?.startsWith('PB')) return sum + 4; // Palco bajo
      if (ticket.seat_code?.startsWith('PA')) return sum + 2; // Palco alto
    } else if (ticket.type === 'pullman') {
      return sum + (ticket.capacity || 1);
    }
    return sum + 1; // Butaca
  }, 0);
}

/**
 * GET /api/bordereaux/show/:show_id
 * Obtener o generar bordereaux para un show
 */
router.get('/show/:show_id', authenticateToken, async (req, res) => {
  try {
    const { show_id } = req.params;
    const { bordereaux: Bordereaux, shows: Show, sessions: Session, tickets: Ticket, sales: Sale } = sequelize.models;
    
    if (!Bordereaux) {
      console.error('[BORDEREAUX] ERROR: Bordereaux model not found in sequelize.models');
      return res.status(500).json({ error: 'Bordereaux model not loaded' });
    }
    
    // Buscar si ya existe un bordereaux para este show
    let bordereaux = await Bordereaux.findOne({
      where: { show_id },
      include: [{
        model: Show,
        as: 'show'
      }]
    });
    
    // Si no existe, crear uno nuevo
    if (!bordereaux) {
      bordereaux = await Bordereaux.create({
        show_id,
        status: 'provisional'
      });
      
      // Recargar con asociaciones
      bordereaux = await Bordereaux.findByPk(bordereaux.id, {
        include: [{
          model: Show,
          as: 'show'
        }]
      });
    }
    
    // Obtener datos del show con todas sus sesiones y ventas
    const show = await Show.findByPk(show_id, {
      include: [{
        model: Session,
        as: 'sessions',
        include: [
          {
            model: Ticket,
            as: 'tickets',
            where: { status: { [Op.in]: ['sold', 'validated'] } },
            required: false
          },
          {
            model: Sale,
            as: 'sales',
            required: false,
            include: [
              {
                model: Ticket,
                as: 'tickets',
                required: false
              },
              {
                model: sequelize.models.discounts,
                as: 'discount',
                required: false
              }
            ]
          }
        ]
      }]
    });
    
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    // Agrupar ventas por ubicación, precio y canal (online/boletería)
    const salesByLocationPriceChannel = {};
    let totalCortesias = 0;
    let totalCortesiasAmount = 0;
    let totalOnline = 0;
    let totalBoleteria = 0;
    
    for (const session of show.sessions) {
      const sessionSales = session.sales || [];
      
      for (const sale of sessionSales) {
        const saleTickets = sale.tickets || [];
        if (saleTickets.length === 0) continue;
        
        // Una venta es ONLINE si el método de pago es MP (Mercado Pago)
        // Una venta es BOLETERÍA si fue vendida por sold_by con cualquier otro método
        const isOnline = sale.payment_method === 'mp';
        const channel = isOnline ? 'online' : 'boleteria';
        
        // Obtener código de descuento si existe
        const discountCode = sale.discount?.code || null;
        const discount = sale.discount || null;
        
        // Calcular subtotal original de los tickets de esta venta
        let saleSubtotal = 0;
        const ticketsWithPrices = [];
        
        for (const ticket of saleTickets) {
          let price = parseFloat(ticket.price || 0);
          const location = ticket.section || ticket.type || 'Sin ubicación';
          
          // Fallback: Si el ticket tiene precio 0, buscar en pricing_json del show
          if (price === 0 && show.pricing_json) {
            const pricingKey = ticket.section || ticket.type;
            if (pricingKey && show.pricing_json[pricingKey]) {
              price = parseFloat(show.pricing_json[pricingKey]);
            }
          }
          
          // Identificar cortesías (precio 0)
          if (price === 0) {
            totalCortesias++;
            continue;
          }
          
          saleSubtotal += price;
          ticketsWithPrices.push({ ticket, price, location });
        }
        
        // Calcular precio efectivo por ticket considerando descuento
        let discountMultiplier = 1.0;
        if (discount && saleSubtotal > 0) {
          if (discount.type === 'percentage') {
            discountMultiplier = 1 - (discount.value / 100);
          } else if (discount.type === 'fixed') {
            const discountAmount = Math.min(discount.value, saleSubtotal);
            discountMultiplier = (saleSubtotal - discountAmount) / saleSubtotal;
          }
        }
        
        // Procesar cada ticket con su precio efectivo
        for (const { ticket, price, location } of ticketsWithPrices) {
          const effectivePrice = price * discountMultiplier;
          
          // Incluir discount code en la clave para separar entradas con promo
          // Usar precio efectivo como parte de la clave para que se agrupe correctamente
          const key = `${location}|${effectivePrice.toFixed(2)}|${channel}|${discountCode || 'none'}`;
          
          if (!salesByLocationPriceChannel[key]) {
            salesByLocationPriceChannel[key] = {
              location,
              price: effectivePrice, // Usar precio efectivo con descuento
              channel,
              discountCode,
              quantity: 0,
              people: 0,
              total: 0
            };
          }
          
          salesByLocationPriceChannel[key].quantity++;
          salesByLocationPriceChannel[key].people += (ticket.type === 'palco' ?
            (ticket.seat_code?.startsWith('PB') ? 4 : 2) :
            (ticket.type === 'pullman' ? (ticket.capacity || 1) : 1)
          );
          salesByLocationPriceChannel[key].total += effectivePrice;
          
          if (isOnline) {
            totalOnline += effectivePrice;
          } else {
            totalBoleteria += effectivePrice;
          }
        }
      }
    }
    
    // Mapear nombres de ubicaciones a formato legible
    const locationNameMap = {
      'palco': 'Palco',
      'palcos_bajos': 'Palcos Bajos',
      'palcos_altos': 'Palcos Altos',
      'butaca': 'Platea General',
      'platea_general': 'Platea General',
      'pullman': 'Pullman'
    };
    
    // Convertir a arrays separados por canal con nombres legibles
    const onlineSales = [];
    const boleteriaSales = [];
    
    Object.values(salesByLocationPriceChannel).forEach(item => {
      // Convertir el nombre de la ubicación a formato legible
      let readableLocation = locationNameMap[item.location] || item.location;
      
      // Agregar código de descuento si existe
      if (item.discountCode) {
        readableLocation = `${readableLocation} (PROMO ${item.discountCode})`;
      }
      
      const itemWithReadableName = { ...item, location: readableLocation };
      
      if (item.channel === 'online') {
        onlineSales.push(itemWithReadableName);
      } else {
        boleteriaSales.push(itemWithReadableName);
      }
    });
    
    // Ordenar por ubicación
    const sortByLocation = (a, b) => a.location.localeCompare(b.location);
    onlineSales.sort(sortByLocation);
    boleteriaSales.sort(sortByLocation);
    
    // Calcular totales
    const totalBruto = totalOnline + totalBoleteria;
    const totalTickets = Object.values(salesByLocationPriceChannel).reduce((sum, item) => sum + item.quantity, 0) + totalCortesias;
    
    // Calcular NETO 1 (después de deducciones A)
    const deductionsA = bordereaux.deductions_a || [];
    let totalDeductionsA = 0;
    const deductionsACalculated = deductionsA.map(ded => {
      const amount = (totalBruto * (ded.percentage / 100));
      totalDeductionsA += amount;
      return {
        ...ded,
        amount: amount.toFixed(2)
      };
    });
    
    const neto1 = totalBruto - totalDeductionsA;
    
    // Calcular distribución por contrato
    const theaterAmount = neto1 * (bordereaux.contract_theater_percentage / 100);
    const userAmount = neto1 * (bordereaux.contract_user_percentage / 100);
    
    // Calcular deducciones B
    const deductionsB = bordereaux.deductions_b || [];
    const totalDeductionsB = deductionsB.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    // Liquidación final
    const userCashAmount = totalBoleteria - theaterAmount - totalDeductionsB;
    const userTransferAmount = totalOnline;
    
    const response = {
      bordereaux: {
        id: bordereaux.id,
        status: bordereaux.status,
        closed_at: bordereaux.closed_at,
        closed_by: bordereaux.closed_by
      },
      show: {
        id: show.id,
        title: show.title,
        description: show.description
      },
      sales: {
        cortesias: {
          quantity: totalCortesias,
          amount: totalCortesiasAmount.toFixed(2)
        },
        online: onlineSales,
        boleteria: boleteriaSales,
        totals: {
          tickets: totalTickets,
          amount: totalBruto.toFixed(2),
          onlineAmount: totalOnline.toFixed(2),
          boleteriaAmount: totalBoleteria.toFixed(2),
          onlineTickets: onlineSales.reduce((sum, s) => sum + s.quantity, 0),
          boleteriaTickets: boleteriaSales.reduce((sum, s) => sum + s.quantity, 0)
        }
      },
      recaudacion: {
        efectivo: totalBoleteria.toFixed(2),
        online: totalOnline.toFixed(2),
        bruto: totalBruto.toFixed(2)
      },
      deductions_a: {
        items: deductionsACalculated,
        total: totalDeductionsA.toFixed(2),
        neto1: neto1.toFixed(2)
      },
      contract: {
        theater_percentage: bordereaux.contract_theater_percentage,
        user_percentage: bordereaux.contract_user_percentage,
        theater_amount: theaterAmount.toFixed(2),
        user_amount: userAmount.toFixed(2)
      },
      deductions_b: {
        items: deductionsB,
        total: totalDeductionsB.toFixed(2)
      },
      liquidacion: {
        user_cash: userCashAmount.toFixed(2),
        user_transfer: userTransferAmount.toFixed(2),
        user_total: (userCashAmount + userTransferAmount).toFixed(2)
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('[BORDEREAUX] Error generating show report:', error);
    console.error('[BORDEREAUX] Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * PUT /api/bordereaux/:id
 * Actualizar configuración del bordereaux (solo admin)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { deductions_a, contract_theater_percentage, contract_user_percentage, deductions_b, notes } = req.body;
    const { bordereaux: Bordereaux } = sequelize.models;
    
    // Verificar que el usuario es admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update bordereaux' });
    }
    
    const bordereaux = await Bordereaux.findByPk(id);
    
    if (!bordereaux) {
      return res.status(404).json({ error: 'Bordereaux not found' });
    }
    
    // No permitir editar si ya está cerrado
    if (bordereaux.status === 'cerrado') {
      return res.status(400).json({ error: 'Cannot update a closed bordereaux' });
    }
    
    // Actualizar campos
    const updates = {};
    if (deductions_a !== undefined) updates.deductions_a = deductions_a;
    if (contract_theater_percentage !== undefined) updates.contract_theater_percentage = contract_theater_percentage;
    if (contract_user_percentage !== undefined) updates.contract_user_percentage = contract_user_percentage;
    if (deductions_b !== undefined) updates.deductions_b = deductions_b;
    if (notes !== undefined) updates.notes = notes;
    
    await bordereaux.update(updates);
    
    res.json({ success: true, bordereaux });
    
  } catch (error) {
    console.error('[BORDEREAUX] Error updating bordereaux:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/bordereaux/:id/close
 * Cerrar el bordereaux (solo admin)
 */
router.post('/:id/close', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { bordereaux: Bordereaux } = sequelize.models;
    
    // Verificar que el usuario es admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can close bordereaux' });
    }
    
    const bordereaux = await Bordereaux.findByPk(id);
    
    if (!bordereaux) {
      return res.status(404).json({ error: 'Bordereaux not found' });
    }
    
    // Verificar que no esté ya cerrado
    if (bordereaux.status === 'cerrado') {
      return res.status(400).json({ error: 'Bordereaux is already closed' });
    }
    
    // Cerrar bordereaux
    await bordereaux.update({
      status: 'cerrado',
      closed_at: new Date(),
      closed_by: req.user.userId
    });
    
    res.json({ success: true, bordereaux });
    
  } catch (error) {
    console.error('[BORDEREAUX] Error closing bordereaux:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/bordereaux/show/:show_id/pdf
 * Generate PDF bordereaux for a show
 */
router.get('/show/:show_id/pdf', authenticateToken, async (req, res) => {
  try {
    const { show_id } = req.params;
    const { shows: Show, sessions: Session, tickets: Ticket, sales: Sale, discounts: Discount } = sequelize.models;
    
    // Get show info
    const show = await Show.findByPk(show_id);
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    // Get sessions with sales and tickets
    const sessions = await Session.findAll({
      where: { show_id },
      include: [
        {
          model: Sale,
          as: 'sales',
          include: [
            { model: Discount, as: 'discount' },
            { model: Ticket, as: 'tickets' }
          ]
        }
      ],
      order: [['starts_at', 'ASC']]
    });
    
    // Aggregate data by location, channel, and discount
    const salesByLocationPriceChannel = {};
    let totalQuantity = 0;
    let totalPeople = 0;
    let totalAmount = 0;
    
    for (const session of sessions) {
      for (const sale of session.sales) {
        const saleTickets = sale.tickets || [];
        const channel = sale.payment_method === 'mp' ? 'Online' : 'Boletería';
        const discountCode = sale.discount?.code || null;
        
        for (const ticket of saleTickets) {
          const location = ticket.section || 'Sin sección';
          const price = parseFloat(ticket.price || 0);
          
          // Calculate effective price (with discount)
          let effectivePrice = price;
          if (sale.discount) {
            if (sale.discount.type === 'percentage') {
              effectivePrice = price * (1 - sale.discount.value / 100);
            } else if (sale.discount.type === 'fixed') {
              effectivePrice = Math.max(0, price - sale.discount.value);
            }
          }
          
          const key = `${location}|${effectivePrice.toFixed(2)}|${channel}|${discountCode || 'none'}`;
          
          if (!salesByLocationPriceChannel[key]) {
            salesByLocationPriceChannel[key] = {
              location,
              price: effectivePrice,
              channel,
              discountCode,
              quantity: 0,
              people: 0,
              total: 0
            };
          }
          
          salesByLocationPriceChannel[key].quantity += 1;
          
          if (ticket.type === 'palco') {
            const palcoPeople = ticket.seat_code?.startsWith('PB') ? 4 : 2;
            salesByLocationPriceChannel[key].people += palcoPeople;
          } else if (ticket.type === 'pullman') {
            salesByLocationPriceChannel[key].people += ticket.capacity || 1;
          } else {
            salesByLocationPriceChannel[key].people += 1;
          }
          
          salesByLocationPriceChannel[key].total += effectivePrice;
        }
        
        totalQuantity += saleTickets.length;
        totalPeople += calculateRealPeople(saleTickets);
        totalAmount += parseFloat(sale.total_amount || 0);
      }
    }
    
    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bordereaux_${show.title.replace(/\s/g, '_')}.pdf"`);
    
    doc.pipe(res);
    
    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('BORDEREAUX', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(show.title, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Generado: ${new Date().toLocaleString('es-AR')}`, { align: 'center' });
    doc.moveDown(1.5);
    
    // Table header
    const tableTop = doc.y;
    const colWidths = { location: 120, price: 80, cant: 50, people: 50, total: 80, channel: 80 };
    const startX = 50;
    
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('UBICACIÓN', startX, tableTop, { width: colWidths.location });
    doc.text('VALOR', startX + colWidths.location, tableTop, { width: colWidths.price, align: 'right' });
    doc.text('CANT', startX + colWidths.location + colWidths.price, tableTop, { width: colWidths.cant, align: 'right' });
    doc.text('PERS', startX + colWidths.location + colWidths.price + colWidths.cant, tableTop, { width: colWidths.people, align: 'right' });
    doc.text('TOTAL', startX + colWidths.location + colWidths.price + colWidths.cant + colWidths.people, tableTop, { width: colWidths.total, align: 'right' });
    doc.text('CANAL', startX + colWidths.location + colWidths.price + colWidths.cant + colWidths.people + colWidths.total, tableTop, { width: colWidths.channel });
    
    // Line under header
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(startX + 480, doc.y).stroke();
    doc.moveDown(0.5);
    
    // Table rows
    doc.font('Helvetica').fontSize(8);
    
    const sortedData = Object.values(salesByLocationPriceChannel).sort((a, b) => {
      if (a.channel !== b.channel) return a.channel.localeCompare(b.channel);
      return a.location.localeCompare(b.location);
    });
    
    for (const item of sortedData) {
      const y = doc.y;
      
      // Check if we need a new page
      if (y > 700) {
        doc.addPage();
      }
      
      const locationName = item.discountCode ? `${item.location} (${item.discountCode})` : item.location;
      
      doc.text(locationName, startX, y, { width: colWidths.location });
      doc.text(`$${item.price.toFixed(2)}`, startX + colWidths.location, y, { width: colWidths.price, align: 'right' });
      doc.text(item.quantity.toString(), startX + colWidths.location + colWidths.price, y, { width: colWidths.cant, align: 'right' });
      doc.text(item.people.toString(), startX + colWidths.location + colWidths.price + colWidths.cant, y, { width: colWidths.people, align: 'right' });
      doc.text(`$${item.total.toFixed(2)}`, startX + colWidths.location + colWidths.price + colWidths.cant + colWidths.people, y, { width: colWidths.total, align: 'right' });
      doc.text(item.channel, startX + colWidths.location + colWidths.price + colWidths.cant + colWidths.people + colWidths.total, y, { width: colWidths.channel });
      
      doc.moveDown(0.7);
    }
    
    // Totals
    doc.moveDown(0.5);
    doc.moveTo(startX, doc.y).lineTo(startX + 480, doc.y).stroke();
    doc.moveDown(0.5);
    
    doc.fontSize(10).font('Helvetica-Bold');
    const totalsY = doc.y;
    doc.text('TOTALES:', startX, totalsY);
    doc.text(totalQuantity.toString(), startX + colWidths.location + colWidths.price, totalsY, { width: colWidths.cant, align: 'right' });
    doc.text(totalPeople.toString(), startX + colWidths.location + colWidths.price + colWidths.cant, totalsY, { width: colWidths.people, align: 'right' });
    doc.text(`$${totalAmount.toFixed(2)}`, startX + colWidths.location + colWidths.price + colWidths.cant + colWidths.people, totalsY, { width: colWidths.total, align: 'right' });
    
    // Footer
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').text(`Teatro Español Pigue - ${new Date().getFullYear()}`, { align: 'center' });
    
    doc.end();
    
  } catch (error) {
    console.error('[BORDEREAUX] Error generating PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
