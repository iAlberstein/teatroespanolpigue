// Sistema de logging profesional
// En producción, los logs se pueden desactivar

const isDev = import.meta.env.DEV;

const logger = {
  info: (...args) => {
    if (isDev) console.log('[INFO]', ...args);
  },
  
  error: (...args) => {
    console.error('[ERROR]', ...args);
  },
  
  warn: (...args) => {
    if (isDev) console.warn('[WARN]', ...args);
  },
  
  debug: (...args) => {
    if (isDev) console.log('[DEBUG]', ...args);
  },
  
  // Para eventos importantes que queremos ver incluso en producción
  important: (...args) => {
    console.log('[✓]', ...args);
  }
};

export default logger;
