import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, readSummary } from '../src/server/summary.js';

const make = (dong, n, sum, housingType = '아파트') => ({ districtCode: '11110', dongCode: dong, dongName: dong === '10100' ? '청운동' : '신교동', housingType, year: 2022, transactionCount: n, sumDepositManwon: sum, areaPriceCount: n, sumDepositPerM2Manwon: sum / 50, meanDepositManwon: n >= 10 ? sum / n : null, meanDepositPerM2Manwon: n >= 10 ? sum / n / 50 : null, periodStart: '2022-01-01', periodEnd: '2022-10-16' });
function env() {
  const groups = [make('10100', 5, 50000), make('10100', 15, 450000, '연립다세대'), make('10200', 10, 200000)];
  const monthly = groups.map(g => ({ ...g, month: '2022-01', periodEnd: '2022-01-31', isPartialMonth: false }));
  const snapshot = { schemaVersion: 2, status: 'complete', snapshotId: 'selection-test', analysisStart: '2022-01-01', analysisEnd: '2026-10-16', sourceRows: 30, sourceCalls: 1, groups, monthly, yearly: [], excludedCounts: {} };
  return { RENT_DATA: { get: async key => ({ json: async () => key.endsWith('latest.json') ? { schemaVersion: 2, status: 'complete', snapshotId: 'selection-test' } : snapshot }) } };
}

test('dong and compact view are validated at the Function boundary', () => {
  const query = parseQuery('https://example.test/api/summary?gu=11110&dong=10100&type=all&view=dashboard');
  assert.equal(query.dong, '10100'); assert.equal(query.view, 'dashboard');
  for (const suffix of ['dong=abc', 'dong=10100&dong=10200', 'view=raw']) assert.throws(() => parseQuery(`https://example.test/api/summary?gu=11110&${suffix}`), e => e.code === 'INVALID_QUERY');
});

test('selected dong rollup uses private sums including suppressed component means', async () => {
  const body = await readSummary(env(), { district: '11110', type: 'all', dong: '10100', view: 'dashboard' });
  assert.equal(body.overview.transactionCount, 20);
  assert.equal(body.overview.meanDepositManwon, 25000);
  assert.equal(body.overview.meanDepositPerM2Manwon, 500);
  assert.equal(body.yearly[0].meanDepositManwon, 25000);
  assert.equal(body.yearly[0].transactionCount, 20);
  assert.deepEqual(body.dongs.map(d => d.code), ['10200', '10100']); // Korean name order: 신교동, 청운동.
  assert.equal(body.groups, undefined); assert.equal(body.monthly, undefined);
  assert.ok(!JSON.stringify(body).includes('sumDepositManwon'));
});

test('no-result housing combinations retain dong options and zero counts; unknown dongs fail', async () => {
  const body = await readSummary(env(), { district: '11110', type: '오피스텔', dong: '10100', view: 'dashboard' });
  assert.equal(body.overview.transactionCount, 0); assert.equal(body.overview.meanDepositManwon, null);
  assert.equal(body.yearly.length, 0); assert.equal(body.dongs.length, 2);
  await assert.rejects(readSummary(env(), { district: '11110', type: 'all', dong: '99999' }), e => e.code === 'INVALID_QUERY');
});

test('all-dong metrics and selected small samples use the correct denominators', async () => {
  const body = await readSummary(env(), { district: '11110', type: 'all', dong: 'all' });
  assert.equal(body.overview.transactionCount, 30);
  assert.ok(Math.abs(body.overview.meanDepositManwon - 23333.333333333332) < 0.00001);
  const small = await readSummary(env(), { district: '11110', type: '아파트', dong: '10100' });
  assert.equal(small.overview.transactionCount, 5); assert.equal(small.overview.meanDepositManwon, null);
});
