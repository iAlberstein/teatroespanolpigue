import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: console.log
  }
);

async function addIncludeInBordereauxToServices() {
  try {
    console.log('[MIGRATION] Adding include_in_bordereaux column to show_services...');
    
    await sequelize.authenticate();
    console.log('Connected to database');
    
    await sequelize.query(
      "ALTER TABLE `show_services` ADD COLUMN `include_in_bordereaux` TINYINT(1) DEFAULT 0 COMMENT 'Si true, el servicio se incluye en el bordereaux' AFTER `active`"
    );
    
    console.log('[MIGRATION] ✅ Column include_in_bordereaux added successfully to show_services');
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('[MIGRATION] ❌ Error adding column:', error.message);
    
    // Check if column already exists
    if (error.message.includes('Duplicate column name')) {
      console.log('[MIGRATION] ℹ️ Column already exists, skipping...');
      await sequelize.close();
      process.exit(0);
    }
    
    await sequelize.close();
    process.exit(1);
  }
}

addIncludeInBordereauxToServices();
