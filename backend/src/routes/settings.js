import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { sequelize } from '../lib/sequelize.js';

const router = Router();

// Get all settings (public - needed for frontend to get service fee)
router.get('/', async (req, res) => {
  try {
    const { system_settings: SystemSettings } = sequelize.models;
    const settings = await SystemSettings.findAll();
    
    // Convert to key-value object
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    
    return res.json(settingsObj);
  } catch (error) {
    console.error('[SETTINGS] Error getting settings:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Get single setting by key (public)
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { system_settings: SystemSettings } = sequelize.models;
    
    const setting = await SystemSettings.findOne({ where: { key } });
    
    if (!setting) {
      // Return default values for known keys
      const defaults = {
        'service_fee_percent': '10'
      };
      return res.json({ key, value: defaults[key] || null });
    }
    
    return res.json({ key: setting.key, value: setting.value, description: setting.description });
  } catch (error) {
    console.error('[SETTINGS] Error getting setting:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Update setting (admin only)
router.put('/:key', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;
    
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value_required' });
    }
    
    const { system_settings: SystemSettings } = sequelize.models;
    
    // Validate specific keys
    if (key === 'service_fee_percent') {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        return res.status(400).json({ error: 'invalid_percentage', message: 'El porcentaje debe estar entre 0 y 100' });
      }
    }
    
    // Upsert the setting
    const [setting, created] = await SystemSettings.findOrCreate({
      where: { key },
      defaults: { value: String(value), description }
    });
    
    if (!created) {
      await setting.update({ value: String(value), ...(description && { description }) });
    }
    
    return res.json({ 
      key: setting.key, 
      value: setting.value, 
      description: setting.description,
      updated: !created 
    });
  } catch (error) {
    console.error('[SETTINGS] Error updating setting:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Initialize default settings (admin only)
router.post('/init-defaults', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { system_settings: SystemSettings } = sequelize.models;
    
    const defaults = [
      { key: 'service_fee_percent', value: '10', description: 'Porcentaje de cargo por servicio aplicado a las compras online' }
    ];
    
    const results = [];
    for (const def of defaults) {
      const [setting, created] = await SystemSettings.findOrCreate({
        where: { key: def.key },
        defaults: { value: def.value, description: def.description }
      });
      results.push({ key: def.key, created });
    }
    
    return res.json({ initialized: results });
  } catch (error) {
    console.error('[SETTINGS] Error initializing defaults:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
