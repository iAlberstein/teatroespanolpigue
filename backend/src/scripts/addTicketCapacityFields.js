import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../lib/sequelize.js';

/**
 * Migración para agregar campos de capacidad a tickets (para validación parcial de palcos)
 */
async function addTicketCapacityFields() {
  try {
    console.log('[MIGRATION] Agregando campos de capacidad a tickets...');
    
    const queryInterface = sequelize.getQueryInterface();
    
    // Verificar si las columnas ya existen
    const tableDescription = await queryInterface.describeTable('tickets');
    
    if (!tableDescription.capacity) {
      await queryInterface.addColumn('tickets', 'capacity', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1,
        comment: 'Capacidad total del ticket (1 para butaca, 4 para palco bajo, 2 para palco alto)'
      });
      console.log('[MIGRATION] ✓ Columna capacity agregada');
    } else {
      console.log('[MIGRATION] - Columna capacity ya existe');
    }
    
    if (!tableDescription.capacity_validated) {
      await queryInterface.addColumn('tickets', 'capacity_validated', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: 'Cantidad de personas ya validadas/ingresadas'
      });
      console.log('[MIGRATION] ✓ Columna capacity_validated agregada');
    } else {
      console.log('[MIGRATION] - Columna capacity_validated ya existe');
    }
    
    // Actualizar capacidades existentes basándose en el tipo y section
    console.log('[MIGRATION] Actualizando capacidades de tickets existentes...');
    
    // Butacas: capacity = 1
    await sequelize.query(`
      UPDATE tickets 
      SET capacity = 1, capacity_validated = 0
      WHERE type = 'butaca' AND capacity IS NULL
    `);
    
    // Pullman: capacity = 1
    await sequelize.query(`
      UPDATE tickets 
      SET capacity = 1, capacity_validated = 0
      WHERE type = 'pullman' AND capacity IS NULL
    `);
    
    // Palcos Bajos: capacity = 4
    await sequelize.query(`
      UPDATE tickets 
      SET capacity = 4, capacity_validated = 0
      WHERE type = 'palco' 
      AND (section = 'palcos_bajos' OR seat_code LIKE 'PB%')
      AND capacity IS NULL
    `);
    
    // Palcos Altos: capacity = 2
    await sequelize.query(`
      UPDATE tickets 
      SET capacity = 2, capacity_validated = 0
      WHERE type = 'palco' 
      AND (section = 'palcos_altos' OR seat_code LIKE 'PA%')
      AND capacity IS NULL
    `);
    
    // Palcos genéricos (legacy sin section específica): intentar detectar de seat_code
    await sequelize.query(`
      UPDATE tickets 
      SET capacity = 4, capacity_validated = 0
      WHERE type = 'palco' 
      AND section = 'palco'
      AND seat_code LIKE 'PB%'
      AND capacity IS NULL
    `);
    
    await sequelize.query(`
      UPDATE tickets 
      SET capacity = 2, capacity_validated = 0
      WHERE type = 'palco' 
      AND section = 'palco'
      AND seat_code LIKE 'PA%'
      AND capacity IS NULL
    `);
    
    // Actualizar status de tickets validados
    // Si un ticket tiene status 'validated', marcar capacity_validated = capacity
    await sequelize.query(`
      UPDATE tickets 
      SET capacity_validated = capacity
      WHERE status = 'validated' AND capacity_validated = 0
    `);
    
    console.log('[MIGRATION] ✓ Capacidades actualizadas');
    console.log('[MIGRATION] ¡Migración completada exitosamente!');
    
    process.exit(0);
  } catch (error) {
    console.error('[MIGRATION] Error:', error);
    process.exit(1);
  }
}

addTicketCapacityFields();
