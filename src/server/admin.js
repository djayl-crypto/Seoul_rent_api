import { ServiceError } from './http.js';

export async function authorizeAdmin(request, env) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  const local = env.LOCAL_ADMIN === '1' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (local) {
    if ((origin && origin !== url.origin) || ['cross-site', 'same-site'].includes(request.headers.get('Sec-Fetch-Site'))) throw new ServiceError('UNAUTHORIZED', 401);
    return;
  }
  if (typeof env.ADMIN_TOKEN !== 'string' || !env.ADMIN_TOKEN) throw new ServiceError('ADMIN_DISABLED', 503);
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(request.headers.get('Authorization') ?? ''), digest(`Bearer ${env.ADMIN_TOKEN}`)]);
  let different = 0;
  const left = new Uint8Array(a), right = new Uint8Array(b);
  for (let i = 0; i < left.length; i++) different |= left[i] ^ right[i];
  if (different || (origin && origin !== url.origin)) throw new ServiceError('UNAUTHORIZED', 401);
}

export async function readAdminJson(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new ServiceError('INVALID_ADMIN_REQUEST', 400);
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError('INVALID_ADMIN_REQUEST', 400);
  const decoder = new TextDecoder(); let text = '', length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8 * 1024 * 1024) { await reader.cancel(); throw new ServiceError('INVALID_ADMIN_REQUEST', 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw new ServiceError('INVALID_ADMIN_REQUEST', 400); }
  } finally { reader.releaseLock(); }
}
