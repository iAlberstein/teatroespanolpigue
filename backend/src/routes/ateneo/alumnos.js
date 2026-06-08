import { Router } from 'express';
import { sequelize } from '../../lib/sequelize.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';

const router = Router();

// GET /api/ateneo/alumnos/me/perfil - Perfil del alumno logueado (MUST be before /:id)
router.get('/me/perfil', authenticateToken, requireRole('alumno_ateneo'), async (req, res) => {
  try {
    const { ateneo_alumnos: AteneoAlumno, users: User, ateneo_inscripciones: AteneoInscripcion, ateneo_clases: AteneoClase, ateneo_clase_horarios: AteneoClaseHorario } = sequelize.models;

    const alumno = await AteneoAlumno.findOne({
      where: { user_id: req.user.userId },
      include: [
        {
          model: User,
          as: 'usuario',
          attributes: ['id', 'name', 'email']
        },
        {
          model: AteneoInscripcion,
          as: 'inscripciones',
          where: { estado: 'confirmada' },
          required: false,
          include: [{
            model: AteneoClase,
            as: 'clase',
            attributes: ['id', 'nombre', 'slug', 'horario', 'ubicacion', 'docente_id'],
            include: [
              { model: AteneoClaseHorario, as: 'horarios' },
              { model: User, as: 'docente', attributes: ['id', 'name'] }
            ]
          }]
        }
      ]
    });

    if (!alumno) {
      return res.status(404).json({ error: 'Perfil de alumno no encontrado' });
    }

    res.json(alumno);
  } catch (error) {
    console.error('[Ateneo] Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// PUT /api/ateneo/alumnos/me/perfil - Editar perfil propio del alumno
router.put('/me/perfil', authenticateToken, requireRole('alumno_ateneo'), async (req, res) => {
  try {
    const { ateneo_alumnos: AteneoAlumno, users: User } = sequelize.models;
    let alumno = await AteneoAlumno.findOne({ where: { user_id: req.user.userId } });
    const { fecha_nacimiento, direccion, contacto_emergencia, telefono_emergencia, es_menor, nombre_menor, apellido_menor, dni_menor, fecha_nacimiento_menor } = req.body;
    if (!alumno) {
      // Auto-create profile
      const user = await User.findByPk(req.user.userId);
      alumno = await AteneoAlumno.create({
        user_id: req.user.userId,
        nombre: user?.name || null,
        dni: user?.dni || null,
        telefono: user?.phone || null,
        fecha_nacimiento: fecha_nacimiento || null,
        direccion: direccion || null,
        contacto_emergencia: contacto_emergencia || null,
        telefono_emergencia: telefono_emergencia || null,
        estado_academico: 'pendiente',
        fecha_ingreso: new Date(),
        es_menor: es_menor || false,
        nombre_menor: es_menor ? (nombre_menor || null) : null,
        apellido_menor: es_menor ? (apellido_menor || null) : null,
        dni_menor: es_menor ? (dni_menor || null) : null,
        fecha_nacimiento_menor: es_menor ? (fecha_nacimiento_menor || null) : null
      });
    } else {
      const updateData = {
        fecha_nacimiento: fecha_nacimiento !== undefined ? fecha_nacimiento : alumno.fecha_nacimiento,
        direccion: direccion !== undefined ? direccion : alumno.direccion,
        contacto_emergencia: contacto_emergencia !== undefined ? contacto_emergencia : alumno.contacto_emergencia,
        telefono_emergencia: telefono_emergencia !== undefined ? telefono_emergencia : alumno.telefono_emergencia
      };
      if (es_menor !== undefined) {
        updateData.es_menor = es_menor;
        updateData.nombre_menor = es_menor ? (nombre_menor !== undefined ? nombre_menor : alumno.nombre_menor) : null;
        updateData.apellido_menor = es_menor ? (apellido_menor !== undefined ? apellido_menor : alumno.apellido_menor) : null;
        updateData.dni_menor = es_menor ? (dni_menor !== undefined ? dni_menor : alumno.dni_menor) : null;
        updateData.fecha_nacimiento_menor = es_menor ? (fecha_nacimiento_menor !== undefined ? fecha_nacimiento_menor : alumno.fecha_nacimiento_menor) : null;
      }
      await alumno.update(updateData);
    }
    res.json({ message: 'Perfil actualizado', alumno });
  } catch (error) {
    console.error('[Ateneo] Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// GET /api/ateneo/alumnos - Listado de alumnos (admin)
router.get('/', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { ateneo_alumnos: AteneoAlumno, users: User, ateneo_inscripciones: AteneoInscripcion } = sequelize.models;
    const { estado_academico, buscar } = req.query;

    const whereAlumno = {};
    if (estado_academico) whereAlumno.estado_academico = estado_academico;

    const term = buscar ? buscar.trim().toLowerCase() : '';
    if (term) {
      const like = { [Op.like]: `%${term}%` };
      whereAlumno[Op.or] = [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('ateneo_alumnos.nombre')),
          like
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.cast(sequelize.col('ateneo_alumnos.dni'), 'CHAR')),
          like
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.cast(sequelize.col('ateneo_alumnos.telefono'), 'CHAR')),
          like
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('usuario.name')),
          like
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('usuario.email')),
          like
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.fn('IFNULL', sequelize.col('ateneo_alumnos.nombre_menor'), '')),
          like
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.fn('IFNULL', sequelize.col('ateneo_alumnos.apellido_menor'), '')),
          like
        )
      ];
    }

    const alumnos = await AteneoAlumno.findAll({
      where: whereAlumno,
      include: [{
        model: User,
        as: 'usuario',
        required: true,
        attributes: ['id', 'name', 'email', 'active']
      }],
      order: [[{ model: User, as: 'usuario' }, 'name', 'ASC']]
    });

    // Agregar conteo de inscripciones
    const alumnosConStats = await Promise.all(alumnos.map(async (alumno) => {
      const inscripciones = await AteneoInscripcion.count({
        where: { alumno_id: alumno.id, estado: 'confirmada' }
      });
      return {
        ...alumno.toJSON(),
        clases_activas: inscripciones
      };
    }));

    res.json(alumnosConStats);
  } catch (error) {
    console.error('[Ateneo] Error listando alumnos:', error);
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
});

// GET /api/ateneo/alumnos/:id - Detalle de alumno (admin)
router.get('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      ateneo_alumnos: AteneoAlumno, 
      users: User, 
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_clases: AteneoClase,
      ateneo_pagos: AteneoPago,
      ateneo_becas: AteneoBeca,
      ateneo_estado_log: AteneoEstadoLog
    } = sequelize.models;

    const alumno = await AteneoAlumno.findByPk(id, {
      include: [
        {
          model: User,
          as: 'usuario',
          attributes: ['id', 'name', 'email', 'phone', 'active']
        },
        {
          model: AteneoInscripcion,
          as: 'inscripciones',
          include: [{
            model: AteneoClase,
            as: 'clase',
            attributes: ['id', 'nombre', 'slug', 'horario', 'costo_cuota']
          }]
        },
        {
          model: AteneoPago,
          as: 'pagos',
          order: [['fecha_vencimiento', 'DESC']],
          limit: 100
        },
        {
          model: AteneoBeca,
          as: 'becas',
          where: { activa: true },
          required: false
        },
        {
          model: AteneoEstadoLog,
          as: 'historial_estados',
          order: [['created_at', 'DESC']],
          limit: 10,
          include: [{
            model: User,
            as: 'responsable',
            attributes: ['id', 'name']
          }]
        }
      ]
    });

    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    res.json(alumno);
  } catch (error) {
    console.error('[Ateneo] Error obteniendo alumno:', error);
    res.status(500).json({ error: 'Error al obtener alumno' });
  }
});

// POST /api/ateneo/alumnos - Crear alumno (admin)
router.post('/', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { users: User, ateneo_alumnos: AteneoAlumno } = sequelize.models;
    const {
      nombre,
      email,
      password,
      dni,
      telefono,
      fecha_nacimiento,
      direccion,
      contacto_emergencia,
      telefono_emergencia
    } = req.body;

    if (!nombre || !email) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Nombre y email son requeridos' });
    }

    // Verificar email único
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      await transaction.rollback();
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // Crear usuario
    const password_hash = await bcrypt.hash(password || 'ateneo2026', 10);
    const user = await User.create({
      name: nombre,
      email,
      password_hash,
      phone: telefono,
      dni,
      role: 'alumno_ateneo',
      active: true
    }, { transaction });

    // Crear perfil de alumno
    const alumno = await AteneoAlumno.create({
      user_id: user.id,
      nombre,
      dni,
      telefono,
      fecha_nacimiento,
      direccion,
      contacto_emergencia,
      telefono_emergencia,
      fecha_ingreso: new Date(),
      estado_academico: 'pendiente'
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      id: alumno.id,
      user_id: user.id,
      nombre: user.name,
      email: user.email,
      estado_academico: alumno.estado_academico
    });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error creando alumno:', error);
    res.status(500).json({ error: 'Error al crear alumno' });
  }
});

// PUT /api/ateneo/alumnos/:id - Actualizar alumno (admin)
router.put('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_alumnos: AteneoAlumno, users: User } = sequelize.models;

    const alumno = await AteneoAlumno.findByPk(id, {
      include: [{ model: User, as: 'usuario' }]
    });

    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const {
      nombre,
      email,
      telefono,
      dni,
      fecha_nacimiento,
      direccion,
      contacto_emergencia,
      telefono_emergencia,
      observaciones_admin,
      active
    } = req.body;

    // Actualizar usuario
    if (nombre || email || active !== undefined) {
      await alumno.usuario.update({
        name: nombre || alumno.usuario.name,
        email: email || alumno.usuario.email,
        phone: telefono || alumno.usuario.phone,
        dni: dni || alumno.usuario.dni,
        active: active !== undefined ? active : alumno.usuario.active
      });
    }

    // Actualizar perfil alumno
    await alumno.update({
      dni: dni !== undefined ? dni : alumno.dni,
      telefono: telefono !== undefined ? telefono : alumno.telefono,
      fecha_nacimiento: fecha_nacimiento !== undefined ? fecha_nacimiento : alumno.fecha_nacimiento,
      direccion: direccion !== undefined ? direccion : alumno.direccion,
      contacto_emergencia: contacto_emergencia !== undefined ? contacto_emergencia : alumno.contacto_emergencia,
      telefono_emergencia: telefono_emergencia !== undefined ? telefono_emergencia : alumno.telefono_emergencia,
      observaciones_admin: observaciones_admin !== undefined ? observaciones_admin : alumno.observaciones_admin
    });

    res.json(alumno);
  } catch (error) {
    console.error('[Ateneo] Error actualizando alumno:', error);
    res.status(500).json({ error: 'Error al actualizar alumno' });
  }
});

// PUT /api/ateneo/alumnos/:id/estado - Forzar estado académico (admin)
router.put('/:id/estado', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { estado, motivo } = req.body;
    const { ateneo_alumnos: AteneoAlumno, ateneo_estado_log: AteneoEstadoLog } = sequelize.models;

    const alumno = await AteneoAlumno.findByPk(id);
    if (!alumno) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const estadosValidos = ['pendiente', 'activo', 'deuda', 'suspendido', 'egresado'];
    if (!estadosValidos.includes(estado)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const estadoAnterior = alumno.estado_academico;

    // Registrar cambio en log
    await AteneoEstadoLog.create({
      alumno_id: id,
      estado_anterior: estadoAnterior,
      estado_nuevo: estado,
      motivo: motivo || 'Cambio manual por admin',
      automatico: false,
      cambiado_por: req.user.userId
    }, { transaction });

    // Actualizar estado
    await alumno.update({
      estado_academico: estado,
      estado_forzado: true
    }, { transaction });

    await transaction.commit();

    res.json({
      id: alumno.id,
      estado_anterior: estadoAnterior,
      estado_nuevo: estado,
      estado_forzado: true
    });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error cambiando estado:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

export default router;
