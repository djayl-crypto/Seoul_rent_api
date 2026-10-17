import { parseComparisonQuery, readComparison } from '../../src/server/comparison.js';
import { json, errorResponse } from '../../src/server/http.js';
import { readPreparedComparison } from '../../src/server/prepared.js';

export async function onRequestGet({ request, env }) {
  try {
    const type = parseComparisonQuery(request.url);
    return json(await (env.RENT_QUERY_VERSION !== undefined ? readPreparedComparison(env,type) : readComparison(env,type)));
  }
  catch (error) { return errorResponse(error); }
}
