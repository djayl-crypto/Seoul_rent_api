import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFixture,version,types,summaryReference,regionKey,comparisonKey,preparedStore } from './fixtures/prepared.mjs';
import { onRequestGet as summary } from '../functions/api/summary.js';

test('offline preparation emits bounded query objects whose dashboards exactly match source sums',async()=>{
  const {prepareQueries}=await import('../scripts/prepare-queries.mjs');
  const {env}=sourceFixture(),objects=new Map();
  const manifest=await prepareQueries({env,version,write:async(key,value)=>{objects.set(key,JSON.parse(value));}});
  assert.equal(manifest.objectCount,77); // 25 * (district + two dongs) + city + comparison
  assert.equal(manifest.regionCount,76);
  assert.equal(objects.size,manifest.objectCount);
  assert.ok(objects.has(comparisonKey));
  assert.ok(manifest.maxRegionBytes<=128*1024);assert.ok(manifest.comparisonBytes<=64*1024);
  assert.ok(!JSON.stringify([...objects.values()]).includes('synthetic-private-value'));
  for(const [district,dong] of [['all','all'],['11110','all'],['11110','10100'],['11110','10200']])for(const type of types){
    assert.ok(objects.has(regionKey(district,dong)));
    const store=preparedStore(objects);
    const response=await summary({request:new Request(`https://example.test/api/summary?gu=${district}&dong=${dong}&type=${encodeURIComponent(type)}&view=dashboard`),env:store.env});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),await summaryReference(env,district,dong,type));
  }
});

test('offline preparation rejects incomplete or mixed-period snapshots before writing any bundle',async()=>{
  const {prepareQueries}=await import('../scripts/prepare-queries.mjs');
  for(const mutate of [snapshots=>snapshots.get('11740').analysisEnd='2026-10-15',snapshots=>snapshots.get('11740').status='collecting']){
    const {env,snapshots}=sourceFixture();mutate(snapshots);let writes=0;
    await assert.rejects(prepareQueries({env,version,write:async()=>{writes++;}}));assert.equal(writes,0);
  }
});

test('offline preparation validates version before touching source storage',async()=>{
  const {prepareQueries}=await import('../scripts/prepare-queries.mjs');let reads=0;
  await assert.rejects(prepareQueries({env:{RENT_DATA:{get:async()=>{reads++;}}},version:'../invalid',write:async()=>{}}));
  assert.equal(reads,0);
});
