import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * Get activity logs with filters and pagination
 * Query params:
 *  - page: number (default 1)
 *  - limit: number (default 50, max 200)
 *  - user_id: filter by user
 *  - action_type: filter by action type
 *  - entity_type: filter by entity type
 *  - from_date: filter from this date (ISO format)
 *  - to_date: filter to this date (ISO format)
 *  - search: text search in details
 */
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      user_id,
      action_type,
      entity_type,
      from_date,
      to_date,
      search
    } = req.query;

    const { activity_logs: ActivityLog, users: User } = sequelize.models;

    // Build where clause
    const where = {};

    if (user_id) {
      where.user_id = user_id;
    }

    if (action_type) {
      where.action_type = action_type;
    }

    if (entity_type) {
      where.entity_type = entity_type;
    }

    if (from_date || to_date) {
      where.created_at = {};
      if (from_date) {
        where.created_at[Op.gte] = new Date(from_date);
      }
      if (to_date) {
        where.created_at[Op.lte] = new Date(to_date);
      }
    }

    if (search) {
      where.details = {
        [Op.like]: `%${search}%`
      };
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const offset = (pageNum - 1) * limitNum;

    // Get logs with user info
    const { count, rows } = await ActivityLog.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'role']
      }],
      order: [['created_at', 'DESC']],
      limit: limitNum,
      offset
    });

    // Format logs
    const logs = rows.map(log => {
      const logData = log.get({ plain: true });
      
      // Parse details if it's a JSON string
      if (logData.details) {
        try {
          logData.details = JSON.parse(logData.details);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }

      return logData;
    });

    return res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum)
      }
    });
  } catch (error) {
    console.error('[ACTIVITY_LOGS] Error fetching logs:', error);
    return res.status(500).json({ error: 'server_error', message: 'Error fetching activity logs' });
  }
});

/**
 * Get unique action types (for filter dropdown)
 */
router.get('/action-types', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { activity_logs: ActivityLog } = sequelize.models;

    const actionTypes = await ActivityLog.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('action_type')), 'action_type']],
      raw: true
    });

    return res.json({
      action_types: actionTypes.map(t => t.action_type).filter(Boolean)
    });
  } catch (error) {
    console.error('[ACTIVITY_LOGS] Error fetching action types:', error);
    return res.status(500).json({ error: 'server_error' });
  }
});

/**
 * Get unique entity types (for filter dropdown)
 */
router.get('/entity-types', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { activity_logs: ActivityLog } = sequelize.models;

    const entityTypes = await ActivityLog.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('entity_type')), 'entity_type']],
      raw: true
    });

    return res.json({
      entity_types: entityTypes.map(t => t.entity_type).filter(Boolean)
    });
  } catch (error) {
    console.error('[ACTIVITY_LOGS] Error fetching entity types:', error);
    return res.status(500).json({ error: 'server_error' });
  }
});

/**
 * Get activity summary stats
 */
router.get('/stats', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { activity_logs: ActivityLog } = sequelize.models;
    const { from_date, to_date } = req.query;

    const where = {};
    if (from_date || to_date) {
      where.created_at = {};
      if (from_date) where.created_at[Op.gte] = new Date(from_date);
      if (to_date) where.created_at[Op.lte] = new Date(to_date);
    }

    // Total logs
    const totalLogs = await ActivityLog.count({ where });

    // Logs by action type
    const byActionType = await ActivityLog.findAll({
      where,
      attributes: [
        'action_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['action_type'],
      raw: true
    });

    // Logs by user (top 10)
    const byUser = await ActivityLog.findAll({
      where,
      attributes: [
        'user_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      include: [{
        model: sequelize.models.users,
        as: 'user',
        attributes: ['name', 'email', 'role']
      }],
      group: ['user_id'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      limit: 10,
      subQuery: false
    });

    return res.json({
      total_logs: totalLogs,
      by_action_type: byActionType,
      by_user: byUser.map(log => ({
        user_id: log.user_id,
        user: log.user,
        count: parseInt(log.get('count'))
      }))
    });
  } catch (error) {
    console.error('[ACTIVITY_LOGS] Error fetching stats:', error);
    return res.status(500).json({ error: 'server_error' });
  }
});

/**
 * Export logs to CSV
 */
router.get('/export/csv', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      user_id,
      action_type,
      entity_type,
      from_date,
      to_date
    } = req.query;

    const { activity_logs: ActivityLog, users: User } = sequelize.models;

    // Build where clause (same as GET /)
    const where = {};
    if (user_id) where.user_id = user_id;
    if (action_type) where.action_type = action_type;
    if (entity_type) where.entity_type = entity_type;
    if (from_date || to_date) {
      where.created_at = {};
      if (from_date) where.created_at[Op.gte] = new Date(from_date);
      if (to_date) where.created_at[Op.lte] = new Date(to_date);
    }

    // Get all logs (no pagination for export)
    const logs = await ActivityLog.findAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['name', 'email', 'role']
      }],
      order: [['created_at', 'DESC']],
      limit: 10000 // Safety limit
    });

    // Build CSV
    const headers = [
      'Fecha',
      'Hora',
      'Usuario',
      'Email',
      'Rol',
      'Acción',
      'Tipo Entidad',
      'ID Entidad',
      'Detalles',
      'IP'
    ];

    const rows = logs.map(log => {
      const date = new Date(log.created_at);
      const dateStr = date.toLocaleDateString('es-AR');
      const timeStr = date.toLocaleTimeString('es-AR', { hour12: false });
      
      let details = log.details || '';
      if (details) {
        try {
          const parsed = JSON.parse(details);
          details = JSON.stringify(parsed);
        } catch (e) {
          // Keep as is
        }
      }

      return [
        dateStr,
        timeStr,
        log.user?.name || '',
        log.user?.email || '',
        log.user?.role || '',
        log.action_type,
        log.entity_type,
        log.entity_id || '',
        details.replace(/"/g, '""'), // Escape quotes
        log.ip_address || ''
      ];
    });

    // Combine headers and rows
    const csvRows = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ];

    const filename = `logs_actividad_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // UTF-8 BOM for Excel compatibility
    res.write('\uFEFF');
    res.write(csvRows.join('\n'));
    res.end();
  } catch (error) {
    console.error('[ACTIVITY_LOGS] Error exporting CSV:', error);
    return res.status(500).json({ error: 'server_error' });
  }
});

export default router;
