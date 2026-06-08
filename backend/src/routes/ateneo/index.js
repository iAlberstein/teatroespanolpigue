import { Router } from 'express';
import clasesRouter from './clases.js';
import alumnosRouter from './alumnos.js';
import inscripcionesRouter from './inscripciones.js';
import pagosRouter from './pagos.js';
import becasRouter from './becas.js';
import asistenciaRouter from './asistencia.js';
import docenteRouter from './docente.js';
import reportesRouter from './reportes.js';
import publicRouter from './public.js';

const router = Router();

// Rutas públicas (sin auth)
router.use('/public', publicRouter);

// Rutas autenticadas por módulo
router.use('/clases', clasesRouter);
router.use('/alumnos', alumnosRouter);
router.use('/inscripciones', inscripcionesRouter);
router.use('/pagos', pagosRouter);
router.use('/becas', becasRouter);
router.use('/asistencia', asistenciaRouter);
router.use('/docente', docenteRouter);
router.use('/reportes', reportesRouter);

export default router;
