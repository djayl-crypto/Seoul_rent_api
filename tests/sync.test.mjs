import test from 'node:test';
import assert from 'node:assert/strict';
import { syncAction } from '../src/server/sync.js';
import { createAccumulator, addRecords } from '../src/analysis.js';
import { onRequestPost } from '../functions/api/admin/sync.js';

class MemoryR2 {
  objects = new Map(); sequence = 0;
  async get(key) {
    const value = this.objects.get(key);
    return value ? { etag: value.etag, json: async () => JSON.parse(value.body) } : null;
  }
  async put(key, body, options = {}) {
    const current = this.objects.get(key);
    if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
    if (options.onlyIf?.etagDoesNotMatch === '*' && current) return null;
    const etag = String(++this.sequence);
    this.objects.set(key, { body, etag }); return { etag };
  }
}
const period = { start: '2022-01-01', end: '2026-10-16' };
const row = year => ({ RCPT_YR: String(year), CGG_CD: '11110', CGG_NM: '종로구', STDG_CD: '10100', STDG_NM: '청운동', CTRT_DAY: `${year}0101`, RENT_SE: '전세', GRFE: '10000', RENT_AREA: '50', BLDG_USG: '아파트' });
function archive() {
  const accumulator = createAccumulator(period);
  addRecords(accumulator, [row(2022), row(2023)]);
  return { schemaVersion: 2, district: '11110', fileYears: [2022, 2023], fileCounts: { 2022: 1, 2023: 1 }, sourceFiles: [2022, 2023].map(year => ({ year, rows: 1, unassignedRows: 0, overlapExcluded: 0, receiptYears: [year], sha256: 'a'.repeat(64) })), accumulator };
}
const dependencies = overrides => ({ period, pageSize: 2, fetchPage: async (env, options) => ({ total: 3, calls: 1, rows: Array.from({ length: options.size === 1 ? 1 : options.start === 1 ? 2 : 1 }, () => row(options.year)) }), ...overrides });

test('all API pages and all three years complete before one five-year snapshot is published', async () => {
  const env = { RENT_DATA: new MemoryR2(), SEOUL_API_KEY: 'synthetic-private-sync' };
  const deps = dependencies();
  let progress = await syncAction(env, { action: 'start', district: '11110', archive: archive() }, deps);
  const jobId = progress.jobId;
  assert.equal(await env.RENT_DATA.get('districts/11110/latest.json'), null);
  for (let i = 0; i < 20 && progress.status !== 'complete'; i++) progress = await syncAction(env, { action: 'step', district: '11110', jobId }, deps);
  assert.equal(progress.status, 'complete');
  const pointer = await (await env.RENT_DATA.get('districts/11110/latest.json')).json();
  const snapshot = await (await env.RENT_DATA.get(`snapshots/${pointer.snapshotId}/11110.json`)).json();
  assert.deepEqual([...new Set(snapshot.groups.map(g => g.year))].sort(), [2022, 2023, 2024, 2025, 2026]);
  assert.equal(snapshot.sourceRows, 11);
  assert.equal(snapshot.sourceCalls, 9);
  assert.equal(snapshot.groups.find(g => g.year === 2024).transactionCount, 3);
  assert.ok(!JSON.stringify(progress).includes('synthetic-private-sync'));
  assert.equal(progress.accumulator, undefined);
});

test('short pages and changing totals fail without replacing a previous completed snapshot', async () => {
  const env = { RENT_DATA: new MemoryR2(), SEOUL_API_KEY: 'unused' };
  const deps = dependencies({ fetchPage: async () => ({ total: 3, rows: [row(2024)], calls: 1 }) });
  await env.RENT_DATA.put('districts/11110/latest.json', JSON.stringify({ snapshotId: 'old' }));
  const { jobId } = await syncAction(env, { action: 'start', district: '11110', archive: archive() }, deps);
  await assert.rejects(syncAction(env, { action: 'step', district: '11110', jobId }, deps), e => e.code === 'SOURCE_CHANGED');
  assert.equal((await (await env.RENT_DATA.get('districts/11110/latest.json')).json()).snapshotId, 'old');
});

test('concurrent page steps cannot duplicate committed aggregates', async () => {
  const env = { RENT_DATA: new MemoryR2(), SEOUL_API_KEY: 'unused' };
  const deps = dependencies();
  const { jobId } = await syncAction(env, { action: 'start', district: '11110', archive: archive() }, deps);
  const outcomes = await Promise.allSettled([syncAction(env, { action: 'step', district: '11110', jobId }, deps), syncAction(env, { action: 'step', district: '11110', jobId }, deps)]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  const progress = await syncAction(env, { action: 'status', district: '11110' }, deps);
  assert.equal(progress.sourceRows, 2);
});

test('restart cannot replace a publishing job and completed districts are reused on resume', async () => {
  const env = { RENT_DATA: new MemoryR2(), SEOUL_API_KEY: 'unused' }, deps = dependencies();
  let progress = await syncAction(env, { action: 'start', district: '11110', archive: archive() }, deps);
  while (progress.phase !== 'publishing') progress = await syncAction(env, { action: 'step', district: '11110', jobId: progress.jobId }, deps);
  await assert.rejects(syncAction(env, { action: 'start', district: '11110', archive: archive(), restart: true }, deps), e => e.code === 'SYNC_CONFLICT');
  progress = await syncAction(env, { action: 'step', district: '11110', jobId: progress.jobId }, deps);
  const resumed = await syncAction(env, { action: 'start', district: '11110', archive: archive() }, deps);
  assert.equal(resumed.jobId, progress.jobId);
  assert.equal(resumed.status, 'complete');
  assert.equal(resumed.sourceCalls, progress.sourceCalls);
});

test('stale cutoff, invalid archive sums and public administration requests are rejected', async () => {
  const env = { RENT_DATA: new MemoryR2(), SEOUL_API_KEY: 'unused' };
  const wrong = archive(); wrong.accumulator.period.end = '2026-10-15';
  await assert.rejects(syncAction(env, { action: 'start', district: '11110', archive: wrong }, dependencies()), e => e.code === 'INVALID_ARCHIVE');
  const invalid = archive(); invalid.accumulator.sourceRows = 100;
  await assert.rejects(syncAction(env, { action: 'start', district: '11110', archive: invalid }, dependencies()), e => e.code === 'INVALID_ARCHIVE');
  const response = await onRequestPost({ env, request: new Request('https://example.test/api/admin/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) });
  assert.equal(response.status, 503);
  const crossSite = await onRequestPost({ env: { ...env, LOCAL_ADMIN: '1' }, request: new Request('http://127.0.0.1:8788/api/admin/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test' }, body: '{}' }) });
  assert.equal(crossSite.status, 401);
});
