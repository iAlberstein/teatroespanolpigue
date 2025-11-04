import 'dotenv/config';
import { sequelize } from '../lib/sequelize.js';

/**
 * Migración: Actualizar modelo de shows
 * Ejecutar: node src/scripts/migrateShowsModel.js
 */

async function migrate() {
  try {
    console.log('[MIGRATION] Iniciando migración del modelo Show...');
    
    // Hacer campos legacy opcionales
    await sequelize.query(`
      ALTER TABLE \`shows\` 
        MODIFY COLUMN \`sala\` VARCHAR(255) NULL,
        MODIFY COLUMN \`date\` DATE NULL,
        MODIFY COLUMN \`time\` VARCHAR(255) NULL
    `);
    console.log('✓ Campos legacy actualizados (sala, date, time → NULL)');
    
    // Agregar nuevos campos si no existen
    try {
      await sequelize.query(`
        ALTER TABLE \`shows\` 
          ADD COLUMN \`description\` TEXT NULL AFTER \`title\`
      `);
      console.log('✓ Campo description agregado');
    } catch (err) {
      if (err.original?.errno === 1060) {
        console.log('• Campo description ya existe');
      } else throw err;
    }
    
    try {
      await sequelize.query(`
        ALTER TABLE \`shows\` 
          ADD COLUMN \`duration_minutes\` INT NOT NULL DEFAULT 120 AFTER \`description\`
      `);
      console.log('✓ Campo duration_minutes agregado');
    } catch (err) {
      if (err.original?.errno === 1060) {
        console.log('• Campo duration_minutes ya existe');
      } else throw err;
    }
    
    try {
      await sequelize.query(`
        ALTER TABLE \`shows\` 
          ADD COLUMN \`image_url\` VARCHAR(255) NULL AFTER \`duration_minutes\`
      `);
      console.log('✓ Campo image_url agregado');
    } catch (err) {
      if (err.original?.errno === 1060) {
        console.log('• Campo image_url ya existe');
      } else throw err;
    }
    
    // Verificar estructura
    const [results] = await sequelize.query('DESCRIBE `shows`');
    console.log('\n[MIGRATION] Estructura final de la tabla shows:');
    console.table(results);
    
    console.log('\n✅ Migración completada exitosamente!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error en migración:', error);
    process.exit(1);
  }
}

migrate();
