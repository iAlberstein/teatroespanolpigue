import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcrypt';
import { sequelize } from '../lib/sequelize.js';
import registerModels from '../models/registerModels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../..', '.env') });

async function createBoleteriaUser() {
  try {
    registerModels(sequelize);
    await sequelize.authenticate();
    await sequelize.sync();

    const { users: User } = sequelize.models;

    // Check if user already exists
    const existing = await User.findOne({ where: { email: 'boleteria@teatroespanol.com' } });
    
    if (existing) {
      console.log('✓ Usuario de boletería ya existe:');
      console.log('  Email: boleteria@teatroespanol.com');
      console.log('  Rol:', existing.role);
      return;
    }

    // Create boleteria user
    const password_hash = await bcrypt.hash('boleteria123', 10);
    
    const user = await User.create({
      name: 'Usuario Boletería',
      email: 'boleteria@teatroespanol.com',
      password_hash,
      role: 'boleteria'
    });

    console.log('✅ Usuario de boletería creado exitosamente!');
    console.log('\n📋 Datos de acceso:');
    console.log('  Email:', user.email);
    console.log('  Contraseña: boleteria123');
    console.log('  Rol:', user.role);
    console.log('\n⚠️  IMPORTANTE: Cambiá la contraseña después del primer login.');

  } catch (error) {
    console.error('❌ Error creando usuario de boletería:', error);
  } finally {
    await sequelize.close();
  }
}

createBoleteriaUser();
