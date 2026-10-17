import { errorResponse, ServiceError } from '../src/server/http.js';

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export async function onRequest(context) {
  try {
    const path = decodeURIComponent(new URL(context.request.url).pathname);
    if (/(?:^|\/)\./.test(path) || /^\/(?:data|src|functions|scripts|tests|docs|node_modules|wrangler(?:\.|\/)|package(?:-lock)?\.json)/i.test(path)) {
      return errorResponse(new ServiceError('NOT_FOUND', 404));
    }
    const response = await context.next();
    // Last boundary: fail closed if a future handler accidentally includes a runtime secret.
    if (path.startsWith('/api/')) {
      const body = await response.clone().text();
      const headers = [...response.headers].flat().join('\n');
      for (const secret of [context.env.SEOUL_API_KEY, context.env.ADMIN_TOKEN]) {
        if (typeof secret === 'string' && secret.length && [secret, encodeURIComponent(secret)].some(value => body.includes(value) || headers.includes(value))) {
          return errorResponse(new ServiceError('INTERNAL_ERROR', 500));
        }
      }
    }
    const secured = new Response(response.body, response);
    for (const [name, value] of Object.entries(securityHeaders)) secured.headers.set(name, value);
    return secured;
  } catch {
    return errorResponse(new ServiceError('INTERNAL_ERROR', 500));
  }
}
