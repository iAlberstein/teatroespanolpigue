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
  console.log('MIGRACIÓN 015 - Visibilidad y Venta Externa');
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
    
    const migrationPath = path.join(__dirname, '../../migrations/015_add_visibility_and_external_sale.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');
    
    console.log('[→] Ejecutando migración...\n');
    await connection.query(sql);
    console.log('[✓] Migración ejecutada exitosamente!\n');

    console.log('================================================================================');
    console.log('VERIFICACIÓN POST-MIGRACIÓN');
    console.log('================================================================================\n');

    console.log('Verificando nuevos campos en tabla SHOWS:');
    const [showsColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'shows' 
      AND COLUMN_NAME IN ('is_visible', 'external_sale', 'external_sale_link')
    `);
    showsColumns.forEach(col => {
      console.log(`   ✓ ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
    });

    console.log('\nVerificando índice:');
    const [indexes] = await connection.query(`
      SELECT DISTINCT INDEX_NAME, TABLE_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      AND INDEX_NAME = 'idx_shows_is_visible'
    `);
    indexes.forEach(idx => {
      console.log(`   ✓ ${idx.INDEX_NAME} en ${idx.TABLE_NAME}`);
    });

    console.log('\n================================================================================');
    console.log('✅ MIGRACIÓN 015 COMPLETADA EXITOSAMENTE');
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
