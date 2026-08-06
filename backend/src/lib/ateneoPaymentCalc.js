import { sequelize } from './sequelize.js';
import { Op } from 'sequelize';

function formatLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getReferenceDate(tipo = 'cuota', periodo = null) {
  if (tipo === 'cuota' && periodo && typeof periodo === 'string' && periodo.includes('-')) {
    const [year, month] = periodo.split('-').map(Number);
    if (!Number.isNaN(year) && !Number.isNaN(month)) {
      return formatLocalDateStr(new Date(year, month - 1, 1));
    }
  }
  return formatLocalDateStr(new Date());
}

export async function calcularMontoConBecas(alumnoId, claseId, montoBase, tipo = 'cuota', periodo = null) {
  let base = parseFloat(montoBase) || 0;
  if (!(base > 0)) return 0;

  const { ateneo_becas: AteneoBeca } = sequelize.models;
  const refDate = getReferenceDate(tipo, periodo);

  const where = {
    alumno_id: alumnoId,
    activa: true,
    fecha_inicio: { [Op.lte]: refDate },
    [Op.or]: [
      { fecha_fin: { [Op.is]: null } },
      { fecha_fin: { [Op.gte]: refDate } }
    ]
  };

  if (claseId !== undefined && claseId !== null) {
    where.clase_id = { [Op.or]: [claseId, null] };
  } else {
    where.clase_id = { [Op.is]: null };
  }

  const becas = await AteneoBeca.findAll({ where });

  let monto = base;

  for (const beca of becas) {
    const valor = parseFloat(beca.valor) || 0;

    if (tipo === 'matricula' && beca.tipo === 'exencion_matricula') {
      return 0;
    }

    if (beca.tipo === 'porcentaje') {
      monto = monto * (1 - Math.min(100, valor) / 100);
    } else if (beca.tipo === 'monto_fijo') {
      monto = monto - valor;
    }

    if (monto <= 0) return 0;
  }

  return Math.round(monto * 100) / 100;
}

export async function recalcularPagosPendientes(alumnoId) {
  const { ateneo_pagos: AteneoPago } = sequelize.models;

  const pagos = await AteneoPago.findAll({
    where: {
      alumno_id: alumnoId,
      estado: { [Op.ne]: 'pagado' }
    }
  });

  for (const pago of pagos) {
    const montoOriginal = parseFloat(pago.monto_original) || parseFloat(pago.monto_final) || 0;
    const nuevoMonto = await calcularMontoConBecas(
      pago.alumno_id,
      pago.clase_id,
      montoOriginal,
      pago.tipo,
      pago.periodo
    );

    const montoFinalActual = parseFloat(pago.monto_final) || 0;
    if (Math.abs(nuevoMonto - montoFinalActual) > 0.001) {
      await pago.update({ monto_final: nuevoMonto });
    }
  }

  return { actualizados: pagos.length };
}
