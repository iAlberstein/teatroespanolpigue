import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../lib/sequelize.js';
import registerModels from '../models/registerModels.js';

/**
 * Migra los bordereaux con status='provisional' y contract_items vacío al nuevo esquema
 * de "contrato como lista de items", preservando exactamente la distribución que tenían
 * (Teatro X% / Usuario Y%).
 *
 * Los bordereaux con status='cerrado' NO se tocan: quedan con contract_items = NULL, y el
 * backend los sigue mostrando con el esquema legado de 2 filas fijas (comportamiento actual).
 */
async function migrateBordereauxContractItems() {
  try {
    registerModels(sequelize);
    const { bordereaux: Bordereaux } = sequelize.models;

    const pending = await Bordereaux.findAll({
      where: { status: 'provisional' }
    });

    console.log(`[MIGRATION] ${pending.length} bordereaux provisionales encontrados`);

    let migrated = 0;
    let skipped = 0;

    for (const b of pending) {
      if (b.contract_items && Array.isArray(b.contract_items) && b.contract_items.length > 0) {
        skipped++;
        continue;
      }

      const theaterPct = parseFloat(b.contract_theater_percentage || 0);
      const userPct = parseFloat(b.contract_user_percentage || 0);

      const contractItems = [
        { title: 'Teatro', mode: 'percentage', percentage: theaterPct, fixedAmount: 0, description: 'del Neto 2', settle: false },
        { title: b.author_name ? b.author_name : 'Usuario', mode: 'percentage', percentage: userPct, fixedAmount: 0, description: 'del Neto 2', settle: true }
      ];

      await b.update({ contract_items: contractItems });
      migrated++;
    }

    console.log(`[MIGRATION] ✓ Migrados: ${migrated}. Ya tenían contract_items: ${skipped}.`);
    console.log('[MIGRATION] ¡Listo!');
    process.exit(0);
  } catch (error) {
    console.error('[MIGRATION] Error:', error);
    process.exit(1);
  }
}

migrateBordereauxContractItems();
