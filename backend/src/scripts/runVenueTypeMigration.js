import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local first, then .env as fallback
const envLocalPath = join(__dirname, '../..', '.env.local');
const envPath = join(__dirname, '../..', '.env');

try {
  dotenv.config({ path: envLocalPath });
  console.log('[ENV] Loaded .env.local');
} catch {
  dotenv.config({ path: envPath });
  console.log('[ENV] Loaded .env');
}

async function runMigration() {
  let connection;
  
  try {
    console.log('🔄 Conectando a la base de datos...');
    
    // Get DB config from env variables or DATABASE_URL
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
      // Use individual env variables
      config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || undefined,
        database: process.env.DB_NAME || 'tep'
      };
    }
    
    console.log(`📍 Conectando a: ${config.host}:${config.port}/${config.database}`);
    
    connection = await mysql.createConnection({
      ...config,
      multipleStatements: true
    });

    console.log('✓ Conectado a la base de datos');
    console.log('📝 Ejecutando migración de tipos de sala...\n');

    // Read SQL file
    const sqlFile = join(__dirname, '../../migrations/013_add_venue_type_and_capacity.sql');
    const sql = readFileSync(sqlFile, 'utf8');

    // Execute migration
    await connection.query(sql);
    
    console.log('✅ Migración completada exitosamente!\n');
    console.log('Cambios aplicados:');
    console.log('  - ✓ Columna venue_type agregada a shows');
    console.log('  - ✓ Columna general_capacity agregada a shows');
    console.log('  - ✓ Índice en venue_type creado');
    console.log('\n🚀 Ahora podés iniciar el servidor con: npm run dev');

  } catch (error) {
    console.error('❌ Error ejecutando migración:', error.message);
    
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('\n⚠️  Las columnas ya existen. La migración ya fue aplicada.');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  No se pudo conectar a la base de datos. Verificá que MySQL esté corriendo.');
    } else {
      console.error('\nDetalles del error:', error);
      process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
