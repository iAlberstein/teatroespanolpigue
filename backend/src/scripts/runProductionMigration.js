import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
// Prioridad: .env.local (desarrollo) > .env (producción)
const envLocalPath = path.join(__dirname, '../../.env.local');
const envPath = path.join(__dirname, '../../.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('[ENV] Loaded .env.local (desarrollo)');
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[ENV] Loaded .env (producción)');
} else {
  console.error('[ERROR] No se encontró archivo .env');
  process.exit(1);
}

async function runProductionMigration() {
  let connection;
  
  try {
    console.log('\n' + '='.repeat(80));
    console.log('MIGRACIÓN CONSOLIDADA PARA PRODUCCIÓN - Diciembre 2024');
    console.log('='.repeat(80) + '\n');

    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'tep',
      multipleStatements: true
    });

    console.log('[✓] Conectado a la base de datos');
    console.log(`    Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`    Database: ${process.env.DB_NAME || 'tep'}\n`);

    // Read migration file
    const migrationPath = path.join(__dirname, '../../migrations/PRODUCTION_MIGRATION_2024_12.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('[→] Ejecutando migración consolidada...\n');

    // Execute migration
    await connection.query(sql);

    console.log('[✓] Migración ejecutada exitosamente!\n');

    // Verification queries
    console.log('='.repeat(80));
    console.log('VERIFICACIÓN POST-MIGRACIÓN');
    console.log('='.repeat(80) + '\n');

    // Verify shows table
    console.log('1. Verificando tabla SHOWS:');
    const [showsColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'shows' 
      AND COLUMN_NAME IN ('venue_type', 'general_capacity')
    `, [process.env.DB_NAME || 'tep']);
    
    showsColumns.forEach(col => {
      console.log(`   ✓ ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
      if (col.COLUMN_COMMENT) {
        console.log(`     └─ ${col.COLUMN_COMMENT}`);
      }
    });

    // Verify reservations table
    console.log('\n2. Verificando tabla RESERVATIONS:');
    const [reservationsColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'reservations' 
      AND COLUMN_NAME = 'sale_id'
    `, [process.env.DB_NAME || 'tep']);
    
    if (reservationsColumns.length > 0) {
      console.log(`   ✓ sale_id: ${reservationsColumns[0].COLUMN_TYPE}`);
    }

    // Verify tickets table
    console.log('\n3. Verificando tabla TICKETS:');
    const [ticketsColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'tickets' 
      AND COLUMN_NAME = 'type'
    `, [process.env.DB_NAME || 'tep']);
    
    if (ticketsColumns.length > 0) {
      console.log(`   ✓ type: ${ticketsColumns[0].COLUMN_TYPE}`);
    }

    // Check indexes
    console.log('\n4. Verificando índices:');
    const [indexes] = await connection.query(`
      SELECT DISTINCT INDEX_NAME, TABLE_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ?
      AND INDEX_NAME IN ('idx_shows_venue_type', 'idx_reservations_sale_id')
    `, [process.env.DB_NAME || 'tep']);
    
    indexes.forEach(idx => {
      console.log(`   ✓ ${idx.INDEX_NAME} en ${idx.TABLE_NAME}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('='.repeat(80) + '\n');

    console.log('Cambios aplicados:');
    console.log('  • Shows: venue_type y general_capacity agregados');
    console.log('  • Reservations: sale_id agregado');
    console.log('  • Tickets: tipo "general" agregado al ENUM');
    console.log('  • Índices: idx_shows_venue_type e idx_reservations_sale_id creados\n');

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ ERROR EN LA MIGRACIÓN');
    console.error('='.repeat(80));
    console.error('\nDetalles del error:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.error('\n' + '='.repeat(80) + '\n');
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('[✓] Conexión cerrada\n');
    }
  }
}

// Run migration
console.log('\n🚀 Iniciando migración de producción...\n');
runProductionMigration()
  .then(() => {
    console.log('✅ Proceso completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  });
