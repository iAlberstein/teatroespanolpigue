import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { Op } from 'sequelize';

const router = express.Router();

// Helper: Get service fee percentage from settings
async function getServiceFeePercent() {
  try {
    const { system_settings: SystemSettings } = sequelize.models;
    if (!SystemSettings) return 10; // Default fallback
    
    const setting = await SystemSettings.findOne({ where: { key: 'service_fee_percent' } });
    return setting ? parseFloat(setting.value) : 10;
  } catch (err) {
    console.error('[REPORTS] Error getting service fee:', err);
    return 10; // Default fallback
  }
}

// Helper: Calcular personas reales considerando palcos
function calculateRealPeople(tickets) {
  let totalPeople = 0;
  
  tickets.forEach(ticket => {
    if (ticket.type === 'palco') {
      // Palcos Bajos = 4 personas, Palcos Altos = 2 personas
      if (ticket.seat_code?.startsWith('PB')) {
        totalPeople += 4;
      } else if (ticket.seat_code?.startsWith('PA')) {
        totalPeople += 2;
      } else {
        totalPeople += 1; // fallback
      }
    } else if (ticket.type === 'pullman') {
      // Pullman usa el campo capacity
      totalPeople += ticket.capacity || 1;
    } else if (ticket.type === 'general') {
      // Entrada general = 1 persona
      totalPeople += 1;
    } else {
      // Butacas = 1 persona
      totalPeople += 1;
    }
  });
  
  return totalPeople;
}

// Helper: Capacidad real de una sesión
function calculateSessionCapacity(session, show) {
  // Si la sesión tiene capacity_override, usarlo
  if (session.capacity_override) {
    return session.capacity_override;
  }
  
  // Si el show es de entrada general, usar general_capacity
  if (show && (show.venue_type === 'el_tablado' || show.venue_type === 'las_gemelas')) {
    return show.general_capacity || 0;
  }
  
  // Capacidad total sala principal: 446 personas
  return 446;
}

/**
 * GET /api/reports/show/:show_id
 * Reporte detallado de un show específico (todas sus sesiones)
 */
router.get('/show/:show_id', authenticateToken, requireRole('admin', 'boleteria', 'productor'), async (req, res) => {
  try {
    const { show_id } = req.params;
    const { date, seller_id, channel, session_id } = req.query; // Filtros opcionales
    const { shows: Show, sessions: Session, tickets: Ticket, sales: Sale, discounts: Discount, users: User, show_services: ShowService } = sequelize.models;

    // Get dynamic service fee percentage
    const serviceFeePercent = await getServiceFeePercent();
    const serviceFeeDivisor = 1 + (serviceFeePercent / 100);

    // Cargar servicios del show para clasificar por include_in_bordereaux
    const showServices = await ShowService.findAll({
      where: { show_id: show_id, active: true },
      attributes: ['name', 'include_in_bordereaux'],
      raw: true
    });
    const serviceBordereauxMap = {};
    showServices.forEach(svc => {
      serviceBordereauxMap[svc.name] = svc.include_in_bordereaux === true || svc.include_in_bordereaux === 1;
    });

    // Obtener show con todas sus sesiones
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
                model: Discount,
                as: 'discount',
                required: false
              },
              {
                model: User,
                as: 'user',
                attributes: ['id', 'name', 'email', 'phone', 'dni', 'localidad'],
                required: false
              },
              {
                model: User,
                as: 'cashier',
                attributes: ['id', 'name', 'email'],
                required: false
              },
              {
                model: User,
                as: 'seller',
                attributes: ['id', 'name', 'email'],
                required: false
              },
              {
                model: Ticket,
                as: 'tickets',
                required: false,
                separate: true
              }
            ]
          }
        ]
      }]
    });
    
    if (!show) {
      return res.status(404).json({ error: 'Show not found' });
    }

    // Helper: excluir ventas anuladas totalmente y sus transacciones de reintegro asociadas
    function parseSaleMetadata(sale) {
      const raw = sale.metadata;
      if (!raw) return {};
      if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return {}; }
      }
      return raw;
    }
    const allSessionSales = show.sessions.flatMap(s => s.sales || []);
    const fullyRefundedSaleIds = new Set(
      allSessionSales
        .filter(s => parseSaleMetadata(s).refunded === true)
        .map(s => s.id)
    );
    const isExcludedSale = (sale) => {
      const meta = parseSaleMetadata(sale);
      if (meta.refunded === true) return true;
      if (meta.type === 'refund' && fullyRefundedSaleIds.has(meta.refund_of)) return true;
      return false;
    };
    
    // Calcular métricas por sesión y totales
    const sessionsData = [];
    let totalRevenue = 0;
    let totalTicketsSold = 0;
    let totalPeopleSold = 0;
    let totalCapacity = 0;
    let totalValidated = 0;
    let totalPeopleValidated = 0;
    
    const paymentMethods = {};
    const saleChannels = { online: 0, boleteria: 0 };
    const locationBreakdown = {
      platea_general: { count: 0, people: 0, revenue: 0 },
      palcos_bajos: { count: 0, people: 0, revenue: 0 },
      palcos_altos: { count: 0, people: 0, revenue: 0 },
      pullman: { count: 0, people: 0, revenue: 0 }
    };

    const serviceBreakdown = {
      bordereaux: {},  // Servicios a bordereaux (del productor)
      teatro: {}       // Servicios del teatro
    };

    const sessionsToProcess = session_id
      ? show.sessions.filter(s => String(s.id) === String(session_id))
      : show.sessions;

    for (const session of sessionsToProcess) {
      const sessionCapacity = calculateSessionCapacity(session, show);
      const soldTickets = (session.tickets || []).filter(t => t.type !== 'service');
      const validatedTickets = soldTickets.filter(t => t.status === 'validated');
      const sessionSales = (session.sales || []).filter(sale => !isExcludedSale(sale));
      
      // Calcular revenue (solo mp incluye service charge en total_amount)
      const sessionRevenue = sessionSales.reduce((sum, sale) => {
        const amount = parseFloat(sale.total_amount || 0);
        return sum + (sale.payment_method === 'mp' ? amount / serviceFeeDivisor : amount);
      }, 0);
      
      const sessionPeople = calculateRealPeople(soldTickets);
      const sessionValidatedPeople = calculateRealPeople(validatedTickets);
      
      // Desglose por ubicación - usando precio real pagado (considerando descuentos)
      // Iteramos por ventas para poder aplicar el factor de descuento
      sessionSales.forEach(sale => {
        const saleTickets = sale.tickets || [];
        if (saleTickets.length === 0) return;

        // Calcular subtotal de entradas (excluyendo servicios)
        const subtotalBase = saleTickets
          .filter(t => t.type !== 'service')
          .reduce((sum, t) => sum + parseFloat(t.price || 0), 0);

        // Calcular factor de descuento (igual que en bordereaux.js)
        // Si netPaid < subtotalBase * 0.995, hay descuento y calculamos el factor
        // Si no, el factor queda en 1.0 (sin descuento)
        const totalPaid = parseFloat(sale.total_amount || 0);
        const netPaid = sale.payment_method === 'mp' ? totalPaid / serviceFeeDivisor : totalPaid;
        let discountFactor = 1.0;
        if (subtotalBase > 0 && netPaid < subtotalBase * 0.995) {
          discountFactor = netPaid / subtotalBase;
        }
        
        saleTickets.forEach(ticket => {
          const basePrice = parseFloat(ticket.price || 0);
          // Precio real = precio base * factor de descuento
          const realPrice = basePrice * discountFactor;
          
          if (ticket.type === 'butaca') {
            locationBreakdown.platea_general.count++;
            locationBreakdown.platea_general.people++;
            locationBreakdown.platea_general.revenue += realPrice;
          } else if (ticket.type === 'palco') {
            if (ticket.seat_code?.startsWith('PB')) {
              locationBreakdown.palcos_bajos.count++;
              locationBreakdown.palcos_bajos.people += 4;
              locationBreakdown.palcos_bajos.revenue += realPrice;
            } else if (ticket.seat_code?.startsWith('PA')) {
              locationBreakdown.palcos_altos.count++;
              locationBreakdown.palcos_altos.people += 2;
              locationBreakdown.palcos_altos.revenue += realPrice;
            }
          } else if (ticket.type === 'pullman') {
            locationBreakdown.pullman.count++;
            locationBreakdown.pullman.people += ticket.capacity || 1;
            locationBreakdown.pullman.revenue += realPrice;
          } else if (ticket.type === 'general') {
            locationBreakdown.pullman.count++;
            locationBreakdown.pullman.people += 1;
            locationBreakdown.pullman.revenue += realPrice;
          }
        });
      });

      sessionSales.forEach(sale => {
        const method = sale.payment_method || 'unknown';
        paymentMethods[method] = (paymentMethods[method] || 0) + 1;

        // Canal de venta
        if ((sale.payment_method === 'mp' || sale.payment_method === 'card')) {
          saleChannels.online++;
        } else {
          saleChannels.boleteria++;
        }

        // Desglose por servicios
        if (sale.service_items) {
          let serviceItems = sale.service_items;
          if (typeof serviceItems === 'string') {
            try {
              serviceItems = JSON.parse(serviceItems);
              // Si el parse devuelve un string (problema de Sequelize), parsear de nuevo
              if (typeof serviceItems === 'string') {
                serviceItems = JSON.parse(serviceItems);
              }
            } catch (e) {
              serviceItems = [];
            }
          }
          // Forzar que sea un array
          if (!Array.isArray(serviceItems)) {
            serviceItems = [];
          }
          serviceItems.forEach(si => {
            const name = si.name || 'Servicio';
            const qty = Number(si.quantity || 1);
            const price = Number(si.price || 0);
            // Determinar si es a bordereaux o del teatro
            const isBordereaux = serviceBordereauxMap[name] === true;
            const targetCategory = isBordereaux ? serviceBreakdown.bordereaux : serviceBreakdown.teatro;
            if (!targetCategory[name]) {
              targetCategory[name] = { quantity: 0, total: 0 };
            }
            targetCategory[name].quantity += qty;
            targetCategory[name].total += qty * price;
          });
        }
      });

      sessionsData.push({
        session_id: session.id,
        date: session.starts_at,
        revenue: sessionRevenue,
        ticketsSold: soldTickets.length,
        peopleSold: sessionPeople,
        capacity: sessionCapacity,
        occupancy: ((sessionPeople / sessionCapacity) * 100).toFixed(1),
        validated: validatedTickets.length,
        peopleValidated: sessionValidatedPeople,
        attendance: soldTickets.length > 0 
          ? ((sessionValidatedPeople / sessionPeople) * 100).toFixed(1)
          : 0
      });
      
      totalRevenue += sessionRevenue;
      totalTicketsSold += soldTickets.length;
      totalPeopleSold += sessionPeople;
      totalCapacity += sessionCapacity;
      totalValidated += validatedTickets.length;
      totalPeopleValidated += sessionValidatedPeople;
    }
    
    // Calcular descuentos
    const allSales = sessionsToProcess.flatMap(s => s.sales || []).filter(sale => !isExcludedSale(sale));
    const salesWithDiscount = allSales.filter(s => s.discount_id);
    const totalDiscountAmount = salesWithDiscount.reduce((sum, sale) => {
      const discount = sale.discount;
      if (!discount) return sum;
      
      if (discount.type === 'percentage') {
        return sum + (parseFloat(sale.total_amount) * (parseFloat(discount.value) / 100));
      } else if (discount.type === 'fixed') {
        return sum + parseFloat(discount.value);
      }
      return sum;
    }, 0);
    
    // salesDetail se carga por separado via /api/reports/sales-detail paginado
    
    const report = {
      show: {
        id: show.id,
        title: show.title,
        description: show.description,
        venue_type: show.venue_type || 'sala_principal',
        sessionsCount: show.sessions.length,
        filteredSessionId: session_id || null,
        sessions: show.sessions.map(s => ({ id: s.id, starts_at: s.starts_at }))
      },
      summary: {
        totalRevenue: totalRevenue.toFixed(2),
        totalTicketsSold,
        totalPeopleSold,
        totalCapacity,
        averageOccupancy: totalCapacity > 0 
          ? ((totalPeopleSold / totalCapacity) * 100).toFixed(1)
          : 0,
        totalValidated,
        totalPeopleValidated,
        averageAttendance: totalPeopleSold > 0
          ? ((totalPeopleValidated / totalPeopleSold) * 100).toFixed(1)
          : 0,
        discountsApplied: salesWithDiscount.length,
        totalDiscountAmount: totalDiscountAmount.toFixed(2)
      },
      locationBreakdown,
      serviceBreakdown,
      paymentMethods,
      saleChannels,
      sessions: sessionsData,
      salesDetail: [] // Se carga por separado via /api/reports/sales-detail paginado
    };
    
    res.json(report);
    
  } catch (error) {
    console.error('[REPORTS] Error generating show report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reports/general
 * Reporte general de todos los shows con filtros
 * Query params: status (active/finished/all), startDate, endDate, date, seller_id, channel, producer_id
 */
router.get('/general', authenticateToken, requireRole('admin', 'boleteria', 'productor'), async (req, res) => {
  try {
    const { status = 'all', startDate, endDate, date, seller_id, channel, producer_id } = req.query;
    const { shows: Show, sessions: Session, tickets: Ticket, sales: Sale, discounts: Discount, users: User, show_producer: ShowProducer, bordereaux: Bordereaux, show_services: ShowService } = sequelize.models;

    // Get dynamic service fee percentage
    const serviceFeePercent = await getServiceFeePercent();
    const serviceFeeDivisor = 1 + (serviceFeePercent / 100);

    // Cargar todos los servicios activos para clasificar por include_in_bordereaux
    const allServices = await ShowService.findAll({
      where: { active: true },
      attributes: ['name', 'include_in_bordereaux'],
      raw: true
    });
    const serviceBordereauxMap = {};
    allServices.forEach(svc => {
      serviceBordereauxMap[svc.name] = svc.include_in_bordereaux === true || svc.include_in_bordereaux === 1;
    });

    // Construir filtro de fechas
    const dateFilter = {};
    if (startDate) {
      dateFilter[Op.gte] = new Date(startDate);
    }
    if (endDate) {
      dateFilter[Op.lte] = new Date(endDate);
    }
    
    // Filtro de estado - no aplicamos filtro de fecha por status aquí,
    // lo haremos después de incluir el bordereaux para considerar cierre de venta
    let sessionWhere = {};
    if (Object.keys(dateFilter).length > 0) {
      sessionWhere.starts_at = dateFilter;
    }
    
    // Obtener shows con bordereaux cerrado para determinar estado
    const closedBordereaux = await Bordereaux.findAll({
      where: { status: 'cerrado' },
      attributes: ['show_id'],
      raw: true
    });
    const showsWithClosedBordereaux = closedBordereaux.map(b => b.show_id);
    
    // Filtrar shows por productor si se especifica
    let showWhere = {};
    if (producer_id) {
      const showIds = await ShowProducer.findAll({
        where: { producer_id },
        attributes: ['show_id'],
        raw: true
      });
      showWhere.id = { [Op.in]: showIds.map(sp => sp.show_id) };
    }
    
    // Obtener todos los shows con sus sesiones (sin ventas - se cargan vía endpoint paginado)
    const shows = await Show.findAll({
      where: Object.keys(showWhere).length > 0 ? showWhere : undefined,
      include: [{
        model: Session,
        as: 'sessions',
        where: Object.keys(sessionWhere).length > 0 ? sessionWhere : undefined,
        required: false,
        include: [
          {
            model: Ticket,
            as: 'tickets',
            where: { status: { [Op.in]: ['sold', 'validated'] } },
            required: false
          }
          // Sales se cargan por separado via /api/reports/sales-detail paginado
        ]
      }]
    });
    
    // Calcular totales generales
    let globalRevenue = 0;
    let globalTicketsSold = 0;
    let globalPeopleSold = 0;
    let globalCapacity = 0;
    let globalValidated = 0;
    let globalPeopleValidated = 0;
    
    const showsData = [];
    const paymentMethods = {};
    const locationBreakdown = {
      platea_general: { count: 0, people: 0, revenue: 0 },
      palcos_bajos: { count: 0, people: 0, revenue: 0 },
      palcos_altos: { count: 0, people: 0, revenue: 0 },
      pullman: { count: 0, people: 0, revenue: 0 }
    };

    const serviceBreakdown = {
      bordereaux: {},  // Servicios a bordereaux (del productor)
      teatro: {}       // Servicios del teatro
    };

    for (const show of shows) {
      const sessions = show.sessions || [];
      if (sessions.length === 0) continue;
      
      // Aplicar filtro de estado considerando bordereaux cerrado
      if (status === 'active' || status === 'finished') {
        const hasBordereauxClosed = showsWithClosedBordereaux.includes(show.id);
        const hasAllSessionsPast = sessions.every(s => new Date(s.starts_at) < new Date());
        const isFinished = hasBordereauxClosed || hasAllSessionsPast;
        
        if (status === 'active' && isFinished) continue;
        if (status === 'finished' && !isFinished) continue;
      }
      
      let showRevenue = 0;
      let showTickets = 0;
      let showPeople = 0;
      let showCapacity = 0;
      let showValidated = 0;
      let showPeopleValidated = 0;
      
      for (const session of sessions) {
        const sessionCapacity = calculateSessionCapacity(session, show);
        const soldTickets = (session.tickets || []).filter(t => t.type !== 'service');
        const validatedTickets = soldTickets.filter(t => t.status === 'validated');
        const sessionSales = session.sales || [];
        
        // Calcular revenue (solo mp incluye service charge en total_amount)
        const sessionRevenue = sessionSales.reduce((sum, sale) => {
          const amount = parseFloat(sale.total_amount || 0);
          return sum + (sale.payment_method === 'mp' ? amount / serviceFeeDivisor : amount);
        }, 0);
        
        const sessionPeople = calculateRealPeople(soldTickets);
        const sessionValidatedPeople = calculateRealPeople(validatedTickets);
        
        // Acumular por ubicación - usando precio real pagado (considerando descuentos)
        sessionSales.forEach(sale => {
          const saleTickets = sale.tickets || [];
          if (saleTickets.length === 0) return;

          // Calcular subtotal de entradas (excluyendo servicios)
          const subtotalBase = saleTickets
            .filter(t => t.type !== 'service')
            .reduce((sum, t) => sum + parseFloat(t.price || 0), 0);

          // Calcular factor de descuento (igual que en bordereaux.js)
          const totalPaid = parseFloat(sale.total_amount || 0);
          const netPaid = sale.payment_method === 'mp' ? totalPaid / serviceFeeDivisor : totalPaid;
          let discountFactor = 1.0;
          if (subtotalBase > 0 && netPaid < subtotalBase * 0.995) {
            discountFactor = netPaid / subtotalBase;
          }
          
          saleTickets.forEach(ticket => {
            const basePrice = parseFloat(ticket.price || 0);
            const realPrice = basePrice * discountFactor;
            
            if (ticket.type === 'butaca') {
              locationBreakdown.platea_general.count++;
              locationBreakdown.platea_general.people++;
              locationBreakdown.platea_general.revenue += realPrice;
            } else if (ticket.type === 'palco') {
              if (ticket.seat_code?.startsWith('PB')) {
                locationBreakdown.palcos_bajos.count++;
                locationBreakdown.palcos_bajos.people += 4;
                locationBreakdown.palcos_bajos.revenue += realPrice;
              } else if (ticket.seat_code?.startsWith('PA')) {
                locationBreakdown.palcos_altos.count++;
                locationBreakdown.palcos_altos.people += 2;
                locationBreakdown.palcos_altos.revenue += realPrice;
              }
            } else if (ticket.type === 'pullman') {
              locationBreakdown.pullman.count++;
              locationBreakdown.pullman.people += ticket.capacity || 1;
              locationBreakdown.pullman.revenue += realPrice;
            } else if (ticket.type === 'general') {
              locationBreakdown.pullman.count++;
              locationBreakdown.pullman.people += 1;
              locationBreakdown.pullman.revenue += realPrice;
            }
          });
        });
        
        // Métodos de pago
        sessionSales.forEach(sale => {
          const method = sale.payment_method || 'unknown';
          paymentMethods[method] = (paymentMethods[method] || 0) + 1;

          // Desglose por servicios
          if (sale.service_items) {
            let serviceItems = sale.service_items;
            if (typeof serviceItems === 'string') {
              try { serviceItems = JSON.parse(serviceItems); } catch { serviceItems = []; }
            }
            if (Array.isArray(serviceItems)) {
              serviceItems.forEach(si => {
                const name = si.name || 'Servicio';
                const qty = Number(si.quantity || 1);
                const price = Number(si.price || 0);
                // Determinar si es a bordereaux o del teatro
                const isBordereaux = serviceBordereauxMap[name] === true;
                const targetCategory = isBordereaux ? serviceBreakdown.bordereaux : serviceBreakdown.teatro;
                if (!targetCategory[name]) {
                  targetCategory[name] = { quantity: 0, total: 0 };
                }
                targetCategory[name].quantity += qty;
                targetCategory[name].total += qty * price;
              });
            }
          }
        });
        
        showRevenue += sessionRevenue;
        showTickets += soldTickets.length;
        showPeople += sessionPeople;
        showCapacity += sessionCapacity;
        showValidated += validatedTickets.length;
        showPeopleValidated += sessionValidatedPeople;
      }
      
      showsData.push({
        show_id: show.id,
        show_title: show.title,
        sessionsCount: sessions.length,
        revenue: showRevenue.toFixed(2),
        ticketsSold: showTickets,
        peopleSold: showPeople,
        capacity: showCapacity,
        occupancy: showCapacity > 0 
          ? ((showPeople / showCapacity) * 100).toFixed(1)
          : 0,
        validated: showValidated,
        peopleValidated: showPeopleValidated,
        attendance: showPeople > 0
          ? ((showPeopleValidated / showPeople) * 100).toFixed(1)
          : 0
      });
      
      globalRevenue += showRevenue;
      globalTicketsSold += showTickets;
      globalPeopleSold += showPeople;
      globalCapacity += showCapacity;
      globalValidated += showValidated;
      globalPeopleValidated += showPeopleValidated;
    }
    
    // Ordenar shows por ingresos (ranking)
    showsData.sort((a, b) => parseFloat(b.revenue) - parseFloat(a.revenue));
    
    // salesDetail ahora se carga por separado via /api/reports/sales-detail paginado
    
    const report = {
      period: {
        startDate: startDate || 'all',
        endDate: endDate || 'all',
        status
      },
      totals: {
        totalRevenue: globalRevenue.toFixed(2),
        totalShows: showsData.length,
        totalTicketsSold: globalTicketsSold,
        totalPeopleSold: globalPeopleSold,
        totalCapacity: globalCapacity,
        averageOccupancy: globalCapacity > 0
          ? ((globalPeopleSold / globalCapacity) * 100).toFixed(1)
          : 0,
        totalValidated: globalValidated,
        totalPeopleValidated: globalPeopleValidated,
        averageAttendance: globalPeopleSold > 0
          ? ((globalPeopleValidated / globalPeopleSold) * 100).toFixed(1)
          : 0
      },
      locationBreakdown,
      serviceBreakdown,
      paymentMethods,
      shows: showsData,
      topShow: showsData[0] || null,
      salesDetail: [] // Se carga por separado via /api/reports/sales-detail paginado
    };
    
    res.json(report);
    
  } catch (error) {
    console.error('[REPORTS] Error generating general report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export sales to CSV
router.get('/export/csv', authenticateToken, requireRole('admin', 'boleteria', 'productor'), async (req, res) => {
  try {
    const { show_id, start_date, end_date, channel } = req.query;
    
    const { shows: Show, sessions: Session, sales: Sale, tickets: Ticket, users: User, discounts: Discount } = sequelize.models;
    
    // Get service fee for mp total_amount calculation
    const serviceFeePercent = await getServiceFeePercent();
    const serviceFeeDivisor = 1 + (serviceFeePercent / 100);
    
    // Build query filters
    const sessionWhere = {};
    if (show_id) sessionWhere.show_id = show_id;
    if (start_date || end_date) {
      sessionWhere.starts_at = {};
      if (start_date) sessionWhere.starts_at[Op.gte] = new Date(start_date);
      if (end_date) {
        const endDateTime = new Date(end_date);
        endDateTime.setHours(23, 59, 59, 999);
        sessionWhere.starts_at[Op.lte] = endDateTime;
      }
    }
    
    // Get all relevant sales
    const sessions = await Session.findAll({
      where: sessionWhere,
      include: [
        { 
          model: Show, 
          as: 'show',
          attributes: ['id', 'title']
        },
        {
          model: Sale,
          as: 'sales',
          include: [
            { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
            { model: User, as: 'seller', attributes: ['id', 'name', 'email'] },
            { model: User, as: 'cashier', attributes: ['id', 'name', 'email'] },
            { model: Discount, as: 'discount', attributes: ['code', 'type', 'value'] },
            {
              model: Ticket,
              as: 'tickets',
              attributes: ['id', 'type', 'seat_code', 'section', 'price', 'status']
            }
          ]
        }
      ]
    });
    
    // Build CSV data
    const csvRows = [];
    
    // CSV Header
    csvRows.push([
      'ID Venta',
      'Fecha Venta',
      'Show',
      'Fecha Función',
      'Cliente',
      'Email',
      'Teléfono',
      'DNI',
      'Vendedor',
      'Canal',
      'Método Pago',
      'Ubicaciones',
      'Cantidad',
      'Personas',
      'Cupón',
      'Descuento',
      'Total',
      'Estado'
    ].join(','));
    
    // Process sales
    for (const session of sessions) {
      const show = session.show;
      
      for (const sale of session.sales) {
        const saleTickets = sale.tickets || [];
        const rawMetadata = sale.metadata || {};
        const refundSnapshot = rawMetadata.refund_snapshot || null;

        // Channel filter
        const saleChannel = (sale.payment_method === 'mp' || sale.payment_method === 'card') ? 'Online' : 'Boletería';
        if (channel && saleChannel !== channel) continue;
        
        // Build locations and counts, using snapshot when no tickets are linked
        let effectiveLocations = [];
        let effectiveTicketsCount = 0;
        let effectivePeopleCount = 0;

        if (saleTickets.length > 0) {
          const regularTickets = saleTickets.filter(t => t.type !== 'service');
          effectiveLocations = regularTickets.map(t => {
            if (t.type === 'butaca') return t.seat_code;
            if (t.type === 'palco') return t.seat_code;
            if (t.type === 'pullman') return `Pullman`;
            return t.type;
          });
          effectiveTicketsCount = regularTickets.length;
          effectivePeopleCount = calculateRealPeople(regularTickets);
        } else if (refundSnapshot && Array.isArray(refundSnapshot.locations) && refundSnapshot.locations.length > 0) {
          effectiveLocations = refundSnapshot.locations;
          effectiveTicketsCount = refundSnapshot.tickets_count || refundSnapshot.locations.length;
          effectivePeopleCount = refundSnapshot.people_count || effectiveTicketsCount;
        }

        const customerName = sale.customer_name || sale.user?.name || 'N/A';
        const customerEmail = sale.customer_email || sale.user?.email || '';
        const customerPhone = sale.customer_phone || sale.user?.phone || '';
        const customerDni = sale.customer_dni || sale.user?.dni || '';
        
        const soldByName = sale.cashier?.name || sale.seller?.name || (sale.sold_by ? 'Boletería' : 'Online');
        
        const discountCode = sale.discount?.code || '';
        const discountValue = sale.discount ? 
          (sale.discount.type === 'percentage' ? `${sale.discount.value}%` : `$${sale.discount.value}`) 
          : '';
        
        // Solo mp incluye service charge en total_amount
        const rawAmount = parseFloat(sale.total_amount || 0);
        const totalAmount = (sale.payment_method === 'mp' ? rawAmount / serviceFeeDivisor : rawAmount).toFixed(2);
        
        const validatedCount = saleTickets.filter(t => t.status === 'validated').length;
        const status = validatedCount === saleTickets.length ? 'Validado' : 
                      validatedCount > 0 ? 'Parcial' : 'Pendiente';
        
        // Escape CSV values
        const escapeCSV = (val) => {
          if (!val) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        csvRows.push([
          escapeCSV(sale.id),
          escapeCSV(new Date(sale.createdAt).toLocaleString('es-AR')),
          escapeCSV(show.title),
          escapeCSV(new Date(session.starts_at).toLocaleString('es-AR')),
          escapeCSV(customerName),
          escapeCSV(customerEmail),
          escapeCSV(customerPhone),
          escapeCSV(customerDni),
          escapeCSV(soldByName),
          escapeCSV(saleChannel),
          escapeCSV(sale.payment_method || 'N/A'),
          escapeCSV(effectiveLocations.join(', ')),
          escapeCSV(effectiveTicketsCount),
          escapeCSV(effectivePeopleCount),
          escapeCSV(discountCode),
          escapeCSV(discountValue),
          escapeCSV(totalAmount),
          escapeCSV(status)
        ].join(','));
      }
    }
    
    // Set response headers for CSV download
    const filename = `ventas_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Add UTF-8 BOM for Excel compatibility
    res.write('\uFEFF');
    res.write(csvRows.join('\n'));
    res.end();
    
  } catch (error) {
    console.error('[REPORTS] Error exporting CSV:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reports/trends
 * Get sales trends data for charts
 * Query params:
 *  - days: number of days to include (default 30, max 365)
 *  - show_id: optional show filter
 */
router.get('/trends', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { days = 30, show_id } = req.query;
    const daysNum = Math.min(parseInt(days) || 30, 1825);
    
    const { sales: Sale, sessions: Session, shows: Show, tickets: Ticket } = sequelize.models;
    
    // Get service fee for mp total_amount calculation
    const serviceFeePercent = await getServiceFeePercent();
    const serviceFeeDivisor = 1 + (serviceFeePercent / 100);
    
    // Calculate date range (include today)
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // End of today
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (daysNum - 1)); // Include today in count
    startDate.setHours(0, 0, 0, 0); // Start of day
    
    // Build where clause
    const where = {
      created_at: {
        [Op.gte]: startDate,
        [Op.lte]: endDate
      },
      payment_status: 'approved'
    };
    
    // Get all sales with tickets
    const salesQuery = {
      where,
      include: [
        {
          model: Session,
          as: 'session',
          required: true,
          include: [{
            model: Show,
            as: 'show',
            ...(show_id ? { where: { id: show_id } } : {})
          }]
        },
        {
          model: Ticket,
          as: 'tickets'
        }
      ],
      order: [['created_at', 'ASC']]
    };
    
    const sales = await Sale.findAll(salesQuery);
    
    // Group sales by date
    const salesByDate = {};
    const revenueByDate = {};
    const revenueOnlineByDate = {};
    const revenueBoxofficeByDate = {};
    const ticketsByDate = {};
    
    sales.forEach((sale, index) => {
      // Skip sales with invalid dates
      if (!sale.createdAt) return;
      
      const saleDate = new Date(sale.createdAt);
      if (isNaN(saleDate.getTime())) return; // Invalid date
      
      // Use local date (server runs in Argentina -03)
      const year = saleDate.getFullYear();
      const month = String(saleDate.getMonth() + 1).padStart(2, '0');
      const day = String(saleDate.getDate()).padStart(2, '0');
      const date = `${year}-${month}-${day}`;
      
      if (!salesByDate[date]) {
        salesByDate[date] = 0;
        revenueByDate[date] = 0;
        revenueOnlineByDate[date] = 0;
        revenueBoxofficeByDate[date] = 0;
        ticketsByDate[date] = 0;
      }
      
      const rawAmount = Number(sale.total_amount || 0);
      // Solo mp incluye service charge en total_amount
      const amount = sale.payment_method === 'mp' ? rawAmount / serviceFeeDivisor : rawAmount;
      const isOnline = (sale.payment_method === 'mp' || sale.payment_method === 'card');
      
      salesByDate[date]++;
      revenueByDate[date] += amount;
      if (isOnline) {
        revenueOnlineByDate[date] += amount;
      } else {
        revenueBoxofficeByDate[date] += amount;
      }
      ticketsByDate[date] += sale.tickets?.length || 0;
    });
    
    // Create array of dates with data
    const dates = [];
    const salesData = [];
    const revenueData = [];
    const revenueOnlineData = [];
    const revenueBoxofficeData = [];
    const ticketsData = [];
    
    for (let i = 0; i < daysNum; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      // Use local date (server runs in Argentina -03)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      dates.push(dateStr);
      salesData.push(salesByDate[dateStr] || 0);
      revenueData.push(revenueByDate[dateStr] || 0);
      revenueOnlineData.push(revenueOnlineByDate[dateStr] || 0);
      revenueBoxofficeData.push(revenueBoxofficeByDate[dateStr] || 0);
      ticketsData.push(ticketsByDate[dateStr] || 0);
    }
    
    // Get channel breakdown
    const channelData = {
      online: 0,
      boxoffice: 0
    };
    
    sales.forEach(sale => {
      const ticketCount = sale.tickets?.length || 1;
      if ((sale.payment_method === 'mp' || sale.payment_method === 'card')) {
        channelData.online += ticketCount;
      } else {
        channelData.boxoffice += ticketCount;
      }
    });
    
    // Get top shows
    const showStats = {};
    sales.forEach(sale => {
      const showId = sale.session?.show?.id;
      const showTitle = sale.session?.show?.title || 'Unknown';
      
      if (!showStats[showId]) {
        showStats[showId] = {
          title: showTitle,
          sales: 0,
          revenue: 0,
          tickets: 0
        };
      }
      
      showStats[showId].sales++;
      // Solo mp incluye service charge en total_amount
      const rawAmt = Number(sale.total_amount || 0);
      showStats[showId].revenue += sale.payment_method === 'mp' ? rawAmt / serviceFeeDivisor : rawAmt;
      showStats[showId].tickets += sale.tickets?.length || 0;
    });
    
    const topShows = Object.values(showStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    
    res.json({
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        days: daysNum
      },
      trends: {
        dates,
        sales: salesData,
        revenue: revenueData,
        revenueOnline: revenueOnlineData,
        revenueBoxoffice: revenueBoxofficeData,
        tickets: ticketsData
      },
      channels: channelData,
      top_shows: topShows,
      totals: {
        sales: sales.length,
        revenue: Object.values(revenueByDate).reduce((sum, val) => sum + val, 0),
        tickets: Object.values(ticketsByDate).reduce((sum, val) => sum + val, 0)
      }
    });
  } catch (error) {
    console.error('[REPORTS] Error getting trends:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reports/compare
 * Compare two time periods
 * Query params:
 *  - period1_start: ISO date
 *  - period1_end: ISO date
 *  - period2_start: ISO date
 *  - period2_end: ISO date
 */
router.get('/compare', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { period1_start, period1_end, period2_start, period2_end } = req.query;
    
    if (!period1_start || !period1_end || !period2_start || !period2_end) {
      return res.status(400).json({ error: 'All date parameters required' });
    }
    
    const { sales: Sale, tickets: Ticket } = sequelize.models;
    
    // Get sales for both periods
    const getSalesForPeriod = async (startDate, endDate) => {
      const sales = await Sale.findAll({
        where: {
          created_at: {
            [Op.gte]: new Date(startDate),
            [Op.lte]: new Date(endDate)
          },
          payment_status: 'approved'
        },
        include: [{
          model: Ticket,
          as: 'tickets'
        }]
      });
      
      const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
      const totalTickets = sales.reduce((sum, sale) => sum + (sale.tickets?.length || 0), 0);
      
      const channelBreakdown = {
        online: sales.filter(s => (s.payment_method === 'mp' || s.payment_method === 'card')).length,
        boxoffice: sales.filter(s => (s.payment_method !== 'mp' && s.payment_method !== 'card')).length
      };
      
      return {
        sales_count: sales.length,
        total_revenue: totalRevenue,
        total_tickets: totalTickets,
        avg_ticket_price: totalTickets > 0 ? totalRevenue / totalTickets : 0,
        avg_sale_amount: sales.length > 0 ? totalRevenue / sales.length : 0,
        channels: channelBreakdown
      };
    };
    
    const period1 = await getSalesForPeriod(period1_start, period1_end);
    const period2 = await getSalesForPeriod(period2_start, period2_end);
    
    // Calculate changes
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };
    
    const comparison = {
      period1: {
        start: period1_start,
        end: period1_end,
        ...period1
      },
      period2: {
        start: period2_start,
        end: period2_end,
        ...period2
      },
      changes: {
        sales_count: calculateChange(period2.sales_count, period1.sales_count),
        total_revenue: calculateChange(period2.total_revenue, period1.total_revenue),
        total_tickets: calculateChange(period2.total_tickets, period1.total_tickets),
        avg_ticket_price: calculateChange(period2.avg_ticket_price, period1.avg_ticket_price),
        avg_sale_amount: calculateChange(period2.avg_sale_amount, period1.avg_sale_amount)
      }
    };
    
    res.json(comparison);
  } catch (error) {
    console.error('[REPORTS] Error comparing periods:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reports/sales-detail
 * Get paginated sales detail with fast count
 * Query params:
 *  - show_id: optional show filter
 *  - status: active/finished/all
 *  - page: page number (default 1)
 *  - limit: items per page (default 20, max 100)
 *  - search: search query
 *  - date: filter by sale date
 *  - seller_id: filter by seller
 *  - channel: filter by channel (Online/Boletería)
 *  - startDate: filter by date range start
 *  - endDate: filter by date range end
 */
router.get('/sales-detail', authenticateToken, requireRole('admin', 'boleteria', 'productor'), async (req, res) => {
  try {
    const { 
      show_id, 
      session_id,
      status = 'all', 
      page = 1, 
      limit = 20, 
      search = '',
      date,
      seller_id,
      channel,
      startDate,
      endDate,
      producer_id
    } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    
    const { 
      shows: Show, 
      sessions: Session, 
      tickets: Ticket, 
      sales: Sale, 
      discounts: Discount, 
      users: User,
      show_producer: ShowProducer,
      bordereaux: Bordereaux
    } = sequelize.models;
    
    // Get service fee for mp total_amount calculation
    const serviceFeePercent = await getServiceFeePercent();
    const serviceFeeDivisor = 1 + (serviceFeePercent / 100);
    
    // Build show filter
    let showWhere = {};
    if (show_id) {
      showWhere.id = show_id;
    }
    if (producer_id) {
      const showIds = await ShowProducer.findAll({
        where: { producer_id },
        attributes: ['show_id'],
        raw: true
      });
      showWhere.id = { [Op.in]: showIds.map(sp => sp.show_id) };
    }
    
    // Get closed bordereaux for status filtering
    const closedBordereaux = await Bordereaux.findAll({
      where: { status: 'cerrado' },
      attributes: ['show_id'],
      raw: true
    });
    const showsWithClosedBordereaux = closedBordereaux.map(b => b.show_id);
    
    // Build date filters for sales
    let saleDateFilter = {};
    if (startDate || endDate) {
      saleDateFilter.created_at = {};
      if (startDate) saleDateFilter.created_at[Op.gte] = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        saleDateFilter.created_at[Op.lte] = endDateTime;
      }
    }
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      saleDateFilter.created_at = { [Op.gte]: startOfDay, [Op.lte]: endOfDay };
    }
    
    // Build seller filter
    if (seller_id) {
      saleDateFilter.sold_by = seller_id;
    }
    
    // Build channel filter  
    if (channel) {
      if (channel === 'Online') {
        saleDateFilter.payment_method = { [Op.in]: ['mp', 'card'] };
      } else if (channel === 'Boletería') {
        saleDateFilter.payment_method = { [Op.notIn]: ['mp', 'card'] };
      }
    }
    
    // First, get total count (fast query)
    const sessionWhere = {};
    if (show_id) sessionWhere.show_id = show_id;
    if (session_id) sessionWhere.id = session_id;
    const countQuery = await Sale.findAll({
      where: Object.keys(saleDateFilter).length > 0 ? saleDateFilter : undefined,
      include: [
        {
          model: Session,
          as: 'session',
          required: true,
          where: Object.keys(sessionWhere).length > 0 ? sessionWhere : undefined,
          include: [{
            model: Show,
            as: 'show',
            required: true,
            where: Object.keys(showWhere).length > 0 ? showWhere : undefined
          }]
        }
      ],
      attributes: [[sequelize.fn('COUNT', sequelize.col('sales.id')), 'total']],
      raw: true
    });
    
    const totalCount = parseInt(countQuery[0]?.total || 0);
    
    // When searching, fetch more records to allow proper filtering and pagination
    const fetchLimit = search ? 1000 : limitNum; // Fetch up to 1000 when searching
    const fetchOffset = search ? 0 : offset; // Start from beginning when searching
    
    // Get paginated sales with all details
    const sales = await Sale.findAll({
      where: Object.keys(saleDateFilter).length > 0 ? saleDateFilter : undefined,
      include: [
        {
          model: Session,
          as: 'session',
          required: true,
          where: Object.keys(sessionWhere).length > 0 ? sessionWhere : undefined,
          include: [{
            model: Show,
            as: 'show',
            required: true,
            where: Object.keys(showWhere).length > 0 ? showWhere : undefined
          }]
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone', 'dni', 'localidad'],
          required: false
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: User,
          as: 'cashier',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: Discount,
          as: 'discount',
          required: false
        },
        {
          model: Ticket,
          as: 'tickets',
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: fetchLimit,
      offset: fetchOffset
    });
    
    // Format sales data
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const salesDetail = [];
    
    for (const sale of sales) {
      const saleTickets = sale.tickets || [];
      const rawMetadata = sale.metadata || {};
      const refundSnapshot = rawMetadata.refund_snapshot || null;
      const session = sale.session;
      const show = session?.show;
      
      if (!show) continue;
      
      // Check status filter
      const hasBordereauxClosed = showsWithClosedBordereaux.includes(show.id);
      const hasAllSessionsPast = new Date(session?.starts_at) < new Date();
      const showIsFinished = hasBordereauxClosed || hasAllSessionsPast;
      
      if (status === 'active' && showIsFinished) continue;
      if (status === 'finished' && !showIsFinished) continue;
      
      // Search filter (applied in JS for complex fields)
      if (search) {
        const q = search.toLowerCase();
        const searchable = [
          sale.customer_name || '',
          sale.customer_email || '',
          sale.user?.name || '',
          sale.user?.email || '',
          sale.user?.dni || '',
          sale.user?.phone || '',
          sale.user?.localidad || '',
          show.title || '',
          sale.seller?.name || '',
          sale.cashier?.name || '',
          sale.discount?.code || '',
          sale.discount?.alias || ''
        ].join(' ').toLowerCase();
        
        if (!searchable.includes(q)) continue;
      }
      
      let effectiveLocations = [];
      let effectiveTicketsCount = 0;
      let effectivePeopleCount = 0;
      
      if (saleTickets.length > 0) {
        const regularTickets = saleTickets.filter(t => t.type !== 'service');
        effectiveLocations = regularTickets.map(ticket =>
          formatSeatLocation(ticket.type, ticket.section, ticket.seat_code, ticket.capacity || 1)
        );
        effectiveTicketsCount = regularTickets.length;
        effectivePeopleCount = calculateRealPeople(regularTickets);
      } else if (refundSnapshot && Array.isArray(refundSnapshot.locations) && refundSnapshot.locations.length > 0) {
        effectiveLocations = refundSnapshot.locations;
        effectiveTicketsCount = refundSnapshot.tickets_count || refundSnapshot.locations.length;
        effectivePeopleCount = refundSnapshot.people_count || effectiveTicketsCount;
      }
      
      const isRefundOperation = rawMetadata.type === 'refund';
      const refunded = !!rawMetadata.refunded;
      
      const saleChannel = ((sale.payment_method === 'mp' || sale.payment_method === 'card')) ? 'Online' : 'Boletería';
      
      salesDetail.push({
        sale_id: sale.id,
        sale_date: sale.createdAt,
        show_title: show.title,
        show_status: showIsFinished ? 'finalizado' : 'activo',
        session_date: session?.starts_at,
        customer_name: sale.customer_name || (sale.user?.name) || 'N/A',
        customer_email: sale.customer_email || (sale.user?.email) || 'N/A',
        customer_phone: (sale.customer_phone !== undefined ? sale.customer_phone : null) || (sale.user?.phone) || null,
        customer_dni: (sale.customer_dni !== undefined ? sale.customer_dni : null) || (sale.user?.dni) || null,
        customer_localidad: (sale.customer_localidad !== undefined ? sale.customer_localidad : null) || (sale.user?.localidad) || null,
        sold_by_name: sale.cashier?.name || sale.seller?.name || (sale.sold_by ? 'Boletería' : 'Online'),
        sold_by_email: sale.cashier?.email || sale.seller?.email || '-',
        sold_by_id: sale.sold_by || null,
        channel: saleChannel,
        payment_method: sale.payment_method || 'N/A',
        tickets_count: effectiveTicketsCount,
        people_count: effectivePeopleCount,
        locations: effectiveLocations.join(', '),
        discount_code: sale.discount?.alias || sale.discount?.code || null,
        discount_value: sale.discount ? 
          (sale.discount.type === 'percentage' ? `${sale.discount.value}%` : `$${sale.discount.value}`) 
          : null,
        total_amount: (sale.payment_method === 'mp' ? parseFloat(sale.total_amount || 0) / serviceFeeDivisor : parseFloat(sale.total_amount || 0)).toFixed(2),
        validated: saleTickets.filter(t => t.status === 'validated').length,
        refunded,
        refund_type: rawMetadata.type || null,
        refund_reason: rawMetadata.refund_reason || rawMetadata.reason || null,
        refunded_at: rawMetadata.refunded_at || null,
        is_refund_operation: isRefundOperation,
        service_items: (() => {
          try {
            if (!sale.service_items) return [];
            const parsed = typeof sale.service_items === 'string' ? JSON.parse(sale.service_items) : sale.service_items;
            return parsed;
          } catch { return []; }
        })()
      });
    }
    
    // When searching, manually paginate the filtered results
    let paginatedSales = salesDetail;
    let filteredTotal = salesDetail.length;
    let totalPages = Math.ceil(filteredTotal / limitNum);
    
    if (search) {
      // Apply manual pagination to filtered results
      const startIndex = offset;
      const endIndex = startIndex + limitNum;
      paginatedSales = salesDetail.slice(startIndex, endIndex);
    } else {
      // Use normal pagination for non-search queries
      filteredTotal = status !== 'all' ? salesDetail.length : Math.min(totalCount - offset, limitNum);
      totalPages = Math.ceil(totalCount / limitNum);
    }
    
    res.json({
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: search ? salesDetail.length : totalCount,
        totalPages: search ? Math.ceil(salesDetail.length / limitNum) : totalPages,
        hasNext: search ? (pageNum * limitNum < salesDetail.length) : (pageNum * limitNum < totalCount),
        hasPrev: pageNum > 1
      },
      sales: paginatedSales,
      totalCount: search ? salesDetail.length : totalCount
    });
    
  } catch (error) {
    console.error('[REPORTS] Error getting paginated sales:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
