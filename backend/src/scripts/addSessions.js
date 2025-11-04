import 'dotenv/config';
import dayjs from 'dayjs';
import { sequelize } from '../lib/sequelize.js';
import registerModels from '../models/registerModels.js';

async function main() {
  try {
    registerModels(sequelize);
    await sequelize.authenticate();

    const { shows: Show, sessions: Session } = sequelize.models;

    console.log('🔍 Buscando shows existentes...\n');

    const shows = await Show.findAll();

    if (shows.length === 0) {
      console.log('⚠️  No hay shows en la base de datos.');
      console.log('Ejecutá primero: npm run reseed');
      process.exit(1);
    }

    console.log(`✓ Encontrados ${shows.length} show(s)\n`);

    let totalCreated = 0;

    for (const show of shows) {
      console.log(`📅 Show: ${show.title}`);
      
      // Check existing sessions
      const existingSessions = await Session.count({ where: { show_id: show.id } });
      
      if (existingSessions > 0) {
        console.log(`   Ya tiene ${existingSessions} session(s), omitiendo...\n`);
        continue;
      }

      // Create 2 sessions for this show
      const showDate = dayjs(show.date);
      const showTime = show.time || '20:00';
      
      const session1 = await Session.create({
        show_id: show.id,
        starts_at: showDate.format('YYYY-MM-DD') + ' ' + showTime,
        ends_at: dayjs(showDate.format('YYYY-MM-DD') + ' ' + showTime).add(3, 'hour').toDate()
      });

      const session2 = await Session.create({
        show_id: show.id,
        starts_at: showDate.format('YYYY-MM-DD') + ' ' + '23:00',
        ends_at: dayjs(showDate.format('YYYY-MM-DD') + ' ' + '23:00').add(3, 'hour').toDate()
      });

      console.log(`   ✓ Creadas 2 sessions:`);
      console.log(`     - ${showTime} hrs`);
      console.log(`     - 23:00 hrs\n`);
      
      totalCreated += 2;
    }

    console.log(`\n✅ Completado! Se crearon ${totalCreated} session(s) en total.`);
    console.log('🚀 Ahora podés iniciar el servidor: npm run dev');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

main();
