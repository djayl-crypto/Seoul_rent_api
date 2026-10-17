import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, normalizeArchiveRow } from '../scripts/lib/csv.mjs';
import { createAccumulator, addRecords, mergeAccumulators, finalizeAccumulator } from '../src/analysis.js';

async function* chunks(text) { for (const ch of text) yield ch; }
test('CSV parser handles escaped quotes, CRLF, quoted newlines and chunk boundaries', async () => {
  const result = [];
  for await (const values of parseCsv(chunks('\ufeffa,b\r\n"x,""y""","line\n2"\r\n'))) result.push(values);
  assert.deepEqual(result, [['a', 'b'], ['x,"y"', 'line\n2']]);
  await assert.rejects(async () => { for await (const row of parseCsv(chunks('a,"unterminated'))) void row; });
});

test('archive normalization maps Korean headers, dates and padded codes without retaining addresses', () => {
  const value = normalizeArchiveRow({ 접수년도: '2022', 자치구코드: '11110', 자치구명: '종로구', 법정동코드: '10100', 법정동명: '청운동', 계약일: '2022-01-01', 전월세구분: '전세', '보증금(만원)': '10000', 임대면적: '50', 건물용도: '아파트', 건물명: 'unused' });
  assert.equal(value.CTRT_DAY, '20220101');
  assert.equal(value.RCPT_YR, '2022');
  assert.equal(value.BLDG_NM, undefined);
});

test('five-year aggregation merges sums, assigns late receipts by contract date and retains full monthly history', () => {
  const period = { start: '2022-01-01', end: '2026-10-16' };
  const row = (date, deposit) => ({ RCPT_YR: '2023', CGG_CD: '11110', CGG_NM: '종로구', STDG_CD: '10100', STDG_NM: '청운동', CTRT_DAY: date, RENT_SE: '전세', GRFE: deposit, RENT_AREA: '50', BLDG_USG: '아파트' });
  const left = createAccumulator(period), right = createAccumulator(period);
  addRecords(left, Array.from({ length: 10 }, () => row('20220101', '10000')));
  addRecords(right, Array.from({ length: 30 }, () => row('20220101', '30000')));
  addRecords(right, [row('20221201', '50000')]);
  mergeAccumulators(left, right);
  const result = finalizeAccumulator(left);
  assert.equal(result.groups[0].transactionCount, 40);
  assert.equal(result.groups[0].meanDepositManwon, 25000);
  assert.equal(result.groups[0].year, 2022);
  assert.equal(result.monthly.find(g => g.month === '2022-12').transactionCount, 1);
  assert.equal(result.yearly.find(g => g.housingType === 'all').meanDepositManwon, 25000);
});
