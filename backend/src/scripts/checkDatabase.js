import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sequelize } from '../lib/sequelize.js';
import registerModels from '../models/registerModels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../..', '.env') });

async function checkDatabase() {
  try {
    registerModels(sequelize);
    await sequelize.authenticate();
    console.log('✓ Conectado a la base de datos\n');

    const { shows: Show, sessions: Session, users: User, tickets: Ticket } = sequelize.models;

    // Check Shows
    const showCount = await Show.count();
    console.log('📊 SHOWS:', showCount);
    if (showCount > 0) {
      const shows = await Show.findAll({ limit: 5 });
      shows.forEach(s => {
        console.log(`  - ${s.title} (${s.date} ${s.time})`);
      });
    }

    // Check Sessions
    const sessionCount = await Session.count();
    console.log('\n📊 SESSIONS:', sessionCount);
    if (sessionCount > 0) {
      const sessions = await Session.findAll({ 
        limit: 5,
        include: [{ model: Show, as: 'show' }]
      });
      sessions.forEach(s => {
        console.log(`  - ${s.show?.title || 'N/A'}: ${s.starts_at}`);
      });
    } else {
      console.log('  ⚠️  Tabla sessions está vacía!');
    }

    // Check Users
    const userCount = await User.count();
    console.log('\n📊 USERS:', userCount);

    // Check Tickets
    const ticketCount = await Ticket.count();
    console.log('\n📊 TICKETS:', ticketCount);

    console.log('\n' + '='.repeat(50));
    
    if (sessionCount === 0) {
      console.log('\n⚠️  PROBLEMA DETECTADO:');
      console.log('No hay sessions en la base de datos.');
      console.log('\n💡 SOLUCIÓN:');
      console.log('Ejecutá: npm run seed');
      console.log('Esto creará shows y sessions de ejemplo.');
    } else {
      console.log('\n✅ La base de datos tiene datos básicos.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkDatabase();
