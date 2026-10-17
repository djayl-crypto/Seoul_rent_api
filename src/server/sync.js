import { ARCHIVE_YEARS, RECEIPT_YEARS, ANALYSIS_YEARS, isDistrict } from '../config.js';
import { analysisPeriod, createAccumulator, mergeAccumulators, addRecords, finalizeAccumulator, validateAccumulator } from '../analysis.js';
import { fetchSeoulPage } from './seoul.js';
import { ServiceError } from './http.js';

const fail = code => new ServiceError(code, code === 'SYNC_CONFLICT' ? 409 : code === 'INVALID_ARCHIVE' || code === 'INVALID_ADMIN_REQUEST' ? 400 : 503);
const progress = state => ({ jobId: state.id, district: state.district, status: state.phase === 'complete' ? 'complete' : state.phase === 'failed' ? 'failed' : 'collecting', phase: state.phase, receiptYear: RECEIPT_YEARS[state.index] ?? null, nextStart: state.start, sourceRows: state.apiRows, sourceCalls: state.sourceCalls });
async function store(bucket, key, state, etag) {
  const saved = await bucket.put(key, JSON.stringify(state), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' } });
  if (!saved) throw fail('SYNC_CONFLICT');
}
function archiveState(archive, district, period) {
  try {
    if (archive?.schemaVersion !== 2 || archive.district !== district || JSON.stringify(archive.fileYears) !== JSON.stringify(ARCHIVE_YEARS) || !Array.isArray(archive.sourceFiles) || archive.sourceFiles.length !== 2) throw new Error();
    let count = 0;
    for (const year of ARCHIVE_YEARS) {
      const source = archive.sourceFiles.find(item => item.year === year);
      if (!source || !/^[a-f0-9]{64}$/.test(source.sha256) || !Number.isSafeInteger(source.rows) || source.rows < 1 || !Array.isArray(source.receiptYears) || !source.receiptYears.length || source.receiptYears.some(y => ![2021, 2022, 2023].includes(y)) || !Number.isSafeInteger(archive.fileCounts?.[year]) || archive.fileCounts[year] < 0 || archive.fileCounts[year] > source.rows) throw new Error();
      count += archive.fileCounts[year];
    }
    validateAccumulator(archive.accumulator, district, period);
    if (archive.accumulator.sourceRows !== count) throw new Error();
    // Reconstruct only accumulator fields; imported arbitrary properties are discarded.
    const clean = createAccumulator(period);
    for (const kind of ['groups', 'monthly']) for (const group of Object.values(archive.accumulator[kind])) {
      const fields = ['districtCode', 'dongCode', 'dongName', 'housingType', 'year', 'periodStart', 'periodEnd', 'transactionCount', 'sumDepositManwon', 'areaPriceCount', 'sumDepositPerM2Manwon', ...(kind === 'monthly' ? ['month', 'isPartialMonth'] : [])];
      const key = `${district}:${group.dongCode}:${group.housingType}:${group.year}${kind === 'monthly' ? `:${group.month}` : ''}`;
      clean[kind][key] = Object.fromEntries(fields.map(field => [field, group[field]]));
    }
    for (const counter of ['sourceRows', 'includedCount', 'allIncludedCount']) clean[counter] = archive.accumulator[counter];
    clean.excludedCounts = { ...archive.accumulator.excludedCounts };
    return clean;
  } catch { throw fail('INVALID_ARCHIVE'); }
}

export async function syncAction(env, input, { period = analysisPeriod(), pageSize = 1000, fetchPage = fetchSeoulPage } = {}) {
  if (!input || !['start', 'step', 'status'].includes(input.action) || !isDistrict(input.district)) throw fail('INVALID_ADMIN_REQUEST');
  const keys = input.action === 'start' ? ['action', 'district', 'archive', 'restart'] : input.action === 'step' ? ['action', 'district', 'jobId'] : ['action', 'district'];
  if (Object.keys(input).some(key => !keys.includes(key)) || (input.restart !== undefined && typeof input.restart !== 'boolean')) throw fail('INVALID_ADMIN_REQUEST');
  if (!env.RENT_DATA) throw fail('STORAGE_UNAVAILABLE');
  const bucket = env.RENT_DATA, key = `jobs/${input.district}.json`;
  const stored = await bucket.get(key), state = stored ? await stored.json() : null;
  if (input.action === 'status') return state ? progress(state) : { status: 'not_started', district: input.district };
  if (!env.SEOUL_API_KEY?.trim()) throw fail('SOURCE_NOT_CONFIGURED');
  if (input.action === 'start') {
    const accumulator = archiveState(input.archive, input.district, period);
    // Once the CAS enters publishing, a restart must not invalidate the publisher.
    if (state?.phase === 'publishing' && input.restart) throw fail('SYNC_CONFLICT');
    const fingerprints = sources => JSON.stringify(sources.map(({ year, sha256 }) => ({ year, sha256 })).sort((a, b) => a.year - b.year));
    const sameSources = state && state.period.end === period.end && fingerprints(state.sources) === fingerprints(input.archive.sourceFiles);
    if (state?.phase === 'complete' && sameSources && !input.restart) return progress(state);
    if (state && !['complete', 'failed'].includes(state.phase) && !input.restart) {
      if (!sameSources) throw fail('INVALID_ARCHIVE');
      return progress(state);
    }
    const next = { id: crypto.randomUUID(), district: input.district, phase: 'api', index: 0, start: 1, pageSize, expectedTotal: null, yearRows: 0, apiRows: 0, sourceCalls: 0, createdAt: new Date().toISOString(), period: { start: period.start, end: period.end }, accumulator,
      sources: input.archive.sourceFiles.map(source => ({ kind: 'file', year: source.year, sha256: source.sha256, rows: source.rows, overlapExcluded: source.overlapExcluded ?? 0 })), fileCounts: input.archive.fileCounts };
    await store(bucket, key, next, stored?.etag);
    return progress(next);
  }
  if (!state || input.jobId !== state.id || state.phase === 'failed') throw fail('SYNC_CONFLICT');
  if (state.phase === 'complete') return progress(state);
  if (state.phase === 'publish') {
    validateAccumulator(state.accumulator, state.district, state.period);
    const snapshot = { ...finalizeAccumulator(state.accumulator), schemaVersion: 2, status: 'complete', snapshotId: state.id, analysisStart: state.period.start, analysisEnd: state.period.end, sourceCalls: state.sourceCalls,
      collectionStartedAt: state.createdAt, collectionFinishedAt: new Date().toISOString(), sources: [...state.sources, ...RECEIPT_YEARS.map(year => ({ kind: 'api', year }))], sourcePolicy: '2022-file-owns-2022-contracts;2023-file-excludes-2022-contracts;API-receipts-2024-2026', analysisYears: ANALYSIS_YEARS };
    await bucket.put(`snapshots/${state.id}/${state.district}.json`, JSON.stringify(snapshot));
    // Serialize publication through a CAS transition; another start/restart invalidates this writer.
    state.phase = 'publishing';
    await store(bucket, key, state, stored.etag);
    return progress(state);
  }
  if (state.phase === 'publishing') {
    const latestKey = `districts/${state.district}/latest.json`, previous = await bucket.get(latestKey);
    const pointer = { schemaVersion: 2, status: 'complete', snapshotId: state.id, createdAt: state.createdAt };
    if (previous) {
      const value = await previous.json();
      if (value.createdAt && value.createdAt > state.createdAt) throw fail('SYNC_CONFLICT');
    }
    await store(bucket, latestKey, pointer, previous?.etag);
    state.phase = 'complete'; await store(bucket, key, state, stored.etag);
    return progress(state);
  }
  const year = RECEIPT_YEARS[state.index];
  const result = await fetchPage(env, { year, district: state.district, start: state.phase === 'verify' ? 1 : state.start, size: state.phase === 'verify' ? 1 : state.pageSize });
  state.sourceCalls += result.calls;
  state.expectedTotal ??= result.total;
  const expectedLength = state.phase === 'verify' ? Math.min(1, result.total) : Math.min(state.pageSize, Math.max(0, result.total - state.start + 1));
  if (result.total !== state.expectedTotal || result.rows.length !== expectedLength) {
    state.phase = 'failed'; await store(bucket, key, state, stored.etag); throw fail('SOURCE_CHANGED');
  }
  if (state.phase === 'verify') {
    if (state.yearRows !== result.total) { state.phase = 'failed'; await store(bucket, key, state, stored.etag); throw fail('SOURCE_CHANGED'); }
    state.index++; state.start = 1; state.expectedTotal = null; state.yearRows = 0;
    state.phase = state.index === RECEIPT_YEARS.length ? 'publish' : 'api';
  } else {
    addRecords(state.accumulator, result.rows);
    state.apiRows += result.rows.length; state.yearRows += result.rows.length; state.start += result.rows.length;
    if (state.yearRows === result.total) state.phase = 'verify';
  }
  await store(bucket, key, state, stored.etag);
  return progress(state);
}
