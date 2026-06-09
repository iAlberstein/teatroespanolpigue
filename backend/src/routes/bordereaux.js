import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken } from '../middleware/auth.js';
import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';
import { generateBordereauxPDF, calculatePDFHeight } from './bordereaux-pdf.js';

const router = express.Router();

// Helper: Get service fee percentage from settings
async function getServiceFeePercent() {
  try {
    const { system_settings: SystemSettings } = sequelize.models;
    if (!SystemSettings) return 10;
    const setting = await SystemSettings.findOne({ where: { key: 'service_fee_percent' } });
    return setting ? parseFloat(setting.value) : 10;
  } catch (err) {
    return 10;
  }
}

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
    const { bordereaux: Bordereaux, shows: Show, sessions: Session, tickets: Ticket, sales: Sale, seat_pricing: SeatPricing } = sequelize.models;
    
    // Get service fee for mp total_amount calculation
    const serviceFeePercent = await getServiceFeePercent();
    const serviceFeeDivisor = 1 + (serviceFeePercent / 100);
    
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
    
    // Obtener datos del show con todas sus sesiones, ventas y servicios
    const show = await Show.findByPk(show_id, {
      include: [{
        model: Session,
        as: 'sessions',
        include: [
          {
            model: Ticket,
            as: 'tickets',
            where: { status: { [Op.in]: ['sold', 'validated'] } },
            required: false,
            separate: true
          },
          {
            model: Sale,
            as: 'sales',
            required: false,
            separate: true,
            include: [
              {
                model: Ticket,
                as: 'tickets',
                required: false,
                separate: true
              },
              {
                model: sequelize.models.discounts,
                as: 'discount',
                required: false
              }
            ]
          }
        ]
      },
      {
        model: sequelize.models.show_services,
        as: 'services',
        required: false
      }]
    });
    
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    // Cargar reglas de precios especiales del show y sus sesiones
    let seatPricingRules = [];
    if (SeatPricing) {
      const sessionIds = show.sessions.map(s => s.id);
      seatPricingRules = await SeatPricing.findAll({
        where: {
          [Op.or]: [
            { show_id: show_id },
            { session_id: { [Op.in]: sessionIds } }
          ]
        }
      });
    }
    
    // Agrupar ventas por ubicación, precio y canal (online/boletería)
    const salesByLocationPriceChannel = {};
    let totalCortesias = 0;
    let totalCortesiasAmount = 0;
    let totalOnline = 0;
    let totalBoleteria = 0;

    // Crear mapa de servicios con include_in_bordereaux
    const serviceMap = {};
    if (show.services && Array.isArray(show.services)) {
      show.services.forEach(svc => {
        serviceMap[svc.name] = svc.include_in_bordereaux === true || svc.include_in_bordereaux === 1;
      });
    }
    
    for (const session of show.sessions) {
      const sessionSales = session.sales || [];
      
      for (const sale of sessionSales) {
        const saleTickets = sale.tickets || [];
        if (saleTickets.length === 0) continue;
        
        // Una venta es ONLINE si el método de pago es MP o card (SiPago)
        // Una venta es BOLETERÍA si fue vendida por sold_by con cualquier otro método
        const isOnline = (sale.payment_method === 'mp' || sale.payment_method === 'card');
        const channel = isOnline ? 'online' : 'boleteria';
        
        // Obtener código de descuento si existe
        const discountCode = sale.discount?.alias || sale.discount?.code || null;
        const discount = sale.discount || null;
        
        // Calcular subtotal original de los tickets de esta venta
        let saleSubtotal = 0;
        const ticketsWithPrices = [];
        
        for (const ticket of saleTickets) {
          // Skip service tickets — they're counted separately via sale.service_items
          if (ticket.type === 'service') continue;
          
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
        // Derivar el descuento real desde total_amount (lo que realmente se pagó)
        let discountMultiplier = 1.0;
        if (saleSubtotal > 0) {
          const saleTotalAmount = parseFloat(sale.total_amount || 0);
          // Solo mp incluye service charge en total_amount
          const netPaid = sale.payment_method === 'mp' ? saleTotalAmount / serviceFeeDivisor : saleTotalAmount;
          if (netPaid === 0) {
            // Cortesía: total_amount=0 con tickets de precio > 0 → descuento 100%
            discountMultiplier = 0;
          } else if (netPaid < saleSubtotal * 0.995) {
            // Descuento parcial (ej: 3x2)
            discountMultiplier = netPaid / saleSubtotal;
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
    
    // -------------------------------------------------------
    // SERVICIOS ASOCIADOS: agregar ventas de servicios al bordereaux
    // -------------------------------------------------------    // Servicios asociados a ventas - separados en regulares y bordereaux
    const servicesByNameChannel = {};
    const bordereauxServicesByNameChannel = {};
    for (const session of show.sessions) {
      const sessionSales = session.sales || [];
      for (const sale of sessionSales) {
        if (!sale.service_items) continue;
        let saleServiceItems = sale.service_items;
        if (typeof saleServiceItems === 'string') {
          try {
            saleServiceItems = JSON.parse(saleServiceItems);
            // Si el parse devuelve un string (problema de Sequelize), parsear de nuevo
            if (typeof saleServiceItems === 'string') {
              saleServiceItems = JSON.parse(saleServiceItems);
            }
          } catch { continue; }
        }
        // Forzar que sea un array
        if (!Array.isArray(saleServiceItems)) {
          saleServiceItems = [];
        }
        if (saleServiceItems.length === 0) continue;

        const isOnline = (sale.payment_method === 'mp' || sale.payment_method === 'card');
        const channel = isOnline ? 'online' : 'boleteria';

        for (const si of saleServiceItems) {
          const qty = Number(si.quantity || 1);
          const price = Number(si.price || 0);
          const name = si.name || 'Servicio';
          const key = `${name}|${price.toFixed(2)}|${channel}`;

          // Verificar si el servicio debe incluirse en bordereaux
          const includeInBordereaux = serviceMap[name] === true;

          const targetMap = includeInBordereaux ? bordereauxServicesByNameChannel : servicesByNameChannel;

          if (!targetMap[key]) {
            targetMap[key] = { name, price, channel, quantity: 0, total: 0 };
          }
          targetMap[key].quantity += qty;
          targetMap[key].total += qty * price;

          // NO sumar servicios al totalBruto (se agregan debajo de deducciones A)
          // if (isOnline) {
          //   totalOnline += qty * price;
          // } else {
          //   totalBoleteria += qty * price;
          // }
        }
      }
    }

    const onlineServices = Object.values(bordereauxServicesByNameChannel).filter(s => s.channel === 'online');
    const boleteriaServices = Object.values(bordereauxServicesByNameChannel).filter(s => s.channel === 'boleteria');
    const onlineBordereauxServices = Object.values(bordereauxServicesByNameChannel).filter(s => s.channel === 'online');
    const boleteriaBordereauxServices = Object.values(bordereauxServicesByNameChannel).filter(s => s.channel === 'boleteria');

    // -------------------------------------------------------
    // CONSOLIDADO POR SECTOR: totales de cada sector (todas las sesiones, todos los canales)
    // -------------------------------------------------------
    // Helper: Find matching seat pricing rule for a location and price
    function findSpecialPricingRule(location, price) {
      const priceNum = parseFloat(price);
      
      // Determine if this is platea or palcos
      const isPlatea = location === 'butaca' || location === 'platea_general';
      const isPalcoBajo = location === 'palcos_bajos';
      const isPalcoAlto = location === 'palcos_altos';
      
      for (const rule of seatPricingRules) {
        const rulePrice = parseFloat(rule.price);
        
        // Check if price matches
        if (Math.abs(rulePrice - priceNum) > 0.01) continue;
        
        // Check if location type matches
        if (isPlatea && rule.row_from && rule.row_to) {
          return {
            isSpecial: true,
            label: `Filas ${rule.row_from} a ${rule.row_to}`,
            rowFrom: rule.row_from,
            rowTo: rule.row_to,
            type: 'platea_range'
          };
        }
        
        if (isPalcoBajo && rule.palco_from !== null && rule.palco_to !== null && !rule.is_palco_alto) {
          return {
            isSpecial: true,
            label: `PB ${rule.palco_from} a ${rule.palco_to}`,
            palcoFrom: rule.palco_from,
            palcoTo: rule.palco_to,
            type: 'palco_bajo_range'
          };
        }
        
        if (isPalcoAlto && rule.palco_from !== null && rule.palco_to !== null && rule.is_palco_alto) {
          return {
            isSpecial: true,
            label: `PA ${rule.palco_from} a ${rule.palco_to}`,
            palcoFrom: rule.palco_from,
            palcoTo: rule.palco_to,
            type: 'palco_alto_range'
          };
        }
      }
      
      return null;
    }
    
    // Consolidado: agrupa online+boletería pero mantiene precio y descuento separados
    const sectorTotals = {};
    Object.values(salesByLocationPriceChannel).forEach(item => {
      const sectorKey = `${item.location}|${item.price.toFixed(2)}|${item.discountCode || 'none'}`;
      if (!sectorTotals[sectorKey]) {
        // Check for special pricing
        const specialPricing = findSpecialPricingRule(item.location, item.price);
        
        sectorTotals[sectorKey] = { 
          location: item.location, 
          price: item.price, 
          discountCode: item.discountCode, 
          quantity: 0, 
          people: 0, 
          total: 0,
          specialPricing: specialPricing
        };
      }
      sectorTotals[sectorKey].quantity += item.quantity;
      sectorTotals[sectorKey].people += item.people || item.quantity;
      sectorTotals[sectorKey].total += item.total;
    });
    // NO incluir servicios en sector totals (se agregan debajo de deducciones A)
    // Object.values(servicesByNameChannel).forEach(item => {
    //   const sectorKey = `svc|${item.name}|${item.price.toFixed(2)}`;
    //   if (!sectorTotals[sectorKey]) {
    //     sectorTotals[sectorKey] = { location: item.name, price: item.price, discountCode: null, quantity: 0, people: 0, total: 0, isService: true };
    //   }
    //   sectorTotals[sectorKey].quantity += item.quantity;
    //   sectorTotals[sectorKey].people += item.quantity;
    //   sectorTotals[sectorKey].total += item.total;
    // });

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
        readableLocation = `${readableLocation} ( ${item.discountCode})`;
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
    let deductionsA = bordereaux.deductions_a || [];
    // Asegurar que deductionsA sea un array
    if (typeof deductionsA === 'string') {
      try {
        deductionsA = JSON.parse(deductionsA);
      } catch (e) {
        deductionsA = [];
      }
    }
    if (!Array.isArray(deductionsA)) {
      deductionsA = [];
    }
    let totalDeductionsA = 0;
    const deductionsACalculated = deductionsA.map(ded => {
      // Soportar tipo fijo o porcentaje
      let amount;
      if (ded.type === 'fixed') {
        amount = parseFloat(ded.fixedAmount || 0);
      } else {
        amount = (totalBruto * (ded.percentage / 100));
      }
      totalDeductionsA += amount;
      return {
        ...ded,
        amount: amount.toFixed(2)
      };
    });
    
    const neto1 = totalBruto - totalDeductionsA;

    // Calcular total de servicios
    const totalServices = onlineServices.reduce((sum, s) => sum + s.total, 0) + boleteriaServices.reduce((sum, s) => sum + s.total, 0);

    // Calcular NETO 2 (NETO 1 + servicios)
    const neto2 = neto1 + totalServices;

    // Calcular distribución por contrato (usando NETO 2)
    const theaterPercentage = bordereaux.contract_theater_percentage || 0;
    const userPercentage = bordereaux.contract_user_percentage || 0;
    const theaterAmount = neto2 * (theaterPercentage / 100);
    const userAmount = neto2 * (userPercentage / 100);
    
    // Calcular deducciones B
    let deductionsB = bordereaux.deductions_b || [];
    // Asegurar que deductionsB sea un array
    if (typeof deductionsB === 'string') {
      try {
        deductionsB = JSON.parse(deductionsB);
      } catch (e) {
        deductionsB = [];
      }
    }
    if (!Array.isArray(deductionsB)) {
      deductionsB = [];
    }
    const totalDeductionsB = deductionsB.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    // Liquidación final - CORREGIDO:
    // El usuario recibe su porcentaje de cada canal
    // Efectivo: (porcentaje usuario de boletería) - deducciones B
    // Transferencia: (porcentaje usuario de online) - ya le llega directo
    const userBoleteriaShare = totalBoleteria * (userPercentage / 100);
    const userOnlineShare = totalOnline * (userPercentage / 100);
    
    // El efectivo es lo que el teatro debe entregarle al usuario de la boletería
    // = su porcentaje de boletería - deducciones B (gastos que el teatro adelantó)
    const userCashAmount = Math.max(0, userBoleteriaShare - totalDeductionsB);
    // La transferencia es lo que el usuario ya recibió de venta online (su porcentaje)
    const userTransferAmount = userOnlineShare;
    
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
        author_name: bordereaux.author_name || '',
        // Obtener la primera fecha de sesión del show
        session_date: show.sessions && show.sessions.length > 0 
          ? show.sessions.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0].starts_at 
          : null
      },
      sales: {
        cortesias: {
          quantity: totalCortesias,
          amount: totalCortesiasAmount.toFixed(2)
        },
        sectorTotals: Object.values(sectorTotals).map(s => ({
          ...s,
          location: locationNameMap[s.location] || s.location,
          total: Number(s.total).toFixed(2)
        })).sort((a, b) => {
          const locCmp = a.location.localeCompare(b.location);
          if (locCmp !== 0) return locCmp;
          return (b.price || 0) - (a.price || 0);
        }),
        online: onlineSales,
        boleteria: boleteriaSales,
        onlineServices,
        boleteriaServices,
        onlineBordereauxServices,
        boleteriaBordereauxServices,
        totals: {
          tickets: totalTickets,
          amount: totalBruto.toFixed(2),
          onlineAmount: totalOnline.toFixed(2),
          boleteriaAmount: totalBoleteria.toFixed(2),
          onlineTickets: onlineSales.reduce((sum, s) => sum + s.quantity, 0),
          boleteriaTickets: boleteriaSales.reduce((sum, s) => sum + s.quantity, 0),
          onlinePeople: onlineSales.reduce((sum, s) => sum + (s.people || s.quantity), 0),
          boleteriaPeople: boleteriaSales.reduce((sum, s) => sum + (s.people || s.quantity), 0),
          people: onlineSales.reduce((sum, s) => sum + (s.people || s.quantity), 0) + boleteriaSales.reduce((sum, s) => sum + (s.people || s.quantity), 0) + totalCortesias
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
      services: {
        online: onlineServices.map(s => ({ name: s.name, quantity: s.quantity, total: s.total.toFixed(2) })),
        boleteria: boleteriaServices.map(s => ({ name: s.name, quantity: s.quantity, total: s.total.toFixed(2) })),
        total: totalServices.toFixed(2)
      },
      neto2: neto2.toFixed(2),
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
    const { deductions_a, contract_theater_percentage, contract_user_percentage, deductions_b, notes, author_name } = req.body;
    const { bordereaux: Bordereaux } = sequelize.models;
    
    // Verificar que el usuario es admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update bordereaux' });
    }
    
    const bordereaux = await Bordereaux.findByPk(id);
    
    if (!bordereaux) {
      return res.status(404).json({ error: 'Bordereaux not found' });
    }
    
    // Actualizar campos
    const updates = {};
    if (deductions_a !== undefined) updates.deductions_a = deductions_a;
    if (contract_theater_percentage !== undefined) updates.contract_theater_percentage = contract_theater_percentage;
    if (contract_user_percentage !== undefined) updates.contract_user_percentage = contract_user_percentage;
    if (deductions_b !== undefined) updates.deductions_b = deductions_b;
    if (notes !== undefined) updates.notes = notes;
    if (author_name !== undefined) updates.author_name = author_name;
    
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
 * Generate PDF bordereaux for a show - Complete version matching the modal
 */
router.get('/show/:show_id/pdf', authenticateToken, async (req, res) => {
  try {
    const { show_id } = req.params;
    const { bordereaux: Bordereaux, shows: Show, sessions: Session, tickets: Ticket, sales: Sale } = sequelize.models;
    
    // Get service fee for mp total_amount calculation
    const serviceFeePercent = await getServiceFeePercent();
    const serviceFeeDivisor = 1 + (serviceFeePercent / 100);
    
    // Get bordereaux data
    let bordereaux = await Bordereaux.findOne({ where: { show_id } });
    
    if (!bordereaux) {
      return res.status(404).json({ error: 'Bordereaux not found' });
    }
    
    // Get show with all data
    const show = await Show.findByPk(show_id, {
      include: [
        {
          model: Session,
          as: 'sessions',
          include: [
            {
              model: Ticket,
              as: 'tickets',
              where: { status: { [Op.in]: ['sold', 'validated'] } },
              required: false,
              separate: true
            },
            {
              model: Sale,
              as: 'sales',
              required: false,
              separate: true,
              include: [
                { model: Ticket, as: 'tickets', required: false, separate: true },
                { model: sequelize.models.discounts, as: 'discount', required: false }
              ]
            }
          ]
        },
        {
          model: sequelize.models.show_services,
          as: 'services',
          required: false
        }
      ]
    });
    
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }
    
    // Aggregate sales data
    const salesByLocationPriceChannel = {};
    let totalCortesias = 0;
    let totalOnline = 0;
    let totalBoleteria = 0;
    
    const locationNameMap = {
      'palco': 'Palco',
      'palcos_bajos': 'Palcos Bajos',
      'palcos_altos': 'Palcos Altos',
      'butaca': 'Platea General',
      'platea_general': 'Platea General',
      'pullman': 'Pullman'
    };
    
    for (const session of show.sessions) {
      const sessionSales = session.sales || [];
      
      for (const sale of sessionSales) {
        const saleTickets = sale.tickets || [];
        if (saleTickets.length === 0) continue;
        
        const isOnline = (sale.payment_method === 'mp' || sale.payment_method === 'card');
        const channel = isOnline ? 'online' : 'boleteria';
        const discountCode = sale.discount?.alias || sale.discount?.code || null;
        const discount = sale.discount || null;
        
        let saleSubtotal = 0;
        const ticketsWithPrices = [];
        
        for (const ticket of saleTickets) {
          // Skip service tickets — they're counted separately via sale.service_items
          if (ticket.type === 'service') continue;
          
          let price = parseFloat(ticket.price || 0);
          const location = ticket.section || ticket.type || 'Sin ubicación';
          
          if (price === 0 && show.pricing_json) {
            const pricingKey = ticket.section || ticket.type;
            if (pricingKey && show.pricing_json[pricingKey]) {
              price = parseFloat(show.pricing_json[pricingKey]);
            }
          }
          
          if (price === 0) {
            totalCortesias++;
            continue;
          }
          
          saleSubtotal += price;
          ticketsWithPrices.push({ ticket, price, location });
        }
        
        // Derivar el descuento real desde total_amount (lo que realmente se pagó)
        let discountMultiplier = 1.0;
        if (saleSubtotal > 0) {
          const saleTotalAmount = parseFloat(sale.total_amount || 0);
          // Solo mp incluye service charge en total_amount
          const netPaid = sale.payment_method === 'mp' ? saleTotalAmount / serviceFeeDivisor : saleTotalAmount;
          if (netPaid === 0) {
            // Cortesía: total_amount=0 con tickets de precio > 0 → descuento 100%
            discountMultiplier = 0;
          } else if (netPaid < saleSubtotal * 0.995) {
            // Descuento parcial (ej: 3x2)
            discountMultiplier = netPaid / saleSubtotal;
          }
        }
        
        for (const { ticket, price, location } of ticketsWithPrices) {
          const effectivePrice = price * discountMultiplier;
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
    
    // Crear mapa de servicios con include_in_bordereaux para PDF
    const serviceMapPDF = {};
    if (show.services && Array.isArray(show.services)) {
      show.services.forEach(svc => {
        serviceMapPDF[svc.name] = svc.include_in_bordereaux === true || svc.include_in_bordereaux === 1;
      });
    }

    // Aggregate service items from sales
    const servicesByNameChannelPDF = {};
    for (const session of show.sessions) {
      for (const sale of (session.sales || [])) {
        if (!sale.service_items) continue;
        let svcItems = sale.service_items;
        if (typeof svcItems === 'string') {
          try { svcItems = JSON.parse(svcItems); } catch { continue; }
          // Si el parse devuelve un string (problema de doble codificación), parsear de nuevo
          if (typeof svcItems === 'string') {
            try { svcItems = JSON.parse(svcItems); } catch { continue; }
          }
        }
        if (!Array.isArray(svcItems) || svcItems.length === 0) continue;
        const isOnlinePDF = (sale.payment_method === 'mp' || sale.payment_method === 'card');
        const ch = isOnlinePDF ? 'online' : 'boleteria';
        for (const si of svcItems) {
          const qty = Number(si.quantity || 1);
          const price = Number(si.price || 0);
          const name = si.name || 'Servicio';
          const key = `${name}|${price.toFixed(2)}|${ch}`;

          // Verificar si el servicio debe incluirse en bordereaux
          const includeInBordereaux = serviceMapPDF[name] === true;

          // Solo agregar si include_in_bordereaux es true
          if (!includeInBordereaux) {
            continue;
          }

          if (!servicesByNameChannelPDF[key]) servicesByNameChannelPDF[key] = { name, price, channel: ch, quantity: 0, total: 0 };
          servicesByNameChannelPDF[key].quantity += qty;
          servicesByNameChannelPDF[key].total += qty * price;
          // NO sumar servicios al totalBruto (se agregan debajo de deducciones A)
          // if (isOnlinePDF) totalOnline += qty * price;
          // else totalBoleteria += qty * price;
        }
      }
    }
    const onlineServicesPDF = Object.values(servicesByNameChannelPDF).filter(s => s.channel === 'online');
    const boleteriaServicesPDF = Object.values(servicesByNameChannelPDF).filter(s => s.channel === 'boleteria');

    // Sector totals for PDF
    const sectorTotalsPDF = {};
    Object.values(salesByLocationPriceChannel).forEach(item => {
      const k = item.location;
      if (!sectorTotalsPDF[k]) sectorTotalsPDF[k] = { location: k, quantity: 0, people: 0, total: 0 };
      sectorTotalsPDF[k].quantity += item.quantity;
      sectorTotalsPDF[k].people += item.people || item.quantity;
      sectorTotalsPDF[k].total += item.total;
    });
    // NO incluir servicios en sector totals PDF (se agregan debajo de deducciones A)
    // Object.values(servicesByNameChannelPDF).forEach(item => {
    //   const k = item.name;
    //   if (!sectorTotalsPDF[k]) sectorTotalsPDF[k] = { location: k, quantity: 0, people: 0, total: 0 };
    //   sectorTotalsPDF[k].quantity += item.quantity;
    //   sectorTotalsPDF[k].people += item.quantity;
    //   sectorTotalsPDF[k].total += item.total;
    // });
    const sectorTotalsPDFArray = Object.values(sectorTotalsPDF).map(s => ({
      ...s,
      location: locationNameMap[s.location] || s.location,
      total: Number(s.total).toFixed(2)
    })).sort((a, b) => a.location.localeCompare(b.location));

    // Separate by channel
    const onlineSales = [];
    const boleteriaSales = [];
    
    Object.values(salesByLocationPriceChannel).forEach(item => {
      let readableLocation = locationNameMap[item.location] || item.location;
      if (item.discountCode) {
        readableLocation = `${readableLocation} ( ${item.discountCode})`;
      }
      const itemWithReadableName = { ...item, location: readableLocation };
      
      if (item.channel === 'online') {
        onlineSales.push(itemWithReadableName);
      } else {
        boleteriaSales.push(itemWithReadableName);
      }
    });
    
    onlineSales.sort((a, b) => a.location.localeCompare(b.location));
    boleteriaSales.sort((a, b) => a.location.localeCompare(b.location));
    
    const totalBruto = totalOnline + totalBoleteria;
    
    // Calculate deductions A
    let deductionsA = bordereaux.deductions_a || [];
    if (typeof deductionsA === 'string') {
      try { deductionsA = JSON.parse(deductionsA); } catch (e) { deductionsA = []; }
    }
    if (!Array.isArray(deductionsA)) deductionsA = [];
    
    let totalDeductionsA = 0;
    const deductionsACalculated = deductionsA.map(ded => {
      let amount;
      if (ded.type === 'fixed') {
        amount = parseFloat(ded.fixedAmount || 0);
      } else {
        amount = (totalBruto * (ded.percentage / 100));
      }
      totalDeductionsA += amount;
      return { ...ded, amount };
    });
    
    const neto1 = totalBruto - totalDeductionsA;

    // Calcular total de servicios
    const totalServices = onlineServicesPDF.reduce((sum, s) => sum + s.total, 0) + boleteriaServicesPDF.reduce((sum, s) => sum + s.total, 0);

    // Calcular NETO 2 (NETO 1 + servicios)
    const neto2 = neto1 + totalServices;

    // Contract (usando NETO 2)
    const theaterPercentage = bordereaux.contract_theater_percentage || 0;
    const userPercentage = bordereaux.contract_user_percentage || 0;
    const theaterAmount = neto2 * (theaterPercentage / 100);
    const userAmount = neto2 * (userPercentage / 100);
    
    // Deductions B
    let deductionsB = bordereaux.deductions_b || [];
    if (typeof deductionsB === 'string') {
      try { deductionsB = JSON.parse(deductionsB); } catch (e) { deductionsB = []; }
    }
    if (!Array.isArray(deductionsB)) deductionsB = [];
    const totalDeductionsB = deductionsB.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    // Final liquidation
    const boleteriaProportion = totalBruto > 0 ? totalBoleteria / totalBruto : 0;
    const userShare = neto1 * (userPercentage / 100);
    const userBoleteriaShare = userShare * boleteriaProportion;
    const userOnlineShare = userShare * (totalBruto > 0 ? totalOnline / totalBruto : 0);
    const userCash = Math.max(0, userBoleteriaShare - totalDeductionsB);
    const userTransfer = userOnlineShare;
    
    // Get session date
    const sessionDate = show.sessions && show.sessions.length > 0 
      ? show.sessions.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0].starts_at 
      : null;
    
    const isClosed = bordereaux.status === 'cerrado';
    
    // Prepare data for PDF generation
    const pdfData = {
      show,
      bordereaux,
      onlineSales,
      boleteriaSales,
      onlineServices: onlineServicesPDF,
      boleteriaServices: boleteriaServicesPDF,
      sectorTotals: sectorTotalsPDFArray,
      totalOnline,
      totalBoleteria,
      totalBruto,
      deductionsACalculated,
      totalDeductionsA,
      neto1,
      totalServices,
      neto2,
      theaterPercentage,
      userPercentage,
      theaterAmount,
      userAmount,
      deductionsB,
      totalDeductionsB,
      userCash,
      userTransfer,
      sessionDate,
      isClosed
    };
    
    // Calculate dynamic page height
    const estimatedHeight = calculatePDFHeight(pdfData);
    
    // Create PDF with dynamic height (no page breaks)
    const doc = new PDFDocument({ 
      margin: 40, 
      size: [595.28, Math.max(841.89, estimatedHeight)],
      autoFirstPage: true
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bordereaux_${show.title.replace(/\s/g, '_')}.pdf"`);
    
    doc.pipe(res);
    
    // Generate PDF content
    generateBordereauxPDF(doc, pdfData);
    
    doc.end();
    
  } catch (error) {
    console.error('[BORDEREAUX] Error generating PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
