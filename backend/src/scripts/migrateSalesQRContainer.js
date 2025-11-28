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

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('[MIGRATE] Conectado a la base de datos');

    const queryInterface = sequelize.getQueryInterface();

    // Verificar si las columnas ya existen
    const tableInfo = await queryInterface.describeTable('sales');

    if (!tableInfo.container_qr_code) {
      console.log('[MIGRATE] Agregando columna container_qr_code...');
      await queryInterface.addColumn('sales', 'container_qr_code', {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      });
    } else {
      console.log('[MIGRATE] container_qr_code ya existe, omitiendo');
    }

    if (!tableInfo.container_qr_data) {
      console.log('[MIGRATE] Agregando columna container_qr_data...');
      await queryInterface.addColumn('sales', 'container_qr_data', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    } else {
      console.log('[MIGRATE] container_qr_data ya existe, omitiendo');
    }

    if (!tableInfo.validated_count) {
      console.log('[MIGRATE] Agregando columna validated_count...');
      await queryInterface.addColumn('sales', 'validated_count', {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      });
    } else {
      console.log('[MIGRATE] validated_count ya existe, omitiendo');
    }

    if (!tableInfo.total_capacity) {
      console.log('[MIGRATE] Agregando columna total_capacity...');
      await queryInterface.addColumn('sales', 'total_capacity', {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      });
    } else {
      console.log('[MIGRATE] total_capacity ya existe, omitiendo');
    }

    console.log('[MIGRATE] ✅ Migración completada exitosamente');
  } catch (error) {
    console.error('[MIGRATE] ❌ Error en la migración:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

migrate();
