import { Router } from 'express';
import { sequelize } from '../../lib/sequelize.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { Op } from 'sequelize';
import { enviarConfirmacionInscripcion } from '../../lib/ateneoEmailService.js';

const router = Router();

// GET /api/ateneo/inscripciones/mis-inscripciones - Inscripciones del alumno logueado (MUST be before /:id)
router.get('/mis-inscripciones', authenticateToken, requireRole('alumno_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_inscripciones: AteneoInscripcion, 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      ateneo_clase_horarios: AteneoClaseHorario,
      users: User
    } = sequelize.models;

    const alumno = await AteneoAlumno.findOne({ where: { user_id: req.user.userId } });
    if (!alumno) {
      return res.status(404).json({ error: 'Perfil de alumno no encontrado' });
    }

    const inscripciones = await AteneoInscripcion.findAll({
      where: { alumno_id: alumno.id },
      include: [{
        model: AteneoClase,
        as: 'clase',
        include: [
          { model: User, as: 'docente', attributes: ['id', 'name'] },
          { model: AteneoClaseHorario, as: 'horarios' }
        ]
      }],
      order: [['fecha_inscripcion', 'DESC']]
    });

    res.json(inscripciones);
  } catch (error) {
    console.error('[Ateneo] Error obteniendo inscripciones:', error);
    res.status(500).json({ error: 'Error al obtener inscripciones' });
  }
});

// GET /api/ateneo/inscripciones - Listado (admin)
router.get('/', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_inscripciones: AteneoInscripcion, 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      users: User 
    } = sequelize.models;
    
    const { clase_id, estado, buscar } = req.query;
    const where = {};
    if (clase_id) where.clase_id = clase_id;
    if (estado) where.estado = estado;
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

    const inscripciones = await AteneoInscripcion.findAll({
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
          attributes: ['id', 'nombre', 'slug']
        }
      ],
      order: [['fecha_inscripcion', 'DESC']]
    });

    res.json(inscripciones);
  } catch (error) {
    console.error('[Ateneo] Error listando inscripciones:', error);
    res.status(500).json({ error: 'Error al obtener inscripciones' });
  }
});

// POST /api/ateneo/inscripciones - Inscribir alumno a clase
router.post('/', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { 
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      ateneo_pagos: AteneoPago,
      ateneo_config: AteneoConfig,
      users: User,
      roles: Role,
      user_roles: UserRole
    } = sequelize.models;
    
    const { clase_id, alumno_id, es_menor, nombre_menor, apellido_menor, dni_menor, fecha_nacimiento_menor } = req.body;
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes('admin') || userRoles.includes('admin_ateneo') || req.user.role === 'admin';
    
    // Si no es admin, obtener o crear alumno_id del usuario logueado
    let targetAlumnoId = alumno_id;
    if (!isAdmin) {
      let alumno = await AteneoAlumno.findOne({ where: { user_id: req.user.userId } });
      if (!alumno) {
        // Auto-crear perfil de alumno
        const user = await User.findByPk(req.user.userId);
        if (!user) {
          await transaction.rollback();
          return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        alumno = await AteneoAlumno.create({
          user_id: req.user.userId,
          nombre: user.name || null,
          dni: user.dni || null,
          telefono: user.phone || null,
          estado_academico: 'pendiente',
          fecha_ingreso: new Date(),
          es_menor: es_menor || false,
          nombre_menor: es_menor ? (nombre_menor || null) : null,
          apellido_menor: es_menor ? (apellido_menor || null) : null,
          dni_menor: es_menor ? (dni_menor || null) : null,
          fecha_nacimiento_menor: es_menor ? (fecha_nacimiento_menor || null) : null
        }, { transaction });

        // Asignar rol alumno_ateneo si no lo tiene
        if (!userRoles.includes('alumno_ateneo')) {
          const rolAlumno = await Role.findOne({ where: { nombre: 'alumno_ateneo' } });
          if (rolAlumno) {
            const yaExiste = await UserRole.findOne({ where: { user_id: req.user.userId, role_id: rolAlumno.id } });
            if (!yaExiste) {
              await UserRole.create({ user_id: req.user.userId, role_id: rolAlumno.id }, { transaction });
            }
          }
        }
      } else if (es_menor && !alumno.es_menor) {
        // Update existing alumno with minor data
        await alumno.update({
          es_menor: true,
          nombre_menor: nombre_menor || alumno.nombre_menor,
          apellido_menor: apellido_menor || alumno.apellido_menor,
          dni_menor: dni_menor || alumno.dni_menor,
          fecha_nacimiento_menor: fecha_nacimiento_menor || alumno.fecha_nacimiento_menor
        }, { transaction });
      }
      targetAlumnoId = alumno.id;
    }

    if (!clase_id || !targetAlumnoId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'clase_id y alumno_id son requeridos' });
    }

    // Verificar que la clase existe y está activa
    const clase = await AteneoClase.findByPk(clase_id);
    if (!clase) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Clase no encontrada' });
    }
    if (clase.estado !== 'activa') {
      await transaction.rollback();
      return res.status(400).json({ error: 'La clase no está activa' });
    }

    // Verificar cupo
    const inscripcionesActuales = await AteneoInscripcion.count({
      where: { clase_id, estado: { [Op.in]: ['pendiente', 'confirmada'] } }
    });
    if (inscripcionesActuales >= clase.cupo) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No hay cupo disponible' });
    }

    // Verificar que no esté ya inscripto (excluir bajas para permitir re-inscripción)
    const existente = await AteneoInscripcion.findOne({
      where: { alumno_id: targetAlumnoId, clase_id, estado: { [Op.in]: ['pendiente', 'confirmada'] } }
    });
    if (existente) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Ya existe una inscripción activa a esta clase' });
    }

    // Si la clase tiene matrícula bonificada, la inscripción se confirma directamente
    const skipMatricula = !!clase.matricula_bonificada;

    // Crear inscripción
    const inscripcion = await AteneoInscripcion.create({
      alumno_id: targetAlumnoId,
      clase_id,
      estado: skipMatricula ? 'confirmada' : 'pendiente'
    }, { transaction });

    // Obtener configuración para fecha de vencimiento
    const configDiaVencimiento = await AteneoConfig.findOne({ where: { clave: 'dia_vencimiento_cuota' } });
    const diaVencimiento = parseInt(configDiaVencimiento?.valor || '10');

    const hoy = new Date();

    // Solo crear pago de matrícula si la clase NO tiene matrícula bonificada
    if (!skipMatricula) {
      const vencMatricula = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 7);
      const fechaVencMatriculaStr = `${vencMatricula.getFullYear()}-${String(vencMatricula.getMonth() + 1).padStart(2, '0')}-${String(vencMatricula.getDate()).padStart(2, '0')}`;

      await AteneoPago.create({
        alumno_id: targetAlumnoId,
        clase_id,
        inscripcion_id: inscripcion.id,
        tipo: 'matricula',
        periodo: `${hoy.getFullYear()}`,
        monto_original: clase.costo_matricula,
        monto_final: clase.costo_matricula,
        estado: 'pendiente',
        fecha_vencimiento: fechaVencMatriculaStr
      }, { transaction });
    }

    // Generar solo la primera cuota mensual (el resto se genera manualmente desde admin)
    if (clase.fecha_inicio && clase.costo_cuota > 0) {
      const inicio = new Date(clase.fecha_inicio + 'T12:00:00');
      const anio = inicio.getFullYear();
      const mes = inicio.getMonth();
      const periodo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
      const fechaVencStr = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(diaVencimiento).padStart(2, '0')}`;

      await AteneoPago.create({
        alumno_id: targetAlumnoId,
        clase_id,
        inscripcion_id: inscripcion.id,
        tipo: 'cuota',
        periodo,
        monto_original: clase.costo_cuota,
        monto_final: clase.costo_cuota,
        estado: 'pendiente',
        fecha_vencimiento: fechaVencStr
      }, { transaction });
    }

    await transaction.commit();

    // Enviar email de confirmación (async, no bloquea)
    try {
      const alumnoData = await AteneoAlumno.findByPk(targetAlumnoId, {
        include: [{ model: User, as: 'usuario', attributes: ['name', 'email'] }]
      });
      if (alumnoData?.usuario?.email) {
        enviarConfirmacionInscripcion({
          email: alumnoData.usuario.email,
          nombre: alumnoData.usuario.name,
          clase: clase.nombre,
          estado: 'pendiente'
        }).catch(err => console.error('[Ateneo] Error enviando email inscripción:', err.message));
      }
    } catch (emailErr) {
      console.error('[Ateneo] Error preparando email:', emailErr.message);
    }

    res.status(201).json({
      inscripcion,
      mensaje: 'Inscripción creada. Pague la matrícula para confirmar.'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error creando inscripción:', error);
    res.status(500).json({ error: 'Error al crear inscripción' });
  }
});

// PUT /api/ateneo/inscripciones/:id/baja - Dar de baja (admin o alumno propio)
router.put('/:id/baja', authenticateToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const { 
      ateneo_inscripciones: AteneoInscripcion, 
      ateneo_alumnos: AteneoAlumno, 
      ateneo_pagos: AteneoPago,
      ateneo_clases: AteneoClase,
      users: User
    } = sequelize.models;

    const inscripcion = await AteneoInscripcion.findByPk(id, {
      include: [
        { model: AteneoAlumno, as: 'alumno', include: [{ model: User, as: 'usuario', attributes: ['name', 'email'] }] },
        { model: AteneoClase, as: 'clase', attributes: ['id', 'nombre'] }
      ]
    });

    if (!inscripcion) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }

    // Verificar permisos
    const roles = req.user.roles || [];
    const isAdmin = roles.includes('admin') || roles.includes('admin_ateneo') || req.user.role === 'admin';
    const isOwner = inscripcion.alumno?.user_id === req.user.userId;
    
    if (!isAdmin && !isOwner) {
      await transaction.rollback();
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Delete pending/vencido payments for this inscription
    await AteneoPago.destroy({
      where: { 
        inscripcion_id: inscripcion.id, 
        estado: { [Op.in]: ['pendiente', 'vencido'] } 
      },
      transaction
    });

    await inscripcion.update({
      estado: 'baja',
      motivo_baja: motivo || 'Baja voluntaria'
    }, { transaction });

    await transaction.commit();

    // Send baja email (async, non-blocking)
    try {
      const email = inscripcion.alumno?.usuario?.email;
      const nombre = inscripcion.alumno?.usuario?.name;
      const clase = inscripcion.clase?.nombre;
      if (email && nombre && clase) {
        const { enviarNotificacionBaja } = await import('../../lib/ateneoEmailService.js');
        enviarNotificacionBaja({ email, nombre, clase, motivo: motivo || 'Baja voluntaria' })
          .catch(err => console.error('[Ateneo] Error enviando email baja:', err.message));
      }
    } catch (emailErr) {
      console.error('[Ateneo] Error preparando email baja:', emailErr.message);
    }

    res.json({ message: 'Baja registrada. Pagos pendientes eliminados.', inscripcion });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error dando de baja:', error);
    res.status(500).json({ error: 'Error al procesar baja' });
  }
});

// PUT /api/ateneo/inscripciones/:id/confirmar - Confirmar inscripción manualmente (admin)
router.put('/:id/confirmar', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      ateneo_inscripciones: AteneoInscripcion, 
      ateneo_alumnos: AteneoAlumno, 
      ateneo_clases: AteneoClase,
      users: User 
    } = sequelize.models;

    const inscripcion = await AteneoInscripcion.findByPk(id, {
      include: [
        { model: AteneoAlumno, as: 'alumno', include: [{ model: User, as: 'usuario', attributes: ['name', 'email'] }] },
        { model: AteneoClase, as: 'clase', attributes: ['nombre'] }
      ]
    });
    if (!inscripcion) {
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }

    await inscripcion.update({ estado: 'confirmada' });

    // Enviar email de confirmación al alumno
    try {
      const email = inscripcion.alumno?.usuario?.email;
      const nombre = inscripcion.alumno?.usuario?.name;
      const clase = inscripcion.clase?.nombre;
      if (email && nombre && clase) {
        const { enviarInscripcionConfirmada } = await import('../../lib/ateneoEmailService.js');
        enviarInscripcionConfirmada({ email, nombre, clase })
          .catch(err => console.error('[Ateneo] Error enviando email confirmación:', err.message));
      }
    } catch (emailErr) {
      console.error('[Ateneo] Error preparando email confirmación:', emailErr.message);
    }

    res.json({ message: 'Inscripción confirmada', inscripcion });
  } catch (error) {
    console.error('[Ateneo] Error confirmando inscripción:', error);
    res.status(500).json({ error: 'Error al confirmar inscripción' });
  }
});

// PUT /api/ateneo/inscripciones/:id/seguimiento - Actualizar seguimiento (admin)
router.put('/:id/seguimiento', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { seguimiento } = req.body;
    const { ateneo_inscripciones: AteneoInscripcion } = sequelize.models;

    const inscripcion = await AteneoInscripcion.findByPk(id);
    if (!inscripcion) {
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }

    await inscripcion.update({ seguimiento: seguimiento || null });
    res.json({ message: 'Seguimiento actualizado', seguimiento: inscripcion.seguimiento });
  } catch (error) {
    console.error('[Ateneo] Error actualizando seguimiento:', error);
    res.status(500).json({ error: 'Error al actualizar seguimiento' });
  }
});

export default router;
