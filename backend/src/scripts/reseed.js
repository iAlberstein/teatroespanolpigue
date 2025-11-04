import 'dotenv/config';
import dayjs from 'dayjs';
import { sequelize } from '../lib/sequelize.js';
import registerModels from '../models/registerModels.js';

async function main() {
  try {
    registerModels(sequelize);
    await sequelize.authenticate();

    const { shows: Show, sessions: Session } = sequelize.models;

    console.log('🔄 Limpiando datos existentes...');
    
    // Delete existing data (without truncate to avoid FK issues)
    await Session.destroy({ where: {} });
    await Show.destroy({ where: {} });

    console.log('✓ Datos anteriores eliminados\n');
    console.log('📝 Creando datos de prueba...\n');

    // Create shows
    const shows = [];
    
    // Show 1: Gala Inaugural (próxima semana)
    const show1 = await Show.create({
      title: 'Gala Inaugural 2025',
      sala: 'Sala Principal',
      date: dayjs().add(7, 'day').format('YYYY-MM-DD'),
      time: '21:00',
      pricing_json: {
        platea_general: 5000,
        palcos_bajos: 8000,
        palcos_altos: 6000,
        pullman: 3000
      }
    });
    shows.push(show1);

    // Create 2 sessions for show1
    await Session.create({
      show_id: show1.id,
      starts_at: dayjs(show1.date + ' ' + show1.time).toDate(),
      ends_at: dayjs(show1.date + ' ' + show1.time).add(3, 'hour').toDate()
    });

    await Session.create({
      show_id: show1.id,
      starts_at: dayjs(show1.date + ' ' + '23:30').toDate(),
      ends_at: dayjs(show1.date + ' ' + '23:30').add(3, 'hour').toDate()
    });

    // Show 2: Concierto de Jazz (en 2 semanas)
    const show2 = await Show.create({
      title: 'Noche de Jazz',
      sala: 'Sala Principal',
      date: dayjs().add(14, 'day').format('YYYY-MM-DD'),
      time: '20:00',
      pricing_json: {
        platea_general: 4500,
        palcos_bajos: 7000,
        palcos_altos: 5500,
        pullman: 2800
      }
    });
    shows.push(show2);

    // Create 1 session for show2
    await Session.create({
      show_id: show2.id,
      starts_at: dayjs(show2.date + ' ' + show2.time).toDate(),
      ends_at: dayjs(show2.date + ' ' + show2.time).add(2, 'hour').toDate()
    });

    // Show 3: Teatro Clásico (en 3 semanas)
    const show3 = await Show.create({
      title: 'Romeo y Julieta',
      sala: 'Sala Principal',
      date: dayjs().add(21, 'day').format('YYYY-MM-DD'),
      time: '19:30',
      pricing_json: {
        platea_general: 6000,
        palcos_bajos: 9000,
        palcos_altos: 7000,
        pullman: 4000
      }
    });
    shows.push(show3);

    // Create 2 sessions for show3
    await Session.create({
      show_id: show3.id,
      starts_at: dayjs(show3.date + ' ' + show3.time).toDate(),
      ends_at: dayjs(show3.date + ' ' + show3.time).add(2.5, 'hour').toDate()
    });

    await Session.create({
      show_id: show3.id,
      starts_at: dayjs(show3.date + ' ' + '22:30').toDate(),
      ends_at: dayjs(show3.date + ' ' + '22:30').add(2.5, 'hour').toDate()
    });

    const sessionCount = await Session.count();

    console.log('✅ Seed completado exitosamente!\n');
    console.log('📊 Resumen:');
    console.log(`  - Shows creados: ${shows.length}`);
    console.log(`  - Sessions creadas: ${sessionCount}`);
    console.log('\nShows creados:');
    shows.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.title}`);
      console.log(`     Fecha: ${s.date} ${s.time}`);
      console.log(`     Precios: Platea $${s.pricing_json.platea_general}, Palco bajo $${s.pricing_json.palcos_bajos}`);
    });

    console.log('\n🚀 Ahora podés iniciar el servidor: npm run dev');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en seed:', err);
    process.exit(1);
  }
}

main();
