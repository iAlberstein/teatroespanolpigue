import mysql from 'mysql2/promise';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function runMigration() {
  console.log('================================================================================');
  console.log('MIGRACIÓN COMPLETA PARA PRODUCCIÓN - Teatro Español Pigüé');
  console.log('================================================================================\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  try {
    console.log('[✓] Conectado a la base de datos');
    
    const migrationPath = path.join(__dirname, '../../migrations/PRODUCTION_MIGRATION_COMPLETE.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');
    
    console.log('[→] Ejecutando migración completa...\n');
    await connection.query(sql);
    console.log('[✓] Migración ejecutada exitosamente!\n');

    console.log('================================================================================');
    console.log('VERIFICACIÓN POST-MIGRACIÓN');
    console.log('================================================================================\n');

    console.log('1. Verificando tabla SHOWS:');
    const [showsColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'shows' 
      AND COLUMN_NAME IN ('venue_type', 'general_capacity', 'image_principal_web', 'image_secundaria_web', 'image_principal_mobile')
    `);
    showsColumns.forEach(col => {
      console.log(`   ✓ ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
    });

    console.log('\n2. Verificando tabla USERS:');
    const [usersColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' 
      AND COLUMN_NAME IN ('dni', 'provincia', 'localidad')
    `);
    usersColumns.forEach(col => {
      console.log(`   ✓ ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
    });

    console.log('\n3. Verificando tabla SALES:');
    const [salesColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'sales' 
      AND COLUMN_NAME IN ('customer_provincia', 'customer_localidad')
    `);
    salesColumns.forEach(col => {
      console.log(`   ✓ ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
    });

    console.log('\n4. Verificando tabla RESERVATIONS:');
    const [reservationsColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'reservations' 
      AND COLUMN_NAME = 'sale_id'
    `);
    reservationsColumns.forEach(col => {
      console.log(`   ✓ ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
    });

    console.log('\n5. Verificando tabla TICKETS:');
    const [ticketsColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'tickets' 
      AND COLUMN_NAME = 'type'
    `);
    ticketsColumns.forEach(col => {
      console.log(`   ✓ ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
    });

    console.log('\n6. Verificando índices:');
    const [indexes] = await connection.query(`
      SELECT DISTINCT INDEX_NAME, TABLE_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      AND INDEX_NAME IN ('idx_shows_venue_type', 'idx_reservations_sale_id', 'idx_users_dni')
    `);
    indexes.forEach(idx => {
      console.log(`   ✓ ${idx.INDEX_NAME} en ${idx.TABLE_NAME}`);
    });

    console.log('\n================================================================================');
    console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('================================================================================\n');

  } catch (error) {
    console.error('\n❌ ERROR durante la migración:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
