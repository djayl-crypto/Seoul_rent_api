import test from 'node:test';
import assert from 'node:assert/strict';
import { regionMonthlyFigure, annualRegionFigure, annualRegionRows, regionDifference } from '../public/region-model.js';
const regions = [
  { label:'A · 종로구 청운동', data: { overview: { meanDepositManwon: 10000, transactionCount: 50 }, yearly:[{year:2022,meanDepositManwon:10000,transactionCount:40}], monthlySeries:[{month:'2022-01',housingType:'all',meanDepositManwon:10000,transactionCount:40},{month:'2022-02',housingType:'all',meanDepositManwon:null,transactionCount:3}] } },
  { label:'B · 강남구 역삼동', data: { overview: { meanDepositManwon: 20000, transactionCount: 60 }, yearly:[{year:2022,meanDepositManwon:20000,transactionCount:50}], monthlySeries:[{month:'2022-01',housingType:'all',meanDepositManwon:20000,transactionCount:50},{month:'2022-02',housingType:'all',meanDepositManwon:null,transactionCount:0}] } },
];
test('paired Plotly traces retain each region mean, count and missing-month gap without combining them', () => {
  const figure = regionMonthlyFigure(regions, { type:'all', compareTypes:false });
  assert.equal(figure.data.length, 2); assert.deepEqual(figure.data[0].y,[10000,null]); assert.deepEqual(figure.data[1].y,[20000,null]);
  assert.equal(figure.data[0].customdata[0][0],40); assert.equal(figure.data[1].customdata[0][0],50);
  assert.match(figure.data[0].name,/청운동/); assert.match(figure.data[1].name,/역삼동/);
  assert.equal(figure.data[1].connectgaps,false);
  assert.equal(regionMonthlyFigure(regions, { type:'all', compareTypes:true }).data.length,8);
});
test('annual comparison aligns years and retains nulls and separate transaction counts', () => {
  const figure = annualRegionFigure(regions);
  assert.equal(figure.data.length,2); assert.deepEqual(figure.data[0].y,[10000,null,null,null,null]);
  assert.deepEqual(figure.data[1].y,[20000,null,null,null,null]);
  assert.equal(figure.data[1].customdata[0],50);
  assert.equal(annualRegionRows(regions).length,5);
  assert.equal(annualRegionRows(regions)[0].regions[1].transactionCount,50);
});
test('mean difference is a separate comparison and is withheld when an average is suppressed', () => {
  const text = regionDifference(regions);
  assert.match(text,/10,000만원/); assert.match(text,/50건/); assert.match(text,/60건/);
  assert.ok(!text.includes('110건'));
  const small = [{ ...regions[0], data: { overview: { meanDepositManwon:null, transactionCount:3 } } },regions[1]];
  assert.match(regionDifference(small),/표본 부족/);
});
