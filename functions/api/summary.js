import { parseQuery, readSummary } from '../../src/server/summary.js';
import { readCitySummary } from '../../src/server/city.js';
import { json, errorResponse } from '../../src/server/http.js';
import { readPreparedSummary } from '../../src/server/prepared.js';

export async function onRequestGet({ request, env }) {
  try {
    const query = parseQuery(request.url);
    if (env.RENT_QUERY_VERSION !== undefined) return json(await readPreparedSummary(env, query));
    return json(await (query.district === 'all' ? readCitySummary(env, query) : readSummary(env, query)));
  }
  catch (error) { return errorResponse(error); }
}
