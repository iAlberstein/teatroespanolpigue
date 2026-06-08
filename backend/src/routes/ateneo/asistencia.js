import { Router } from 'express';
import { sequelize } from '../../lib/sequelize.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { Op } from 'sequelize';

const router = Router();

// GET /api/ateneo/asistencia/clase/:clase_id - Asistencia de una clase (admin/docente)
router.get('/clase/:clase_id', authenticateToken, requireRole('admin', 'admin_ateneo', 'docente_ateneo'), async (req, res) => {
  try {
    const { clase_id } = req.params;
    const { fecha } = req.query;
    const { 
      ateneo_asistencia: AteneoAsistencia,
      ateneo_clases: AteneoClase,
      ateneo_alumnos: AteneoAlumno,
      ateneo_inscripciones: AteneoInscripcion,
      users: User
    } = sequelize.models;

    // Verificar que el docente tiene acceso a esta clase
    const userRoles = req.user.roles || [];
    const isDocente = userRoles.includes('docente_ateneo') && !userRoles.includes('admin') && !userRoles.includes('admin_ateneo');
    if (isDocente) {
      const { ateneo_clase_docentes: AteneoClaseDocente } = sequelize.models;
      const docenteAccess = await AteneoClaseDocente.findOne({ where: { clase_id, docente_id: req.user.userId } });
      if (!docenteAccess) {
        return res.status(403).json({ error: 'No tienes acceso a esta clase' });
      }
    }

    // Obtener alumnos inscriptos confirmados
    const inscripciones = await AteneoInscripcion.findAll({
      where: { clase_id, estado: 'confirmada' },
      include: [{
        model: AteneoAlumno,
        as: 'alumno',
        include: [{
          model: User,
          as: 'usuario',
          attributes: ['id', 'name', 'email']
        }]
      }]
    });

    // Si hay fecha específica, obtener asistencia de ese día
    if (fecha) {
      const asistencias = await AteneoAsistencia.findAll({
        where: { clase_id, fecha }
      });

      const asistenciaMap = new Map(asistencias.map(a => [a.alumno_id, a]));

      const resultado = inscripciones.map(ins => ({
        alumno_id: ins.alumno_id,
        alumno: ins.alumno,
        asistencia: asistenciaMap.get(ins.alumno_id) || null
      }));

      return res.json({ fecha, alumnos: resultado });
    }

    // Sin fecha, retornar lista de alumnos
    res.json({ alumnos: inscripciones.map(i => i.alumno) });
  } catch (error) {
    console.error('[Ateneo] Error obteniendo asistencia:', error);
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
});

// POST /api/ateneo/asistencia/registrar - Registrar asistencia (admin/docente)
router.post('/registrar', authenticateToken, requireRole('admin', 'admin_ateneo', 'docente_ateneo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { clase_id, fecha, asistencias } = req.body;
    // asistencias: [{ alumno_id, presente, observaciones }]
    
    const { 
      ateneo_asistencia: AteneoAsistencia,
      ateneo_clases: AteneoClase,
      ateneo_alumnos: AteneoAlumno
    } = sequelize.models;

    if (!clase_id || !fecha || !Array.isArray(asistencias)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'clase_id, fecha y asistencias son requeridos' });
    }

    // Verificar acceso del docente
    const userRoles2 = req.user.roles || [];
    const isDocente2 = userRoles2.includes('docente_ateneo') && !userRoles2.includes('admin') && !userRoles2.includes('admin_ateneo');
    if (isDocente2) {
      const { ateneo_clase_docentes: AteneoClaseDocente } = sequelize.models;
      const docenteAccess = await AteneoClaseDocente.findOne({ where: { clase_id, docente_id: req.user.userId } });
      if (!docenteAccess) {
        await transaction.rollback();
        return res.status(403).json({ error: 'No tienes acceso a esta clase' });
      }
    }

    const resultados = [];

    for (const item of asistencias) {
      const { alumno_id, presente, observaciones } = item;

      // Verificar que el alumno existe
      const alumno = await AteneoAlumno.findByPk(alumno_id);
      if (!alumno) continue;

      // Upsert asistencia
      const [asistencia, created] = await AteneoAsistencia.upsert({
        alumno_id,
        clase_id,
        fecha,
        presente: presente || false,
        observaciones: observaciones || null,
        registrado_por: req.user.userId
      }, { transaction });

      resultados.push({
        alumno_id,
        presente,
        created
      });
    }

    await transaction.commit();

    res.json({ 
      message: 'Asistencia registrada',
      fecha,
      resultados
    });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error registrando asistencia:', error);
    res.status(500).json({ error: 'Error al registrar asistencia' });
  }
});

// GET /api/ateneo/asistencia/historial/:clase_id - Historial de asistencia (admin/docente)
router.get('/historial/:clase_id', authenticateToken, requireRole('admin', 'admin_ateneo', 'docente_ateneo'), async (req, res) => {
  try {
    const { clase_id } = req.params;
    const { desde, hasta } = req.query;
    const { 
      ateneo_asistencia: AteneoAsistencia,
      ateneo_clases: AteneoClase
    } = sequelize.models;

    // Verificar acceso del docente
    const userRoles3 = req.user.roles || [];
    const isDocente3 = userRoles3.includes('docente_ateneo') && !userRoles3.includes('admin') && !userRoles3.includes('admin_ateneo');
    if (isDocente3) {
      const { ateneo_clase_docentes: AteneoClaseDocente } = sequelize.models;
      const docenteAccess = await AteneoClaseDocente.findOne({ where: { clase_id, docente_id: req.user.userId } });
      if (!docenteAccess) {
        return res.status(403).json({ error: 'No tienes acceso a esta clase' });
      }
    }

    const where = { clase_id };
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha[Op.gte] = desde;
      if (hasta) where.fecha[Op.lte] = hasta;
    }

    // Obtener fechas únicas con asistencia
    const fechas = await AteneoAsistencia.findAll({
      where,
      attributes: [
        'fecha',
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN presente = true THEN 1 ELSE 0 END')), 'presentes']
      ],
      group: ['fecha'],
      order: [['fecha', 'DESC']]
    });

    res.json(fechas);
  } catch (error) {
    console.error('[Ateneo] Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// GET /api/ateneo/asistencia/alumno/:alumno_id - Asistencia de un alumno (admin o propio)
router.get('/alumno/:alumno_id', authenticateToken, async (req, res) => {
  try {
    const { alumno_id } = req.params;
    const { clase_id } = req.query;
    const { 
      ateneo_asistencia: AteneoAsistencia,
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase
    } = sequelize.models;

    // Verificar permisos
    const userRoles4 = req.user.roles || [];
    const isAdmin = userRoles4.includes('admin') || userRoles4.includes('admin_ateneo');
    if (!isAdmin) {
      const alumno = await AteneoAlumno.findByPk(alumno_id);
      if (!alumno || alumno.user_id !== req.user.userId) {
        return res.status(403).json({ error: 'No autorizado' });
      }
    }

    const where = { alumno_id };
    if (clase_id) where.clase_id = clase_id;

    const asistencias = await AteneoAsistencia.findAll({
      where,
      include: [{
        model: AteneoClase,
        as: 'clase',
        attributes: ['id', 'nombre']
      }],
      order: [['fecha', 'DESC']]
    });

    // Calcular estadísticas
    const stats = {
      total: asistencias.length,
      presentes: asistencias.filter(a => a.presente).length,
      ausentes: asistencias.filter(a => !a.presente).length
    };
    stats.porcentaje = stats.total > 0 ? Math.round((stats.presentes / stats.total) * 100) : 0;

    res.json({ asistencias, stats });
  } catch (error) {
    console.error('[Ateneo] Error obteniendo asistencia alumno:', error);
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
});

// GET /api/ateneo/asistencia/mi-asistencia - Asistencia del alumno logueado
router.get('/mi-asistencia', authenticateToken, requireRole('alumno_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_asistencia: AteneoAsistencia,
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase
    } = sequelize.models;

    const alumno = await AteneoAlumno.findOne({ where: { user_id: req.user.userId } });
    if (!alumno) {
      return res.status(404).json({ error: 'Perfil de alumno no encontrado' });
    }

    const asistencias = await AteneoAsistencia.findAll({
      where: { alumno_id: alumno.id },
      include: [{
        model: AteneoClase,
        as: 'clase',
        attributes: ['id', 'nombre', 'horario']
      }],
      order: [['fecha', 'DESC']],
      limit: 50
    });

    // Agrupar por clase
    const porClase = {};
    for (const a of asistencias) {
      const claseId = a.clase_id;
      if (!porClase[claseId]) {
        porClase[claseId] = {
          clase: a.clase,
          registros: [],
          presentes: 0,
          ausentes: 0
        };
      }
      porClase[claseId].registros.push(a);
      if (a.presente) porClase[claseId].presentes++;
      else porClase[claseId].ausentes++;
    }

    res.json({
      asistencias,
      por_clase: Object.values(porClase)
    });
  } catch (error) {
    console.error('[Ateneo] Error obteniendo mi asistencia:', error);
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
});

export default router;
