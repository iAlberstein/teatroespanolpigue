import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../..', '.env') });

async function fixQRColumn() {
  let connection;
  
  try {
    console.log('🔄 Conectando a la base de datos...');
    
    // Get DB config
    let config;
    
    if (process.env.DATABASE_URL) {
      const dbUrl = process.env.DATABASE_URL;
      const match = dbUrl.match(/mysql:\/\/([^:]+):?([^@]*)@([^:]+):(\d+)\/(.+)/);
      
      if (!match) {
        throw new Error('DATABASE_URL format invalid');
      }
      
      const [, user, password, host, port, database] = match;
      config = {
        host,
        port: parseInt(port),
        user,
        password: password || undefined,
        database
      };
    } else {
      config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || undefined,
        database: process.env.DB_NAME || 'tep'
      };
    }
    
    connection = await mysql.createConnection(config);

    console.log('✓ Conectado a la base de datos');
    console.log('📝 Modificando columna qr_code...\n');

    // Step 1: Drop unique index if exists
    console.log('1. Eliminando índice UNIQUE de qr_code...');
    try {
      await connection.query(`
        ALTER TABLE tickets 
          DROP INDEX unique_qr_code
      `);
      console.log('   ✓ Índice eliminado');
    } catch (err) {
      if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
        console.log('   ℹ Índice no existe, continuando...');
      } else {
        throw err;
      }
    }

    // Step 2: Change column type to TEXT
    console.log('2. Cambiando tipo de columna a TEXT...');
    await connection.query(`
      ALTER TABLE tickets 
        MODIFY COLUMN qr_code TEXT NULL
    `);
    console.log('   ✓ Columna actualizada a TEXT');

    // Step 3: Add index with prefix (for performance, optional)
    console.log('3. Agregando índice con prefijo (opcional)...');
    try {
      await connection.query(`
        ALTER TABLE tickets 
          ADD INDEX idx_qr_code (qr_code(100))
      `);
      console.log('   ✓ Índice agregado');
    } catch (err) {
      console.log('   ℹ Índice ya existe o no se pudo crear');
    }

    console.log('\n✅ Columna qr_code actualizada exitosamente!');
    console.log('🚀 Ahora podés ejecutar: npm run regen-qr');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

fixQRColumn();
