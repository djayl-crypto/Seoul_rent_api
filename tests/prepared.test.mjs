import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as summary } from '../functions/api/summary.js';
import { onRequestGet as comparison } from '../functions/api/comparison.js';
import { readComparison } from '../src/server/comparison.js';
import { sourceFixture,types,version,summaryReference,regionFixture,comparisonFixture,preparedStore,regionKey,comparisonKey } from './fixtures/prepared.mjs';

const request=(handler,path,env)=>handler({request:new Request('https://example.test'+path),env});

test('prepared district, dong and city dashboards preserve exact weighted results with one bounded KV read',async()=>{
  const {env}=sourceFixture();
  for(const [district,dong] of [['11110','all'],['11110','10100'],['11110','10200'],['all','all']]) {
    const bundle=await regionFixture(env,district,dong);
    assert.ok(Buffer.byteLength(JSON.stringify(bundle))<=128*1024);
    for(const type of types) {
      const store=preparedStore(new Map([[regionKey(district,dong),bundle]]));
      const response=await request(summary,`/api/summary?gu=${district}&dong=${dong}&type=${encodeURIComponent(type)}&view=dashboard`,store.env);
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),await summaryReference(env,district,dong,type));
      assert.deepEqual(store.reads,[regionKey(district,dong)]);
    }
  }
});

test('prepared comparison preserves all housing selections with one small read',async()=>{
  const {env}=sourceFixture(),bundle=await comparisonFixture(env);
  assert.ok(Buffer.byteLength(JSON.stringify(bundle))<=64*1024);
  for(const type of types) {
    const store=preparedStore(new Map([[comparisonKey,bundle]]));
    const response=await request(comparison,`/api/comparison?type=${encodeURIComponent(type)}`,store.env);
    assert.equal(response.status,200);assert.deepEqual(await response.json(),await readComparison(env,type));
    assert.deepEqual(store.reads,[comparisonKey]);
  }
});

test('prepared readers project unknown properties and suppress small samples',async()=>{
  const {env}=sourceFixture(),bundle=await regionFixture(env,'11110','10200');
  bundle.private='synthetic-private-value';bundle.meta.private='synthetic-private-value';
  bundle.summaries[0].overview.private='synthetic-private-value';
  bundle.summaries[0].overview.meanDepositManwon=123456;
  const store=preparedStore(new Map([[regionKey('11110','10200'),bundle]]));
  const response=await request(summary,'/api/summary?gu=11110&dong=10200&view=dashboard',store.env);
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.overview.meanDepositManwon,null);assert.ok(!JSON.stringify(body).includes('synthetic-private-value'));
});

test('invalid prepared objects fail safely without loading raw snapshots',async()=>{
  const {env}=sourceFixture(),base=await regionFixture(env);
  const variants=[null,'{synthetic-private-value', {...base,datasetVersion:'wrong-version'}, {...base,private:'x'.repeat(128*1024)}];
  for(const alter of [b=>{b.monthlySeries[0].transactionCount=-1;},b=>{b.monthlySeries[0].meanDepositManwon=-1;},b=>{b.summaries[0].yearly[0].periodEnd='2027-01-01';},b=>{b.summaries.pop();}]) { const b=structuredClone(base);alter(b);variants.push(b); }
  for(const value of variants) {
    const reads=[];const response=await request(summary,'/api/summary?gu=11110&view=dashboard',{RENT_QUERY_VERSION:version,RENT_SNAPSHOTS:{get:async key=>{reads.push(key);return value===null?null:typeof value==='string'?value:JSON.stringify(value);}}});
    assert.equal(response.status,503);assert.ok(!(await response.text()).includes('synthetic-private-value'));
    assert.deepEqual(reads,[regionKey('11110')]);
  }
});

test('prepared mode rejects unknown conditions before storage and never falls back to expensive detailed reads',async()=>{
  for(const path of ['/api/summary?gu=all&dong=10100&view=dashboard','/api/summary?gu=11110&view=all','/api/summary?gu=11110&view=dashboard&type=unknown','/api/comparison?type=all&type=all']) {
    const store=preparedStore(new Map());
    const response=await request(path.includes('comparison')?comparison:summary,path,store.env);
    assert.equal(response.status,400);assert.deepEqual(store.reads,[]);
  }
});

test('unknown dongs return 400 while missing known dong bundles return a safe 503 using at most two bounded reads',async()=>{
  const {env}=sourceFixture(),root=await regionFixture(env);
  for(const [dong,status] of [['99999',400],['10100',503]]) {
    const store=preparedStore(new Map([[regionKey('11110'),root]]));
    const response=await request(summary,`/api/summary?gu=11110&dong=${dong}&view=dashboard`,store.env);
    assert.equal(response.status,status);assert.deepEqual(store.reads,[regionKey('11110',dong),regionKey('11110')]);
  }
});

test('null nested rows and invalid comparison bundles return safe preparation errors',async()=>{
  const {env}=sourceFixture();
  for(const property of ['dongs','summaries','monthlySeries']) {
    const bundle=await regionFixture(env);bundle[property][0]=null;
    const store=preparedStore(new Map([[regionKey('11110'),bundle]]));
    const response=await request(summary,'/api/summary?gu=11110&view=dashboard',store.env);
    assert.equal(response.status,503);assert.equal((await response.json()).error.code,'DATA_NOT_READY');
  }
  for(const mutate of [b=>{b.rows[0]=null;},b=>{b.rows[0].transactionCount=-1;},b=>{b.rows[1]=b.rows[0];},b=>{b.meta.analysisEnd='2026-10-15';}]) {
    const bundle=await comparisonFixture(env);mutate(bundle);
    const store=preparedStore(new Map([[comparisonKey,bundle]]));
    const response=await request(comparison,'/api/comparison?type=all',store.env);
    assert.equal(response.status,503);assert.equal((await response.json()).error.code,'DATA_NOT_READY');
    assert.deepEqual(store.reads,[comparisonKey]);
  }
});

test('prepared validation rejects non-scalar fields and null annual rows with 503',async()=>{
  const {env}=sourceFixture();
  for(const alter of [b=>{b.monthlySeries[0].month=[b.monthlySeries[0].month];},b=>{b.summaries[0].yearly[0]=null;}]) {
    const bundle=await regionFixture(env);alter(bundle);
    const store=preparedStore(new Map([[regionKey('11110'),bundle]]));
    const response=await request(summary,'/api/summary?gu=11110&view=dashboard',store.env);
    assert.equal(response.status,503);assert.equal((await response.json()).error.code,'DATA_NOT_READY');
  }
  const bundle=await comparisonFixture(env);bundle.rows[0].districtCode={toString:null};
  const store=preparedStore(new Map([[comparisonKey,bundle]]));
  const response=await request(comparison,'/api/comparison?type=all',store.env);
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'DATA_NOT_READY');
});

test('annual change requires both yearly samples and is derived from validated means',async()=>{
  const {env}=sourceFixture();
  for(const previousCount of [29,30]) {
    const bundle=await regionFixture(env),[previous,current]=bundle.summaries[0].yearly;
    previous.transactionCount=previous.areaPriceCount=previousCount;previous.yearOverYearPercent=42;
    current.transactionCount=current.areaPriceCount=30;current.meanDepositManwon=20000;current.meanDepositPerM2Manwon=400;current.yearOverYearPercent=42;
    const store=preparedStore(new Map([[regionKey('11110'),bundle]]));
    const response=await request(summary,'/api/summary?gu=11110&view=dashboard',store.env);
    assert.equal(response.status,200);const body=await response.json();
    assert.equal(body.yearly[0].yearOverYearPercent,null);
    assert.equal(body.yearly[1].yearOverYearPercent,previousCount>=30?(current.meanDepositManwon/previous.meanDepositManwon-1)*100:null);
  }
});
