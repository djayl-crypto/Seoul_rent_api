import { DISTRICTS, ANALYSIS_YEARS } from '../config.js';
import { comparisonEnd } from '../analysis.js';
import { readSnapshot, rollup, monthlySeries } from './summary.js';
import { ServiceError } from './http.js';

function addGroups(target, groups, monthly) {
  for (const group of groups) {
    const key = `${monthly ? group.month : group.year}|${group.housingType}`;
    if (!target.has(key)) target.set(key, { ...group, transactionCount: 0, areaPriceCount: 0, sumDepositManwon: 0, sumDepositPerM2Manwon: 0 });
    const total = target.get(key);
    for (const field of ['transactionCount', 'areaPriceCount', 'sumDepositManwon', 'sumDepositPerM2Manwon']) total[field] += group[field];
  }
}

export async function readCitySummary(env, query) {
  const groups = new Map(), months = new Map();
  let start, end;
  for (let i = 0; i < DISTRICTS.length; i += 3) {
    const batch = await Promise.all(DISTRICTS.slice(i, i + 3).map(district => readSnapshot(env, district.code)));
    for (const { snapshot } of batch) {
      start ??= snapshot.analysisStart; end ??= snapshot.analysisEnd;
      if (snapshot.analysisStart !== start || snapshot.analysisEnd !== end) throw new ServiceError('DATA_NOT_READY', 503);
      // Validate additive data before merging; private sums never enter the public response.
      rollup(snapshot.groups, start, end); rollup(snapshot.monthly, start, end);
      addGroups(groups, snapshot.groups, false); addGroups(months, snapshot.monthly, true);
    }
  }
  const snapshot = { analysisStart: start, analysisEnd: end, monthly: [...months.values()] };
  const filter = group => query.type === 'all' || group.housingType === query.type;
  const selected = [...groups.values()].filter(filter);
  const yearly = ANALYSIS_YEARS.filter(year => selected.some(group => group.year === year)).map(year => ({
    districtCode: 'all', housingType: query.type, year,
    ...rollup(selected.filter(group => group.year === year), `${year}-01-01`, comparisonEnd(year, end)), yearOverYearPercent: null,
  }));
  for (const current of yearly) {
    const previous = yearly.find(row => row.year === current.year - 1);
    if (current.transactionCount >= 30 && previous?.transactionCount >= 30) current.yearOverYearPercent = (current.meanDepositManwon / previous.meanDepositManwon - 1) * 100;
  }
  return {
    meta: { schemaVersion: 2, status: 'complete', scope: 'all', districtCount: 25, analysisStart: start, analysisEnd: end, analysisYears: ANALYSIS_YEARS, comparison: 'samePeriod', monthlyComparison: 'fullAvailablePeriod' },
    dongs: [], overview: rollup(snapshot.monthly.filter(filter), start, end), yearly,
    monthlySeries: monthlySeries(snapshot, 'all'),
  };
}
