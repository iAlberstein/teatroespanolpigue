import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../../lib/sequelize.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { Op } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Multer config for ateneo images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../../media/ateneo'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ateneo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten imagenes (jpeg, jpg, png, gif, webp)'));
  }
});

// Generar slug único
function generateSlug(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// GET /api/ateneo/clases - Listado de clases (admin)
router.get('/', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { ateneo_clases: AteneoClase, ateneo_clase_horarios: AteneoClaseHorario, users: User, ateneo_inscripciones: AteneoInscripcion } = sequelize.models;
    const { estado, ciclo } = req.query;

    const where = {};
    if (estado) where.estado = estado;
    if (ciclo) where.ciclo = ciclo;

    const clases = await AteneoClase.findAll({
      where,
      include: [
        { model: User, as: 'docente', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'docentes', attributes: ['id', 'name', 'email'], through: { attributes: [] } },
        { model: AteneoClaseHorario, as: 'horarios', order: [['dia_semana', 'ASC']] }
      ],
      order: [['orden', 'ASC'], ['nombre', 'ASC']]
    });

    // Agregar conteo de inscriptos
    const clasesConStats = await Promise.all(clases.map(async (clase) => {
      const [pendientes, confirmados] = await Promise.all([
        AteneoInscripcion.count({ where: { clase_id: clase.id, estado: 'pendiente' } }),
        AteneoInscripcion.count({ where: { clase_id: clase.id, estado: 'confirmada' } })
      ]);
      return {
        ...clase.toJSON(),
        inscriptos_pendientes: pendientes,
        inscriptos_confirmados: confirmados,
        inscriptos_total: pendientes + confirmados
      };
    }));

    res.json(clasesConStats);
  } catch (error) {
    console.error('[Ateneo] Error listando clases:', error);
    res.status(500).json({ error: 'Error al obtener clases' });
  }
});

// PUT /api/ateneo/clases/reordenar - Guardar nuevo orden de clases (admin)
router.put('/reordenar', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { ateneo_clases: AteneoClase } = sequelize.models;
    const { orden } = req.body; // [{ id: 1, orden: 0 }, { id: 2, orden: 1 }, ...]
    if (!orden || !Array.isArray(orden)) {
      return res.status(400).json({ error: 'Se requiere un array de orden' });
    }
    await Promise.all(orden.map(item =>
      AteneoClase.update({ orden: item.orden }, { where: { id: item.id } })
    ));
    res.json({ message: 'Orden actualizado' });
  } catch (error) {
    console.error('[Ateneo] Error reordenando clases:', error);
    res.status(500).json({ error: 'Error al reordenar' });
  }
});

// GET /api/ateneo/clases/:id - Detalle de clase (admin)
router.get('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_clases: AteneoClase, users: User, ateneo_inscripciones: AteneoInscripcion, ateneo_alumnos: AteneoAlumno } = sequelize.models;

    const { ateneo_clase_horarios: AteneoClaseHorario } = sequelize.models;

    const clase = await AteneoClase.findByPk(id, {
      include: [
        { model: User, as: 'docente', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'docentes', attributes: ['id', 'name', 'email'], through: { attributes: [] } },
        { model: AteneoClaseHorario, as: 'horarios' },
        {
          model: AteneoInscripcion,
          as: 'inscripciones',
          include: [{
            model: AteneoAlumno,
            as: 'alumno',
            include: [{
              model: User,
              as: 'usuario',
              attributes: ['id', 'name', 'email']
            }]
          }]
        }
      ]
    });

    if (!clase) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    res.json(clase);
  } catch (error) {
    console.error('[Ateneo] Error obteniendo clase:', error);
    res.status(500).json({ error: 'Error al obtener clase' });
  }
});

// POST /api/ateneo/clases - Crear clase (admin)
router.post('/', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { ateneo_clases: AteneoClase, ateneo_clase_docentes: AteneoClaseDocente } = sequelize.models;
    const { ateneo_clase_horarios: AteneoClaseHorario } = sequelize.models;
    const {
      nombre,
      descripcion,
      docente_id,
      docentes_ids,
      cupo,
      horarios,
      ubicacion,
      costo_matricula,
      costo_cuota,
      ciclo,
      fecha_inicio,
      fecha_fin,
      imagen_url,
      imagen_actividad_url,
      imagen_docente_url,
      bio_docente,
      nombre_docente,
      requisitos,
      visible,
      color,
      matricula_bonificada,
      cuota_unica,
      taller_corto
    } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    const transaction = await sequelize.transaction();
    try {
      // Generar slug único
      let slug = generateSlug(nombre);
      const existing = await AteneoClase.findOne({ where: { slug } });
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }

      // Build legacy horario string from horarios array
      const horarioLegacy = Array.isArray(horarios) && horarios.length > 0
        ? horarios.map(h => `${h.dia_semana} ${h.hora_inicio}-${h.hora_fin}`).join(', ')
        : null;

      const clase = await AteneoClase.create({
        nombre,
        slug,
        descripcion,
        docente_id: docente_id || null,
        cupo: cupo || 20,
        horario: horarioLegacy,
        ubicacion,
        costo_matricula: costo_matricula || 0,
        costo_cuota: costo_cuota || 0,
        ciclo: ciclo || new Date().getFullYear().toString(),
        fecha_inicio,
        fecha_fin,
        imagen_url,
        imagen_actividad_url,
        imagen_docente_url,
        bio_docente,
        nombre_docente: nombre_docente || null,
        requisitos,
        visible: visible !== false,
        color: color || null,
        matricula_bonificada: !!matricula_bonificada,
        cuota_unica: !!cuota_unica,
        taller_corto: !!taller_corto
      }, { transaction });

      // Create horarios
      if (Array.isArray(horarios) && horarios.length > 0) {
        const DIAS = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
        await AteneoClaseHorario.bulkCreate(
          horarios.map(h => {
            const row = {
              clase_id: clase.id,
              dia_semana: h.dia_semana,
              hora_inicio: h.hora_inicio,
              hora_fin: h.hora_fin,
              fecha: h.fecha || null
            };
            if (taller_corto && h.fecha && !h.dia_semana) {
              const d = new Date(h.fecha + 'T12:00:00');
              row.dia_semana = DIAS[d.getDay()];
            }
            return row;
          }),
          { transaction }
        );
      }

      // Sync docentes (many-to-many)
      if (Array.isArray(docentes_ids) && docentes_ids.length > 0) {
        await AteneoClaseDocente.bulkCreate(
          docentes_ids.map(did => ({ clase_id: clase.id, docente_id: did })),
          { transaction }
        );
      }

      await transaction.commit();

      const { users: User } = sequelize.models;
      // Reload with horarios and docentes
      const result = await AteneoClase.findByPk(clase.id, {
        include: [
          { model: AteneoClaseHorario, as: 'horarios' },
          { model: User, as: 'docentes', attributes: ['id', 'name', 'email'], through: { attributes: [] } }
        ]
      });
      res.status(201).json(result);
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (error) {
    console.error('[Ateneo] Error creando clase:', error);
    res.status(500).json({ error: 'Error al crear clase' });
  }
});

// PUT /api/ateneo/clases/:id - Actualizar clase (admin)
router.put('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_clases: AteneoClase, ateneo_clase_horarios: AteneoClaseHorario, ateneo_clase_docentes: AteneoClaseDocente, users: User } = sequelize.models;

    const clase = await AteneoClase.findByPk(id);
    if (!clase) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }
    const {
      nombre,
      descripcion,
      docente_id,
      docentes_ids,
      cupo,
      horarios,
      ubicacion,
      costo_matricula,
      costo_cuota,
      estado,
      ciclo,
      fecha_inicio,
      fecha_fin,
      imagen_url,
      imagen_actividad_url,
      imagen_docente_url,
      bio_docente,
      nombre_docente,
      requisitos,
      visible,
      color,
      matricula_bonificada,
      cuota_unica,
      taller_corto
    } = req.body;

    const transaction = await sequelize.transaction();
    try {
      // Si cambia el nombre, actualizar slug
      let slug = clase.slug;
      if (nombre && nombre !== clase.nombre) {
        slug = generateSlug(nombre);
        const existing = await AteneoClase.findOne({ where: { slug, id: { [Op.ne]: id } } });
        if (existing) {
          slug = `${slug}-${Date.now()}`;
        }
      }

      // Build legacy horario string
      const horarioLegacy = Array.isArray(horarios) && horarios.length > 0
        ? horarios.map(h => `${h.dia_semana} ${h.hora_inicio}-${h.hora_fin}`).join(', ')
        : clase.horario;

      await clase.update({
        nombre: nombre || clase.nombre,
        slug,
        descripcion: descripcion !== undefined ? descripcion : clase.descripcion,
        docente_id: docente_id !== undefined ? (docente_id || null) : clase.docente_id,
        cupo: cupo !== undefined ? cupo : clase.cupo,
        horario: horarioLegacy,
        ubicacion: ubicacion !== undefined ? ubicacion : clase.ubicacion,
        costo_matricula: costo_matricula !== undefined ? (costo_matricula === '' ? 0 : costo_matricula) : clase.costo_matricula,
        costo_cuota: costo_cuota !== undefined ? (costo_cuota === '' ? 0 : costo_cuota) : clase.costo_cuota,
        estado: estado || clase.estado,
        ciclo: ciclo || clase.ciclo,
        fecha_inicio: fecha_inicio !== undefined ? fecha_inicio : clase.fecha_inicio,
        fecha_fin: fecha_fin !== undefined ? fecha_fin : clase.fecha_fin,
        imagen_url: imagen_url !== undefined ? imagen_url : clase.imagen_url,
        imagen_actividad_url: imagen_actividad_url !== undefined ? imagen_actividad_url : clase.imagen_actividad_url,
        imagen_docente_url: imagen_docente_url !== undefined ? imagen_docente_url : clase.imagen_docente_url,
        bio_docente: bio_docente !== undefined ? bio_docente : clase.bio_docente,
        nombre_docente: nombre_docente !== undefined ? (nombre_docente || null) : clase.nombre_docente,
        requisitos: requisitos !== undefined ? requisitos : clase.requisitos,
        visible: visible !== undefined ? visible : clase.visible,
        color: color !== undefined ? (color || null) : clase.color,
        matricula_bonificada: matricula_bonificada !== undefined ? !!matricula_bonificada : clase.matricula_bonificada,
        cuota_unica: cuota_unica !== undefined ? !!cuota_unica : clase.cuota_unica,
        taller_corto: taller_corto !== undefined ? !!taller_corto : clase.taller_corto
      }, { transaction });

      // Replace horarios if provided
      const isTallerCorto = taller_corto !== undefined ? !!taller_corto : clase.taller_corto;
      if (Array.isArray(horarios)) {
        await AteneoClaseHorario.destroy({ where: { clase_id: id }, transaction });
        if (horarios.length > 0) {
          const DIAS = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
          await AteneoClaseHorario.bulkCreate(
            horarios.map(h => {
              const row = {
                clase_id: parseInt(id),
                dia_semana: h.dia_semana,
                hora_inicio: h.hora_inicio,
                hora_fin: h.hora_fin,
                fecha: h.fecha || null
              };
              if (isTallerCorto && h.fecha && !h.dia_semana) {
                const d = new Date(h.fecha + 'T12:00:00');
                row.dia_semana = DIAS[d.getDay()];
              }
              return row;
            }),
            { transaction }
          );
        }
      }

      // Sync docentes (many-to-many) if provided
      if (Array.isArray(docentes_ids)) {
        await AteneoClaseDocente.destroy({ where: { clase_id: id }, transaction });
        if (docentes_ids.length > 0) {
          await AteneoClaseDocente.bulkCreate(
            docentes_ids.map(did => ({ clase_id: parseInt(id), docente_id: did })),
            { transaction }
          );
        }
      }

      await transaction.commit();

      // Reload with horarios and docentes
      const result = await AteneoClase.findByPk(id, {
        include: [
          { model: User, as: 'docente', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'docentes', attributes: ['id', 'name', 'email'], through: { attributes: [] } },
          { model: AteneoClaseHorario, as: 'horarios' }
        ]
      });
      res.json(result);
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (error) {
    console.error('[Ateneo] Error actualizando clase:', error);
    res.status(500).json({ error: 'Error al actualizar clase' });
  }
});

// GET /api/ateneo/clases/:id/check-delete - Verificar si se puede eliminar (admin)
router.get('/:id/check-delete', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_clases: AteneoClase, ateneo_inscripciones: AteneoInscripcion } = sequelize.models;

    const clase = await AteneoClase.findByPk(id);
    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });

    const inscripcionesActivas = await AteneoInscripcion.count({
      where: { clase_id: id, estado: { [Op.in]: ['pendiente', 'confirmada'] } }
    });

    res.json({ inscripciones_activas: inscripcionesActivas });
  } catch (error) {
    console.error('[Ateneo] Error verificando clase:', error);
    res.status(500).json({ error: 'Error al verificar' });
  }
});

// DELETE /api/ateneo/clases/:id - Eliminar clase con cascade (admin)
router.delete('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { 
      ateneo_clases: AteneoClase, 
      ateneo_inscripciones: AteneoInscripcion,
      ateneo_pagos: AteneoPago,
      ateneo_clase_horarios: AteneoClaseHorario,
      ateneo_asistencia: AteneoAsistencia
    } = sequelize.models;

    const clase = await AteneoClase.findByPk(id);
    if (!clase) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    // Dar de baja inscripciones activas
    await AteneoInscripcion.update(
      { estado: 'baja', motivo_baja: 'Clase eliminada por administración' },
      { where: { clase_id: id, estado: { [Op.in]: ['pendiente', 'confirmada'] } }, transaction }
    );

    // Cancelar pagos pendientes de esta clase
    await AteneoPago.update(
      { estado: 'cancelado', observaciones: 'Clase eliminada' },
      { where: { clase_id: id, estado: { [Op.in]: ['pendiente', 'vencido'] } }, transaction }
    );

    // Eliminar horarios y asistencia
    await AteneoClaseHorario.destroy({ where: { clase_id: id }, transaction });
    await AteneoAsistencia.destroy({ where: { clase_id: id }, transaction });

    await clase.destroy({ transaction });
    await transaction.commit();

    res.json({ message: 'Clase eliminada correctamente' });
  } catch (error) {
    await transaction.rollback();
    console.error('[Ateneo] Error eliminando clase:', error);
    res.status(500).json({ error: 'Error al eliminar clase' });
  }
});

// GET /api/ateneo/clases/docentes/disponibles - Lista de docentes para asignar
router.get('/docentes/disponibles', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { users: User, roles: Role } = sequelize.models;
    
    const docentes = await User.findAll({
      attributes: ['id', 'name', 'email'],
      include: [{
        model: Role,
        as: 'roles',
        where: { nombre: 'docente_ateneo' },
        attributes: [],
        through: { attributes: [] }
      }],
      order: [['name', 'ASC']]
    });

    res.json(docentes);
  } catch (error) {
    console.error('[Ateneo] Error listando docentes:', error);
    res.status(500).json({ error: 'Error al obtener docentes' });
  }
});

// POST /api/ateneo/clases/upload-image - Upload image for a class
router.post('/upload-image', authenticateToken, requireRole('admin', 'admin_ateneo'), (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      console.error('[Ateneo] Upload error:', err);
      return res.status(400).json({ error: err.message || 'Error al subir imagen' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibio ninguna imagen' });
    }
    const url = `/media/ateneo/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  });
});

export default router;
