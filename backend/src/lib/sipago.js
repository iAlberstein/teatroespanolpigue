// Helper para autenticación y requests a Sipago
import fetch from 'node-fetch';

// Variables leídas dinámicamente para evitar problemas con ES modules hoisting
function getConfig() {
  const isProd = ((process.env.SIPAGO_ENV || '').toLowerCase() === 'production') || (process.env.NODE_ENV === 'production');
  return {
    clientId: process.env.SIPAGO_CLIENT_ID,
    clientSecret: process.env.SIPAGO_CLIENT_SECRET,
    authUrl: process.env.SIPAGO_AUTH_URL || (isProd ? 'https://auth.sipago.coop' : 'https://auth.preprod.geopagos.com'),
    baseUrl: process.env.SIPAGO_BASE_URL || (isProd ? 'https://api.sipago.coop' : 'https://api-cabal.preprod.geopagos.com')
  };
}

let cachedToken = null;
let tokenExpiresAt = 0;

// Invalidar token cacheado (llamar cuando hay 401)
export function invalidateSipagoToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
  console.log('[SIPAGO] Token cache invalidated');
}

export async function getSipagoToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }
  const config = getConfig();
  const authUrl = `${config.authUrl}/oauth/token`;
  const authBody = {
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: '*'
  };
  const res = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authBody)
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown');
    console.error('[SIPAGO_AUTH] Request failed with status:', res.status);
    const err = new Error(`Sipago Auth failed: ${res.status}`);
    err.status = res.status;
    err.responseText = errorText;
    throw err;
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in ? data.expires_in * 1000 : 600000);
  return cachedToken;
}

const MAX_CREATE_RETRIES = 4;
const CREATE_RETRY_INITIAL_MS = 500;
const CREATE_RETRY_MAX_MS = 8000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientCreateError(status, responseText = '') {
  if (status === null || status === undefined) return true; // network / timeout
  if (status >= 500 && status < 600) return true;
  if (status === 401 || status === 429) return true;
  if (status === 400 && /api\\?\/account|401 Unauthorized|status_code[^0-9]*401/i.test(responseText)) return true;
  return false;
}

export async function createSipagoOrder({ total, redirect_urls, items, webhookUrl, currency = '032', expireLimitMinutes }) {
  const config = getConfig();
  const attributes = {
    redirect_urls,
    currency,
    items: Array.isArray(items) && items.length > 0
      ? items
      : [
          {
            id: 'venta',
            name: 'Entradas Teatro',
            unitPrice: { currency, amount: total },
            quantity: 1
          }
        ],
    webhookUrl
  };
  // Si se especifica, Sipago rechaza el pago una vez pasado ese tiempo (en minutos)
  // desde la creación de la orden. Lo usamos para que el checkout de Sipago nunca
  // acepte un pago después de que nuestra reserva interna ya haya expirado.
  if (Number.isFinite(expireLimitMinutes)) attributes.expireLimitMinutes = expireLimitMinutes;
  const body = { data: { attributes } };

  let lastError;
  for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt++) {
    try {
      const token = await getSipagoToken();
      const res = await fetch(`${config.baseUrl}/api/v2/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) return res.json();

      const errorText = await res.text().catch(() => 'unknown');
      console.error(`[SIPAGO_ORDER] Request failed with status: ${res.status} (attempt ${attempt})`);
      const err = new Error(`Sipago order creation failed: ${res.status}`);
      err.status = res.status;
      err.responseText = errorText;

      // Do not retry ordinary validation 4xx (e.g. 400, 403, 404, 422)
      if (!isTransientCreateError(res.status, errorText)) throw err;

      // A direct or provider-wrapped account 401 requires a fresh token.
      if (res.status === 401 || /401 Unauthorized|status_code[^0-9]*401/i.test(errorText)) invalidateSipagoToken();

      if (attempt === MAX_CREATE_RETRIES) throw err;

      const delayMs = Math.min(CREATE_RETRY_INITIAL_MS * (2 ** attempt), CREATE_RETRY_MAX_MS) + Math.floor(Math.random() * 200);
      await sleep(delayMs);
      lastError = err;
    } catch (networkError) {
      // Auth / network failures without a status: only retry if they are transient.
      // 4xx credential errors (e.g. 403) are terminal and should not be retried.
      if (networkError?.status && !isTransientCreateError(networkError.status)) throw networkError;
      console.error(`[SIPAGO_ORDER] Network/auth error on attempt ${attempt}:`, networkError.message);
      if (attempt === MAX_CREATE_RETRIES) throw networkError;
      const delayMs = Math.min(CREATE_RETRY_INITIAL_MS * (2 ** attempt), CREATE_RETRY_MAX_MS) + Math.floor(Math.random() * 200);
      await sleep(delayMs);
      lastError = networkError;
    }
  }
  throw lastError || new Error('Sipago order creation failed');
}

export async function getSipagoOrder(uuid, retry = true) {
  const token = await getSipagoToken();
  const config = getConfig();
  const res = await fetch(`${config.baseUrl}/api/v2/orders/${encodeURIComponent(uuid)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/vnd.api+json'
    }
  });
  if (!res.ok) {
    await res.text().catch(() => '');
    if (res.status === 401 && retry) {
      invalidateSipagoToken();
      await getSipagoToken(true);
      return getSipagoOrder(uuid, false);
    }
    console.error('[SIPAGO_GET_ORDER] Request failed with status:', res.status);
    throw new Error(`Sipago get order failed: ${res.status}`);
  }
  return res.json();
}
