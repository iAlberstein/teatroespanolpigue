// API configuration
// Detectar si estamos en móvil, ngrok o localhost - DINÁMICAMENTE
const getAPIUrl = () => {
  // Si hay variable de entorno, usarla
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Detección dinámica basada en el hostname actual
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    
    // Producción: detectar dominio del teatro
    if (currentHost.includes('teatropigue.com.ar')) {
      return 'https://www.teatropigue.com.ar';
    }
    
    // Si estamos en ngrok, usar URL relativa (proxy de Vite)
    if (currentHost.includes('ngrok')) {
      return ''; // URL relativa, Vite proxy manejará /api
    }
  }
  
  // Por defecto, localhost
  return 'http://localhost:4000';
};

// Función especial para Socket.IO (necesita URL completa)
const getSocketURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    const currentOrigin = window.location.origin;
    
    // Producción: detectar dominio del teatro
    if (currentHost.includes('teatropigue.com.ar')) {
      return 'https://www.teatropigue.com.ar';
    }
    
    // Si estamos en ngrok, socket debe usar el mismo origin (Vite proxy redirige)
    if (currentHost.includes('ngrok')) {
      return currentOrigin; // Socket.IO se conectará a ngrok, Vite proxy redirige a :4000
    }
  }
  
  return 'http://localhost:4000';
};

// Exportar constantes y funciones
export const API_URL = getSocketURL(); // Para socket.io (evaluado al inicio)
export { getAPIUrl, getSocketURL }; // Para evaluación dinámica

/**
 * Make a fetch request with proper CORS configuration
 * @param {string} endpoint - API endpoint (e.g., '/api/auth/login')
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
  // Evaluar URL dinámicamente en cada request
  const apiUrl = getAPIUrl();
  const url = `${apiUrl}${endpoint}`;
  
  // No agregar Content-Type si el body es FormData (el navegador lo hace automáticamente)
  const isFormData = options.body instanceof FormData;
  
  const defaultOptions = {
    mode: 'cors', // Explícito para Safari
    credentials: 'omit', // No enviamos cookies, usamos JWT en headers
    headers: isFormData ? {} : {
      'Content-Type': 'application/json',
    },
  };
  
  const finalOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };
  
  return fetch(url, finalOptions);
}

/**
 * Make a fetch request with authentication token
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @param {string} token - JWT token
 * @returns {Promise<Response>}
 */
export async function apiAuthFetch(endpoint, options = {}, token) {
  const response = await apiFetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: token ? `Bearer ${token}` : undefined,
    },
  });

  // Si el token venció o es inválido, avisamos a la app para que cierre la
  // sesión y redirija a /login en vez de dejar pantallas (ej: Validador) con
  // un error crudo de "Token has expired" sin salida.
  if (token && response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  return response;
}
