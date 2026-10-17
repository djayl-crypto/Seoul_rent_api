import { parseComparisonQuery, readComparison } from '../../src/server/comparison.js';
import { json, errorResponse } from '../../src/server/http.js';

export async function onRequestGet({ request, env }) {
  try { return json(await readComparison(env, parseComparisonQuery(request.url))); }
  catch (error) { return errorResponse(error); }
}
