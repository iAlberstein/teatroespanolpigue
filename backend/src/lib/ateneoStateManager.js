import { sequelize } from './sequelize.js';
import { Op } from 'sequelize';
import { enviarAvisoSuspension, enviarAvisoCuotaVencida } from './ateneoEmailService.js';

/**
 * Actualiza el estado académico de un alumno basado en sus pagos
 * Reglas:
 * - Sin matrícula pagada → pendiente
 * - Matrícula pagada, sin cuotas vencidas → activo
 * - Cuotas vencidas → deuda
 * - N+ cuotas vencidas → suspendido (N configurable)
 * 
 * @param {number} alumnoId - ID del alumno
 * @param {Transaction} transaction - Transacción de Sequelize (opcional)
 * @returns {Object} - { estadoAnterior, estadoNuevo, cambio }
 */
export async function actualizarEstadoAcademico(alumnoId, transaction = null) {
  try {
    const { 
      ateneo_alumnos: AteneoAlumno,
      ateneo_pagos: AteneoPago,
      ateneo_config: AteneoConfig,
      ateneo_estado_log: AteneoEstadoLog
    } = sequelize.models;

    const alumno = await AteneoAlumno.findByPk(alumnoId);
    if (!alumno) {
      throw new Error('Alumno no encontrado');
    }

    // Si el estado fue forzado manualmente, no cambiar automáticamente
    if (alumno.estado_forzado) {
      return {
        estadoAnterior: alumno.estado_academico,
        estadoNuevo: alumno.estado_academico,
        cambio: false,
        motivo: 'Estado forzado manualmente'
      };
    }

    const estadoAnterior = alumno.estado_academico;

    // Obtener configuración
    const configSuspension = await AteneoConfig.findOne({ 
      where: { clave: 'cuotas_vencidas_suspension' } 
    });
    const cuotasParaSuspension = parseInt(configSuspension?.valor || '3');

    // Verificar matrícula pagada
    const matriculaPagada = await AteneoPago.findOne({
      where: {
        alumno_id: alumnoId,
        tipo: 'matricula',
        estado: 'pagado'
      }
    });

    // Si no hay matrícula pagada, estado = pendiente
    if (!matriculaPagada) {
      if (estadoAnterior !== 'pendiente') {
        await registrarCambioEstado(alumnoId, estadoAnterior, 'pendiente', 'Sin matrícula pagada', transaction);
        await alumno.update({ estado_academico: 'pendiente' }, { transaction });
      }
      return {
        estadoAnterior,
        estadoNuevo: 'pendiente',
        cambio: estadoAnterior !== 'pendiente',
        motivo: 'Sin matrícula pagada'
      };
    }

    // Contar cuotas vencidas
    const cuotasVencidas = await AteneoPago.count({
      where: {
        alumno_id: alumnoId,
        tipo: 'cuota',
        estado: 'vencido'
      }
    });

    let nuevoEstado;
    let motivo;

    if (cuotasVencidas >= cuotasParaSuspension) {
      nuevoEstado = 'suspendido';
      motivo = `${cuotasVencidas} cuotas vencidas (límite: ${cuotasParaSuspension})`;
    } else if (cuotasVencidas > 0) {
      nuevoEstado = 'deuda';
      motivo = `${cuotasVencidas} cuota(s) vencida(s)`;
    } else {
      nuevoEstado = 'activo';
      motivo = 'Pagos al día';
    }

    // Solo actualizar si cambió
    if (estadoAnterior !== nuevoEstado) {
      await registrarCambioEstado(alumnoId, estadoAnterior, nuevoEstado, motivo, transaction);
      await alumno.update({ estado_academico: nuevoEstado }, { transaction });

      // Enviar email de suspensión (async, no bloquea)
      if (nuevoEstado === 'suspendido') {
        try {
          const { users: User } = sequelize.models;
          const alumnoConUser = await AteneoAlumno.findByPk(alumnoId, {
            include: [{ model: User, as: 'usuario', attributes: ['name', 'email'] }]
          });
          if (alumnoConUser?.usuario?.email) {
            enviarAvisoSuspension({
              email: alumnoConUser.usuario.email,
              nombre: alumnoConUser.usuario.name,
              motivo
            }).catch(err => console.error('[Ateneo] Error email suspensión:', err.message));
          }
        } catch (emailErr) {
          console.error('[Ateneo] Error preparando email suspensión:', emailErr.message);
        }
      }
    }

    return {
      estadoAnterior,
      estadoNuevo: nuevoEstado,
      cambio: estadoAnterior !== nuevoEstado,
      motivo
    };
  } catch (error) {
    console.error('[Ateneo] Error actualizando estado académico:', error);
    throw error;
  }
}

/**
 * Registra un cambio de estado en el log de auditoría
 */
async function registrarCambioEstado(alumnoId, estadoAnterior, estadoNuevo, motivo, transaction = null) {
  const { ateneo_estado_log: AteneoEstadoLog } = sequelize.models;
  
  await AteneoEstadoLog.create({
    alumno_id: alumnoId,
    estado_anterior: estadoAnterior,
    estado_nuevo: estadoNuevo,
    motivo,
    automatico: true,
    cambiado_por: null
  }, { transaction });
}

/**
 * Marca pagos como vencidos si pasó la fecha de vencimiento
 * Diseñado para ejecutarse en un job diario
 */
export async function marcarPagosVencidos() {
  const transaction = await sequelize.transaction();
  
  try {
    const { ateneo_pagos: AteneoPago } = sequelize.models;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const [count] = await AteneoPago.update(
      { estado: 'vencido' },
      {
        where: {
          estado: 'pendiente',
          fecha_vencimiento: { [Op.lt]: hoy }
        },
        transaction
      }
    );

    await transaction.commit();
    console.log(`[Ateneo] ${count} pagos marcados como vencidos`);
    return count;
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error marcando pagos vencidos:', error);
    throw error;
  }
}

/**
 * Actualiza estados académicos de todos los alumnos
 * Diseñado para ejecutarse en un job diario después de marcarPagosVencidos
 */
export async function actualizarTodosLosEstados() {
  try {
    const { ateneo_alumnos: AteneoAlumno } = sequelize.models;
    
    const alumnos = await AteneoAlumno.findAll({
      where: { estado_forzado: false },
      attributes: ['id']
    });

    let cambios = 0;
    for (const alumno of alumnos) {
      const resultado = await actualizarEstadoAcademico(alumno.id);
      if (resultado.cambio) cambios++;
    }

    console.log(`[Ateneo] ${cambios} estados académicos actualizados de ${alumnos.length} alumnos`);
    return { total: alumnos.length, cambios };
  } catch (error) {
    console.error('[Ateneo] Error actualizando todos los estados:', error);
    throw error;
  }
}

/**
 * Obtiene alumnos que serán suspendidos si no pagan
 * Útil para enviar avisos preventivos
 */
export async function obtenerAlumnosEnRiesgoSuspension() {
  try {
    const { 
      ateneo_alumnos: AteneoAlumno,
      ateneo_pagos: AteneoPago,
      ateneo_config: AteneoConfig,
      users: User
    } = sequelize.models;

    const configSuspension = await AteneoConfig.findOne({ 
      where: { clave: 'cuotas_vencidas_suspension' } 
    });
    const limite = parseInt(configSuspension?.valor || '3');
    const umbralRiesgo = limite - 1; // Una cuota antes de suspensión

    // Alumnos con estado deuda
    const alumnosDeuda = await AteneoAlumno.findAll({
      where: { estado_academico: 'deuda' },
      include: [{
        model: User,
        as: 'usuario',
        attributes: ['id', 'name', 'email']
      }]
    });

    const enRiesgo = [];

    for (const alumno of alumnosDeuda) {
      const cuotasVencidas = await AteneoPago.count({
        where: {
          alumno_id: alumno.id,
          tipo: 'cuota',
          estado: 'vencido'
        }
      });

      if (cuotasVencidas >= umbralRiesgo) {
        enRiesgo.push({
          alumno_id: alumno.id,
          nombre: alumno.usuario?.name,
          email: alumno.usuario?.email,
          cuotas_vencidas: cuotasVencidas,
          cuotas_para_suspension: limite - cuotasVencidas
        });
      }
    }

    return enRiesgo;
  } catch (error) {
    console.error('[Ateneo] Error obteniendo alumnos en riesgo:', error);
    throw error;
  }
}

/**
 * Fuerza un estado académico manualmente (para admin)
 */
export async function forzarEstadoAcademico(alumnoId, nuevoEstado, motivo, adminUserId) {
  const transaction = await sequelize.transaction();
  
  try {
    const { 
      ateneo_alumnos: AteneoAlumno,
      ateneo_estado_log: AteneoEstadoLog
    } = sequelize.models;

    const alumno = await AteneoAlumno.findByPk(alumnoId);
    if (!alumno) throw new Error('Alumno no encontrado');

    const estadoAnterior = alumno.estado_academico;

    // Registrar en log
    await AteneoEstadoLog.create({
      alumno_id: alumnoId,
      estado_anterior: estadoAnterior,
      estado_nuevo: nuevoEstado,
      motivo: motivo || 'Cambio manual por admin',
      automatico: false,
      cambiado_por: adminUserId
    }, { transaction });

    // Actualizar alumno
    await alumno.update({
      estado_academico: nuevoEstado,
      estado_forzado: true
    }, { transaction });

    await transaction.commit();

    return {
      estadoAnterior,
      estadoNuevo: nuevoEstado,
      forzado: true
    };
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error forzando estado:', error);
    throw error;
  }
}

/**
 * Quita el flag de forzado para que el estado se calcule automáticamente
 */
export async function quitarEstadoForzado(alumnoId) {
  try {
    const { ateneo_alumnos: AteneoAlumno } = sequelize.models;
    
    const alumno = await AteneoAlumno.findByPk(alumnoId);
    if (!alumno) throw new Error('Alumno no encontrado');

    await alumno.update({ estado_forzado: false });
    
    // Recalcular estado
    return await actualizarEstadoAcademico(alumnoId);
  } catch (error) {
    console.error('[Ateneo] Error quitando estado forzado:', error);
    throw error;
  }
}
