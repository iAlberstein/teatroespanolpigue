import { Router } from 'express';
import { sequelize } from '../../lib/sequelize.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { Op } from 'sequelize';
import { calcularMontoConBecas } from '../../lib/ateneoPaymentCalc.js';
import { actualizarEstadoAcademico, marcarPagosVencidos, actualizarTodosLosEstados } from '../../lib/ateneoStateManager.js';
import { createSipagoOrder, getSipagoOrder } from '../../lib/sipago.js';
import { enviarConfirmacionPago } from '../../lib/ateneoEmailService.js';

const router = Router();

// Helper: calcular recargo del 15% si la cuota está vencida (fecha actual > fecha_vencimiento)
const RECARGO_PORCENTAJE = 0.15;
function calcularMontoConRecargo(pago) {
  if (pago.tipo !== 'cuota') return parseFloat(pago.monto_final);
  if (pago.estado === 'pagado') return parseFloat(pago.monto_final);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(pago.fecha_vencimiento + (String(pago.fecha_vencimiento).length === 10 ? 'T00:00:00' : ''));
  venc.setHours(0, 0, 0, 0);
  if (hoy > venc) {
    const base = parseFloat(pago.monto_final);
    return Math.round(base * (1 + RECARGO_PORCENTAJE));
  }
  return parseFloat(pago.monto_final);
}

// POST /api/ateneo/pagos/recalcular-estados - Marcar vencidos + recalcular estados (admin)
router.post('/recalcular-estados', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const vencidos = await marcarPagosVencidos();
    const estados = await actualizarTodosLosEstados();
    res.json({
      message: 'Estados recalculados',
      pagos_vencidos: vencidos,
      alumnos_total: estados.total,
      estados_cambiados: estados.cambios
    });
  } catch (error) {
    console.error('[Ateneo] Error recalculando estados:', error);
    res.status(500).json({ error: 'Error al recalcular estados' });
  }
});

// GET /api/ateneo/pagos - Listado de pagos (admin)
router.get('/', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_pagos: AteneoPago, 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      users: User 
    } = sequelize.models;
    
    const { alumno_id, clase_id, estado, tipo, desde, hasta, buscar } = req.query;
    const where = {};
    
    if (alumno_id) where.alumno_id = alumno_id;
    if (clase_id) where.clase_id = clase_id;
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;
    if (desde || hasta) {
      where.fecha_vencimiento = {};
      if (desde) where.fecha_vencimiento[Op.gte] = desde;
      if (hasta) where.fecha_vencimiento[Op.lte] = hasta;
    }

    if (buscar) {
      const term = buscar.trim().toLowerCase();
      if (term.length > 0) {
        const like = { [Op.like]: `%${term}%` };
        where[Op.or] = [
          sequelize.where(
            sequelize.fn('LOWER', sequelize.col('alumno->usuario.name')),
            like
          ),
          sequelize.where(
            sequelize.fn('LOWER', sequelize.col('alumno->usuario.email')),
            like
          ),
          sequelize.where(
            sequelize.fn('LOWER', sequelize.col('clase.nombre')),
            like
          ),
          sequelize.where(
            sequelize.fn('LOWER', sequelize.cast(sequelize.col('alumno.dni'), 'CHAR')),
            like
          ),
          sequelize.where(
            sequelize.fn('LOWER', sequelize.cast(sequelize.col('alumno.telefono'), 'CHAR')),
            like
          ),
          sequelize.where(
            sequelize.fn('LOWER', sequelize.fn('IFNULL', sequelize.col('alumno.nombre_menor'), '')),
            like
          ),
          sequelize.where(
            sequelize.fn('LOWER', sequelize.fn('IFNULL', sequelize.col('alumno.apellido_menor'), '')),
            like
          )
        ];
      }
    }

    const pagos = await AteneoPago.findAll({
      where,
      include: [
        {
          model: AteneoAlumno,
          as: 'alumno',
          include: [{
            model: User,
            as: 'usuario',
            attributes: ['id', 'name', 'email']
          }]
        },
        {
          model: AteneoClase,
          as: 'clase',
          attributes: ['id', 'nombre']
        },
        {
          model: User,
          as: 'registrador',
          attributes: ['id', 'name']
        }
      ],
      order: [['fecha_vencimiento', 'DESC']]
    });

    res.json(pagos);
  } catch (error) {
    console.error('[Ateneo] Error listando pagos:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

// GET /api/ateneo/pagos/pendientes - Pagos pendientes con filtros (admin)
router.get('/pendientes', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_pagos: AteneoPago, 
      ateneo_alumnos: AteneoAlumno,
      users: User 
    } = sequelize.models;

    const pagos = await AteneoPago.findAll({
      where: { estado: { [Op.in]: ['pendiente', 'vencido'] } },
      include: [{
        model: AteneoAlumno,
        as: 'alumno',
        include: [{
          model: User,
          as: 'usuario',
          attributes: ['id', 'name', 'email']
        }]
      }],
      order: [['fecha_vencimiento', 'ASC']]
    });

    res.json(pagos);
  } catch (error) {
    console.error('[Ateneo] Error listando pendientes:', error);
    res.status(500).json({ error: 'Error al obtener pagos pendientes' });
  }
});

// POST /api/ateneo/pagos/manual - Registrar pago manual (admin)
router.post('/manual', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { 
      ateneo_pagos: AteneoPago,
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_alumnos: AteneoAlumno
    } = sequelize.models;
    
    const { pago_id, origen, notas } = req.body;

    if (!pago_id) {
      await transaction.rollback();
      return res.status(400).json({ error: 'pago_id es requerido' });
    }

    const pago = await AteneoPago.findByPk(pago_id);
    if (!pago) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    if (pago.estado === 'pagado') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Este pago ya fue registrado' });
    }

    // Aplicar recargo del 15% si la cuota está vencida
    const montoConRecargo = calcularMontoConRecargo(pago);

    // Registrar pago (con recargo si aplica)
    await pago.update({
      estado: 'pagado',
      monto_final: montoConRecargo,
      fecha_pago: new Date(),
      origen: origen || 'efectivo',
      registrado_por: req.user.userId,
      notas: notas || null
    }, { transaction });

    // Si es matrícula, confirmar inscripción
    if (pago.tipo === 'matricula' && pago.inscripcion_id) {
      await AteneoInscripcion.update(
        { estado: 'confirmada' },
        { where: { id: pago.inscripcion_id }, transaction }
      );
    }

    // Actualizar estado académico del alumno
    await actualizarEstadoAcademico(pago.alumno_id, transaction);

    await transaction.commit();

    // Enviar email de confirmación (async)
    try {
      const alumnoData = await AteneoAlumno.findByPk(pago.alumno_id, {
        include: [{ model: sequelize.models.users, as: 'usuario', attributes: ['name', 'email'] }]
      });
      const claseData = pago.clase_id ? await sequelize.models.ateneo_clases.findByPk(pago.clase_id) : null;
      if (alumnoData?.usuario?.email) {
        enviarConfirmacionPago({
          email: alumnoData.usuario.email,
          nombre: alumnoData.usuario.name,
          clase: claseData?.nombre || 'Ateneo',
          tipo: pago.tipo,
          periodo: pago.periodo,
          monto: pago.monto_final,
          origen: origen || 'efectivo'
        }).catch(err => console.error('[Ateneo] Error email pago:', err.message));
      }
    } catch (emailErr) {
      console.error('[Ateneo] Error preparando email pago:', emailErr.message);
    }

    res.json({ message: 'Pago registrado correctamente', pago });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error registrando pago:', error);
    res.status(500).json({ error: 'Error al registrar pago' });
  }
});

// PUT /api/ateneo/pagos/:id/ajustar - Ajustar monto de una cuota pendiente (admin)
router.put('/:id/ajustar', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_pagos: AteneoPago } = sequelize.models;
    const { monto_final, notas } = req.body;

    if (monto_final === undefined || monto_final === null || parseFloat(monto_final) < 0) {
      return res.status(400).json({ error: 'monto_final es requerido y debe ser >= 0' });
    }

    const pago = await AteneoPago.findByPk(id);
    if (!pago) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    if (pago.estado === 'pagado') {
      return res.status(400).json({ error: 'No se puede ajustar un pago ya registrado' });
    }

    const montoAnterior = parseFloat(pago.monto_final);
    const notaAjuste = `Ajuste manual: $${montoAnterior.toLocaleString('es-AR')} → $${parseFloat(monto_final).toLocaleString('es-AR')}${notas ? ' - ' + notas : ''}`;

    await pago.update({
      monto_final: parseFloat(monto_final),
      notas: pago.notas ? pago.notas + '\n' + notaAjuste : notaAjuste
    });

    res.json({ message: 'Monto ajustado correctamente', pago });
  } catch (error) {
    console.error('[Ateneo] Error ajustando pago:', error);
    res.status(500).json({ error: 'Error al ajustar pago' });
  }
});

// PUT /api/ateneo/pagos/:id/extender-vencimiento - Extender fecha de vencimiento (admin)
router.put('/:id/extender-vencimiento', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_pagos: AteneoPago } = sequelize.models;
    const { fecha_vencimiento } = req.body;

    if (!fecha_vencimiento) {
      return res.status(400).json({ error: 'fecha_vencimiento es requerida' });
    }

    const pago = await AteneoPago.findByPk(id);
    if (!pago) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    if (pago.estado === 'pagado') {
      return res.status(400).json({ error: 'No se puede extender un pago ya registrado' });
    }

    const fechaAnterior = pago.fecha_vencimiento;
    const notaExtension = `Vencimiento extendido: ${fechaAnterior || '-'} → ${fecha_vencimiento}`;

    // Si el pago estaba vencido y la nueva fecha es futura, volver a pendiente
    let nuevoEstado = pago.estado;
    const nuevaFecha = new Date(fecha_vencimiento + 'T00:00:00');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (pago.estado === 'vencido' && nuevaFecha >= hoy) {
      nuevoEstado = 'pendiente';
    }

    await pago.update({
      fecha_vencimiento: fecha_vencimiento,
      estado: nuevoEstado,
      notas: pago.notas ? pago.notas + '\n' + notaExtension : notaExtension
    });

    // Si cambió de vencido a pendiente, recalcular estado académico
    if (nuevoEstado !== pago.estado) {
      await actualizarEstadoAcademico(pago.alumno_id);
    }

    res.json({ message: 'Fecha de vencimiento actualizada', pago });
  } catch (error) {
    console.error('[Ateneo] Error extendiendo vencimiento:', error);
    res.status(500).json({ error: 'Error al extender vencimiento' });
  }
});

// POST /api/ateneo/pagos/generar-cuotas - Generar cuotas mensuales para una clase (admin)
router.post('/generar-cuotas', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { 
      ateneo_pagos: AteneoPago,
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_clases: AteneoClase,
      ateneo_config: AteneoConfig
    } = sequelize.models;
    
    const { clase_id, meses, monto_parcial } = req.body; // meses: ['2026-03', '2026-04', ...], monto_parcial: number|null

    if (!clase_id || !meses || !Array.isArray(meses)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'clase_id y meses son requeridos' });
    }

    const clase = await AteneoClase.findByPk(clase_id);
    if (!clase) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    // Obtener inscripciones confirmadas
    const inscripciones = await AteneoInscripcion.findAll({
      where: { clase_id, estado: 'confirmada' }
    });

    // Obtener día de vencimiento de config
    const configDiaVencimiento = await AteneoConfig.findOne({ where: { clave: 'dia_vencimiento_cuota' } });
    const diaVencimiento = parseInt(configDiaVencimiento?.valor || '10');

    const pagosCreados = [];

    for (const inscripcion of inscripciones) {
      for (const periodo of meses) {
        // Verificar si ya existe cuota para ese período
        const existe = await AteneoPago.findOne({
          where: {
            alumno_id: inscripcion.alumno_id,
            clase_id,
            tipo: 'cuota',
            periodo
          }
        });

        if (!existe) {
          const [year, month] = periodo.split('-').map(Number);
          const fechaVencimiento = new Date(year, month - 1, diaVencimiento);

          // Si se indicó monto parcial, usarlo como base; sino usar costo_cuota de la clase
          const montoBase = (monto_parcial && parseFloat(monto_parcial) > 0) ? parseFloat(monto_parcial) : clase.costo_cuota;

          // Calcular monto con becas
          const montoFinal = await calcularMontoConBecas(
            inscripcion.alumno_id, 
            clase_id, 
            montoBase, 
            'cuota'
          );

          const pago = await AteneoPago.create({
            alumno_id: inscripcion.alumno_id,
            clase_id,
            inscripcion_id: inscripcion.id,
            tipo: 'cuota',
            periodo,
            monto_original: montoBase,
            monto_final: montoFinal,
            estado: 'pendiente',
            fecha_vencimiento: fechaVencimiento
          }, { transaction });

          pagosCreados.push(pago);
        }
      }
    }

    await transaction.commit();

    res.json({ 
      message: `${pagosCreados.length} cuotas generadas`,
      cuotas: pagosCreados.length
    });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error generando cuotas:', error);
    res.status(500).json({ error: 'Error al generar cuotas' });
  }
});

// POST /api/ateneo/pagos/generar-cuotas-alumno - Generar cuotas para un alumno/inscripción específico (admin)
router.post('/generar-cuotas-alumno', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      ateneo_pagos: AteneoPago,
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_clases: AteneoClase,
      ateneo_config: AteneoConfig
    } = sequelize.models;

    const { inscripcion_id, meses, monto_parcial } = req.body;

    if (!inscripcion_id || !meses || !Array.isArray(meses) || meses.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'inscripcion_id y meses son requeridos' });
    }

    const inscripcion = await AteneoInscripcion.findByPk(inscripcion_id);
    if (!inscripcion) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }

    const clase = await AteneoClase.findByPk(inscripcion.clase_id);
    if (!clase) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    const configDiaVencimiento = await AteneoConfig.findOne({ where: { clave: 'dia_vencimiento_cuota' } });
    const diaVencimiento = parseInt(configDiaVencimiento?.valor || '10');

    const pagosCreados = [];

    for (const periodo of meses) {
      const existe = await AteneoPago.findOne({
        where: { alumno_id: inscripcion.alumno_id, clase_id: inscripcion.clase_id, tipo: 'cuota', periodo }
      });

      if (!existe) {
        const [year, month] = periodo.split('-').map(Number);
        const fechaVencimiento = new Date(year, month - 1, diaVencimiento);
        const montoBase = (monto_parcial && parseFloat(monto_parcial) > 0) ? parseFloat(monto_parcial) : clase.costo_cuota;
        const montoFinal = await calcularMontoConBecas(inscripcion.alumno_id, inscripcion.clase_id, montoBase, 'cuota');

        const pago = await AteneoPago.create({
          alumno_id: inscripcion.alumno_id,
          clase_id: inscripcion.clase_id,
          inscripcion_id: inscripcion.id,
          tipo: 'cuota',
          periodo,
          monto_original: montoBase,
          monto_final: montoFinal,
          estado: 'pendiente',
          fecha_vencimiento: fechaVencimiento
        }, { transaction });

        pagosCreados.push(pago);
      }
    }

    await transaction.commit();
    res.json({ message: `${pagosCreados.length} cuota${pagosCreados.length !== 1 ? 's' : ''} generada${pagosCreados.length !== 1 ? 's' : ''}`, cuotas: pagosCreados.length });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error generando cuotas alumno:', error);
    res.status(500).json({ error: 'Error al generar cuotas' });
  }
});

// DELETE /api/ateneo/pagos/:id - Eliminar un pago pendiente/vencido (admin)
router.delete('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { ateneo_pagos: AteneoPago } = sequelize.models;

    const pago = await AteneoPago.findByPk(id);
    if (!pago) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    if (pago.estado === 'pagado') {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se puede eliminar un pago ya registrado como pagado' });
    }

    const alumnoId = pago.alumno_id;
    await pago.destroy({ transaction });

    await actualizarEstadoAcademico(alumnoId, transaction);
    await transaction.commit();

    res.json({ message: 'Pago eliminado correctamente' });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error eliminando pago:', error);
    res.status(500).json({ error: 'Error al eliminar pago' });
  }
});

// GET /api/ateneo/pagos/mis-pagos - Pagos del alumno logueado
router.get('/mis-pagos', authenticateToken, requireRole('alumno_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_pagos: AteneoPago, 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase
    } = sequelize.models;

    const alumno = await AteneoAlumno.findOne({ where: { user_id: req.user.userId } });
    if (!alumno) {
      return res.status(404).json({ error: 'Perfil de alumno no encontrado' });
    }

    const pagos = await AteneoPago.findAll({
      where: { alumno_id: alumno.id },
      include: [{
        model: AteneoClase,
        as: 'clase',
        attributes: ['id', 'nombre']
      }],
      order: [['fecha_vencimiento', 'DESC']]
    });

    // Separar por estado
    const pendientes = pagos.filter(p => p.estado === 'pendiente');
    const vencidos = pagos.filter(p => p.estado === 'vencido');
    const pagados = pagos.filter(p => p.estado === 'pagado');

    res.json({
      todos: pagos,
      pendientes,
      vencidos,
      pagados,
      resumen: {
        total_pendiente: pendientes.reduce((sum, p) => sum + parseFloat(p.monto_final), 0),
        total_vencido: vencidos.reduce((sum, p) => sum + parseFloat(p.monto_final), 0)
      }
    });
  } catch (error) {
    console.error('[Ateneo] Error obteniendo pagos:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

// POST /api/ateneo/pagos/:id/iniciar-pago - Iniciar pago por Sipago (alumno)
router.post('/:id/iniciar-pago', authenticateToken, requireRole('alumno_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      ateneo_pagos: AteneoPago, 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      users: User
    } = sequelize.models;

    const alumno = await AteneoAlumno.findOne({ 
      where: { user_id: req.user.userId },
      include: [{ model: User, as: 'usuario', attributes: ['id', 'name', 'email'] }]
    });
    if (!alumno) {
      return res.status(404).json({ error: 'Perfil de alumno no encontrado' });
    }

    const pago = await AteneoPago.findOne({
      where: { id, alumno_id: alumno.id },
      include: [{ model: AteneoClase, as: 'clase', attributes: ['id', 'nombre'] }]
    });

    if (!pago) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    if (pago.estado === 'pagado') {
      return res.status(400).json({ error: 'Este pago ya fue procesado' });
    }

    // Aplicar recargo del 15% si la cuota está vencida
    const monto = calcularMontoConRecargo(pago);
    if (!monto || monto <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    // Sipago espera montos en centavos
    const totalCentavos = Math.round(monto * 100);

    const FRONTEND_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.teatropigue.com.ar';
    const BASE_URL = process.env.BASE_URL || 'https://www.teatropigue.com.ar';

    // Formatear concepto con año/mes
    const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    let concepto;
    if (pago.tipo === 'matricula') {
      concepto = `Matrícula ${pago.periodo || new Date().getFullYear()} - ${pago.clase?.nombre || 'Ateneo'}`;
    } else {
      let mesLabel = pago.periodo || '';
      if (pago.periodo && pago.periodo.includes('-')) {
        const mesNum = parseInt(pago.periodo.split('-')[1]) - 1;
        mesLabel = MESES_NOMBRE[mesNum] || pago.periodo;
      }
      concepto = `Cuota ${mesLabel} - ${pago.clase?.nombre || 'Ateneo'}`;
    }

    const successUrl = new URL(`${FRONTEND_URL}/ateneo/alumno`);
    successUrl.searchParams.set('pago', 'ok');
    successUrl.searchParams.set('id', String(pago.id));

    const failureUrl = new URL(`${FRONTEND_URL}/ateneo/alumno`);
    failureUrl.searchParams.set('pago', 'error');
    failureUrl.searchParams.set('id', String(pago.id));

    const redirect_urls = {
      success: successUrl.toString(),
      failed: failureUrl.toString()
    };

    // Webhook con parámetros para identificar el pago
    const hookParams = new URLSearchParams({ 
      pago_id: String(pago.id),
      alumno_id: String(alumno.id)
    });
    if (process.env.SIPAGO_WEBHOOK_SECRET) {
      hookParams.set('secret', process.env.SIPAGO_WEBHOOK_SECRET);
    }
    const webhookUrl = `${BASE_URL}/api/ateneo/pagos/webhook?${hookParams.toString()}`;

    const items = [{
      id: `ateneo_pago_${pago.id}`,
      name: concepto,
      unitPrice: { currency: '032', amount: totalCentavos },
      quantity: 1
    }];

    const order = await createSipagoOrder({ total: totalCentavos, redirect_urls, items, webhookUrl });
    const checkoutUrl = order?.data?.attributes?.links?.checkout || order?.data?.links?.checkout;

    if (!checkoutUrl) {
      console.error('[Ateneo Sipago] No checkout URL in response:', JSON.stringify(order));
      return res.status(500).json({ error: 'No se pudo generar el link de pago' });
    }

    // Guardar referencia de la orden Sipago
    const orderUuid = order?.data?.id || order?.data?.attributes?.uuid || null;
    if (orderUuid) {
      await pago.update({ referencia_pasarela: orderUuid });
    }

    res.json({ checkout_url: checkoutUrl, pago_id: pago.id });
  } catch (error) {
    console.error('[Ateneo] Error iniciando pago Sipago:', error);
    res.status(500).json({ error: 'Error al iniciar pago' });
  }
});

// POST /api/ateneo/pagos/webhook - Webhook Sipago para notificaciones de pago
router.post('/webhook', async (req, res) => {
  console.log('[Ateneo Sipago Webhook] Recibido');
  try {
    // Validar secret
    const secret = req.query?.secret;
    if (process.env.SIPAGO_WEBHOOK_SECRET && secret !== process.env.SIPAGO_WEBHOOK_SECRET) {
      console.warn('[Ateneo Sipago Webhook] Secret inválido');
      return res.status(200).json({ ignored: true });
    }

    const pagoId = req.query?.pago_id;
    const alumnoId = req.query?.alumno_id;
    if (!pagoId) {
      console.warn('[Ateneo Sipago Webhook] Falta pago_id');
      return res.status(200).json({ ignored: true });
    }

    const { 
      ateneo_pagos: AteneoPago,
      ateneo_inscripciones: AteneoInscripcion
    } = sequelize.models;

    const pago = await AteneoPago.findByPk(pagoId);
    if (!pago) {
      console.warn('[Ateneo Sipago Webhook] Pago no encontrado:', pagoId);
      return res.status(200).json({ ignored: true });
    }

    // Ya procesado
    if (pago.estado === 'pagado') {
      console.log('[Ateneo Sipago Webhook] Pago ya procesado:', pagoId);
      return res.status(200).json({ ok: true, already_processed: true });
    }

    const payload = req.body || {};
    const orderStatus = (payload?.data?.order?.status || '').toString().toUpperCase();
    console.log('[Ateneo Sipago Webhook] order.status =', orderStatus, 'pago_id =', pagoId);

    if (orderStatus !== 'SUCCESS') {
      return res.status(200).json({ ok: true, status: orderStatus });
    }

    // Pago exitoso - actualizar
    const transaction = await sequelize.transaction();
    try {
      await pago.update({
        estado: 'pagado',
        fecha_pago: new Date(),
        origen: 'pasarela',
        notas: `Sipago - ${orderStatus}`
      }, { transaction });

      // Si es matrícula, confirmar inscripción
      if (pago.tipo === 'matricula' && pago.inscripcion_id) {
        await AteneoInscripcion.update(
          { estado: 'confirmada' },
          { where: { id: pago.inscripcion_id }, transaction }
        );
      }

      // Actualizar estado académico del alumno
      await actualizarEstadoAcademico(pago.alumno_id, transaction);

      await transaction.commit();
      console.log('[Ateneo Sipago Webhook] Pago procesado OK:', pagoId);

      // Enviar email de confirmación (async)
      try {
        const { ateneo_alumnos: AteneoAlumno, ateneo_clases: AteneoClase, users: User } = sequelize.models;
        const alumnoData = await AteneoAlumno.findByPk(pago.alumno_id, {
          include: [{ model: User, as: 'usuario', attributes: ['name', 'email'] }]
        });
        const claseData = pago.clase_id ? await AteneoClase.findByPk(pago.clase_id) : null;
        if (alumnoData?.usuario?.email) {
          enviarConfirmacionPago({
            email: alumnoData.usuario.email,
            nombre: alumnoData.usuario.name,
            clase: claseData?.nombre || 'Ateneo',
            tipo: pago.tipo,
            periodo: pago.periodo,
            monto: pago.monto_final,
            origen: 'pasarela'
          }).catch(err => console.error('[Ateneo Webhook] Error email:', err.message));
        }
      } catch (emailErr) {
        console.error('[Ateneo Webhook] Error preparando email:', emailErr.message);
      }
    } catch (txError) {
      await transaction.rollback();
      throw txError;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Ateneo Sipago Webhook] Error:', error);
    res.status(200).json({ error: 'internal_error' });
  }
});

// GET /api/ateneo/pagos/:id/verificar - Verificar estado de pago con Sipago (alumno)
router.get('/:id/verificar', authenticateToken, requireRole('alumno_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_pagos: AteneoPago, ateneo_alumnos: AteneoAlumno, ateneo_inscripciones: AteneoInscripcion } = sequelize.models;

    const alumno = await AteneoAlumno.findOne({ where: { user_id: req.user.userId } });
    if (!alumno) return res.status(404).json({ error: 'Perfil no encontrado' });

    const pago = await AteneoPago.findOne({ where: { id, alumno_id: alumno.id } });
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

    // Si ya está pagado, retornar directo
    if (pago.estado === 'pagado') {
      return res.json({ estado: 'pagado', pago });
    }

    // Si tiene referencia Sipago, consultar estado
    if (pago.referencia_pasarela) {
      try {
        const order = await getSipagoOrder(pago.referencia_pasarela);
        const orderStatus = (order?.data?.attributes?.status || '').toString().toUpperCase();

        if (orderStatus === 'SUCCESS' || orderStatus === 'APPROVED') {
          // Procesar pago que el webhook no capturó
          const transaction = await sequelize.transaction();
          try {
            await pago.update({
              estado: 'pagado',
              fecha_pago: new Date(),
              origen: 'pasarela',
              notas: `Sipago verificación - ${orderStatus}`
            }, { transaction });

            if (pago.tipo === 'matricula' && pago.inscripcion_id) {
              await AteneoInscripcion.update(
                { estado: 'confirmada' },
                { where: { id: pago.inscripcion_id }, transaction }
              );
            }

            await actualizarEstadoAcademico(pago.alumno_id, transaction);
            await transaction.commit();
          } catch (txErr) {
            await transaction.rollback();
            throw txErr;
          }
          return res.json({ estado: 'pagado', pago: await AteneoPago.findByPk(id) });
        }

        return res.json({ estado: pago.estado, sipago_status: orderStatus });
      } catch (sipagoErr) {
        console.error('[Ateneo] Error consultando Sipago:', sipagoErr.message);
      }
    }

    res.json({ estado: pago.estado });
  } catch (error) {
    console.error('[Ateneo] Error verificando pago:', error);
    res.status(500).json({ error: 'Error al verificar pago' });
  }
});

export default router;
