import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[ENV] Loaded .env.local');
} else {
  dotenv.config();
  console.log('[ENV] Loaded .env');
}

async function runMigration() {
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'tep',
      multipleStatements: true
    });

    console.log('[MIGRATION] Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, '../../migrations/014_add_sale_id_to_reservations.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('[MIGRATION] Executing migration...');
    console.log(sql);

    // Execute migration
    await connection.query(sql);

    console.log('[MIGRATION] ✅ Migration completed successfully!');
    console.log('[MIGRATION] Added sale_id column to reservations table');

  } catch (error) {
    console.error('[MIGRATION] ❌ Error:', error.message);
    if (error.message.includes('Duplicate column')) {
      console.log('[MIGRATION] Column already exists, skipping...');
    } else {
      throw error;
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('[MIGRATION] Database connection closed');
    }
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('[MIGRATION] Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[MIGRATION] Fatal error:', error);
    process.exit(1);
  });
