import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { Op } from 'sequelize';

const router = express.Router();

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
    } else {
      // Butacas = 1 persona
      totalPeople += 1;
    }
  });
  
  return totalPeople;
}

// Helper: Capacidad real de una sesión
function calculateSessionCapacity(capacityOverride) {
  // Capacidad base: 62 butacas + 28 palcos bajos (4 cada uno = 112) + 4 palcos altos (2 cada uno = 8) + 92 pullman
  // Total: 62 + 112 + 8 + 92 = 274 personas
  return capacityOverride || 274;
}

/**
 * GET /api/reports/show/:show_id
 * Reporte detallado de un show específico (todas sus sesiones)
 */
router.get('/show/:show_id', authenticateToken, requireRole('admin', 'boleteria', 'productor'), async (req, res) => {
  try {
    const { show_id } = req.params;
    const { date, seller_id, channel } = req.query; // Filtros opcionales
    const { shows: Show, sessions: Session, tickets: Ticket, sales: Sale, discounts: Discount, users: User } = sequelize.models;
    
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
            required: false
          },
          {
            model: Sale,
            as: 'sales',
            required: false,
            include: [
              {
                model: Discount,
                as: 'discount',
                required: false
              },
              {
                model: User,
                as: 'user',
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
                model: User,
                as: 'seller',
                attributes: ['id', 'name', 'email'],
                required: false
              },
              {
                model: Ticket,
                as: 'tickets',
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
    
    for (const session of show.sessions) {
      const sessionCapacity = calculateSessionCapacity(session.capacity_override);
      const soldTickets = session.tickets || [];
      const validatedTickets = soldTickets.filter(t => t.status === 'validated');
      const sessionSales = session.sales || [];
      
      // Calcular revenue sin el cargo de servicio del 10%
      // IMPORTANTE: Solo ventas online incluyen el 10%, boletería no lo incluye
      const sessionRevenue = sessionSales.reduce((sum, sale) => {
        const amount = parseFloat(sale.total_amount || 0);
        // Una venta es ONLINE solo si payment_method es 'mp'
        const isOnline = sale.payment_method === 'mp';
        return sum + (isOnline ? amount / 1.10 : amount);
      }, 0);
      
      const sessionPeople = calculateRealPeople(soldTickets);
      const sessionValidatedPeople = calculateRealPeople(validatedTickets);
      
      // Desglose por ubicación
      soldTickets.forEach(ticket => {
        const price = parseFloat(ticket.price || 0);
        
        if (ticket.type === 'butaca') {
          locationBreakdown.platea_general.count++;
          locationBreakdown.platea_general.people++;
          locationBreakdown.platea_general.revenue += price;
        } else if (ticket.type === 'palco') {
          if (ticket.seat_code?.startsWith('PB')) {
            locationBreakdown.palcos_bajos.count++;
            locationBreakdown.palcos_bajos.people += 4;
            locationBreakdown.palcos_bajos.revenue += price;
          } else if (ticket.seat_code?.startsWith('PA')) {
            locationBreakdown.palcos_altos.count++;
            locationBreakdown.palcos_altos.people += 2;
            locationBreakdown.palcos_altos.revenue += price;
          }
        } else if (ticket.type === 'pullman') {
          locationBreakdown.pullman.count++;
          locationBreakdown.pullman.people += ticket.capacity || 1;
          locationBreakdown.pullman.revenue += price;
        }
      });
      
      // Métodos de pago
      sessionSales.forEach(sale => {
        const method = sale.payment_method || 'unknown';
        paymentMethods[method] = (paymentMethods[method] || 0) + 1;
        
        // Canal de venta
        if (sale.payment_method === 'mp') {
          saleChannels.online++;
        } else {
          saleChannels.boleteria++;
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
    const allSales = show.sessions.flatMap(s => s.sales || []);
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
    
    // Construir detalle de ventas
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const salesDetail = [];
    
    for (const session of show.sessions) {
      const sessionSales = session.sales || [];
      
      for (const sale of sessionSales) {
        const saleTickets = sale.tickets || [];
        const rawMetadata = sale.metadata || {};
        const refundSnapshot = rawMetadata.refund_snapshot || null;

        let effectiveLocations = [];
        let effectiveTicketsCount = 0;
        let effectivePeopleCount = 0;

        if (saleTickets.length > 0) {
          effectiveLocations = saleTickets.map(ticket =>
            formatSeatLocation(ticket.type, ticket.section, ticket.seat_code, ticket.capacity || 1)
          );
          effectiveTicketsCount = saleTickets.length;
          effectivePeopleCount = calculateRealPeople(saleTickets);
        } else if (refundSnapshot && Array.isArray(refundSnapshot.locations) && refundSnapshot.locations.length > 0) {
          effectiveLocations = refundSnapshot.locations;
          effectiveTicketsCount = refundSnapshot.tickets_count || refundSnapshot.locations.length;
          effectivePeopleCount = refundSnapshot.people_count || effectiveTicketsCount;
        }

        const isRefundOperation = rawMetadata.type === 'refund';
        const refunded = !!rawMetadata.refunded;
        const refundReason = rawMetadata.refund_reason || rawMetadata.reason || null;
        const refundedAt = rawMetadata.refunded_at || null;

        const saleChannel = (sale.payment_method === 'mp') ? 'Online' : 'Boletería';
        const saleSellerId = sale.sold_by || null;
        const saleDate = new Date(sale.createdAt);
        
        // Aplicar filtros
        if (date) {
          const filterDate = new Date(date);
          if (saleDate.toDateString() !== filterDate.toDateString()) {
            continue; // Skip esta venta
          }
        }
        
        if (seller_id && saleSellerId !== seller_id) {
          continue; // Skip esta venta
        }
        
        if (channel && saleChannel !== channel) {
          continue; // Skip esta venta
        }
        
        const saleData = {
          sale_id: sale.id,
          sale_date: sale.createdAt,
          session_date: session.starts_at,
          customer_name: sale.customer_name || (sale.user?.name) || 'N/A',
          customer_email: sale.customer_email || (sale.user?.email) || 'N/A',
          customer_phone: (sale.customer_phone !== undefined ? sale.customer_phone : null) || (sale.user?.phone) || null,
          customer_dni: (sale.customer_dni !== undefined ? sale.customer_dni : null) || (sale.user?.dni) || null,
          sold_by_name: sale.cashier?.name || sale.seller?.name || (sale.sold_by ? 'Boletería' : 'Online'),
          sold_by_email: sale.cashier?.email || sale.seller?.email || '-',
          sold_by_id: saleSellerId,
          channel: saleChannel,
          payment_method: sale.payment_method || 'N/A',
          tickets_count: effectiveTicketsCount,
          people_count: effectivePeopleCount,
          locations: effectiveLocations.join(', '),
          discount_code: sale.discount?.code || null,
          discount_value: sale.discount ? 
            (sale.discount.type === 'percentage' ? `${sale.discount.value}%` : `$${sale.discount.value}`) 
            : null,
          total_amount: (() => {
            const amount = parseFloat(sale.total_amount || 0);
            const isOnline = sale.payment_method === 'mp';
            return (isOnline ? amount / 1.10 : amount).toFixed(2);
          })(),
          validated: saleTickets.filter(t => t.status === 'validated').length,
          refunded,
          refund_type: rawMetadata.type || null,
          refund_reason: refundReason,
          refunded_at: refundedAt,
          is_refund_operation: isRefundOperation
        };
        
        salesDetail.push(saleData);
      }
    }
    
    // Ordenar por fecha (más recientes primero)
    salesDetail.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
    
    const report = {
      show: {
        id: show.id,
        title: show.title,
        description: show.description,
        sessionsCount: show.sessions.length
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
      paymentMethods,
      saleChannels,
      sessions: sessionsData,
      salesDetail  // Nueva sección
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
    const { shows: Show, sessions: Session, tickets: Ticket, sales: Sale, discounts: Discount, users: User, show_producer: ShowProducer } = sequelize.models;
    
    // Construir filtro de fechas
    const dateFilter = {};
    if (startDate) {
      dateFilter[Op.gte] = new Date(startDate);
    }
    if (endDate) {
      dateFilter[Op.lte] = new Date(endDate);
    }
    
    // Filtro de estado
    let sessionWhere = {};
    if (Object.keys(dateFilter).length > 0) {
      sessionWhere.starts_at = dateFilter;
    }
    
    if (status === 'active') {
      sessionWhere.starts_at = { ...sessionWhere.starts_at, [Op.gte]: new Date() };
    } else if (status === 'finished') {
      sessionWhere.starts_at = { ...sessionWhere.starts_at, [Op.lt]: new Date() };
    }
    
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
    
    // Obtener todos los shows con sus sesiones
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
          },
          {
            model: Sale,
            as: 'sales',
            required: false,
            include: [
              {
                model: Discount,
                as: 'discount',
                required: false
              },
              {
                model: User,
                as: 'user',
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
                model: User,
                as: 'seller',
                attributes: ['id', 'name', 'email'],
                required: false
              },
              {
                model: Ticket,
                as: 'tickets',
                required: false
              }
            ]
          }
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
    
    for (const show of shows) {
      const sessions = show.sessions || [];
      if (sessions.length === 0) continue;
      
      let showRevenue = 0;
      let showTickets = 0;
      let showPeople = 0;
      let showCapacity = 0;
      let showValidated = 0;
      let showPeopleValidated = 0;
      
      for (const session of sessions) {
        const sessionCapacity = calculateSessionCapacity(session.capacity_override);
        const soldTickets = session.tickets || [];
        const validatedTickets = soldTickets.filter(t => t.status === 'validated');
        const sessionSales = session.sales || [];
        
        // Calcular revenue sin el cargo de servicio del 10%
        // IMPORTANTE: Solo ventas online incluyen el 10%, boletería no lo incluye
        const sessionRevenue = sessionSales.reduce((sum, sale) => {
          const amount = parseFloat(sale.total_amount || 0);
          const isOnline = sale.payment_method === 'mp';
          return sum + (isOnline ? amount / 1.10 : amount);
        }, 0);
        
        const sessionPeople = calculateRealPeople(soldTickets);
        const sessionValidatedPeople = calculateRealPeople(validatedTickets);
        
        // Acumular por ubicación
        soldTickets.forEach(ticket => {
          const price = parseFloat(ticket.price || 0);
          
          if (ticket.type === 'butaca') {
            locationBreakdown.platea_general.count++;
            locationBreakdown.platea_general.people++;
            locationBreakdown.platea_general.revenue += price;
          } else if (ticket.type === 'palco') {
            if (ticket.seat_code?.startsWith('PB')) {
              locationBreakdown.palcos_bajos.count++;
              locationBreakdown.palcos_bajos.people += 4;
              locationBreakdown.palcos_bajos.revenue += price;
            } else if (ticket.seat_code?.startsWith('PA')) {
              locationBreakdown.palcos_altos.count++;
              locationBreakdown.palcos_altos.people += 2;
              locationBreakdown.palcos_altos.revenue += price;
            }
          } else if (ticket.type === 'pullman') {
            locationBreakdown.pullman.count++;
            locationBreakdown.pullman.people += ticket.capacity || 1;
            locationBreakdown.pullman.revenue += price;
          }
        });
        
        // Métodos de pago
        sessionSales.forEach(sale => {
          const method = sale.payment_method || 'unknown';
          paymentMethods[method] = (paymentMethods[method] || 0) + 1;
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
    
    // Construir detalle de ventas para todos los shows
    const { formatSeatLocation } = await import('../lib/seatFormatter.js');
    const salesDetail = [];
    
    for (const show of shows) {
      const sessions = show.sessions || [];
      
      for (const session of sessions) {
        const sessionSales = session.sales || [];
        
        for (const sale of sessionSales) {
          const saleTickets = sale.tickets || [];
          const rawMetadata = sale.metadata || {};
          const refundSnapshot = rawMetadata.refund_snapshot || null;

          let effectiveLocations = [];
          let effectiveTicketsCount = 0;
          let effectivePeopleCount = 0;

          if (saleTickets.length > 0) {
            effectiveLocations = saleTickets.map(ticket =>
              formatSeatLocation(ticket.type, ticket.section, ticket.seat_code, ticket.capacity || 1)
            );
            effectiveTicketsCount = saleTickets.length;
            effectivePeopleCount = calculateRealPeople(saleTickets);
          } else if (refundSnapshot && Array.isArray(refundSnapshot.locations) && refundSnapshot.locations.length > 0) {
            effectiveLocations = refundSnapshot.locations;
            effectiveTicketsCount = refundSnapshot.tickets_count || refundSnapshot.locations.length;
            effectivePeopleCount = refundSnapshot.people_count || effectiveTicketsCount;
          }

          const isRefundOperation = rawMetadata.type === 'refund';
          const refunded = !!rawMetadata.refunded;
          const refundReason = rawMetadata.refund_reason || rawMetadata.reason || null;
          const refundedAt = rawMetadata.refunded_at || null;

          const saleChannel = (sale.payment_method === 'mp') ? 'Online' : 'Boletería';
          const saleSellerId = sale.sold_by || null;
          const saleDate = new Date(sale.createdAt);
          
          // Aplicar filtros
          if (date) {
            const filterDate = new Date(date);
            if (saleDate.toDateString() !== filterDate.toDateString()) {
              continue; // Skip esta venta
            }
          }
          
          if (seller_id && saleSellerId !== seller_id) {
            continue; // Skip esta venta
          }
          
          if (channel && saleChannel !== channel) {
            continue; // Skip esta venta
          }
          
          const saleData = {
            sale_id: sale.id,
            sale_date: sale.createdAt,
            show_title: show.title,
            session_date: session.starts_at,
            customer_name: sale.customer_name || (sale.user?.name) || 'N/A',
            customer_email: sale.customer_email || (sale.user?.email) || 'N/A',
            customer_phone: (sale.customer_phone !== undefined ? sale.customer_phone : null) || (sale.user?.phone) || null,
            customer_dni: (sale.customer_dni !== undefined ? sale.customer_dni : null) || (sale.user?.dni) || null,
            sold_by_name: sale.seller ? sale.seller.name : (sale.user ? sale.user.name : 'Sistema'),
            sold_by_email: sale.seller ? sale.seller.email : (sale.user ? sale.user.email : '-'),
            sold_by_id: saleSellerId,
            channel: sale.payment_method === 'mp' ? 'Online' : 'Boletería',
            payment_method: sale.payment_method || 'N/A',
            tickets_count: effectiveTicketsCount,
            people_count: effectivePeopleCount,
            locations: effectiveLocations.join(', '),
            discount_code: sale.discount?.code || null,
            discount_value: sale.discount ? 
              (sale.discount.type === 'percentage' ? `${sale.discount.value}%` : `$${sale.discount.value}`) 
              : null,
            total_amount: (() => {
              const amount = parseFloat(sale.total_amount || 0);
              const isOnline = sale.payment_method === 'mp';
              return (isOnline ? amount / 1.10 : amount).toFixed(2);
            })(),
            validated: saleTickets.filter(t => t.status === 'validated').length,
            refunded,
            refund_type: rawMetadata.type || null,
            refund_reason: refundReason,
            refunded_at: refundedAt,
            is_refund_operation: isRefundOperation
          };
          
          salesDetail.push(saleData);
        }
      }
    }
    
    // Ordenar por fecha (más recientes primero)
    salesDetail.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
    
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
      paymentMethods,
      shows: showsData,
      topShow: showsData[0] || null,
      salesDetail  // Nueva sección
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
        const saleChannel = sale.payment_method === 'mp' ? 'Online' : 'Boletería';
        if (channel && saleChannel !== channel) continue;
        
        // Build locations and counts, using snapshot when no tickets are linked
        let effectiveLocations = [];
        let effectiveTicketsCount = 0;
        let effectivePeopleCount = 0;

        if (saleTickets.length > 0) {
          effectiveLocations = saleTickets.map(t => {
            if (t.type === 'butaca') return t.seat_code;
            if (t.type === 'palco') return t.seat_code;
            if (t.type === 'pullman') return `Pullman`;
            return t.type;
          });
          effectiveTicketsCount = saleTickets.length;
          effectivePeopleCount = calculateRealPeople(saleTickets);
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
        
        const amount = parseFloat(sale.total_amount || 0);
        const isOnline = sale.payment_method === 'mp';
        const totalAmount = (isOnline ? amount / 1.10 : amount).toFixed(2);
        
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
    const daysNum = Math.min(parseInt(days), 365);
    
    const { sales: Sale, sessions: Session, shows: Show, tickets: Ticket } = sequelize.models;
    
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
    const ticketsByDate = {};
    
    sales.forEach((sale, index) => {
      // Skip sales with invalid dates
      if (!sale.createdAt) return;
      
      const saleDate = new Date(sale.createdAt);
      if (isNaN(saleDate.getTime())) return; // Invalid date
      
      // Use local date string to avoid timezone issues
      const year = saleDate.getFullYear();
      const month = String(saleDate.getMonth() + 1).padStart(2, '0');
      const day = String(saleDate.getDate()).padStart(2, '0');
      const date = `${year}-${month}-${day}`;
      
      if (!salesByDate[date]) {
        salesByDate[date] = 0;
        revenueByDate[date] = 0;
        ticketsByDate[date] = 0;
      }
      
      salesByDate[date]++;
      revenueByDate[date] += Number(sale.total_amount || 0);
      ticketsByDate[date] += sale.tickets?.length || 0;
    });
    
    // Create array of dates with data
    const dates = [];
    const salesData = [];
    const revenueData = [];
    const ticketsData = [];
    
    for (let i = 0; i < daysNum; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      // Use local date string to avoid timezone issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      dates.push(dateStr);
      salesData.push(salesByDate[dateStr] || 0);
      revenueData.push(revenueByDate[dateStr] || 0);
      ticketsData.push(ticketsByDate[dateStr] || 0);
    }
    
    // Get channel breakdown
    const channelData = {
      online: 0,
      boxoffice: 0
    };
    
    sales.forEach(sale => {
      if (sale.payment_method === 'mp') {
        channelData.online++;
      } else {
        channelData.boxoffice++;
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
      showStats[showId].revenue += Number(sale.total_amount || 0);
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
        online: sales.filter(s => s.payment_method === 'mp').length,
        boxoffice: sales.filter(s => s.payment_method !== 'mp').length
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

export default router;
