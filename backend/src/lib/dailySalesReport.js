import dayjs from 'dayjs';
import { Op } from 'sequelize';
import { sequelize } from './sequelize.js';

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
};

const formatDisplayDate = (date) => {
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export async function buildDailySalesSnapshot(targetDate = new Date()) {
  const { sales: Sale, sessions: Session, shows: Show, tickets: Ticket, cash_register_shifts: CashRegisterShift } =
    sequelize.models;

  const day = dayjs(targetDate);
  const startOfDay = day.startOf('day').toDate();
  const endOfDay = day.endOf('day').toDate();

  const sales = await Sale.findAll({
    where: {
      payment_status: 'approved',
      created_at: {
        [Op.gte]: startOfDay,
        [Op.lte]: endOfDay
      }
    },
    include: [
      {
        model: Session,
        as: 'session',
        include: [
          {
            model: Show,
            as: 'show',
            attributes: ['id', 'title']
          }
        ]
      },
      {
        model: Ticket,
        as: 'tickets',
        attributes: ['id']
      }
    ],
    order: [['created_at', 'ASC']]
  });

  const showsMap = new Map();
  let totalRevenue = 0;
  let totalTickets = 0;

  for (const sale of sales) {
    const showId = sale.session?.show?.id || 'unknown';
    const showTitle = sale.session?.show?.title || 'Show sin nombre';
    const ticketCount = sale.tickets?.length || 0;
    const amount = toNumber(sale.total_amount);

    totalRevenue += amount;
    totalTickets += ticketCount;

    if (!showsMap.has(showId)) {
      showsMap.set(showId, {
        title: showTitle,
        tickets: 0,
        revenue: 0
      });
    }

    const showStats = showsMap.get(showId);
    showStats.tickets += ticketCount;
    showStats.revenue += amount;
  }

  const showStatsList = Array.from(showsMap.values()).sort((a, b) => b.tickets - a.tickets);

  const shifts = await CashRegisterShift.findAll({
    where: {
      status: 'closed',
      closed_at: {
        [Op.gte]: startOfDay,
        [Op.lte]: endOfDay
      }
    }
  });

  const cashSummary = {
    totalCash: 0,
    shiftCount: shifts.length
  };

  for (const shift of shifts) {
    // Prefer explicit field, fallback to closing summary data
    const cashValue =
      shift.cash_sales_total ??
      shift.closing_summary?.cash_sales_total ??
      shift.summary?.cash_sales_total ??
      shift.closing_summary?.cashSalesTotal;
    cashSummary.totalCash += toNumber(cashValue);
  }

  return {
    date: formatDisplayDate(startOfDay),
    totals: {
      sales: sales.length,
      tickets: totalTickets,
      revenue: totalRevenue
    },
    shows: showStatsList,
    cashSummary
  };
}

export function scheduleDailySalesEmail() {
  console.info('[DailySalesReport] scheduleDailySalesEmail() no-op en producción.');
}
