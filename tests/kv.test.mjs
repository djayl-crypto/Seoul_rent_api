import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as summary } from '../functions/api/summary.js';
import { onRequestGet as comparison } from '../functions/api/comparison.js';
import { syncAction } from '../src/server/sync.js';

function storage() {
  const get=async key=>{
    const district=key.match(/\/(\d{5})(?:\/latest)?\.json$/)?.[1];
    if(key.endsWith('latest.json'))return {schemaVersion:2,status:'complete',snapshotId:'synthetic-kv-snapshot'};
    const group={districtCode:district,dongCode:'10100',dongName:'청운동',housingType:'아파트',year:2022,transactionCount:30,areaPriceCount:30,sumDepositManwon:900000,sumDepositPerM2Manwon:18000,meanDepositManwon:30000,meanDepositPerM2Manwon:600,periodStart:'2022-01-01',periodEnd:'2022-10-16'};
    return {schemaVersion:2,status:'complete',snapshotId:'synthetic-kv-snapshot',analysisStart:'2022-01-01',analysisEnd:'2026-10-16',sourceRows:30,sourceCalls:1,excludedCounts:{},groups:[group],monthly:[{...group,month:'2022-01',periodEnd:'2022-01-31',isPartialMonth:false}],yearly:[],unexpected:'synthetic-private-value'};
  };
  return {r2:{get:async key=>({json:async()=>get(key)})},kv:{get:async key=>JSON.stringify(await get(key))}};
}
const request=(handler,path,env)=>handler({request:new Request('https://example.test'+path),env});

test('read-only KV preserves district and city responses including exact private-sum aggregation',async()=>{
  const {r2,kv}=storage();
  for(const path of ['/api/summary?gu=11110&view=dashboard','/api/summary?gu=11110&dong=10100','/api/summary?gu=all&view=dashboard']){
    const expected=await request(summary,path,{RENT_DATA:r2});
    const actual=await request(summary,path,{RENT_SNAPSHOTS:kv});
    assert.equal(actual.status,200);assert.deepEqual(await actual.json(),await expected.json());
  }
  const result=await request(comparison,'/api/comparison?type=all',{RENT_SNAPSHOTS:kv});
  assert.equal(result.status,200);const body=await result.json();
  assert.equal(body.meta.transactionCount,750);assert.equal(body.rows.length,125);
  assert.ok(!JSON.stringify(body).includes('synthetic-private-value'));
});

test('missing, malformed and mixed-period KV snapshots never expose raw storage values',async()=>{
  for(const get of [async()=>null,async()=>'{synthetic-private-value',async key=>{
    const value=JSON.parse(await storage().kv.get(key));
    if(key.startsWith('snapshots/')&&key.includes('/11200.json'))value.analysisEnd='2026-10-15';
    return JSON.stringify(value);
  }]){
    const response=await request(summary,'/api/summary?gu=all&view=dashboard',{RENT_SNAPSHOTS:{get}});
    assert.ok(response.status>=500);assert.ok(!(await response.text()).includes('synthetic-private-value'));
  }
});

test('KV storage never enables the R2 collection state machine or writes',async()=>{
  let writes=0;
  const kv={...storage().kv,put:async()=>{writes++;}};
  await assert.rejects(syncAction({RENT_SNAPSHOTS:kv,SEOUL_API_KEY:'synthetic-source-key'},{action:'status',district:'11110'}),error=>error.code==='STORAGE_UNAVAILABLE');
  assert.equal(writes,0);
});
