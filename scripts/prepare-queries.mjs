import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { DISTRICTS } from '../src/config.js';
import { readSnapshot, summarizeSnapshot } from '../src/server/summary.js';
import { readCitySummary } from '../src/server/city.js';
import { readComparison } from '../src/server/comparison.js';
import { PREPARED_TYPES, REGION_LIMIT, COMPARISON_LIMIT, validVersion, regionKey, comparisonKey, validateRegionBundle, validateComparisonBundle } from '../src/server/prepared.js';
import { scanText } from './check-upload.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const check = condition => { if (!condition) throw new Error('Prepared data validation failed'); };

export async function prepareQueries({env,version,write}) {
  check(validVersion(version) && typeof write === 'function');
  const snapshots = new Map();
  let analysisStart, analysisEnd;
  // Complete validation before emitting a version. Never query the source API here.
  for (const {code} of DISTRICTS) {
    const loaded = await readSnapshot(env,code), s = loaded.snapshot;
    analysisStart ??= s.analysisStart; analysisEnd ??= s.analysisEnd;
    check(s.analysisStart === analysisStart && s.analysisEnd === analysisEnd);
    snapshots.set(code,loaded);
  }
  const memoryEnv = {RENT_DATA:{get:async key=>{
    const code = key.match(/\/(\d{5})(?:\/latest)?\.json$/)?.[1], loaded = snapshots.get(code);
    if (!loaded) return null;
    return {json:async()=>key.endsWith('/latest.json') ? {schemaVersion:2,status:'complete',snapshotId:loaded.snapshot.snapshotId} : loaded.snapshot};
  }}};
  let objectCount=0, regionCount=0, totalBytes=0, maxRegionBytes=0, comparisonBytes=0;
  const digest=createHash('sha256');
  async function emit(key,bundle,limit) {
    const value=JSON.stringify(bundle),bytes=Buffer.byteLength(value);
    check(bytes<=limit && scanText(value,key,'prepared-data').length===0);
    await write(key,value); digest.update(key).update('\0').update(value);
    objectCount++;totalBytes+=bytes;return bytes;
  }
  async function emitRegion(district,dong,results) {
    const first=results[0];
    const bundle=validateRegionBundle({schemaVersion:1,datasetVersion:version,district,dong,meta:first.meta,dongs:first.dongs,monthlySeries:first.monthlySeries,
      summaries:results.map((result,i)=>({housingType:PREPARED_TYPES[i],overview:result.overview,yearly:result.yearly}))},version,district,dong);
    // Every selected response must equal the previous calculation, including suppression.
    for(let i=0;i<PREPARED_TYPES.length;i++) {
      const projected={meta:bundle.meta,dongs:bundle.dongs,overview:bundle.summaries[i].overview,yearly:bundle.summaries[i].yearly,monthlySeries:bundle.monthlySeries};
      const expected={meta:results[i].meta,dongs:results[i].dongs,overview:results[i].overview,yearly:results[i].yearly,monthlySeries:first.monthlySeries};
      check(isDeepStrictEqual(projected,expected));
    }
    maxRegionBytes=Math.max(maxRegionBytes,await emit(regionKey(version,district,dong),bundle,REGION_LIMIT));regionCount++;
  }
  for(const {code} of DISTRICTS) {
    const loaded=snapshots.get(code);
    const dongs=[...new Set([...loaded.groups,...loaded.monthly].map(row=>row.dongCode))];
    for(const dong of ['all',...dongs]) {
      const results=PREPARED_TYPES.map((type,i)=>summarizeSnapshot(loaded,{district:code,dong,type,view:i===0?'dashboard':'all'}));
      await emitRegion(code,dong,results);
    }
  }
  await emitRegion('all','all',await Promise.all(PREPARED_TYPES.map(type=>readCitySummary(memoryEnv,{district:'all',dong:'all',type,view:'dashboard'}))));
  const comparison=await readComparison(memoryEnv,'all');
  const bundle=validateComparisonBundle({schemaVersion:1,datasetVersion:version,...comparison},version);
  check(isDeepStrictEqual({meta:bundle.meta,districts:bundle.districts,rows:bundle.rows},comparison));
  comparisonBytes=await emit(comparisonKey(version),bundle,COMPARISON_LIMIT);
  return {schemaVersion:1,version,analysisStart,analysisEnd,objectCount,regionCount,verifiedSelections:regionCount*PREPARED_TYPES.length,totalBytes,maxRegionBytes,comparisonBytes,
    transactionCount:comparison.meta.transactionCount,sha256:digest.digest('hex')};
}

async function cli() {
  const version=process.argv[2];check(validVersion(version) && process.argv.length===3);
  const input=resolve(ROOT,'.check-output','deploy-data');
  check(!(await lstat(input)).isSymbolicLink());
  const objects=new Map();
  for(const {code} of DISTRICTS)for(const suffix of ['pointer','snapshot']) {
    const file=resolve(input,`${code}-${suffix}.json`),stat=await lstat(file);
    check(stat.isFile() && !stat.isSymbolicLink());
    const text=await readFile(file,'utf8');
    const value=JSON.parse(text);
    objects.set(suffix==='pointer'?`districts/${code}/latest.json`:`snapshots/${value.snapshotId}/${code}.json`,value);
  }
  const env={RENT_DATA:{get:async key=>objects.has(key)?{json:async()=>objects.get(key)}:null}};
  const bulk=[];
  const manifest=await prepareQueries({env,version,write:async(key,value)=>{bulk.push({key,value});}});
  const output=resolve(ROOT,'.generated','queries',version);await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'kv-bulk.json'),JSON.stringify(bulk));
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(manifest));
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(()=>{console.error('Query preparation failed. Check completed snapshot inputs and version; no source data or secrets were printed.');process.exitCode=1;});
