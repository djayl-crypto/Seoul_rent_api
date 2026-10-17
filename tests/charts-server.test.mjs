import test from 'node:test';
import assert from 'node:assert/strict';
import { readSummary } from '../src/server/summary.js';
import { DISTRICTS } from '../src/config.js';
import { onRequestGet as comparison } from '../functions/api/comparison.js';

const group = (district, n, sum, type = '아파트') => ({ districtCode: district, dongCode: '10100', dongName: '가회동', housingType: type, year: 2022, month: '2022-01', periodStart: '2022-01-01', periodEnd: '2022-01-31', isPartialMonth: false, transactionCount: n, areaPriceCount: n, sumDepositManwon: sum, sumDepositPerM2Manwon: sum / 50, meanDepositManwon: n >= 10 ? sum / n : null, meanDepositPerM2Manwon: n >= 10 ? sum / n / 50 : null });
function fixture({ missing, mismatch, invalid } = {}) {
  return { RENT_DATA: { get: async key => {
    const code = key.match(/\/(\d{5})(?:\/latest)?\.json$/)?.[1];
    if (code === missing) return null;
    const monthly = [group(code, 5, 50000), group(code, 15, 450000, '연립다세대')];
    if (code === invalid) monthly[0].sumDepositManwon = -1;
    const snapshot = { schemaVersion: 2, status: 'complete', snapshotId: 'charts-test', analysisStart: '2022-01-01', analysisEnd: code === mismatch ? '2026-10-15' : '2026-10-16', sourceRows: 20, sourceCalls: 1, excludedCounts: {}, groups: [], monthly, yearly: [] };
    return { json: async () => key.endsWith('latest.json') ? { schemaVersion: 2, status: 'complete', snapshotId: 'charts-test' } : snapshot };
  } } };
}
const request = (query, env) => comparison({ request: new Request(`https://example.test/api/comparison${query}`), env });

test('monthly chart aggregates private sums, preserves gaps and marks the partial cutoff', async () => {
  const data = await readSummary(fixture(), { district: '11110', dong: 'all', type: 'all', view: 'dashboard' });
  const all = data.monthlySeries.filter(row => row.housingType === 'all');
  assert.equal(all.length, 58);
  assert.equal(all[0].transactionCount, 20); assert.equal(all[0].meanDepositManwon, 25000);
  assert.equal(all[1].month, '2022-02'); assert.equal(all[1].transactionCount, 0); assert.equal(all[1].meanDepositManwon, null);
  assert.equal(all.at(-1).periodEnd, '2026-10-16'); assert.equal(all.at(-1).isPartialMonth, true);
  const small = data.monthlySeries.find(row => row.month === '2022-01' && row.housingType === '아파트');
  assert.equal(small.transactionCount, 5); assert.equal(small.meanDepositManwon, null);
  assert.ok(!JSON.stringify(data.monthlySeries).includes('sumDeposit'));
});

test('district comparison covers 25 gu with exact aggregate and separate type means', async () => {
  const response = await request('?type=all', fixture());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.districts.length, 25); assert.equal(data.rows.length, 125);
  const all = data.rows.filter(row => row.housingType === 'all');
  assert.equal(all.length, 25); assert.equal(all[0].transactionCount, 20); assert.equal(all[0].meanDepositManwon, 25000);
  assert.equal(data.meta.transactionCount, 500);
  assert.equal(data.meta.analysisEnd, '2026-10-16');
  assert.equal(data.rows.find(row => row.housingType === '아파트').meanDepositManwon, null);
  assert.ok(!JSON.stringify(data).includes('sumDeposit')); assert.ok(!JSON.stringify(data).includes('sourceRows'));
  const selected = await (await request('?type='+encodeURIComponent('연립다세대'), fixture())).json();
  assert.equal(selected.rows.length, 25); assert.equal(selected.meta.transactionCount, 375);
  assert.equal(selected.rows[0].meanDepositManwon, 30000);
});

test('missing, invalid or differently dated district partitions never appear as comparable zeroes', async () => {
  for (const options of [{ missing: DISTRICTS[7].code }, { mismatch: DISTRICTS[3].code }, { invalid: DISTRICTS[1].code }]) {
    const response = await request('?type=all', fixture(options));
    assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'DATA_NOT_READY');
  }
  for (const query of ['?gu=11110', '?type=all&type=all', '?type=unknown', '?url=private-fixture']) assert.equal((await request(query, fixture())).status, 400);
});
