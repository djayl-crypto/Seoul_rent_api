import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyFigure, districtFigure, monthlyObservations, districtObservations } from '../public/chart-model.js';
const monthly = [
  { month: '2022-01', housingType: 'all', transactionCount: 40, meanDepositManwon: 10000, isPartialMonth: false },
  { month: '2022-02', housingType: 'all', transactionCount: 0, meanDepositManwon: null, isPartialMonth: false },
  { month: '2022-03', housingType: 'all', transactionCount: 60, meanDepositManwon: 15000, isPartialMonth: false },
  { month: '2026-10', housingType: 'all', transactionCount: 50, meanDepositManwon: 90000, isPartialMonth: true },
  { month: '2022-01', housingType: '아파트', transactionCount: 8, meanDepositManwon: null, isPartialMonth: false },
];
test('Plotly monthly traces preserve null gaps, point counts and type comparison without duplicate all', () => {
  const figure = monthlyFigure(monthly, { type: 'all', compareTypes: false });
  assert.deepEqual(figure.data[0].y, [10000, null, 15000, 90000]);
  assert.equal(figure.data[0].connectgaps, false);
  assert.equal(figure.data[0].customdata[0][0], 40);
  assert.match(figure.data[0].hovertemplate, /만원/); assert.match(figure.data[0].hovertemplate, /건/);
  assert.equal(monthlyFigure(monthly, { type: 'all', compareTypes: true }).data.length, 4);
});
test('monthly observations exclude partial and small months and state only observable differences', () => {
  const text = monthlyObservations(monthly, ['all']).join(' ');
  assert.match(text, /2022-01/); assert.match(text, /2022-03/); assert.match(text, /50(?:\.0)?%/);
  assert.ok(!text.includes('90,000')); assert.match(text, /40건/); assert.match(text, /60건/);
  assert.match(monthlyObservations([], ['all']).join(' '), /부족/);
});
test('district figure reports per-point sample sizes and observations ignore small districts', () => {
  const rows = [{ districtCode:'11110', districtName:'종로구', housingType:'all', transactionCount:40, meanDepositManwon:10000 }, { districtCode:'11680', districtName:'강남구', housingType:'all', transactionCount:60, meanDepositManwon:20000 }, { districtCode:'11140', districtName:'중구', housingType:'all', transactionCount:10, meanDepositManwon:90000 }];
  const figure = districtFigure(rows, { type:'all', compareTypes:false });
  assert.equal(figure.data[0].type, 'bar'); assert.match(figure.data[0].hovertemplate, /건/);
  const text = districtObservations(rows, ['all']).join(' ');
  assert.match(text, /강남구/); assert.match(text, /종로구/); assert.ok(!text.includes('중구'));
  assert.match(text, /60건/); assert.match(text, /40건/);
});
