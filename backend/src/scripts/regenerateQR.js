import { generateContainerQR } from '../lib/qrGenerator.js';
import { initSequelize, sequelize } from '../lib/sequelize.js';
import '../models/registerModels.js';

const saleId = process.argv[2];
if (!saleId) {
  console.error('Usage: node regenerateQR.js <sale_id>');
  process.exit(1);
}

async function regenerate() {
  try {
    await initSequelize();
    await sequelize.authenticate();
    const { sales: Sale, tickets: Ticket } = sequelize.models;
    
    const sale = await Sale.findByPk(saleId);
    if (!sale) {
      console.error('Sale not found:', saleId);
      process.exit(1);
    }
    
    // Get tickets to calculate capacity
    const tickets = await Ticket.findAll({ where: { sale_id: saleId } });
    const items = tickets.map(t => ({
      type: t.type,
      seat_code: t.seat_code,
      quantity: t.capacity || 1
    }));
    
    console.log('Found', items.length, 'tickets');
    
    // Generate new QR
    const containerQR = await generateContainerQR(saleId, items);
    
    // Update sale
    await sale.update({
      container_qr_code: containerQR.qr_code,
      container_qr_data: containerQR.qr_data,
      total_capacity: containerQR.total_capacity
    });
    
    console.log('✅ QR regenerated successfully');
    console.log('QR Data:', containerQR.qr_data);
    console.log('Total Capacity:', containerQR.total_capacity);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

regenerate();
