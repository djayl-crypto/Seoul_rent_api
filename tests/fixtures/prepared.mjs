import { DISTRICTS, HOUSING_TYPES } from '../../src/config.js';
import { readSummary } from '../../src/server/summary.js';
import { readCitySummary } from '../../src/server/city.js';
import { readComparison } from '../../src/server/comparison.js';

export const version = 'synthetic-prepared-v1';
export const types = ['all', ...HOUSING_TYPES];
export function sourceFixture() {
  const snapshots = new Map(DISTRICTS.map(({code}, i) => {
    const groups = [
      {dongCode:'10100', dongName:'청운동', housingType:HOUSING_TYPES[0], year:2022, transactionCount:30, price:30000+i},
      {dongCode:'10200', dongName:'신교동', housingType:HOUSING_TYPES[0], year:2022, transactionCount:3, price:90000+i},
      {dongCode:'10100', dongName:'청운동', housingType:HOUSING_TYPES[1], year:2023, transactionCount:8, price:20000+i},
    ].map(row => ({...row, districtCode:code, areaPriceCount:row.transactionCount, sumDepositManwon:row.price*row.transactionCount, sumDepositPerM2Manwon:row.price*row.transactionCount/50,
      meanDepositManwon:row.price, meanDepositPerM2Manwon:row.price/50, periodStart:`${row.year}-01-01`, periodEnd:`${row.year}-10-16` }));
    return [code, {schemaVersion:2,status:'complete',snapshotId:'synthetic-source',analysisStart:'2022-01-01',analysisEnd:'2026-10-16',sourceRows:41,sourceCalls:1,excludedCounts:{},groups,
      monthly:groups.map(row=>({...row,month:`${row.year}-01`,periodEnd:`${row.year}-01-31`,isPartialMonth:false})),yearly:[],unexpected:'synthetic-private-value'}];
  }));
  const env = {RENT_DATA:{get:async key=>{
    const district=key.match(/\/(\d{5})(?:\/latest)?\.json$/)?.[1];
    if(key.endsWith('/latest.json')) return {json:async()=>({schemaVersion:2,status:'complete',snapshotId:'synthetic-source'})};
    const snapshot=snapshots.get(district); return snapshot ? {json:async()=>snapshot} : null;
  }}};
  return {env,snapshots};
}

export async function summaryReference(env, district, dong, type) {
  const query={district,dong,type,view:'dashboard'};
  return district==='all' ? readCitySummary(env,query) : readSummary(env,query);
}

export async function regionFixture(env,district='11110',dong='all') {
  const results=await Promise.all(types.map(type=>summaryReference(env,district,dong,type)));
  const {meta,dongs,monthlySeries}=results[0];
  return {schemaVersion:1,datasetVersion:version,district,dong,meta,dongs,monthlySeries,
    summaries:results.map((result,i)=>({housingType:types[i],overview:result.overview,yearly:result.yearly}))};
}

export async function comparisonFixture(env) {
  return {schemaVersion:1,datasetVersion:version,...await readComparison(env,'all')};
}

export function preparedStore(objects) {
  const reads=[];
  return {reads,env:{RENT_QUERY_VERSION:version,RENT_SNAPSHOTS:{get:async key=>{reads.push(key);return objects.has(key)?JSON.stringify(objects.get(key)):null;}}}};
}
export const regionKey=(district,dong='all')=>`queries/${version}/regions/${district}/${dong}.json`;
export const comparisonKey=`queries/${version}/comparison.json`;
