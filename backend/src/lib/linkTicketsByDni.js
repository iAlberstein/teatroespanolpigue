import { Op } from 'sequelize';
import { sequelize } from './sequelize.js';

/**
 * Link historical sales/tickets that were purchased as guest (customer_dni)
 * to a user account that has the same DNI.
 *
 * @param {string} userId - UUID of the user that should own the sales/tickets
 * @param {string} dni - DNI value used during guest checkout
 * @returns {Promise<{salesUpdated: number, ticketsUpdated: number}>}
 */
export async function linkTicketsToUserByDni(userId, dni) {
  if (!userId || !dni) {
    return { salesUpdated: 0, ticketsUpdated: 0 };
  }

  const { sales: Sale, tickets: Ticket } = sequelize.models;

  const salesToLink = await Sale.findAll({
    where: {
      customer_dni: dni,
      [Op.or]: [
        { user_id: null },
        { user_id: { [Op.ne]: userId } }
      ]
    },
    attributes: ['id']
  });

  if (!salesToLink.length) {
    return { salesUpdated: 0, ticketsUpdated: 0 };
  }

  const saleIds = salesToLink.map(sale => sale.id);

  const [salesUpdated] = await Sale.update(
    { user_id: userId },
    { where: { id: { [Op.in]: saleIds } } }
  );

  const [ticketsUpdated] = await Ticket.update(
    { user_id: userId },
    {
      where: {
        sale_id: { [Op.in]: saleIds },
        [Op.or]: [
          { user_id: null },
          { user_id: { [Op.ne]: userId } }
        ]
      }
    }
  );

  console.log('[DNI LINKER] Linked by DNI', dni, '=> sales:', salesUpdated, 'tickets:', ticketsUpdated);

  return { salesUpdated, ticketsUpdated };
}
