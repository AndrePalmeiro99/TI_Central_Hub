import dotenv from 'dotenv';
dotenv.config();

export const ONETY_BACKEND_URL = (process.env.ONETY_BACKEND_URL || 'https://back.cfonety.com.br').replace(/\/$/, '');
export const ONETY_EMPRESA_ID = process.env.ONETY_EMPRESA_ID || '23';
export const ONETY_AUTH_EMAIL = process.env.ONETY_AUTH_EMAIL || '';
export const ONETY_AUTH_PASSWORD = process.env.ONETY_AUTH_PASSWORD || '';
export const ONETY_API_KEY = process.env.ONETY_API_KEY || process.env.VITE_ONETY_API_KEY || '';

let cachedOnetyJwt = null;
let cachedOnetyJwtExpiresAt = 0;

export async function getOnetyBearerToken() {
  if (!ONETY_AUTH_EMAIL || !ONETY_AUTH_PASSWORD) return null;
  const now = Date.now();
  if (cachedOnetyJwt && cachedOnetyJwtExpiresAt > now + 60000) {
    return cachedOnetyJwt;
  }
  try {
    const res = await fetch(`${ONETY_BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ONETY_AUTH_EMAIL,
        senha: ONETY_AUTH_PASSWORD,
        password: ONETY_AUTH_PASSWORD
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.token) {
      cachedOnetyJwt = data.token;
      cachedOnetyJwtExpiresAt = now + 7 * 60 * 60 * 1000;
      return cachedOnetyJwt;
    }
  } catch (err) {
    console.error('[Onety Auth] Falha ao renovar token JWT de background:', err.message);
  }
  return null;
}
