import { fetchSeoulPage } from '../../../src/server/seoul.js';
import { json, errorResponse, ServiceError } from '../../../src/server/http.js';
import { authorizeAdmin } from '../../../src/server/admin.js';

const fields = ['RENT_SE', 'GRFE', 'CTRT_DAY', 'CGG_CD', 'CGG_NM', 'STDG_CD', 'STDG_NM', 'BLDG_USG'];

export async function onRequestPost({ request, env }) {
  try {
    await authorizeAdmin(request, env);
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new ServiceError('INVALID_ADMIN_REQUEST', 400);
    const result = await fetchSeoulPage(env, { year: 2024, district: '11110', size: 1 });
    // No upstream strings, records, request URLs or environment values are returned.
    return json({ status: 'ok', fieldsPresent: Object.fromEntries(fields.map(field => [field, Object.hasOwn(result.rows[0] ?? {}, field)])) });
  } catch (error) { return errorResponse(error); }
}
