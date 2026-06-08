import { Router } from 'express';
import { sequelize } from '../../lib/sequelize.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { enviarNotificacionSeguimiento } from '../../lib/ateneoEmailService.js';

const router = Router();

// GET /api/ateneo/docente/mis-clases - Clases asignadas al docente
router.get('/mis-clases', authenticateToken, requireRole('admin', 'admin_ateneo', 'docente_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_clases: AteneoClase,
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_clase_docentes: AteneoClaseDocente,
      ateneo_clase_horarios: AteneoClaseHorario
    } = sequelize.models;

    // Find classes where this user is assigned as docente via join table
    const docenteEntries = await AteneoClaseDocente.findAll({
      where: { docente_id: req.user.userId },
      attributes: ['clase_id']
    });
    const claseIds = docenteEntries.map(e => e.clase_id);

    const clases = await AteneoClase.findAll({
      where: { 
        id: claseIds,
        estado: 'activa'
      },
      include: [{ model: AteneoClaseHorario, as: 'horarios' }],
      order: [['nombre', 'ASC']]
    });

    // Agregar conteo de alumnos
    const clasesConStats = await Promise.all(clases.map(async (clase) => {
      const inscriptos = await AteneoInscripcion.count({
        where: { clase_id: clase.id, estado: 'confirmada' }
      });
      return {
        ...clase.toJSON(),
        alumnos_inscriptos: inscriptos
      };
    }));

    res.json(clasesConStats);
  } catch (error) {
    console.error('[Ateneo] Error obteniendo clases docente:', error);
    res.status(500).json({ error: 'Error al obtener clases' });
  }
});

// GET /api/ateneo/docente/clases/:id/alumnos - Alumnos de una clase (sin montos)
router.get('/clases/:id/alumnos', authenticateToken, requireRole('admin', 'admin_ateneo', 'docente_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      ateneo_clases: AteneoClase,
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_alumnos: AteneoAlumno,
      users: User
    } = sequelize.models;

    // Verificar que el docente tiene acceso via join table
    const { ateneo_clase_docentes: AteneoClaseDocente } = sequelize.models;
    const clase = await AteneoClase.findByPk(id);
    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });
    const docenteAccess = await AteneoClaseDocente.findOne({ where: { clase_id: id, docente_id: req.user.userId } });
    if (!docenteAccess) {
      return res.status(403).json({ error: 'No tienes acceso a esta clase' });
    }

    const inscripciones = await AteneoInscripcion.findAll({
      where: { clase_id: id, estado: 'confirmada' },
      include: [{
        model: AteneoAlumno,
        as: 'alumno',
        attributes: ['id', 'estado_academico', 'telefono', 'contacto_emergencia', 'telefono_emergencia'],
        include: [{
          model: User,
          as: 'usuario',
          attributes: ['id', 'name', 'email']
        }]
      }],
      order: [[{ model: AteneoAlumno, as: 'alumno' }, { model: User, as: 'usuario' }, 'name', 'ASC']]
    });

    // Mapear para no exponer datos sensibles
    const alumnos = inscripciones.map(ins => ({
      inscripcion_id: ins.id,
      alumno_id: ins.alumno_id,
      nombre: ins.alumno.usuario.name,
      email: ins.alumno.usuario.email,
      telefono: ins.alumno.telefono,
      estado_academico: ins.alumno.estado_academico,
      contacto_emergencia: ins.alumno.contacto_emergencia,
      telefono_emergencia: ins.alumno.telefono_emergencia,
      fecha_inscripcion: ins.fecha_inscripcion,
      seguimiento: ins.seguimiento || '',
      es_menor: ins.alumno.es_menor || false,
      nombre_menor: ins.alumno.nombre_menor || null,
      apellido_menor: ins.alumno.apellido_menor || null
    }));

    res.json({
      clase: {
        id: clase.id,
        nombre: clase.nombre,
        horario: clase.horario,
        ubicacion: clase.ubicacion
      },
      alumnos
    });
  } catch (error) {
    console.error('[Ateneo] Error obteniendo alumnos:', error);
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
});

// GET /api/ateneo/docente/alumno/:id - Ver estado académico de alumno (sin montos)
router.get('/alumno/:id', authenticateToken, requireRole('admin', 'admin_ateneo', 'docente_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_asistencia: AteneoAsistencia,
      users: User
    } = sequelize.models;

    const alumno = await AteneoAlumno.findByPk(id, {
      attributes: ['id', 'estado_academico', 'telefono', 'contacto_emergencia', 'telefono_emergencia', 'fecha_ingreso', 'es_menor', 'nombre_menor', 'apellido_menor'],
      include: [{
        model: User,
        as: 'usuario',
        attributes: ['id', 'name', 'email']
      }]
    });

    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    // Verificar que el docente tiene acceso (the student is in one of their classes)
    const { ateneo_clase_docentes: AteneoClaseDocente } = sequelize.models;
    const docenteEntries = await AteneoClaseDocente.findAll({
      where: { docente_id: req.user.userId },
      attributes: ['clase_id']
    });
    const clasesIds = docenteEntries.map(e => e.clase_id);

    const inscripcion = await AteneoInscripcion.findOne({
      where: {
        alumno_id: id,
        clase_id: clasesIds,
        estado: 'confirmada'
      }
    });

    if (!inscripcion) {
      return res.status(403).json({ error: 'No tienes acceso a este alumno' });
    }

    // Obtener asistencia en clases del docente
    const asistencias = await AteneoAsistencia.findAll({
      where: {
        alumno_id: id,
        clase_id: clasesIds
      },
      include: [{
        model: AteneoClase,
        as: 'clase',
        attributes: ['id', 'nombre']
      }],
      order: [['fecha', 'DESC']],
      limit: 20
    });

    // Calcular estadísticas
    const stats = {
      total: asistencias.length,
      presentes: asistencias.filter(a => a.presente).length
    };
    stats.porcentaje = stats.total > 0 ? Math.round((stats.presentes / stats.total) * 100) : 0;

    res.json({
      alumno: {
        id: alumno.id,
        nombre: alumno.usuario.name,
        email: alumno.usuario.email,
        telefono: alumno.telefono,
        estado_academico: alumno.estado_academico,
        fecha_ingreso: alumno.fecha_ingreso,
        contacto_emergencia: alumno.contacto_emergencia,
        telefono_emergencia: alumno.telefono_emergencia
      },
      asistencia: {
        registros: asistencias,
        stats
      }
    });
  } catch (error) {
    console.error('[Ateneo] Error obteniendo alumno:', error);
    res.status(500).json({ error: 'Error al obtener alumno' });
  }
});

// POST /api/ateneo/docente/alumno/:id/observacion - Agregar observación
router.post('/alumno/:id/observacion', authenticateToken, requireRole('admin', 'admin_ateneo', 'docente_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { clase_id, fecha, observacion } = req.body;
    const { 
      ateneo_clases: AteneoClase,
      ateneo_asistencia: AteneoAsistencia
    } = sequelize.models;

    // Verificar acceso via join table
    const { ateneo_clase_docentes: AteneoClaseDocente } = sequelize.models;
    const clase = await AteneoClase.findByPk(clase_id);
    if (!clase) return res.status(403).json({ error: 'Clase no encontrada' });
    const docenteAccess = await AteneoClaseDocente.findOne({ where: { clase_id, docente_id: req.user.userId } });
    if (!docenteAccess) {
      return res.status(403).json({ error: 'No tienes acceso a esta clase' });
    }

    // Buscar o crear registro de asistencia
    const [asistencia, created] = await AteneoAsistencia.findOrCreate({
      where: { alumno_id: id, clase_id, fecha },
      defaults: {
        presente: false,
        observaciones: observacion,
        registrado_por: req.user.userId
      }
    });

    if (!created) {
      // Agregar a observaciones existentes
      const nuevaObs = asistencia.observaciones 
        ? `${asistencia.observaciones}\n[${new Date().toLocaleDateString()}] ${observacion}`
        : observacion;
      
      await asistencia.update({ observaciones: nuevaObs });
    }

    res.json({ message: 'Observación registrada', asistencia });
  } catch (error) {
    console.error('[Ateneo] Error agregando observación:', error);
    res.status(500).json({ error: 'Error al agregar observación' });
  }
});

// PUT /api/ateneo/docente/inscripcion/:id/seguimiento - Actualizar seguimiento de alumno
router.put('/inscripcion/:id/seguimiento', authenticateToken, requireRole('admin', 'admin_ateneo', 'docente_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { seguimiento } = req.body;
    const {
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_clases: AteneoClase,
      ateneo_clase_docentes: AteneoClaseDocente,
      ateneo_alumnos: AteneoAlumno,
      users: User
    } = sequelize.models;

    const inscripcion = await AteneoInscripcion.findByPk(id, {
      include: [
        { model: AteneoAlumno, as: 'alumno', include: [{ model: User, as: 'usuario', attributes: ['name'] }] },
        { model: AteneoClase, as: 'clase', attributes: ['id', 'nombre'] }
      ]
    });
    if (!inscripcion) {
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }

    // Verificar que el docente tiene acceso a la clase de esta inscripción
    const docenteAccess = await AteneoClaseDocente.findOne({
      where: { clase_id: inscripcion.clase_id, docente_id: req.user.userId }
    });
    if (!docenteAccess) {
      return res.status(403).json({ error: 'No tienes acceso a esta inscripción' });
    }

    await inscripcion.update({ seguimiento: seguimiento || null });

    // Send notification email to ateneo admin
    const docente = await User.findByPk(req.user.userId, { attributes: ['name'] });
    enviarNotificacionSeguimiento({
      docenteNombre: docente?.name || 'Docente',
      alumnoNombre: inscripcion.alumno?.usuario?.name || 'Alumno',
      claseNombre: inscripcion.clase?.nombre || 'Clase',
      seguimientoTexto: seguimiento || ''
    }).catch(err => console.error('[ATENEO] Error enviando email seguimiento:', err));

    res.json({ message: 'Seguimiento actualizado', seguimiento: inscripcion.seguimiento });
  } catch (error) {
    console.error('[Ateneo] Error actualizando seguimiento:', error);
    res.status(500).json({ error: 'Error al actualizar seguimiento' });
  }
});

export default router;
