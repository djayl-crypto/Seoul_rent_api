import { RECEIPT_YEARS, isDistrict } from '../config.js';
import { ServiceError } from './http.js';
const fields = ['RCPT_YR', 'CGG_CD', 'CGG_NM', 'STDG_CD', 'STDG_NM', 'CTRT_DAY', 'RENT_SE', 'GRFE', 'RENT_AREA', 'BLDG_USG'];
const invalid = (diagnostic = 'RESPONSE_SHAPE') => Object.assign(new ServiceError('SOURCE_INVALID_RESPONSE', 502), { diagnostic });
async function readJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const parts = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4 * 1024 * 1024) { await reader.cancel(); throw invalid(); }
      parts.push(value);
    }
    const joined = new Uint8Array(length); let offset = 0;
    for (const part of parts) { joined.set(part, offset); offset += part.length; }
    try { return JSON.parse(new TextDecoder().decode(joined)); } catch { throw invalid('JSON_FORMAT'); }
  } finally { reader.releaseLock(); }
}

// Function runtime only. Never retain/log the URL, raw body, upstream message or exception cause.
export async function fetchSeoulPage(env, { year = 2024, district, start = 1, size = 1000 } = {}, fetchImpl = fetch, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const key = env.SEOUL_API_KEY;
  if (typeof key !== 'string' || !key.trim()) throw new ServiceError('SOURCE_NOT_CONFIGURED', 503);
  if (!RECEIPT_YEARS.includes(year) || !Number.isSafeInteger(start) || start < 1 || start > 5000000 || !Number.isInteger(size) || size < 1 || size > 1000 || (district !== undefined && !isDistrict(district))) throw new ServiceError('INVALID_SOURCE_QUERY', 400);
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/tbLnOpendataRentV/${start}/${start + size - 1}/${year}/${district ? `${district}/` : ''}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let response;
      try { response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: { Accept: 'application/json' } }); }
      catch { throw new ServiceError('SOURCE_UNAVAILABLE', 502); }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) throw new ServiceError('SOURCE_LIMITED', 503);
        if (response.status >= 500) throw new ServiceError('SOURCE_UNAVAILABLE', 502);
        if ([401, 403].includes(response.status)) throw new ServiceError('SOURCE_AUTH_FAILED', 503);
        throw invalid('HTTP_STATUS');
      }
      const data = await readJson(response);
      const payload = data?.tbLnOpendataRentV;
      const code = payload?.RESULT?.CODE ?? data?.RESULT?.CODE;
      if (code === 'INFO-200') return { total: 0, rows: [], calls: attempt + 1 };
      if (code === 'INFO-100') throw new ServiceError('SOURCE_AUTH_FAILED', 503);
      if (['ERROR-500', 'ERROR-600'].includes(code)) throw new ServiceError('SOURCE_UNAVAILABLE', 502);
      if (code !== 'INFO-000' || !payload || !Array.isArray(payload.row)) throw invalid('API_RESULT');
      const rawTotal = payload.list_total_count;
      if (!((typeof rawTotal === 'number' && Number.isSafeInteger(rawTotal)) || (typeof rawTotal === 'string' && /^\d+$/.test(rawTotal)))) throw invalid('COUNT_TYPE');
      const total = Number(rawTotal);
      if (!Number.isSafeInteger(total) || total < 0 || total > 5000000 || payload.row.length > size) throw invalid('COUNT_RANGE');
      const rows = payload.row.map(row => {
        if (!row || typeof row !== 'object' || Array.isArray(row) || String(row.RCPT_YR) !== String(year) || (district && String(row.CGG_CD) !== district)) throw invalid('PARTITION');
        const projected = {};
        for (const field of fields) {
          if (!Object.hasOwn(row, field) || !['string', 'number'].includes(typeof row[field]) || String(row[field]).length > 256) throw invalid(`FIELD_SHAPE_${field}`);
          projected[field] = String(row[field]);
        }
        return projected;
      });
      return { total, rows, calls: attempt + 1 };
    } catch (error) {
      const safe = error instanceof ServiceError ? error : new ServiceError('SOURCE_UNAVAILABLE', 502);
      if (!['SOURCE_UNAVAILABLE', 'SOURCE_LIMITED'].includes(safe.code) || attempt === 3) throw safe;
      await sleep(1000 * 2 ** attempt);
    }
  }
}
