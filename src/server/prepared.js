import { DISTRICTS, HOUSING_TYPES, ANALYSIS_YEARS, ARCHIVE_YEARS, RECEIPT_YEARS } from '../config.js';
import { validDate, validName, comparisonEnd } from '../analysis.js';
import { SOURCE_POLICY, COVERAGE_NOTE } from './summary.js';
import { ServiceError } from './http.js';

export const REGION_LIMIT = 128 * 1024;
export const COMPARISON_LIMIT = 64 * 1024;
export const PREPARED_TYPES = ['all', ...HOUSING_TYPES];
const integer = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const fail = () => { throw new ServiceError('DATA_NOT_READY', 503); };
const require = condition => { if (!condition) fail(); };
export const validVersion = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
export const regionKey = (version, district, dong) => `queries/${version}/regions/${district}/${dong}.json`;
export const comparisonKey = version => `queries/${version}/comparison.json`;

function header(bundle, version) {
  require(validVersion(version) && bundle?.schemaVersion === 1 && bundle.datasetVersion === version);
  require(bundle.meta?.analysisStart === '2022-01-01' && validDate(bundle.meta.analysisEnd) && bundle.meta.analysisEnd >= bundle.meta.analysisStart && bundle.meta.analysisEnd <= '2026-12-31');
}

function metric(row, start, end) {
  require(row && row.periodStart === start && row.periodEnd === end);
  const n = row.transactionCount, a = row.areaPriceCount;
  require(integer(n) && integer(a) && a <= n);
  require((n < 10 || positive(row.meanDepositManwon)) && (a < 10 || positive(row.meanDepositPerM2Manwon)));
  require((row.meanDepositManwon == null || positive(row.meanDepositManwon)) && (row.meanDepositPerM2Manwon == null || positive(row.meanDepositPerM2Manwon)));
  return { periodStart:start, periodEnd:end, transactionCount:n, areaPriceCount:a,
    meanDepositManwon:n >= 10 ? row.meanDepositManwon : null,
    meanDepositPerM2Manwon:a >= 10 ? row.meanDepositPerM2Manwon : null,
    reliability:n >= 30 ? 'sufficient' : n >= 10 ? 'small' : 'suppressed' };
}

function metadata(meta, district) {
  const common = {schemaVersion:2,status:'complete',analysisStart:meta.analysisStart,analysisEnd:meta.analysisEnd,analysisYears:ANALYSIS_YEARS,comparison:'samePeriod',monthlyComparison:'fullAvailablePeriod'};
  if (district === 'all') return {...common,scope:'all',districtCount:25};
  require(typeof meta.snapshotId === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(meta.snapshotId) && integer(meta.sourceRows) && integer(meta.sourceCalls));
  const excludedCounts = {};
  for (const reason of ['archiveOverlap','notJeonse','invalidDate','outsideAnalysisPeriod','invalidDeposit','invalidRegion','unsupportedHousingType','invalidArea']) {
    require(integer(meta.excludedCounts?.[reason])); excludedCounts[reason] = meta.excludedCounts[reason];
  }
  return {...common,snapshotId:meta.snapshotId,archiveFileYears:ARCHIVE_YEARS,apiReceiptYears:RECEIPT_YEARS,sourceRows:meta.sourceRows,sourceCalls:meta.sourceCalls,excludedCounts,
    collectionFinishedAt:typeof meta.collectionFinishedAt === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(meta.collectionFinishedAt) ? meta.collectionFinishedAt : null,
    sourcePolicy:SOURCE_POLICY,coverageNote:COVERAGE_NOTE};
}

function projectRegionBundle(bundle, version, district, dong) {
  header(bundle,version); require(bundle.district === district && bundle.dong === dong);
  const meta = metadata(bundle.meta,district), start = meta.analysisStart, end = meta.analysisEnd;
  require(Array.isArray(bundle.dongs) && bundle.dongs.length <= 100 && (district !== 'all' || bundle.dongs.length === 0));
  const dongs = bundle.dongs.map(row => { require(row && typeof row.code === 'string' && /^\d{5}$/.test(row.code) && validName(row.name)); return {code:row.code,name:row.name}; });
  require(new Set(dongs.map(row=>row.code)).size === dongs.length && (dong === 'all' || dongs.some(row=>row.code === dong)));
  require(Array.isArray(bundle.summaries) && bundle.summaries.length === PREPARED_TYPES.length);
  const seenTypes = new Set();
  const summaries = bundle.summaries.map(summary => {
    require(summary);
    const type = summary.housingType;
    require(PREPARED_TYPES.includes(type) && !seenTypes.has(type)); seenTypes.add(type);
    require(Array.isArray(summary.yearly) && summary.yearly.length <= 5);
    const years = new Set();
    const yearly = summary.yearly.map(row => {
      require(row);
      require(ANALYSIS_YEARS.includes(row.year) && row.year <= Number(end.slice(0,4)) && !years.has(row.year) && row.districtCode === district && row.housingType === type);
      years.add(row.year);
      require(row.yearOverYearPercent === null || (typeof row.yearOverYearPercent === 'number' && Number.isFinite(row.yearOverYearPercent)));
      return {districtCode:district,housingType:type,year:row.year,...metric(row,`${row.year}-01-01`,comparisonEnd(row.year,end)),yearOverYearPercent:null};
    });
    for (const current of yearly) {
      const previous=yearly.find(row=>row.year===current.year-1);
      if (current.transactionCount>=30 && previous?.transactionCount>=30) {
        const change=(current.meanDepositManwon/previous.meanDepositManwon-1)*100;
        require(Number.isFinite(change));current.yearOverYearPercent=change;
      }
    }
    return {housingType:type,overview:metric(summary.overview,start,end),yearly};
  });
  const expectedMonths = (Number(end.slice(0,4))-2022)*12 + Number(end.slice(5,7));
  require(Array.isArray(bundle.monthlySeries) && bundle.monthlySeries.length === expectedMonths * PREPARED_TYPES.length);
  const months = new Set();
  const monthlySeries = bundle.monthlySeries.map(row => {
    require(row);
    require(typeof row.month === 'string' && /^202[2-6]-(?:0[1-9]|1[0-2])$/.test(row.month) && PREPARED_TYPES.includes(row.housingType));
    const key = `${row.month}|${row.housingType}`;
    require(!months.has(key)); months.add(key);
    const first = `${row.month}-01`, last = new Date(Date.UTC(Number(row.month.slice(0,4)),Number(row.month.slice(5,7)),0)).toISOString().slice(0,10);
    require(first >= start && first <= end);
    const monthEnd = last < end ? last : end;
    require(row.isPartialMonth === (monthEnd < last));
    return {month:row.month,housingType:row.housingType,isPartialMonth:monthEnd < last,...metric(row,first,monthEnd)};
  });
  return {schemaVersion:1,datasetVersion:version,district,dong,meta,dongs,monthlySeries,summaries};
}

function projectComparisonBundle(bundle, version) {
  header(bundle,version);
  require(Array.isArray(bundle.rows) && bundle.rows.length === DISTRICTS.length * PREPARED_TYPES.length);
  const seen = new Set(), start = bundle.meta.analysisStart, end = bundle.meta.analysisEnd;
  const rows = bundle.rows.map(row => {
    require(row);
    require(typeof row.districtCode === 'string');
    const district = DISTRICTS.find(item=>item.code === row.districtCode), type = row.housingType, key = `${row.districtCode}|${type}`;
    require(district && PREPARED_TYPES.includes(type) && !seen.has(key)); seen.add(key);
    return {districtCode:district.code,districtName:district.name,housingType:type,...metric(row,start,end)};
  });
  const transactionCount = rows.filter(row=>row.housingType === 'all').reduce((n,row)=>n+row.transactionCount,0);
  require(integer(transactionCount) && bundle.meta.transactionCount === transactionCount);
  return {schemaVersion:1,datasetVersion:version,meta:{analysisStart:start,analysisEnd:end,housingType:'all',transactionCount,districtCount:25},districts:DISTRICTS,rows};
}

// Storage corruption and malformed nested values always share the safe readiness error.
export function validateRegionBundle(...args) {
  try { return projectRegionBundle(...args); } catch { fail(); }
}
export function validateComparisonBundle(...args) {
  try { return projectComparisonBundle(...args); } catch { fail(); }
}

async function readObject(env, key, limit) {
  try {
    require(env.RENT_SNAPSHOTS && validVersion(env.RENT_QUERY_VERSION));
    const text = await env.RENT_SNAPSHOTS.get(key);
    if (text === null) return null;
    require(typeof text === 'string' && text.length <= limit && new TextEncoder().encode(text).byteLength <= limit);
    return JSON.parse(text);
  } catch { fail(); }
}

export async function readPreparedSummary(env, query) {
  // Detailed legacy groups are unavailable on the bounded production path.
  if (query.view !== 'dashboard') throw new ServiceError('INVALID_QUERY',400);
  const version = env.RENT_QUERY_VERSION, dong = query.dong ?? 'all';
  let bundle = await readObject(env,regionKey(version,query.district,dong),REGION_LIMIT);
  if (!bundle && dong !== 'all') {
    const root = await readObject(env,regionKey(version,query.district,'all'),REGION_LIMIT);
    if (root) {
      const valid = validateRegionBundle(root,version,query.district,'all');
      if (!valid.dongs.some(row=>row.code === dong)) throw new ServiceError('INVALID_QUERY',400);
    }
  }
  require(bundle);
  bundle = validateRegionBundle(bundle,version,query.district,dong);
  const selected = bundle.summaries.find(row=>row.housingType === query.type);
  require(selected);
  return {meta:bundle.meta,dongs:bundle.dongs,overview:selected.overview,yearly:selected.yearly,monthlySeries:bundle.monthlySeries};
}

export async function readPreparedComparison(env, type) {
  const bundle = validateComparisonBundle(await readObject(env,comparisonKey(env.RENT_QUERY_VERSION),COMPARISON_LIMIT),env.RENT_QUERY_VERSION);
  const rows = type === 'all' ? bundle.rows : bundle.rows.filter(row=>row.housingType === type);
  const transactionCount = rows.filter(row=>row.housingType === type).reduce((n,row)=>n+row.transactionCount,0);
  require(integer(transactionCount));
  return {meta:{...bundle.meta,housingType:type,transactionCount},districts:bundle.districts,rows};
}
