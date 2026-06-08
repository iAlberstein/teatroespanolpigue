import { Router } from 'express';
import { sequelize } from '../../lib/sequelize.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { Op } from 'sequelize';
import { recalcularPagosPendientes } from '../../lib/ateneoPaymentCalc.js';

const router = Router();

// GET /api/ateneo/becas - Listado de becas (admin)
router.get('/', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { 
      ateneo_becas: AteneoBeca, 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      users: User 
    } = sequelize.models;
    
    const { alumno_id, clase_id, activa, tipo } = req.query;
    const where = {};
    
    if (alumno_id) where.alumno_id = alumno_id;
    if (clase_id) where.clase_id = clase_id;
    if (activa !== undefined) where.activa = activa === 'true';
    if (tipo) where.tipo = tipo;

    const becas = await AteneoBeca.findAll({
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
          as: 'otorgante',
          attributes: ['id', 'name']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json(becas);
  } catch (error) {
    console.error('[Ateneo] Error listando becas:', error);
    res.status(500).json({ error: 'Error al obtener becas' });
  }
});

// GET /api/ateneo/becas/:id - Detalle de beca (admin)
router.get('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      ateneo_becas: AteneoBeca, 
      ateneo_alumnos: AteneoAlumno,
      ateneo_clases: AteneoClase,
      users: User 
    } = sequelize.models;

    const beca = await AteneoBeca.findByPk(id, {
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
          as: 'clase'
        },
        {
          model: User,
          as: 'otorgante',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!beca) {
      return res.status(404).json({ error: 'Beca no encontrada' });
    }

    res.json(beca);
  } catch (error) {
    console.error('[Ateneo] Error obteniendo beca:', error);
    res.status(500).json({ error: 'Error al obtener beca' });
  }
});

// POST /api/ateneo/becas - Crear beca (admin)
router.post('/', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { ateneo_becas: AteneoBeca, ateneo_alumnos: AteneoAlumno } = sequelize.models;
    const {
      alumno_id,
      clase_id,
      tipo,
      valor,
      motivo,
      fecha_inicio,
      fecha_fin
    } = req.body;

    if (!alumno_id || !tipo || !fecha_inicio) {
      return res.status(400).json({ error: 'alumno_id, tipo y fecha_inicio son requeridos' });
    }

    // Validar tipo
    const tiposValidos = ['porcentaje', 'monto_fijo', 'exencion_matricula'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de beca inválido' });
    }

    // Validar alumno existe
    const alumno = await AteneoAlumno.findByPk(alumno_id);
    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    // Validar valor según tipo
    if (tipo === 'porcentaje' && (valor < 0 || valor > 100)) {
      return res.status(400).json({ error: 'El porcentaje debe estar entre 0 y 100' });
    }

    const beca = await AteneoBeca.create({
      alumno_id,
      clase_id: clase_id || null, // null = aplica a todas las clases
      tipo,
      valor: tipo === 'exencion_matricula' ? 100 : valor,
      motivo,
      fecha_inicio,
      fecha_fin: fecha_fin || null,
      activa: true,
      otorgada_por: req.user.userId
    });

    // Recalcular pagos pendientes del alumno con la nueva beca
    try {
      await recalcularPagosPendientes(alumno_id);
    } catch (err) {
      console.error('[Ateneo] Error recalculando pagos tras crear beca:', err.message);
    }

    res.status(201).json(beca);
  } catch (error) {
    console.error('[Ateneo] Error creando beca:', error);
    res.status(500).json({ error: 'Error al crear beca' });
  }
});

// PUT /api/ateneo/becas/:id - Actualizar beca (admin)
router.put('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_becas: AteneoBeca } = sequelize.models;

    const beca = await AteneoBeca.findByPk(id);
    if (!beca) {
      return res.status(404).json({ error: 'Beca no encontrada' });
    }

    const {
      clase_id,
      tipo,
      valor,
      motivo,
      fecha_inicio,
      fecha_fin,
      activa
    } = req.body;

    await beca.update({
      clase_id: clase_id !== undefined ? clase_id : beca.clase_id,
      tipo: tipo || beca.tipo,
      valor: valor !== undefined ? valor : beca.valor,
      motivo: motivo !== undefined ? motivo : beca.motivo,
      fecha_inicio: fecha_inicio || beca.fecha_inicio,
      fecha_fin: fecha_fin !== undefined ? fecha_fin : beca.fecha_fin,
      activa: activa !== undefined ? activa : beca.activa
    });

    // Recalcular pagos pendientes del alumno
    try {
      await recalcularPagosPendientes(beca.alumno_id);
    } catch (err) {
      console.error('[Ateneo] Error recalculando pagos tras actualizar beca:', err.message);
    }

    res.json(beca);
  } catch (error) {
    console.error('[Ateneo] Error actualizando beca:', error);
    res.status(500).json({ error: 'Error al actualizar beca' });
  }
});

// DELETE /api/ateneo/becas/:id - Desactivar beca (admin)
router.delete('/:id', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ateneo_becas: AteneoBeca } = sequelize.models;

    const beca = await AteneoBeca.findByPk(id);
    if (!beca) {
      return res.status(404).json({ error: 'Beca no encontrada' });
    }

    // Solo desactivar, no eliminar (para auditoría)
    await beca.update({ activa: false, fecha_fin: new Date() });

    // Recalcular pagos pendientes (quitar descuento de beca desactivada)
    try {
      await recalcularPagosPendientes(beca.alumno_id);
    } catch (err) {
      console.error('[Ateneo] Error recalculando pagos tras desactivar beca:', err.message);
    }

    res.json({ message: 'Beca desactivada', beca });
  } catch (error) {
    console.error('[Ateneo] Error desactivando beca:', error);
    res.status(500).json({ error: 'Error al desactivar beca' });
  }
});

// GET /api/ateneo/becas/alumno/:alumno_id/activas - Becas activas de un alumno
router.get('/alumno/:alumno_id/activas', authenticateToken, requireRole('admin', 'admin_ateneo'), async (req, res) => {
  try {
    const { alumno_id } = req.params;
    const { ateneo_becas: AteneoBeca, ateneo_clases: AteneoClase } = sequelize.models;
    const hoy = new Date();

    const becas = await AteneoBeca.findAll({
      where: {
        alumno_id,
        activa: true,
        fecha_inicio: { [Op.lte]: hoy },
        [Op.or]: [
          { fecha_fin: null },
          { fecha_fin: { [Op.gte]: hoy } }
        ]
      },
      include: [{
        model: AteneoClase,
        as: 'clase',
        attributes: ['id', 'nombre']
      }]
    });

    res.json(becas);
  } catch (error) {
    console.error('[Ateneo] Error obteniendo becas activas:', error);
    res.status(500).json({ error: 'Error al obtener becas' });
  }
});

export default router;
