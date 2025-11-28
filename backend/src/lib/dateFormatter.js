/**
 * Format date to DD/MM/YYYY
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Format time to HH:MM (24hs)
 */
export function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Format datetime to object with date and time
 */
export function formatDateTime(dateStr) {
  return {
    date: formatDate(dateStr),
    time: formatTime(dateStr)
  };
}

/**
 * Format date to long format (for emails)
 */
export function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
