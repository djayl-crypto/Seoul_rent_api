import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

export async function* parseCsv(chunks) {
  let field = '', row = [], quoted = false, afterQuote = false, skipLF = false, first = true, dirty = false;
  for await (const chunk of chunks) for (const char of chunk) {
    if (first) { first = false; if (char === '\ufeff') continue; }
    if (skipLF) { skipLF = false; if (char === '\n') continue; }
    dirty = true;
    if (quoted && !afterQuote) {
      if (char === '"') afterQuote = true;
      else field += char;
    } else if (afterQuote && char === '"') { field += '"'; afterQuote = false; }
    else if (char === ',' || char === '\r' || char === '\n') {
      row.push(field); field = ''; quoted = afterQuote = false;
      if (char !== ',') { if (row.length > 1 || row[0] !== '') yield row; row = []; dirty = false; skipLF = char === '\r'; }
    } else if (afterQuote) throw new Error('INVALID_CSV_QUOTING');
    else if (char === '"') { if (field !== '') throw new Error('INVALID_CSV_QUOTING'); quoted = true; }
    else field += char;
    if (field.length > 16384 || row.length > 100) throw new Error('CSV_FIELD_LIMIT');
  }
  if (quoted && !afterQuote) throw new Error('INVALID_CSV_QUOTING');
  if (dirty) { row.push(field); yield row; }
}

export const ARCHIVE_COLUMNS = {
  RCPT_YR: '접수년도', CGG_CD: '자치구코드', CGG_NM: '자치구명', STDG_CD: '법정동코드', STDG_NM: '법정동명',
  CTRT_DAY: '계약일', RENT_SE: '전월세구분', GRFE: '보증금(만원)', RENT_AREA: '임대면적', BLDG_USG: '건물용도',
};
export function normalizeArchiveRow(row) {
  const result = {};
  for (const [field, korean] of Object.entries(ARCHIVE_COLUMNS)) result[field] = String(row[field] ?? row[korean] ?? '').trim();
  result.CTRT_DAY = result.CTRT_DAY.replaceAll('-', '');
  for (const code of ['CGG_CD', 'STDG_CD']) if (/^\d{1,5}$/.test(result[code])) result[code] = result[code].padStart(5, '0');
  return result;
}

export async function detectEncoding(file) {
  const handle = await open(file, 'r');
  try {
    const bytes = Buffer.alloc(8192), { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead), { stream: true }); return 'utf-8'; }
    catch { return 'euc-kr'; }
  } finally { await handle.close(); }
}
export async function* readCsv(file, encoding, onBytes = () => {}) {
  const decoder = new TextDecoder(encoding, { fatal: true });
  async function* textChunks() {
    for await (const bytes of createReadStream(file)) { onBytes(bytes); yield decoder.decode(bytes, { stream: true }); }
    yield decoder.decode();
  }
  yield* parseCsv(textChunks());
}
