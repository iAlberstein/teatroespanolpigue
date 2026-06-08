import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Ensure sponsors directory exists
const sponsorsDir = path.join(__dirname, '../../media/sponsors');
if (!fs.existsSync(sponsorsDir)) {
  fs.mkdirSync(sponsorsDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, sponsorsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(ext, '');
    cb(null, `${Date.now()}_${name}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(png|jpg|jpeg|svg|webp|gif)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (png, jpg, jpeg, svg, webp, gif)'));
    }
  }
});

// GET /api/sponsors - List all sponsor logos (public)
router.get('/', async (req, res) => {
  try {
    const files = fs.readdirSync(sponsorsDir)
      .filter(f => /\.(png|jpg|jpeg|svg|webp|gif)$/i.test(f))
      .sort();
    const sponsors = files.map(f => ({
      filename: f,
      url: `/media/sponsors/${f}`
    }));
    res.json(sponsors);
  } catch (error) {
    console.error('[SPONSORS] Error listing:', error);
    res.status(500).json({ error: 'Error al listar patrocinadores' });
  }
});

// POST /api/sponsors - Upload sponsor logo (admin only)
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('[SPONSORS] Upload error:', err);
      return res.status(400).json({ error: err.message || 'Error al subir imagen' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }
    res.json({
      filename: req.file.filename,
      url: `/media/sponsors/${req.file.filename}`
    });
  });
});

// DELETE /api/sponsors/:filename - Delete sponsor logo (admin only)
router.delete('/:filename', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(sponsorsDir, filename);
    // Prevent path traversal
    if (!filePath.startsWith(sponsorsDir)) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    fs.unlinkSync(filePath);
    res.json({ message: 'Patrocinador eliminado' });
  } catch (error) {
    console.error('[SPONSORS] Error deleting:', error);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
