// API configuration
// Detectar si estamos en móvil y usar la IP de la red local
const getAPIUrl = () => {
  // Si hay variable de entorno, usarla
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Si no, usar localhost (funcionará en desktop)
  return 'http://localhost:4000';
};

export const API_URL = getAPIUrl();

/**
 * Make a fetch request with proper CORS configuration
 * @param {string} endpoint - API endpoint (e.g., '/api/auth/login')
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
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
  return apiFetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: token ? `Bearer ${token}` : undefined,
    },
  });
}
