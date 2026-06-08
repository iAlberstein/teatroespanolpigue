import { Router } from 'express';
import { sequelize } from '../../lib/sequelize.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { Op } from 'sequelize';

const router = Router();

// GET /api/ateneo/reportes/ingresos - Reporte de ingresos (admin)
router.get('/ingresos', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { desde, hasta, clase_id } = req.query;
    const { ateneo_pagos: AteneoPago, ateneo_clases: AteneoClase } = sequelize.models;

    const where = { estado: 'pagado' };
    if (desde || hasta) {
      where.fecha_pago = {};
      if (desde) where.fecha_pago[Op.gte] = desde;
      if (hasta) where.fecha_pago[Op.lte] = hasta;
    }
    if (clase_id) where.clase_id = clase_id;

    const pagos = await AteneoPago.findAll({
      where,
      include: [{
        model: AteneoClase,
        as: 'clase',
        attributes: ['id', 'nombre']
      }],
      order: [['fecha_pago', 'DESC']]
    });

    // Agrupar por tipo y clase
    const porTipo = {
      matricula: { cantidad: 0, total: 0 },
      cuota: { cantidad: 0, total: 0 }
    };

    const porClase = {};
    const porOrigen = {};
    const porMes = {};

    for (const pago of pagos) {
      const tipo = pago.tipo;
      const monto = parseFloat(pago.monto_final);
      
      porTipo[tipo].cantidad++;
      porTipo[tipo].total += monto;

      // Por clase (solo cuotas en el total)
      const claseNombre = pago.clase?.nombre || 'Sin clase';
      if (!porClase[claseNombre]) porClase[claseNombre] = { cantidad: 0, total: 0 };
      porClase[claseNombre].cantidad++;
      if (tipo === 'cuota') porClase[claseNombre].total += monto;

      // Por origen
      const origen = pago.origen;
      if (!porOrigen[origen]) porOrigen[origen] = { cantidad: 0, total: 0 };
      porOrigen[origen].cantidad++;
      porOrigen[origen].total += monto;

      // Por mes
      if (pago.fecha_pago) {
        const mes = pago.fecha_pago.toISOString().slice(0, 7);
        if (!porMes[mes]) porMes[mes] = { cantidad: 0, total: 0 };
        porMes[mes].cantidad++;
        porMes[mes].total += monto;
      }
    }

    const totalGeneral = pagos.reduce((sum, p) => sum + parseFloat(p.monto_final), 0);

    res.json({
      resumen: {
        total_pagos: pagos.length,
        total_ingresos: totalGeneral
      },
      por_tipo: porTipo,
      por_clase: porClase,
      por_origen: porOrigen,
      por_mes: porMes,
      detalle: pagos.slice(0, 100) // Limitar detalle
    });
  } catch (error) {
    console.error('[Ateneo] Error en reporte ingresos:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// GET /api/ateneo/reportes/morosidad - Reporte de morosidad (admin)
router.get('/morosidad', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_pagos: AteneoPago, 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      users: User
    } = sequelize.models;

    const hoy = new Date();

    // Pagos vencidos
    const pagosVencidos = await AteneoPago.findAll({
      where: {
        estado: { [Op.in]: ['pendiente', 'vencido'] },
        fecha_vencimiento: { [Op.lt]: hoy }
      },
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
        }
      ],
      order: [['fecha_vencimiento', 'ASC']]
    });

    // Agrupar por alumno
    const porAlumno = {};
    for (const pago of pagosVencidos) {
      const alumnoId = pago.alumno_id;
      if (!porAlumno[alumnoId]) {
        porAlumno[alumnoId] = {
          alumno: pago.alumno,
          pagos_vencidos: [],
          total_adeudado: 0,
          cuotas_vencidas: 0
        };
      }
      porAlumno[alumnoId].pagos_vencidos.push(pago);
      porAlumno[alumnoId].total_adeudado += parseFloat(pago.monto_final);
      if (pago.tipo === 'cuota') porAlumno[alumnoId].cuotas_vencidas++;
    }

    // Convertir a array y ordenar por deuda
    const alumnosDeudores = Object.values(porAlumno)
      .sort((a, b) => b.total_adeudado - a.total_adeudado);

    const totalDeuda = pagosVencidos.reduce((sum, p) => sum + parseFloat(p.monto_final), 0);

    res.json({
      resumen: {
        total_pagos_vencidos: pagosVencidos.length,
        total_alumnos_deudores: alumnosDeudores.length,
        total_deuda: totalDeuda
      },
      por_alumno: alumnosDeudores,
      detalle: pagosVencidos
    });
  } catch (error) {
    console.error('[Ateneo] Error en reporte morosidad:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// GET /api/ateneo/reportes/asistencia - Reporte de asistencia (admin)
router.get('/asistencia', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { clase_id, desde, hasta } = req.query;
    const { 
      ateneo_asistencia: AteneoAsistencia,
      ateneo_clases: AteneoClase,
      ateneo_alumnos: AteneoAlumno,
      users: User
    } = sequelize.models;

    if (!clase_id) {
      return res.status(400).json({ error: 'clase_id es requerido' });
    }

    const clase = await AteneoClase.findByPk(clase_id);
    if (!clase) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    const whereAsistencia = { clase_id };
    if (desde || hasta) {
      whereAsistencia.fecha = {};
      if (desde) whereAsistencia.fecha[Op.gte] = desde;
      if (hasta) whereAsistencia.fecha[Op.lte] = hasta;
    }

    const asistencias = await AteneoAsistencia.findAll({
      where: whereAsistencia,
      include: [{
        model: AteneoAlumno,
        as: 'alumno',
        include: [{
          model: User,
          as: 'usuario',
          attributes: ['name']
        }]
      }],
      order: [['fecha', 'DESC']]
    });

    // Agrupar por alumno
    const porAlumno = {};
    for (const a of asistencias) {
      const alumnoId = a.alumno_id;
      if (!porAlumno[alumnoId]) {
        porAlumno[alumnoId] = {
          alumno_id: alumnoId,
          nombre: a.alumno?.usuario?.name || 'N/A',
          total: 0,
          presentes: 0,
          ausentes: 0
        };
      }
      porAlumno[alumnoId].total++;
      if (a.presente) porAlumno[alumnoId].presentes++;
      else porAlumno[alumnoId].ausentes++;
    }

    // Calcular porcentajes
    const estadisticasAlumnos = Object.values(porAlumno).map(a => ({
      ...a,
      porcentaje: a.total > 0 ? Math.round((a.presentes / a.total) * 100) : 0
    })).sort((a, b) => b.porcentaje - a.porcentaje);

    // Fechas únicas
    const fechasSet = new Set(asistencias.map(a => a.fecha));
    const totalClases = fechasSet.size;

    res.json({
      clase: { id: clase.id, nombre: clase.nombre },
      resumen: {
        total_clases_dictadas: totalClases,
        total_alumnos: estadisticasAlumnos.length,
        promedio_asistencia: estadisticasAlumnos.length > 0
          ? Math.round(estadisticasAlumnos.reduce((sum, a) => sum + a.porcentaje, 0) / estadisticasAlumnos.length)
          : 0
      },
      por_alumno: estadisticasAlumnos
    });
  } catch (error) {
    console.error('[Ateneo] Error en reporte asistencia:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// GET /api/ateneo/reportes/estados - Reporte de estados académicos (admin)
router.get('/estados', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { ateneo_alumnos: AteneoAlumno, users: User } = sequelize.models;

    const alumnos = await AteneoAlumno.findAll({
      include: [{
        model: User,
        as: 'usuario',
        attributes: ['name', 'email', 'active']
      }]
    });

    // Agrupar por estado
    const porEstado = {
      pendiente: [],
      activo: [],
      deuda: [],
      suspendido: [],
      egresado: []
    };

    for (const alumno of alumnos) {
      porEstado[alumno.estado_academico].push({
        id: alumno.id,
        nombre: alumno.usuario?.name,
        email: alumno.usuario?.email,
        estado_forzado: alumno.estado_forzado
      });
    }

    res.json({
      resumen: {
        total: alumnos.length,
        pendiente: porEstado.pendiente.length,
        activo: porEstado.activo.length,
        deuda: porEstado.deuda.length,
        suspendido: porEstado.suspendido.length,
        egresado: porEstado.egresado.length
      },
      por_estado: porEstado
    });
  } catch (error) {
    console.error('[Ateneo] Error en reporte estados:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// GET /api/ateneo/reportes/dashboard - Dashboard resumen (admin)
router.get('/dashboard', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_pagos: AteneoPago
    } = sequelize.models;

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [
      totalAlumnos,
      alumnosActivos,
      totalClases,
      clasesActivas,
      inscripcionesConfirmadas,
      pagosEsteMes,
      pagosPendientes,
      pagosVencidos
    ] = await Promise.all([
      AteneoAlumno.count(),
      AteneoAlumno.count({ where: { estado_academico: 'activo' } }),
      AteneoClase.count(),
      AteneoClase.count({ where: { estado: 'activa' } }),
      AteneoInscripcion.count({ where: { estado: 'confirmada' } }),
      AteneoPago.sum('monto_final', { 
        where: { estado: 'pagado', fecha_pago: { [Op.gte]: inicioMes } } 
      }),
      AteneoPago.count({ where: { estado: 'pendiente' } }),
      AteneoPago.count({ where: { estado: 'vencido' } })
    ]);

    res.json({
      alumnos: {
        total: totalAlumnos,
        activos: alumnosActivos
      },
      clases: {
        total: totalClases,
        activas: clasesActivas
      },
      inscripciones: {
        confirmadas: inscripcionesConfirmadas
      },
      pagos: {
        ingresos_mes: pagosEsteMes || 0,
        pendientes: pagosPendientes,
        vencidos: pagosVencidos
      }
    });
  } catch (error) {
    console.error('[Ateneo] Error en dashboard:', error);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
});

// GET /api/ateneo/reportes/export/ingresos - Exportar ingresos CSV
router.get('/export/ingresos', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { desde, hasta, clase_id } = req.query;
    const { ateneo_pagos: AteneoPago, ateneo_clases: AteneoClase, ateneo_alumnos: AteneoAlumno, users: User } = sequelize.models;

    const where = { estado: 'pagado' };
    if (desde || hasta) {
      where.fecha_pago = {};
      if (desde) where.fecha_pago[Op.gte] = desde;
      if (hasta) where.fecha_pago[Op.lte] = hasta;
    }
    if (clase_id) where.clase_id = clase_id;

    const pagos = await AteneoPago.findAll({
      where,
      include: [
        { model: AteneoClase, as: 'clase', attributes: ['nombre'] },
        { model: AteneoAlumno, as: 'alumno', include: [{ model: User, as: 'usuario', attributes: ['name', 'email'] }] }
      ],
      order: [['fecha_pago', 'DESC']]
    });

    let csv = 'Fecha,Alumno,Email,Clase,Tipo,Periodo,Monto Original,Monto Final,Origen\n';
    for (const p of pagos) {
      csv += `${p.fecha_pago ? new Date(p.fecha_pago).toLocaleDateString('es-AR') : ''},`;
      csv += `"${p.alumno?.usuario?.name || ''}",`;
      csv += `${p.alumno?.usuario?.email || ''},`;
      csv += `"${p.clase?.nombre || ''}",`;
      csv += `${p.tipo},${p.periodo || ''},${p.monto_original},${p.monto_final},${p.origen}\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=ingresos_ateneo.csv');
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('[Ateneo] Error exportando ingresos:', error);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

// GET /api/ateneo/reportes/export/morosidad - Exportar morosidad CSV
router.get('/export/morosidad', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { ateneo_pagos: AteneoPago, ateneo_alumnos: AteneoAlumno, ateneo_clases: AteneoClase, users: User } = sequelize.models;
    const hoy = new Date();

    const pagosVencidos = await AteneoPago.findAll({
      where: { estado: { [Op.in]: ['pendiente', 'vencido'] }, fecha_vencimiento: { [Op.lt]: hoy } },
      include: [
        { model: AteneoAlumno, as: 'alumno', include: [{ model: User, as: 'usuario', attributes: ['name', 'email'] }] },
        { model: AteneoClase, as: 'clase', attributes: ['nombre'] }
      ],
      order: [['fecha_vencimiento', 'ASC']]
    });

    let csv = 'Alumno,Email,Clase,Tipo,Periodo,Monto,Vencimiento,Estado\n';
    for (const p of pagosVencidos) {
      csv += `"${p.alumno?.usuario?.name || ''}",`;
      csv += `${p.alumno?.usuario?.email || ''},`;
      csv += `"${p.clase?.nombre || ''}",`;
      csv += `${p.tipo},${p.periodo || ''},${p.monto_final},`;
      csv += `${p.fecha_vencimiento ? new Date(p.fecha_vencimiento).toLocaleDateString('es-AR') : ''},${p.estado}\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=morosidad_ateneo.csv');
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('[Ateneo] Error exportando morosidad:', error);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

// GET /api/ateneo/reportes/export/asistencia - Exportar asistencia CSV
router.get('/export/asistencia', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { clase_id, desde, hasta } = req.query;
    if (!clase_id) return res.status(400).json({ error: 'clase_id requerido' });

    const { ateneo_asistencia: AteneoAsistencia, ateneo_clases: AteneoClase, ateneo_alumnos: AteneoAlumno, users: User } = sequelize.models;

    const clase = await AteneoClase.findByPk(clase_id);
    const whereA = { clase_id };
    if (desde || hasta) {
      whereA.fecha = {};
      if (desde) whereA.fecha[Op.gte] = desde;
      if (hasta) whereA.fecha[Op.lte] = hasta;
    }

    const asistencias = await AteneoAsistencia.findAll({
      where: whereA,
      include: [{ model: AteneoAlumno, as: 'alumno', include: [{ model: User, as: 'usuario', attributes: ['name'] }] }],
      order: [['fecha', 'DESC'], ['alumno_id', 'ASC']]
    });

    let csv = `Asistencia - ${clase?.nombre || 'Clase'}\nFecha,Alumno,Presente,Observaciones\n`;
    for (const a of asistencias) {
      csv += `${a.fecha ? new Date(a.fecha).toLocaleDateString('es-AR') : ''},`;
      csv += `"${a.alumno?.usuario?.name || ''}",`;
      csv += `${a.presente ? 'Sí' : 'No'},"${(a.observaciones || '').replace(/"/g, '""')}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=asistencia_${clase?.nombre || 'clase'}.csv`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('[Ateneo] Error exportando asistencia:', error);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

// GET /api/ateneo/reportes/rendicion-datos - Datos para PDF de rendicion al docente (admin)
router.get('/rendicion-datos', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { clase_id, periodos } = req.query;
    if (!clase_id) return res.status(400).json({ error: 'clase_id es requerido' });

    const {
      ateneo_clases: AteneoClase,
      ateneo_clase_horarios: AteneoClaseHorario,
      ateneo_pagos: AteneoPago,
      ateneo_alumnos: AteneoAlumno,
      ateneo_inscripciones: AteneoInscripcion,
      users: User
    } = sequelize.models;

    const clase = await AteneoClase.findByPk(clase_id, {
      include: [
        { model: User, as: 'docente', attributes: ['id', 'name'] },
        { model: AteneoClaseHorario, as: 'horarios' }
      ]
    });
    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });

    // Periodos: array de strings 'YYYY-MM', puede venir como "2026-04,2026-05" o array
    let periodosArr = [];
    if (periodos) {
      periodosArr = (Array.isArray(periodos) ? periodos : periodos.split(',')).map(p => p.trim()).filter(Boolean);
    }

    const whereP = {
      clase_id,
      tipo: 'cuota',
      estado: 'pagado'
    };
    if (periodosArr.length > 0) {
      whereP.periodo = { [Op.in]: periodosArr };
    }

    const pagos = await AteneoPago.findAll({
      where: whereP,
      include: [{
        model: AteneoAlumno,
        as: 'alumno',
        include: [{ model: User, as: 'usuario', attributes: ['name'] }]
      }],
      order: [['periodo', 'ASC'], ['alumno_id', 'ASC']]
    });

    // Obtener períodos disponibles de cuotas pagadas para esa clase
    const todosLosPagos = await AteneoPago.findAll({
      where: { clase_id, tipo: 'cuota', estado: 'pagado' },
      attributes: ['periodo'],
      group: ['periodo'],
      order: [['periodo', 'ASC']]
    });
    const periodosDisponibles = [...new Set(todosLosPagos.map(p => p.periodo).filter(Boolean))];

    // Agrupar pagos por alumno (un alumno puede tener múltiples cuotas)
    const porAlumno = {};
    for (const pago of pagos) {
      const alumno = pago.alumno;
      const esMenor = alumno?.es_menor;
      const nombre = esMenor
        ? `${alumno.nombre_menor || ''} ${alumno.apellido_menor || ''}`.trim() || alumno?.usuario?.name || '-'
        : alumno?.usuario?.name || alumno?.nombre || '-';
      const key = alumno?.id || pago.alumno_id;
      if (!porAlumno[key]) {
        porAlumno[key] = { nombre, monto: 0, periodos: [], observaciones: '' };
      }
      porAlumno[key].monto += parseFloat(pago.monto_final || 0);
      if (pago.periodo && !porAlumno[key].periodos.includes(pago.periodo)) {
        porAlumno[key].periodos.push(pago.periodo);
      }
    }

    const filas = Object.values(porAlumno).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const totalRecaudado = filas.reduce((sum, f) => sum + f.monto, 0);

    res.json({
      clase: {
        id: clase.id,
        nombre: clase.nombre,
        docente: clase.docente?.name || clase.nombre_docente || '-',
        horarios: (clase.horarios || []).map(h => ({
          dia: h.dia_semana,
          hora_inicio: h.hora_inicio,
          hora_fin: h.hora_fin
        }))
      },
      periodosDisponibles,
      periodosSeleccionados: periodosArr,
      filas,
      totalRecaudado
    });
  } catch (error) {
    console.error('[Ateneo] Error rendicion datos:', error);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// GET /api/ateneo/reportes/lista-alumnos - Lista de alumnos con inscripcion confirmada (admin)
router.get('/lista-alumnos', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { clase_id } = req.query;
    const {
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      users: User
    } = sequelize.models;

    const where = { estado: 'confirmada' };
    if (clase_id) where.clase_id = clase_id;

    const inscripciones = await AteneoInscripcion.findAll({
      where,
      include: [
        {
          model: AteneoAlumno,
          as: 'alumno',
          include: [{ model: User, as: 'usuario', attributes: ['name'] }]
        },
        {
          model: AteneoClase,
          as: 'clase',
          attributes: ['id', 'nombre']
        }
      ],
      order: [
        [{ model: AteneoClase, as: 'clase' }, 'nombre', 'ASC'],
        ['alumno_id', 'ASC']
      ]
    });

    const lista = inscripciones.map(insc => {
      const alumno = insc.alumno;
      const esMenor = alumno?.es_menor;
      const nombre = esMenor
        ? `${alumno.nombre_menor || ''} ${alumno.apellido_menor || ''}`.trim() || alumno?.usuario?.name || '-'
        : alumno?.usuario?.name || alumno?.nombre || '-';
      const dni = esMenor ? (alumno?.dni_menor || '-') : (alumno?.dni || '-');
      const fechaNacimiento = esMenor ? (alumno?.fecha_nacimiento_menor || null) : (alumno?.fecha_nacimiento || null);

      return {
        inscripcion_id: insc.id,
        clase: insc.clase?.nombre || '-',
        nombre,
        fecha_nacimiento: fechaNacimiento,
        dni
      };
    });

    res.json({ total: lista.length, lista });
  } catch (error) {
    console.error('[Ateneo] Error en lista alumnos:', error);
    res.status(500).json({ error: 'Error al generar lista' });
  }
});

// GET /api/ateneo/reportes/export/lista-alumnos - Exportar lista CSV
router.get('/export/lista-alumnos', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { clase_id } = req.query;
    const {
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      users: User
    } = sequelize.models;

    const where = { estado: 'confirmada' };
    if (clase_id) where.clase_id = clase_id;

    const inscripciones = await AteneoInscripcion.findAll({
      where,
      include: [
        {
          model: AteneoAlumno,
          as: 'alumno',
          include: [{ model: User, as: 'usuario', attributes: ['name'] }]
        },
        {
          model: AteneoClase,
          as: 'clase',
          attributes: ['id', 'nombre']
        }
      ],
      order: [
        [{ model: AteneoClase, as: 'clase' }, 'nombre', 'ASC'],
        ['alumno_id', 'ASC']
      ]
    });

    const formatFechaCSV = (fecha) => {
      if (!fecha) return '-';
      const d = new Date(String(fecha).length === 10 ? fecha + 'T12:00:00' : fecha);
      if (isNaN(d)) return '-';
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    let csv = 'Clase,Nombre y Apellido,Fecha de Nacimiento,DNI\n';
    for (const insc of inscripciones) {
      const alumno = insc.alumno;
      const esMenor = alumno?.es_menor;
      const nombre = esMenor
        ? `${alumno.nombre_menor || ''} ${alumno.apellido_menor || ''}`.trim() || alumno?.usuario?.name || ''
        : alumno?.usuario?.name || alumno?.nombre || '';
      const dni = esMenor ? (alumno?.dni_menor || '') : (alumno?.dni || '');
      const fechaNac = esMenor ? alumno?.fecha_nacimiento_menor : alumno?.fecha_nacimiento;

      csv += `"${(insc.clase?.nombre || '').replace(/"/g, '""')}",`;
      csv += `"${nombre.replace(/"/g, '""')}",`;
      csv += `${formatFechaCSV(fechaNac)},`;
      csv += `${dni}\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=lista_alumnos_ateneo.csv');
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('[Ateneo] Error exportando lista alumnos:', error);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

export default router;
