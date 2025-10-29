import 'dotenv/config';
import dayjs from 'dayjs';
import { sequelize } from '../lib/sequelize.js';
import registerModels from '../models/registerModels.js';

async function main() {
  try {
    registerModels(sequelize);
    await sequelize.authenticate();

    const { shows: Show, sessions: Session } = sequelize.models;

    // Simple check to avoid duplicating seeds
    const existing = await Show.count();
    if (existing > 0) {
      console.log('Seed skipped: shows already present');
      process.exit(0);
    }

    const show = await Show.create({
      title: 'Gala Inaugural',
      sala: 'Sala Principal',
      date: dayjs().add(7, 'day').format('YYYY-MM-DD'),
      time: '21:00',
      pricing_json: {
        platea_general: 10000,
        palcos_bajos: 42000,
        palcos_altos: 22000,
        pullman: 8000
      }
    });

    const s1 = await Session.create({
      show_id: show.id,
      starts_at: dayjs(show.date + ' ' + show.time).toDate(),
      ends_at: dayjs(show.date + ' ' + show.time).add(2, 'hour').toDate()
    });

    const s2 = await Session.create({
      show_id: show.id,
      starts_at: dayjs(show.date + ' ' + '23:59').toDate(),
      ends_at: dayjs(show.date + ' ' + '23:59').add(2, 'hour').toDate()
    });

    console.log('Seed completed:', { show: show.id, sessions: [s1.id, s2.id] });
    process.exit(0);
  } catch (err) {
    console.error('Seed error', err);
    process.exit(1);
  }
}

main();
