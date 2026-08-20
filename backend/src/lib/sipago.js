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
    console.error('[SIPAGO_AUTH] Failed:', res.status, errorText);
    throw new Error(`Sipago Auth failed: ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in ? data.expires_in * 1000 : 600000);
  return cachedToken;
}

export async function createSipagoOrder({ total, redirect_urls, items, webhookUrl, currency = '032', expireLimitMinutes }) {
  const token = await getSipagoToken();
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
  const res = await fetch(`${config.baseUrl}/api/v2/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown');
    console.error('[SIPAGO_ORDER] Failed:', res.status, errorText);
    // Si es 401, invalidar token y reintentar una vez
    if (res.status === 401 || errorText.includes('401')) {
      console.log('[SIPAGO] Got 401, invalidating token and retrying...');
      invalidateSipagoToken();
      const newToken = await getSipagoToken(true);
      const retryRes = await fetch(`${config.baseUrl}/api/v2/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          'Authorization': `Bearer ${newToken}`
        },
        body: JSON.stringify(body)
      });
      if (!retryRes.ok) {
        const retryError = await retryRes.text().catch(() => 'unknown');
        console.error('[SIPAGO_ORDER] Retry failed:', retryRes.status, retryError);
        throw new Error(`Sipago order creation failed after retry: ${retryRes.status} - ${retryError}`);
      }
      return retryRes.json();
    }
    throw new Error(`Sipago order creation failed: ${res.status} - ${errorText}`);
  }
  return res.json();
}

export async function getSipagoOrder(uuid) {
  const token = await getSipagoToken();
  const config = getConfig();
  const res = await fetch(`${config.baseUrl}/api/v2/orders/${uuid}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/vnd.api+json'
    }
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown');
    console.error('[SIPAGO_GET_ORDER] Failed:', res.status, errorText);
    throw new Error(`Sipago get order failed: ${res.status} - ${errorText}`);
  }
  return res.json();
}
