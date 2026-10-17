import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisPeriod, aggregate } from '../src/analysis.js';

const row = overrides => ({ RCPT_YR: '2024', CGG_CD: '11110', CGG_NM: '종로구', STDG_CD: '10100', STDG_NM: '청운동', CTRT_DAY: '20240101', RENT_SE: '전세', GRFE: '10,000', RENT_AREA: '50', BLDG_USG: '아파트', ...overrides });

test('analysis period uses the previous Korean day and never expands into 2027', () => {
  assert.deepEqual(analysisPeriod(new Date('2026-10-16T16:00:00Z')), { start: '2022-01-01', end: '2026-10-16', comparisonMonthDay: '10-16' });
  assert.equal(analysisPeriod(new Date('2027-01-02T00:00:00Z')).end, '2026-12-31');
});

test('means use transactions, separate area denominators and preserve equal-valued trades', () => {
  const result = aggregate([row({}), row({ GRFE: '30000', RENT_AREA: '100' }), row({ GRFE: '20000', RENT_AREA: '' }), row({})], { start: '2024-01-01', end: '2026-10-16' });
  const group = result.groups[0];
  assert.equal(group.transactionCount, 4);
  assert.equal(group.sumDepositManwon, 70000);
  assert.equal(group.areaPriceCount, 3);
  assert.equal(group.sumDepositPerM2Manwon, 700);
  assert.equal(group.meanDepositManwon, null);
  assert.equal(group.reliability, 'suppressed');
});

test('strict dates, rent category, positive deposits and supported types govern inclusion', () => {
  const result = aggregate([row({ CTRT_DAY: '20240230' }), row({ CTRT_DAY: '20231231' }), row({ RENT_SE: '월세', RTFE: '0' }), row({ GRFE: '-1' }), row({ GRFE: '1oops' }), row({ BLDG_USG: '상가' }), row({})], { start: '2024-01-01', end: '2026-10-16' });
  assert.equal(result.includedCount, 1);
  assert.equal(Object.values(result.excludedCounts).reduce((a, b) => a + b, 0), 6);
});

test('same-period comparisons exclude later months from older years', () => {
  const records = [row({ CTRT_DAY: '20241201' }), ...Array.from({ length: 30 }, () => row({}))];
  const result = aggregate(records, { start: '2024-01-01', end: '2026-10-16' });
  assert.equal(result.groups[0].transactionCount, 30);
  assert.equal(result.groups[0].meanDepositManwon, 10000);
  assert.equal(result.groups[0].meanDepositPerM2Manwon, 200);
});
