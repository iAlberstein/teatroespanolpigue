import { Router } from 'express';
import { sequelize } from '../../lib/sequelize.js';
import { Op } from 'sequelize';

const router = Router();

// GET /api/ateneo/public/clases - Listado público de clases activas
router.get('/clases', async (req, res) => {
  try {
    const { ateneo_clases: AteneoClase, ateneo_clase_horarios: AteneoClaseHorario, users: User } = sequelize.models;
    
    const clases = await AteneoClase.findAll({
      where: {
        estado: 'activa',
        visible: true
      },
      include: [
        { model: User, as: 'docente', attributes: ['id', 'name'] },
        { model: User, as: 'docentes', attributes: ['id', 'name'], through: { attributes: [] } },
        { model: AteneoClaseHorario, as: 'horarios' }
      ],
      order: [['orden', 'ASC'], ['nombre', 'ASC']]
    });

    // Contar inscripciones confirmadas para cada clase
    const { ateneo_inscripciones: AteneoInscripcion } = sequelize.models;
    const clasesConCupo = await Promise.all(clases.map(async (clase) => {
      const inscriptos = await AteneoInscripcion.count({
        where: {
          clase_id: clase.id,
          estado: { [Op.in]: ['pendiente', 'confirmada'] }
        }
      });
      return {
        ...clase.toJSON(),
        inscriptos,
        cupo_disponible: Math.max(0, clase.cupo - inscriptos)
      };
    }));

    res.json(clasesConCupo);
  } catch (error) {
    console.error('[Ateneo] Error listando clases públicas:', error);
    res.status(500).json({ error: 'Error al obtener clases' });
  }
});

// GET /api/ateneo/public/clases/:slug - Detalle público de una clase
router.get('/clases/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { ateneo_clases: AteneoClase, ateneo_clase_horarios: AteneoClaseHorario, users: User, ateneo_inscripciones: AteneoInscripcion } = sequelize.models;
    
    const clase = await AteneoClase.findOne({
      where: {
        slug,
        estado: 'activa',
        visible: true
      },
      include: [
        { model: User, as: 'docente', attributes: ['id', 'name'] },
        { model: User, as: 'docentes', attributes: ['id', 'name'], through: { attributes: [] } },
        { model: AteneoClaseHorario, as: 'horarios' }
      ]
    });

    if (!clase) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    const inscriptos = await AteneoInscripcion.count({
      where: {
        clase_id: clase.id,
        estado: { [Op.in]: ['pendiente', 'confirmada'] }
      }
    });

    res.json({
      ...clase.toJSON(),
      inscriptos,
      cupo_disponible: Math.max(0, clase.cupo - inscriptos)
    });
  } catch (error) {
    console.error('[Ateneo] Error obteniendo detalle clase:', error);
    res.status(500).json({ error: 'Error al obtener clase' });
  }
});

// GET /api/ateneo/public/config/:clave - Obtener configuración pública
router.get('/config/:clave', async (req, res) => {
  try {
    const { clave } = req.params;
    const { ateneo_config: AteneoConfig } = sequelize.models;
    
    // Solo permitir claves públicas
    const clavesPublicas = ['ciclo_activo'];
    if (!clavesPublicas.includes(clave)) {
      return res.status(403).json({ error: 'Configuración no disponible' });
    }

    const config = await AteneoConfig.findOne({ where: { clave } });
    if (!config) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    res.json({ clave: config.clave, valor: config.valor });
  } catch (error) {
    console.error('[Ateneo] Error obteniendo config:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

export default router;
