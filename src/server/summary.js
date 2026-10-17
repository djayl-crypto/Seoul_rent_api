import { HOUSING_TYPES, ANALYSIS_YEARS, RECEIPT_YEARS, ARCHIVE_YEARS, isDistrict } from '../config.js';
import { validDate, validName, comparisonEnd } from '../analysis.js';
import { ServiceError } from './http.js';

export function parseQuery(url) {
  const parameters = new URL(url).searchParams;
  if ([...parameters.keys()].some(key => !['gu', 'dong', 'type', 'comparison', 'view'].includes(key) || parameters.getAll(key).length !== 1)) throw new ServiceError('INVALID_QUERY', 400);
  const district = parameters.get('gu'), type = parameters.get('type') ?? 'all';
  const dong = parameters.get('dong') ?? 'all', view = parameters.get('view') ?? 'all';
  if ((dong !== 'all' && !/^\d{5}$/.test(dong)) || !['all', 'dashboard'].includes(view)) throw new ServiceError('INVALID_QUERY', 400);
  if ((!isDistrict(district) && district !== 'all') || (district === 'all' && dong !== 'all') || (type !== 'all' && !HOUSING_TYPES.includes(type)) || (parameters.get('comparison') ?? 'samePeriod') !== 'samePeriod') throw new ServiceError('INVALID_QUERY', 400);
  return { district, type, dong, view };
}
const integer = n => Number.isSafeInteger(n) && n >= 0;
const metric = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const notReady = () => new ServiceError('DATA_NOT_READY', 503);

// Roll up private sums before suppressing small samples. Never average group averages.
export function rollup(groups, periodStart, periodEnd) {
  let n = 0, a = 0, sum = 0, areaSum = 0;
  for (const group of groups) {
    if (!integer(group.transactionCount) || !integer(group.areaPriceCount) || group.areaPriceCount > group.transactionCount ||
      !Number.isFinite(group.sumDepositManwon) || group.sumDepositManwon < 0 ||
      !Number.isFinite(group.sumDepositPerM2Manwon) || group.sumDepositPerM2Manwon < 0 ||
      (group.transactionCount > 0 && group.sumDepositManwon === 0) || (group.areaPriceCount > 0 && group.sumDepositPerM2Manwon === 0) ||
      (group.transactionCount === 0 && group.sumDepositManwon !== 0) || (group.areaPriceCount === 0 && group.sumDepositPerM2Manwon !== 0)) throw notReady();
    n += group.transactionCount; a += group.areaPriceCount;
    sum += group.sumDepositManwon; areaSum += group.sumDepositPerM2Manwon;
  }
  if (!integer(n) || !integer(a) || !Number.isFinite(sum) || !Number.isFinite(areaSum)) throw notReady();
  return { periodStart, periodEnd, transactionCount: n, areaPriceCount: a,
    meanDepositManwon: n >= 10 ? sum / n : null, meanDepositPerM2Manwon: a >= 10 ? areaSum / a : null,
    reliability: n >= 30 ? 'sufficient' : n >= 10 ? 'small' : 'suppressed' };
}

function publicGroup(group, district, snapshot, kind = 'annual') {
  const total = kind === 'total', monthly = kind === 'monthly';
  if (group.districtCode !== district || ![...HOUSING_TYPES, ...(total ? ['all'] : [])].includes(group.housingType) || !ANALYSIS_YEARS.includes(group.year) || !integer(group.transactionCount) || !integer(group.areaPriceCount) || group.areaPriceCount > group.transactionCount || !validDate(group.periodStart) || !validDate(group.periodEnd)) throw notReady();
  if (!total && (!/^\d{5}$/.test(group.dongCode) || !validName(group.dongName))) throw notReady();
  const n = group.transactionCount, a = group.areaPriceCount, year = group.year;
  if (year > Number(snapshot.analysisEnd.slice(0, 4)) || group.periodStart > group.periodEnd || group.periodStart < snapshot.analysisStart || group.periodEnd > snapshot.analysisEnd) throw notReady();
  if (!monthly && (group.periodStart !== `${year}-01-01` || group.periodEnd !== comparisonEnd(year, snapshot.analysisEnd))) throw notReady();
  if ((n >= 10 && !metric(group.meanDepositManwon)) || (a >= 10 && !metric(group.meanDepositPerM2Manwon))) throw notReady();
  if (monthly) {
    if (!/^202[2-6]-(?:0[1-9]|1[0-2])$/.test(group.month)) throw notReady();
    const lastDay = new Date(Date.UTC(year, Number(group.month.slice(5)), 0)).toISOString().slice(0, 10);
    const expectedEnd = lastDay < snapshot.analysisEnd ? lastDay : snapshot.analysisEnd;
    if (Number(group.month.slice(0, 4)) !== year || group.periodStart !== `${group.month}-01` || group.periodEnd !== expectedEnd || group.isPartialMonth !== (expectedEnd < lastDay)) throw notReady();
  }
  return {
    districtCode: district, ...(!total ? { dongCode: group.dongCode, dongName: group.dongName } : {}),
    housingType: group.housingType, year, periodStart: group.periodStart, periodEnd: group.periodEnd,
    transactionCount: n, areaPriceCount: a,
    meanDepositManwon: n >= 10 ? group.meanDepositManwon : null,
    meanDepositPerM2Manwon: a >= 10 ? group.meanDepositPerM2Manwon : null,
    yearOverYearPercent: n >= 30 && group.previousTransactionCount >= 30 && typeof group.yearOverYearPercent === 'number' && Number.isFinite(group.yearOverYearPercent) ? group.yearOverYearPercent : null,
    reliability: n >= 30 ? 'sufficient' : n >= 10 ? 'small' : 'suppressed',
    ...(monthly ? { month: group.month, isPartialMonth: group.isPartialMonth === true } : {}),
  };
}
export async function readSnapshot(env, district) {
  if (!env.RENT_DATA) throw notReady();
  const pointer = await env.RENT_DATA.get(`districts/${district}/latest.json`);
  if (!pointer) throw notReady();
  const manifest = await pointer.json();
  if (manifest.schemaVersion !== 2 || manifest.status !== 'complete' || !/^[a-zA-Z0-9_-]{1,80}$/.test(manifest.snapshotId ?? '')) throw notReady();
  const object = await env.RENT_DATA.get(`snapshots/${manifest.snapshotId}/${district}.json`);
  if (!object) throw notReady();
  const snapshot = await object.json();
  if (snapshot.schemaVersion !== 2 || snapshot.status !== 'complete' || snapshot.snapshotId !== manifest.snapshotId || snapshot.analysisStart !== '2022-01-01' || !validDate(snapshot.analysisEnd) || snapshot.analysisEnd > '2026-12-31' || snapshot.analysisStart > snapshot.analysisEnd || !integer(snapshot.sourceRows) || !integer(snapshot.sourceCalls) || !Array.isArray(snapshot.groups) || !Array.isArray(snapshot.monthly) || !Array.isArray(snapshot.yearly)) throw notReady();
  const groups = snapshot.groups.map(group => publicGroup(group, district, snapshot));
  const monthly = snapshot.monthly.map(group => publicGroup(group, district, snapshot, 'monthly'));
  return { snapshot, groups, monthly };
}

export function monthlySeries(snapshot, dong) {
  const buckets = new Map();
  for (const group of snapshot.monthly) {
    if (dong !== 'all' && group.dongCode !== dong) continue;
    for (const type of ['all', group.housingType]) {
      const key = `${group.month}|${type}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(group);
    }
  }
  const result = [];
  for (let year = 2022; year <= Number(snapshot.analysisEnd.slice(0, 4)); year++) {
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`, start = `${month}-01`;
      if (start > snapshot.analysisEnd) break;
      const lastDay = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
      const end = lastDay < snapshot.analysisEnd ? lastDay : snapshot.analysisEnd;
      for (const type of ['all', ...HOUSING_TYPES]) result.push({ month, housingType: type, isPartialMonth: end < lastDay, ...rollup(buckets.get(`${month}|${type}`) ?? [], start, end) });
    }
  }
  return result;
}

export async function readSummary(env, query) {
  const { snapshot, groups, monthly } = await readSnapshot(env, query.district);
  const dong = query.dong ?? 'all';
  const filter = group => (query.type === 'all' || group.housingType === query.type) && (dong === 'all' || group.dongCode === dong);
  const dongs = [...new Map([...groups, ...monthly].map(group => [group.dongCode, { code: group.dongCode, name: group.dongName }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.code.localeCompare(b.code));
  if (dong !== 'all' && !dongs.some(item => item.code === dong)) throw new ServiceError('INVALID_QUERY', 400);
  const selected = snapshot.groups.filter(filter), selectedMonthly = snapshot.monthly.filter(filter);
  const yearly = ANALYSIS_YEARS.filter(year => selected.some(group => group.year === year)).map(year => ({
    districtCode: query.district, housingType: query.type, year,
    ...rollup(selected.filter(group => group.year === year), `${year}-01-01`, comparisonEnd(year, snapshot.analysisEnd)),
    yearOverYearPercent: null,
  }));
  for (const current of yearly) {
    const previous = yearly.find(group => group.year === current.year - 1);
    if (current.transactionCount >= 30 && previous?.transactionCount >= 30) current.yearOverYearPercent = (current.meanDepositManwon / previous.meanDepositManwon - 1) * 100;
  }
  const exclusions = {};
  for (const reason of ['archiveOverlap', 'notJeonse', 'invalidDate', 'outsideAnalysisPeriod', 'invalidDeposit', 'invalidRegion', 'unsupportedHousingType', 'invalidArea']) {
    const value = snapshot.excludedCounts?.[reason] ?? 0;
    if (!integer(value)) throw notReady();
    exclusions[reason] = value;
  }
  // Explicit projection only: sums, raw fields, file paths and arbitrary stored metadata stay private.
  return {
    meta: {
      schemaVersion: 2, snapshotId: snapshot.snapshotId, status: 'complete',
      analysisStart: snapshot.analysisStart, analysisEnd: snapshot.analysisEnd, analysisYears: ANALYSIS_YEARS,
      archiveFileYears: ARCHIVE_YEARS, apiReceiptYears: RECEIPT_YEARS, comparison: 'samePeriod', monthlyComparison: 'fullAvailablePeriod',
      sourceRows: snapshot.sourceRows, sourceCalls: snapshot.sourceCalls, excludedCounts: exclusions,
      collectionFinishedAt: typeof snapshot.collectionFinishedAt === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(snapshot.collectionFinishedAt) ? snapshot.collectionFinishedAt : null,
      sourcePolicy: '2022 계약은 2022 파일 우선, 2023 파일의 2022 계약 제외, 접수연도 2024~2026은 API 추가',
      coverageNote: '자료는 제공된 파일과 최근 3개 접수연도의 API 범위입니다. 신고 지연·정정 및 파일 추출 시점 차이로 전체 계약을 보장하지 않습니다.',
    },
    dongs,
    overview: rollup(selectedMonthly, snapshot.analysisStart, snapshot.analysisEnd),
    yearly,
    ...(query.view === 'dashboard' ? { monthlySeries: monthlySeries(snapshot, dong) } : {}),
    ...(query.view === 'dashboard' ? {} : { groups: groups.filter(filter), monthly: monthly.filter(filter) }),
  };
}
