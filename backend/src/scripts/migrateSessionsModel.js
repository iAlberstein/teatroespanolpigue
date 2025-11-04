import 'dotenv/config';
import { sequelize } from '../lib/sequelize.js';

/**
 * Migración: Actualizar modelo de sessions
 * Ejecutar: node src/scripts/migrateSessionsModel.js
 */

async function migrate() {
  try {
    console.log('[MIGRATION] Iniciando migración del modelo Session...');
    
    // Agregar campos si no existen
    try {
      await sequelize.query(`
        ALTER TABLE \`sessions\` 
          ADD COLUMN \`pricing_json\` JSON NULL AFTER \`ends_at\`
      `);
      console.log('✓ Campo pricing_json agregado');
    } catch (err) {
      if (err.original?.errno === 1060) {
        console.log('• Campo pricing_json ya existe');
      } else throw err;
    }
    
    try {
      await sequelize.query(`
        ALTER TABLE \`sessions\` 
          ADD COLUMN \`capacity_override\` INT NULL AFTER \`pricing_json\`
      `);
      console.log('✓ Campo capacity_override agregado');
    } catch (err) {
      if (err.original?.errno === 1060) {
        console.log('• Campo capacity_override ya existe');
      } else throw err;
    }
    
    // Verificar estructura
    const [results] = await sequelize.query('DESCRIBE `sessions`');
    console.log('\n[MIGRATION] Estructura final de la tabla sessions:');
    console.table(results);
    
    console.log('\n✅ Migración completada exitosamente!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error en migración:', error);
    process.exit(1);
  }
}

migrate();
