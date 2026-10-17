import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSummary, requestComparison, requestRegions } from '../public/client.js';

test('UI requests only the same-origin Pages Function and encodes its selections', async () => {
  const result = await requestSummary({ district: '11110', dong: '10100', type: '아파트' }, { fetchImpl: async url => {
    assert.ok(url.startsWith('/api/summary?'));
    const query = new URL(url, 'https://example.test').searchParams;
    assert.equal(query.get('gu'), '11110'); assert.equal(query.get('dong'), '10100');
    assert.equal(query.get('type'), '아파트'); assert.equal(query.get('view'), 'dashboard');
    return Response.json({ meta: {}, dongs: [], overview: { transactionCount: 0 }, yearly: [] });
  } });
  assert.equal(result.kind, 'ready');
});

test('untrusted API error contents are discarded while preparation and service failures differ', async () => {
  const notReady = await requestSummary({}, { fetchImpl: async () => Response.json({ error: { code: 'DATA_NOT_READY', message: 'private-fixture' } }, { status: 503 }) });
  assert.equal(notReady.kind, 'not-ready');
  for (const fetchImpl of [async () => Response.json({ error: { message: 'private-fixture' } }, { status: 500 }), async () => { throw new Error('private-fixture'); }, async () => new Response('private-fixture')]) {
    const result = await requestSummary({}, { fetchImpl });
    assert.equal(result.kind, 'error'); assert.ok(!JSON.stringify(result).includes('private-fixture'));
  }
});

test('comparison chart uses only its same-origin Function and rejects malformed or unsafe error data', async () => {
  const ready = await requestComparison({ fetchImpl: async url => {
    assert.equal(url, '/api/comparison?type=all');
    return Response.json({ meta: { analysisStart: '2022-01-01', analysisEnd: '2026-10-16' }, rows: [], districts: [] });
  } });
  assert.equal(ready.kind, 'ready');
  const unavailable = await requestComparison({ fetchImpl: async () => Response.json({ error: { code: 'DATA_NOT_READY', message: 'private-fixture' } }, { status: 503 }) });
  assert.equal(unavailable.kind, 'not-ready'); assert.ok(!JSON.stringify(unavailable).includes('private-fixture'));
  assert.equal((await requestComparison({ fetchImpl: async () => Response.json({ rows: [] }) })).kind, 'error');
});

test('paired regions deduplicate identical same-origin selections and reject incomplete comparisons', async () => {
  let calls = 0;
  const ready = () => Response.json({ meta: { analysisStart: '2022-01-01', analysisEnd: '2026-10-16' }, dongs: [], overview: { transactionCount: 10 }, yearly: [] });
  const filters = { district: '11110', dong: '10100', type: '아파트' };
  const pair = await requestRegions([filters, filters], { fetchImpl: async url => { assert.ok(url.startsWith('/api/summary?')); calls++; return ready(); } });
  assert.equal(pair.kind, 'ready'); assert.equal(pair.data.length, 2); assert.equal(calls, 1);
  const failed = await requestRegions([filters, { ...filters, district: '11680' }], { fetchImpl: async url => url.includes('11680') ? Response.json({ error: { code: 'DATA_NOT_READY', message: 'private-fixture' } }, { status: 503 }) : ready() });
  assert.equal(failed.kind, 'not-ready'); assert.equal(failed.regionIndex, 1); assert.equal(failed.data, undefined);
  const mismatch = await requestRegions([filters, { ...filters, district: '11680' }], { fetchImpl: async url => url.includes('11680') ? Response.json({ meta: { analysisStart:'2022-01-01', analysisEnd:'2026-10-15' }, dongs:[], overview:{transactionCount:10},yearly:[] }) : ready() });
  assert.equal(mismatch.kind, 'period-mismatch'); assert.equal(mismatch.data, undefined);
});
