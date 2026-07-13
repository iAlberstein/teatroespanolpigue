/**
 * Helpers de formateo de fechas/horas para el frontend.
 * Todos los formatos usan zona horaria America/Argentina/Buenos_Aires,
 * locale es-AR y formato 24hs para garantizar consistencia en toda la app.
 */

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';
const DEFAULT_LOCALE = 'es-AR';

/**
 * Convierte un string/fecha a un objeto Date en la zona horaria argentina.
 * Acepta strings ISO, strings con espacio (YYYY-MM-DD HH:MM:SS) y timestamps.
 */
export function toLocalDate(dateStr) {
  if (!dateStr) return null;
  let normalized = dateStr;
  if (typeof dateStr === 'string') {
    if (dateStr.includes(' ') && !dateStr.includes('T')) {
      // YYYY-MM-DD HH:MM:SS -> interpretar como local
      normalized = dateStr.replace(' ', 'T');
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Fecha ISO corta sin zona: agregar mediodía local para evitar desface de día
      normalized = `${dateStr}T12:00:00`;
    }
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formatea una fecha a "mes largo de AAAA" (ej: "junio de 2026").
 */
export function formatMonthYear(dateStr) {
  const date = toLocalDate(dateStr);
  if (!date) return '';
  return date.toLocaleDateString(DEFAULT_LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: DEFAULT_TIMEZONE
  });
}

/**
 * Formatea una fecha a DD/MM/AAAA.
 */
export function formatDate(dateStr) {
  const date = toLocalDate(dateStr);
  if (!date) return '';
  return date.toLocaleDateString(DEFAULT_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: DEFAULT_TIMEZONE
  });
}

/**
 * Formatea una hora a HH:MM (24hs).
 */
export function formatTime(dateStr) {
  const date = toLocalDate(dateStr);
  if (!date) return '';
  return date.toLocaleTimeString(DEFAULT_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DEFAULT_TIMEZONE
  });
}

/**
 * Devuelve un objeto con { date, time } formateados.
 */
export function formatDateTime(dateStr) {
  return {
    date: formatDate(dateStr),
    time: formatTime(dateStr)
  };
}

/**
 * Formatea una fecha a formato largo para emails y tickets.
 * Ejemplo: "lunes, 22 de junio de 2026".
 */
export function formatDateLong(dateStr) {
  const date = toLocalDate(dateStr);
  if (!date) return '';
  return date.toLocaleDateString(DEFAULT_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: DEFAULT_TIMEZONE
  });
}

/**
 * Formatea una fecha a formato corto para botones de selección.
 * Ejemplo: "lun, 22 jun".
 */
export function formatDateShort(dateStr) {
  const date = toLocalDate(dateStr);
  if (!date) return '';
  return date.toLocaleDateString(DEFAULT_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: DEFAULT_TIMEZONE
  });
}

/**
 * Formatea fecha y hora juntas para tablas y reportes.
 * Ejemplo: "22/06/2026 21:30".
 */
export function formatDateTimeCompact(dateStr) {
  const date = toLocalDate(dateStr);
  if (!date) return '';
  return date.toLocaleString(DEFAULT_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DEFAULT_TIMEZONE
  });
}

/**
 * Convierte un Date a string ISO YYYY-MM-DD (útil para inputs type="date").
 */
export function formatDateISO(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convierte DD/MM/AAAA a YYYY-MM-DD.
 */
export function parseDisplayDate(displayDate) {
  if (!displayDate) return '';
  const cleaned = displayDate.replace(/[^0-9/]/g, '');
  const parts = cleaned.split('/');
  if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return '';
}
