import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache para los datos de ubicaciones
let locationsCache = null;

// Cargar datos de ubicaciones
async function loadLocations() {
  if (locationsCache) {
    return locationsCache;
  }
  
  try {
    const dataPath = path.join(__dirname, '../data/argentina-locations.json');
    const data = await fs.readFile(dataPath, 'utf-8');
    locationsCache = JSON.parse(data);
    return locationsCache;
  } catch (error) {
    console.error('Error loading locations data:', error);
    throw new Error('No se pudieron cargar los datos de ubicaciones');
  }
}

// GET /api/locations/provinces - Obtener todas las provincias
router.get('/provinces', async (req, res) => {
  try {
    const locations = await loadLocations();
    const provinces = locations.map(item => item.provincia);
    res.json({ provinces });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/locations/localities/:provincia - Obtener localidades de una provincia
router.get('/localities/:provincia', async (req, res) => {
  try {
    const provincia = req.params.provincia;
  
  if (!provincia) {
    return res.status(400).json({ error: 'Provincia parameter is required' });
  }

  const locations = await loadLocations();
  const provinciaData = locations.find(
    item => item.provincia.toLowerCase() === provincia.toLowerCase()
  );
    
  if (!provinciaData) {
    return res.status(404).json({ message: 'Provincia no encontrada' });
  }

  // Sort localities alphabetically
  const sortedLocalidades = [...provinciaData.localidades].sort((a, b) => 
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );

  res.json({
    provincia: provinciaData.provincia,
    localidades: sortedLocalidades
  });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/locations/all - Obtener todas las provincias con sus localidades
router.get('/all', async (req, res) => {
  try {
    const locations = await loadLocations();
    res.json({ locations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
