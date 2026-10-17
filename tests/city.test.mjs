import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/server/summary.js';
import { onRequestGet as summary } from '../functions/api/summary.js';

function fixture({ missing, mismatch } = {}) {
  return { RENT_DATA: { get: async key => {
    const district = key.match(/\/(\d{5})(?:\/latest)?\.json$/)?.[1];
    if (district === missing) return null;
    const n = district === '11110' ? 5 : 10, sum = district === '11110' ? 50000 : 300000;
    const base = { districtCode: district, dongCode: '10100', dongName: '청운동', housingType: '아파트', year: 2022, transactionCount: n, areaPriceCount: n, sumDepositManwon: sum, sumDepositPerM2Manwon: sum / 50, meanDepositManwon: n >= 10 ? sum / n : null, meanDepositPerM2Manwon: n >= 10 ? sum / n / 50 : null, periodStart: '2022-01-01', periodEnd: '2022-10-16' };
    const snapshot = { schemaVersion: 2, status: 'complete', snapshotId: 'city-test', analysisStart: '2022-01-01', analysisEnd: district === mismatch ? '2026-10-15' : '2026-10-16', sourceRows: n, sourceCalls: 1, excludedCounts: {}, groups: [{ ...base, periodEnd: district === mismatch ? '2022-10-15' : base.periodEnd }], monthly: [{ ...base, month: '2022-01', periodEnd: '2022-01-31', isPartialMonth: false }], yearly: [] };
    return { json: async () => key.endsWith('latest.json') ? { schemaVersion: 2, status: 'complete', snapshotId: 'city-test' } : snapshot };
  } } };
}
const read = async (query, env = fixture()) => summary({ request: new Request(`https://example.test/api/summary?${query}`), env });

test('Seoul-wide scope permits only all dongs and retains other query validation', () => {
  assert.equal(parseQuery('https://example.test/api/summary?gu=all&view=dashboard').district, 'all');
  for (const suffix of ['&dong=10100', '&gu=11110', '&type=invalid']) assert.throws(() => parseQuery(`https://example.test/api/summary?gu=all${suffix}`), e => e.code === 'INVALID_QUERY');
});
test('city overview, annual and monthly combine private counts/sums before suppression', async () => {
  const response = await read('gu=all&view=dashboard');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.meta.districtCount, 25); assert.equal(data.meta.scope, 'all'); assert.deepEqual(data.dongs, []);
  assert.equal(data.overview.transactionCount, 245);
  assert.ok(Math.abs(data.overview.meanDepositManwon - 29591.836734693876) < 1e-9);
  assert.equal(data.yearly[0].transactionCount, 245); assert.equal(data.yearly[0].meanDepositManwon, data.overview.meanDepositManwon);
  assert.equal(data.monthlySeries.find(row => row.month === '2022-01' && row.housingType === 'all').transactionCount, 245);
  assert.equal(data.monthlySeries.find(row => row.month === '2022-02' && row.housingType === 'all').meanDepositManwon, null);
  assert.equal(data.groups, undefined); assert.equal(data.monthly, undefined);
  assert.ok(!JSON.stringify(data).includes('sumDeposit'));
  const empty = await (await read('gu=all&view=dashboard&type='+encodeURIComponent('오피스텔'))).json();
  assert.equal(empty.overview.transactionCount, 0); assert.equal(empty.overview.meanDepositManwon, null);
});
test('Seoul total is unavailable when any gu is absent or has a different period', async () => {
  for (const options of [{ missing: '11290' }, { mismatch: '11200' }]) {
    const response = await read('gu=all&view=dashboard', fixture(options));
    assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'DATA_NOT_READY');
  }
});
