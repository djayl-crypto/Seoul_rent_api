import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSeoulPage } from '../src/server/seoul.js';

const env = { SEOUL_API_KEY: 'synthetic-source-key' };
const options = { year: 2024, district: '11110', size: 2 };
const row = { RCPT_YR: '2024', CGG_CD: '11110', CGG_NM: '종로구', STDG_CD: '10100', STDG_NM: '청운동', CTRT_DAY: '20240101', RENT_SE: '전세', GRFE: '10000', RENT_AREA: '50', BLDG_USG: '아파트' };
const ok = overrides => Response.json({ tbLnOpendataRentV: { list_total_count: 3, RESULT: { CODE: 'INFO-000' }, row: [row, row], ...overrides } });

test('adapter removes unused original fields including building names and addresses', async () => {
  const result = await fetchSeoulPage(env, options, async (url, init) => {
    assert.equal(init.redirect, 'manual');
    return ok({ row: [{ ...row, BLDG_NM: 'private-source-test-only', MNO: '1234' }] });
  });
  assert.equal(result.rows[0].BLDG_NM, undefined);
  assert.equal(result.rows[0].MNO, undefined);
  assert.equal(result.calls, 1);
});

test('upstream redirects are rejected rather than following a secret-bearing request elsewhere', async () => {
  await assert.rejects(fetchSeoulPage(env, options, async () => new Response(null, { status: 302, headers: { Location: 'https://other.test/' } })), e => e.code === 'SOURCE_INVALID_RESPONSE');
});

test('transient HTTP and transport failures retry with a bounded budget', async () => {
  let attempts = 0;
  const result = await fetchSeoulPage(env, options, async () => ++attempts < 3 ? new Response('', { status: 503 }) : ok(), { sleep: async () => {} });
  assert.equal(result.calls, 3);
  assert.equal(result.rows.length, 2);
  attempts = 0;
  await assert.rejects(fetchSeoulPage(env, options, async () => { attempts++; throw new Error('private-source-test-only'); }, { sleep: async () => {} }), e => e.code === 'SOURCE_UNAVAILABLE' && !String(e).includes('private-source-test-only'));
  assert.equal(attempts, 4);
});

test('API authentication failures are sanitized and not retried', async () => {
  let attempts = 0;
  await assert.rejects(fetchSeoulPage(env, options, async () => { attempts++; return Response.json({ RESULT: { CODE: 'INFO-100', MESSAGE: env.SEOUL_API_KEY } }); }), e => e.code === 'SOURCE_AUTH_FAILED' && !String(e).includes(env.SEOUL_API_KEY));
  assert.equal(attempts, 1);
});

test('schema failures carry only a predefined field category for local diagnosis', async () => {
  await assert.rejects(fetchSeoulPage(env, options, async () => ok({ row: [{ ...row, GRFE: { unexpected: 'private-source-test-only' } }] })), e => e.code === 'SOURCE_INVALID_RESPONSE' && e.diagnostic === 'FIELD_SHAPE_GRFE' && !JSON.stringify(e).includes('private-source-test-only'));
});

test('no-data is explicit while malformed counts, foreign partitions and invalid JSON fail closed', async () => {
  const empty = await fetchSeoulPage(env, options, async () => Response.json({ RESULT: { CODE: 'INFO-200' } }));
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.rows, []);
  for (const response of [ok({ list_total_count: '' }), ok({ row: [{ ...row, RCPT_YR: '2023' }] }), ok({ row: [{ ...row, CGG_CD: '11680' }] }), new Response('<html>bad gateway</html>')]) {
    await assert.rejects(fetchSeoulPage(env, options, async () => response), e => e.code === 'SOURCE_INVALID_RESPONSE');
  }
});
