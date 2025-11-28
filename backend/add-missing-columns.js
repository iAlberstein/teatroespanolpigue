import dotenv from 'dotenv';
import { sequelize, initSequelize } from './src/lib/sequelize.js';

// Cargar variables de entorno
dotenv.config();

async function addMissingColumns() {
  try {
    console.log('🔧 Inicializando conexión a base de datos...');
    await initSequelize();
    
    console.log('🔧 Agregando columnas faltantes...');
    
    // Agregar customer_dni a sales
    try {
      await sequelize.query(`
        ALTER TABLE sales 
        ADD COLUMN customer_dni VARCHAR(255);
      `);
      console.log('✅ Columna customer_dni agregada a sales');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('⚠️  customer_dni ya existe en sales (ok)');
      } else {
        console.log('⚠️  Error en customer_dni:', e.message);
      }
    }
    
    // Agregar active a users
    try {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN active BOOLEAN DEFAULT true;
      `);
      console.log('✅ Columna active agregada a users');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('⚠️  active ya existe en users (ok)');
      } else {
        console.log('⚠️  Error en active:', e.message);
      }
    }
    
    // Actualizar todos los usuarios existentes a activos por defecto
    try {
      const [results] = await sequelize.query(`
        UPDATE users 
        SET active = true 
        WHERE active IS NULL;
      `);
      console.log('✅ Usuarios existentes marcados como activos');
    } catch (e) {
      // Si la columna no existe, se ignorará este paso
      if (!e.message.includes('Unknown column')) {
        console.log('⚠️  Error actualizando usuarios:', e.message);
      }
    }
    
    console.log('✨ Migración completada');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

addMissingColumns();
