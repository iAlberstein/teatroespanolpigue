import express from 'express';
import { requireRole, authenticateToken } from '../middleware/auth.js';
import { getSequelize } from '../lib/sequelize.js';
import { Op } from 'sequelize';

const router = express.Router();

const getModels = () => {
  const sequelizeInstance = getSequelize();
  if (!sequelizeInstance) {
    throw new Error('Sequelize not initialized. Call initSequelize() first.');
  }
  const { sales, sessions, shows, users, system_settings } = sequelizeInstance.models || {};
  if (!sales || !sessions || !shows || !users || !system_settings) {
    throw new Error('Sequelize not initialized. Call initSequelize() first.');
  }
  return {
    Sale: sales,
    Session: sessions,
    Show: shows,
    User: users,
    SystemSettings: system_settings
  };
};

// Helper function to calculate service charge
const getServiceFeePercent = async () => {
  try {
    const { SystemSettings } = getModels();
    const setting = await SystemSettings.findOne({ where: { key: 'service_fee_percent' } });
    return setting ? parseFloat(setting.value) : 0;
  } catch (error) {
    console.error('Error getting service fee percent:', error);
    return 0;
  }
};

// Helper to parse a YYYY-MM-DD string as a local Date (start or end of day)
const parseDateOnly = (dateStr, endOfDay = false) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  if (endOfDay) {
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

// Get online sales for billing
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { Sale, Session, Show, User } = getModels();
    const { status = 'pending', from, to } = req.query;

    const fromDate = parseDateOnly(from, false);
    const toDate = parseDateOnly(to, true);

    const whereClause = {
      payment_method: {
        [Op.in]: ['mp', 'card', 'online']
      }, // Online sales only (mp = MercadoPago, card = SiPago)
      sold_by: null, // Exclude box office sales (they have sold_by set)
      payment_status: 'approved'
    };

    if (status === 'pending') {
      whereClause[Op.or] = [
        { billing_status: 'pending' },
        { billing_status: null }
      ];
    } else if (status === 'invoiced') {
      whereClause.billing_status = 'invoiced';
    }

    const sales = await Sale.findAll({
      where: whereClause,
      include: [
        {
          model: Session,
          as: 'session',
          include: [
            {
              model: Show,
              as: 'show',
              attributes: ['title']
            }
          ]
        },
        {
          model: User,
          as: 'invoiced_by_user',
          attributes: ['name', 'email']
        },
        {
          model: User,
          as: 'cashier',
          attributes: ['name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const serviceFeePercent = await getServiceFeePercent();

    const salesData = sales.map(sale => {
      const netAmount = parseFloat(sale.total_amount || 0);
      // total_amount stores ticket price WITHOUT service charge
      const serviceCharge = Math.round(netAmount * (serviceFeePercent / 100));

      const releaseDate = new Date(sale.createdAt);
      releaseDate.setDate(releaseDate.getDate() + 10);

      return {
        id: sale.id,
        createdAt: sale.createdAt,
        totalAmount: netAmount + serviceCharge,
        netAmount,
        serviceCharge,
        releaseDate,
        billingStatus: sale.billing_status,
        invoicedAt: sale.invoiced_at,
        invoicedBy: sale.invoiced_by_user,
        cashier: sale.cashier,
        showTitle: sale.session?.show?.title,
        sessionDate: sale.session?.starts_at,
        customerName: sale.customer_name,
        customerEmail: sale.customer_email,
        customerDni: sale.customer_dni
      };
    });

    const filteredSales = salesData.filter(sale => {
      if (!fromDate && !toDate) return true;
      const releaseDate = sale.releaseDate;
      if (fromDate && releaseDate < fromDate) return false;
      if (toDate && releaseDate > toDate) return false;
      return true;
    });

    res.json(filteredSales);
  } catch (error) {
    console.error('Error getting billing sales:', error);
    res.status(500).json({ error: 'Error al obtener ventas para facturación' });
  }
});

// Calculate service charges for period
router.get('/summary', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { Sale } = getModels();
    const { from, to } = req.query;

    const fromDate = parseDateOnly(from, false);
    const toDate = parseDateOnly(to, true);

    const whereClause = {
      payment_method: {
        [Op.in]: ['mp', 'card', 'online']
      },
      sold_by: null, // Exclude box office sales
      payment_status: 'approved'
    };

    whereClause[Op.or] = [
      { billing_status: 'pending' },
      { billing_status: null }
    ];

    const sales = await Sale.findAll({
      where: whereClause,
      attributes: ['total_amount', 'createdAt'],
      raw: true
    });

    const serviceFeePercent = await getServiceFeePercent();

    const filteredSales = sales.filter(sale => {
      const releaseDate = new Date(sale.createdAt);
      releaseDate.setDate(releaseDate.getDate() + 10);
      if (fromDate && releaseDate < fromDate) return false;
      if (toDate && releaseDate > toDate) return false;
      return true;
    });

    // total_amount stores ticket price WITHOUT service charge
    const totalServiceCharge = filteredSales.reduce((sum, sale) => {
      const netAmount = parseFloat(sale.total_amount || 0);
      if (!netAmount) return sum;
      const serviceCharge = netAmount * (serviceFeePercent / 100);
      return sum + serviceCharge;
    }, 0);

    res.json({
      totalServiceCharge: Math.round(totalServiceCharge),
      salesCount: filteredSales.length,
      serviceFeePercent,
      period: { from, to }
    });
  } catch (error) {
    console.error('Error calculating billing summary:', error);
    res.status(500).json({ error: 'Error al calcular resumen de facturación' });
  }
});

// Mark sales as invoiced
router.post('/invoice', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { Sale } = getModels();
    const { saleIds, userId } = req.body;
    
    if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
      return res.status(400).json({ error: 'Se deben especificar las ventas a facturar' });
    }

    const [updatedCount] = await Sale.update(
      {
        billing_status: 'invoiced',
        invoiced_at: new Date(),
        invoiced_by: userId
      },
      {
        where: {
          id: saleIds,
          [Op.or]: [
            { billing_status: 'pending' },
            { billing_status: null }
          ]
        }
      }
    );

    res.json({
      message: `${updatedCount} ventas marcadas como facturadas`,
      updatedCount
    });
  } catch (error) {
    console.error('Error marking sales as invoiced:', error);
    res.status(500).json({ error: 'Error al marcar ventas como facturadas' });
  }
});

// Monthly service charge report with SiPago retention
router.get('/service-charge-report', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { Sale } = getModels();

    const SIPAGO_FEE_RATE = 0.0295; // 2.95%
    const IVA_RATE = 1.21; // 21% IVA

    // Get all approved online sales
    const sales = await Sale.findAll({
      where: {
        payment_method: { [Op.in]: ['mp', 'card', 'online'] },
        sold_by: null,
        payment_status: 'approved'
      },
      attributes: ['total_amount', 'createdAt'],
      order: [['createdAt', 'ASC']],
      raw: true
    });

    const serviceFeePercent = await getServiceFeePercent();

    // Group by month
    const monthlyMap = {};

    for (const sale of sales) {
      const date = new Date(sale.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = {
          month: monthKey,
          salesCount: 0,
          grossTotal: 0,
          serviceChargeTotal: 0,
          sipagoRetentionTotal: 0,
          platformNetTotal: 0
        };
      }

      // total_amount stores ticket price WITHOUT service charge
      const netTicketPrice = parseFloat(sale.total_amount || 0);
      if (!netTicketPrice) continue;

      const serviceCharge = netTicketPrice * (serviceFeePercent / 100);
      const grossAmount = netTicketPrice + serviceCharge;
      const sipagoRetention = grossAmount * SIPAGO_FEE_RATE * IVA_RATE;
      const platformNet = serviceCharge - sipagoRetention;

      monthlyMap[monthKey].salesCount += 1;
      monthlyMap[monthKey].grossTotal += grossAmount;
      monthlyMap[monthKey].serviceChargeTotal += serviceCharge;
      monthlyMap[monthKey].sipagoRetentionTotal += sipagoRetention;
      monthlyMap[monthKey].platformNetTotal += platformNet;
    }

    // Sort by month and round values
    const months = Object.values(monthlyMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        grossTotal: Math.round(m.grossTotal),
        serviceChargeTotal: Math.round(m.serviceChargeTotal),
        sipagoRetentionTotal: Math.round(m.sipagoRetentionTotal),
        platformNetTotal: Math.round(m.platformNetTotal)
      }));

    // Grand totals
    const totals = months.reduce((acc, m) => ({
      salesCount: acc.salesCount + m.salesCount,
      grossTotal: acc.grossTotal + m.grossTotal,
      serviceChargeTotal: acc.serviceChargeTotal + m.serviceChargeTotal,
      sipagoRetentionTotal: acc.sipagoRetentionTotal + m.sipagoRetentionTotal,
      platformNetTotal: acc.platformNetTotal + m.platformNetTotal
    }), { salesCount: 0, grossTotal: 0, serviceChargeTotal: 0, sipagoRetentionTotal: 0, platformNetTotal: 0 });

    res.json({
      months,
      totals,
      config: {
        serviceFeePercent,
        sipagoFeeRate: SIPAGO_FEE_RATE * 100,
        ivaRate: (IVA_RATE - 1) * 100
      }
    });
  } catch (error) {
    console.error('Error generating service charge report:', error);
    res.status(500).json({ error: 'Error al generar reporte de service charge' });
  }
});

export default router;
