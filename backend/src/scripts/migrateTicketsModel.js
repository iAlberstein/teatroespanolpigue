import 'dotenv/config';
import { sequelize } from '../lib/sequelize.js';

/**
 * Migración: Agregar campo price y sale_id a tickets
 * Ejecutar: node src/scripts/migrateTicketsModel.js
 */

async function migrate() {
  try {
    console.log('[MIGRATION] Iniciando migración del modelo Ticket...');
    
    // Agregar campo price si no existe
    try {
      await sequelize.query(`
        ALTER TABLE \`tickets\` 
          ADD COLUMN \`price\` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER \`type\`
      `);
      console.log('✓ Campo price agregado');
    } catch (err) {
      if (err.original?.errno === 1060) {
        console.log('• Campo price ya existe');
      } else throw err;
    }
    
    // Agregar campo sale_id si no existe
    try {
      await sequelize.query(`
        ALTER TABLE \`tickets\` 
          ADD COLUMN \`sale_id\` CHAR(36) NULL AFTER \`session_id\`
      `);
      console.log('✓ Campo sale_id agregado');
    } catch (err) {
      if (err.original?.errno === 1060) {
        console.log('• Campo sale_id ya existe');
      } else throw err;
    }
    
    // Verificar estructura
    const [results] = await sequelize.query('DESCRIBE `tickets`');
    console.log('\n[MIGRATION] Estructura final de la tabla tickets:');
    console.table(results);
    
    console.log('\n✅ Migración completada exitosamente!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error en migración:', error);
    process.exit(1);
  }
}

migrate();
