import { authorizeAdmin, readAdminJson } from '../../../src/server/admin.js';
import { syncAction } from '../../../src/server/sync.js';
import { json, errorResponse } from '../../../src/server/http.js';

export async function onRequestPost({ request, env }) {
  try {
    await authorizeAdmin(request, env);
    return json(await syncAction(env, await readAdminJson(request)));
  } catch (error) {
    const response = errorResponse(error);
    const diagnostics = ['RESPONSE_SHAPE', 'JSON_FORMAT', 'HTTP_STATUS', 'API_RESULT', 'COUNT_TYPE', 'COUNT_RANGE', 'PARTITION', ...['RCPT_YR', 'CGG_CD', 'CGG_NM', 'STDG_CD', 'STDG_NM', 'CTRT_DAY', 'RENT_SE', 'GRFE', 'RENT_AREA', 'BLDG_USG'].map(field => `FIELD_SHAPE_${field}`)];
    // Local administrator diagnosis uses our fixed categories only, never upstream strings/values.
    if (env.LOCAL_ADMIN === '1' && diagnostics.includes(error.diagnostic)) return json({ ...await response.json(), diagnostic: error.diagnostic }, response.status);
    return response;
  }
}
