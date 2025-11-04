import 'dotenv/config';
import { sequelize } from '../lib/sequelize.js';
import registerModels from '../models/registerModels.js';
import { generateTicketQR } from '../lib/qr.js';

async function main() {
  try {
    registerModels(sequelize);
    await sequelize.authenticate();

    const { tickets: Ticket } = sequelize.models;

    console.log('🔍 Buscando tickets sin QR code...\n');

    // Find tickets without qr_data (nuevos) or with old placeholder QR
    const tickets = await Ticket.findAll({
      where: {
        status: 'sold'
      }
    });

    if (tickets.length === 0) {
      console.log('✓ No hay tickets para actualizar.');
      process.exit(0);
    }

    console.log(`📊 Encontrados ${tickets.length} ticket(s) en estado "sold"\n`);

    let updated = 0;
    let skipped = 0;

    for (const ticket of tickets) {
      // Check if needs QR regeneration
      const needsQR = !ticket.qr_data || !ticket.qr_code || ticket.qr_code.startsWith('TEP:');

      if (!needsQR) {
        skipped++;
        continue;
      }

      // Generate new QR
      const { qr_code, qr_data } = await generateTicketQR(ticket);
      
      await ticket.update({
        qr_code,
        qr_data
      });

      updated++;
      
      console.log(`✓ Ticket ${ticket.id.substring(0, 8)}... - ${ticket.type} ${ticket.seat_code || 'pullman'}`);
    }

    console.log(`\n✅ Completado!`);
    console.log(`  - Tickets actualizados: ${updated}`);
    console.log(`  - Tickets omitidos (ya tenían QR): ${skipped}`);
    console.log('\n🚀 Los tickets ahora tienen QR codes válidos.');
    console.log('   Recargá la página de perfil para verlos.');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

main();
