import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as middleware } from '../functions/_middleware.js';
import { onRequestGet as meta } from '../functions/api/meta.js';
import { onRequestGet as summary } from '../functions/api/summary.js';
import { onRequestPost as sourceCheck } from '../functions/api/admin/source-check.js';
import { fetchSeoulPage } from '../src/server/seoul.js';

const secret = 'synthetic-private-sentinel';
const context = (path, env = {}) => ({ request: new Request(`https://example.test${path}`), env });
const safe = async response => {
  const text = await response.text();
  assert.ok(!text.includes(secret), 'a private value escaped into a response');
  return JSON.parse(text);
};

test('metadata is available with no credentials and contains a bounded contract period', async () => {
  const response = await meta(context('/api/meta'));
  assert.equal(response.status, 200);
  const body = await safe(response);
  assert.equal(body.analysis.start, '2022-01-01');
  assert.deepEqual(body.analysisYears, [2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(body.receiptYears, [2024, 2025, 2026]);
  assert.equal(body.housingTypes.length, 4);
  assert.equal(body.districts.length, 25);
  assert.ok(body.analysis.end <= '2026-12-31');
});

test('summary without storage is honestly not ready, with no upstream request', async () => {
  const response = await summary(context('/api/summary?gu=11110'));
  assert.equal(response.status, 503);
  assert.equal((await safe(response)).error.code, 'DATA_NOT_READY');
});

test('summary rejects unknown parameters, repeated parameters and invalid regions', async () => {
  for (const query of ['gu=00000', 'gu=11110&url=https://invalid.test', 'gu=11110&gu=11680', 'gu=11110&type=unknown']) {
    assert.equal((await summary(context(`/api/summary?${query}`))).status, 400);
  }
});

test('incomplete stored snapshots never become public summaries', async () => {
  const env = { RENT_DATA: { get: async () => ({ json: async () => ({ status: 'collecting' }) }) } };
  assert.equal((await summary(context('/api/summary?gu=11110', env))).status, 503);
});

const fixtureGroup = overrides => ({ districtCode: '11110', dongCode: '10100', dongName: '청운동', housingType: '아파트', year: 2024, periodStart: '2024-01-01', periodEnd: '2024-10-16', transactionCount: 30, areaPriceCount: 30, meanDepositManwon: 10000, meanDepositPerM2Manwon: 200, sumDepositManwon: 300000, sumDepositPerM2Manwon: 6000, ...overrides });
const fixtureEnv = (groups, monthly = []) => ({ RENT_DATA: { get: async key => ({ json: async () => key.endsWith('latest.json') ? { status: 'complete', schemaVersion: 2, snapshotId: 'test-snapshot' } : { status: 'complete', schemaVersion: 2, snapshotId: 'test-snapshot', analysisStart: '2022-01-01', analysisEnd: '2026-10-16', collectionFinishedAt: '2026-10-17T00:00:00Z', sourceRows: 30, sourceCalls: 1, excludedCounts: {}, groups, monthly, yearly: [] } }) } });

test('completed snapshot projection excludes arbitrary stored fields and suppresses small samples', async () => {
  const response = await summary(context('/api/summary?gu=11110', fixtureEnv([fixtureGroup({ unexpected: secret, transactionCount: 3, areaPriceCount: 3 })])));
  assert.equal(response.status, 200);
  const body = await safe(response);
  assert.equal(body.groups[0].meanDepositManwon, null);
  assert.equal(body.groups[0].meanDepositPerM2Manwon, null);
  assert.equal(body.groups[0].reliability, 'suppressed');
});

test('inconsistent annual or monthly periods cannot be published as complete comparisons', async () => {
  for (const group of [fixtureGroup({ periodStart: '2026-12-31', periodEnd: '2024-01-01' }), fixtureGroup({ periodEnd: '2024-12-31' })]) {
    const response = await summary(context('/api/summary?gu=11110', fixtureEnv([group])));
    assert.equal(response.status, 503);
  }
  const monthly = fixtureGroup({ month: '2024-02', periodStart: '2024-01-01', periodEnd: '2024-01-31' });
  assert.equal((await summary(context('/api/summary?gu=11110', fixtureEnv([], [monthly])))).status, 503);
});

test('server errors and sensitive paths are contained by middleware', async () => {
  for (const path of ['/.env', '/.env.example', '/%2eenv', '/src/server/seoul.js', '/wrangler.jsonc', '/package.json']) {
    let forwarded = false;
    const response = await middleware({ ...context(path), next: async () => { forwarded = true; return new Response('bad'); } });
    assert.equal(response.status, 404);
    assert.equal(forwarded, false);
  }
  const response = await middleware({ ...context('/api/meta', { SEOUL_API_KEY: secret }), next: async () => { throw new Error(secret); } });
  assert.equal(response.status, 500);
  await safe(response);
});

test('middleware blocks an accidental secret-bearing downstream response', async () => {
  const response = await middleware({ ...context('/api/meta', { SEOUL_API_KEY: secret }), next: async () => new Response(JSON.stringify({ value: secret }), { headers: { 'Content-Type': 'application/json' } }) });
  assert.equal(response.status, 500);
  await safe(response);
});

test('administrator source check is disabled or authenticated before key use', async () => {
  assert.equal((await sourceCheck(context('/api/admin/source-check'))).status, 503);
  assert.equal((await sourceCheck(context('/api/admin/source-check', { ADMIN_TOKEN: secret }))).status, 401);
});

test('missing source key fails safely before making an external request', async () => {
  let calls = 0;
  await assert.rejects(fetchSeoulPage({}, {}, async () => { calls++; }), error => error.code === 'SOURCE_NOT_CONFIGURED');
  assert.equal(calls, 0);
});

test('source adapter builds the official year/district path and validates the response', async () => {
  const result = await fetchSeoulPage({ SEOUL_API_KEY: secret }, { year: 2024, district: '11110', start: 1001, size: 1000 }, async url => {
    assert.ok(new URL(url).pathname.endsWith('/json/tbLnOpendataRentV/1001/2000/2024/11110/'));
    return Response.json({ tbLnOpendataRentV: { list_total_count: 1001, RESULT: { CODE: 'INFO-000', MESSAGE: 'normal' }, row: [{ RCPT_YR: '2024', CGG_CD: '11110', CGG_NM: '종로구', STDG_CD: '10100', STDG_NM: '청운동', RENT_SE: '전세', CTRT_DAY: '20240101', GRFE: '10000', RENT_AREA: '50', BLDG_USG: '아파트' }] } });
  });
  assert.equal(result.total, 1001);
  assert.equal(result.rows.length, 1);
});

test('source transport and API errors never retain an upstream URL or error message', async () => {
  for (const transport of [async () => { throw new Error(secret); }, async () => Response.json({ RESULT: { CODE: 'INFO-100', MESSAGE: secret } })]) {
    await assert.rejects(fetchSeoulPage({ SEOUL_API_KEY: secret }, { year: 2024 }, transport, { sleep: async () => {} }), error => {
      assert.ok(!String(error).includes(secret));
      assert.ok(!JSON.stringify(error).includes(secret));
      return true;
    });
  }
});

test('invalid pagination is rejected before upstream access', async () => {
  for (const options of [{ year: 2023 }, { year: 2024, size: 1001 }, { year: 2024, start: 0 }, { year: 2024, district: '00000' }]) {
    await assert.rejects(fetchSeoulPage({ SEOUL_API_KEY: secret }, options, async () => { throw new Error('must not fetch'); }), error => error.code === 'INVALID_SOURCE_QUERY');
  }
});
