import { sequelize } from '../lib/sequelize.js';

/**
 * Middleware para registrar actividades de usuarios
 * Se puede usar manualmente en rutas específicas
 */
export function logActivity(actionType, entityType, entityId = null, details = null) {
  return async (req, res, next) => {
    try {
      const { activity_logs: ActivityLog } = sequelize.models;
      const userId = req.user?.userId;
      
      if (!userId) {
        // Si no hay usuario autenticado, continuar sin registrar
        return next();
      }

      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];

      await ActivityLog.create({
        user_id: userId,
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId || req.params.id || null,
        details: details ? JSON.stringify(details) : null,
        ip_address: ipAddress,
        user_agent: userAgent
      });

      next();
    } catch (error) {
      console.error('[ACTIVITY_LOG] Error logging activity:', error);
      // No fallar la request por error de logging
      next();
    }
  };
}

/**
 * Función helper para registrar actividades manualmente
 * desde cualquier lugar del código
 */
export async function createActivityLog({
  userId,
  actionType,
  entityType,
  entityId = null,
  details = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    const { activity_logs: ActivityLog } = sequelize.models;

    await ActivityLog.create({
      user_id: userId,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      details: details ? JSON.stringify(details) : null,
      ip_address: ipAddress,
      user_agent: userAgent
    });
  } catch (error) {
    console.error('[ACTIVITY_LOG] Error creating log:', error);
  }
}

/**
 * Tipos de acciones comunes (para referencia)
 */
export const ActionTypes = {
  // Auth
  LOGIN: 'login',
  LOGOUT: 'logout',
  REGISTER: 'register',
  
  // Sales
  SALE_CREATE: 'sale_create',
  SALE_ONLINE: 'sale_online',
  SALE_BOXOFFICE: 'sale_boxoffice',
  
  // Tickets
  TICKET_VALIDATE: 'ticket_validate',
  TICKET_REFUND: 'ticket_refund',
  RESEND_TICKETS: 'resend_tickets',
  
  // Shows
  SHOW_CREATE: 'show_create',
  SHOW_UPDATE: 'show_update',
  SHOW_DELETE: 'show_delete',
  
  // Sessions
  SESSION_CREATE: 'session_create',
  SESSION_UPDATE: 'session_update',
  SESSION_DELETE: 'session_delete',
  
  // Discounts
  DISCOUNT_CREATE: 'discount_create',
  DISCOUNT_UPDATE: 'discount_update',
  DISCOUNT_DELETE: 'discount_delete',
  DISCOUNT_TOGGLE: 'discount_toggle',
  
  // Users
  USER_UPDATE: 'user_update',
  USER_ROLE_CHANGE: 'user_role_change',
  USER_STATUS_CHANGE: 'user_status_change',
  
  // Bordereaux
  BORDEREAUX_OPEN: 'bordereaux_open',
  BORDEREAUX_CLOSE: 'bordereaux_close',
  BORDEREAUX_VIEW: 'bordereaux_view',
  
  // Reports
  REPORT_VIEW: 'report_view',
  REPORT_EXPORT: 'report_export'
};

/**
 * Tipos de entidades (para referencia)
 */
export const EntityTypes = {
  USER: 'user',
  SHOW: 'show',
  SESSION: 'session',
  SALE: 'sale',
  TICKET: 'ticket',
  DISCOUNT: 'discount',
  BORDEREAUX: 'bordereaux',
  REPORT: 'report'
};
