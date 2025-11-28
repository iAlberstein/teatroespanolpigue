import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: console.log
  }
);

async function dropIndexesOnColumn(table, column) {
  const dbName = process.env.DB_NAME;
  const [rows] = await sequelize.query(
    `SHOW INDEX FROM \`${table}\` WHERE Column_name = :col`,
    { replacements: { col: column } }
  );
  for (const idx of rows) {
    const key = idx.Key_name;
    if (!key) continue;
    try {
      console.log(`[ALTER] Dropping index ${key} on ${table}.${column}`);
      await sequelize.query(`DROP INDEX \`${key}\` ON \`${table}\``);
    } catch (e) {
      console.log(`[ALTER] Could not drop index ${key}:`, e.message);
    }
  }

  // Drop constraints from INFORMATION_SCHEMA if any
  const [cons] = await sequelize.query(
    `SELECT CONSTRAINT_NAME AS name FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
     WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND CONSTRAINT_TYPE IN ('UNIQUE','PRIMARY KEY')`,
    { replacements: { db: dbName, table } }
  );
  for (const c of cons) {
    try {
      console.log(`[ALTER] Dropping constraint ${c.name} on ${table}`);
      await sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${c.name}\``);
    } catch {}
  }
}

async function alter() {
  const qi = sequelize.getQueryInterface();
  try {
    await sequelize.authenticate();
    console.log('[ALTER] Connected');

    // Ensure no index remains on target TEXT columns
    await dropIndexesOnColumn('sales', 'container_qr_code');
    await dropIndexesOnColumn('tickets', 'qr_code');

    // Change columns to TEXT (no index)
    console.log('[ALTER] Changing sales.container_qr_code to TEXT');
    await qi.changeColumn('sales', 'container_qr_code', { type: DataTypes.TEXT, allowNull: true });

    console.log('[ALTER] Changing sales.container_qr_data to TEXT');
    await qi.changeColumn('sales', 'container_qr_data', { type: DataTypes.TEXT, allowNull: true });

    console.log('[ALTER] Changing tickets.qr_code to TEXT');
    await qi.changeColumn('tickets', 'qr_code', { type: DataTypes.TEXT, allowNull: true });

    console.log('[ALTER] Changing tickets.qr_data to TEXT');
    await qi.changeColumn('tickets', 'qr_data', { type: DataTypes.TEXT, allowNull: true });

    console.log('[ALTER] ✅ Done');
  } catch (err) {
    console.error('[ALTER] ❌ Error:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

alter();
