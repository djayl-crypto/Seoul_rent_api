import { HOUSING_TYPES, isDistrict, ANALYSIS_YEARS } from './config.js';

export function analysisPeriod(now = new Date()) {
  const yesterday = new Date(now.getTime() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
  const end = yesterday > '2026-12-31' ? '2026-12-31' : yesterday;
  return { start: '2022-01-01', end, comparisonMonthDay: end.slice(5) };
}
export function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}
export function comparisonEnd(year, end) {
  const month = Number(end.slice(5, 7));
  const day = Math.min(Number(end.slice(8)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function numeric(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text.replaceAll(',', ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
export const validName = value => typeof value === 'string' && /^[가-힣0-9·. ()-]{1,40}$/.test(value);
export function createAccumulator(period) {
  return { period: { start: period.start, end: period.end }, sourceRows: 0, includedCount: 0, allIncludedCount: 0, excludedCounts: {}, groups: {}, monthly: {} };
}
function baseGroup(row, year) {
  return { districtCode: row.CGG_CD, dongCode: row.STDG_CD, dongName: row.STDG_NM, housingType: row.BLDG_USG, year, transactionCount: 0, sumDepositManwon: 0, areaPriceCount: 0, sumDepositPerM2Manwon: 0 };
}
function add(group, deposit, area) {
  group.transactionCount++; group.sumDepositManwon += deposit;
  if (area !== null) { group.areaPriceCount++; group.sumDepositPerM2Manwon += deposit / area; }
}
export function addRecords(state, rows) {
  const exclude = reason => { state.excludedCounts[reason] = (state.excludedCounts[reason] ?? 0) + 1; };
  for (const row of rows) {
    state.sourceRows++;
    if (String(row.RENT_SE ?? '').trim() !== '전세') { exclude('notJeonse'); continue; }
    const raw = String(row.CTRT_DAY ?? '');
    const date = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}` : '';
    if (!validDate(date)) { exclude('invalidDate'); continue; }
    if (date < state.period.start || date > state.period.end) { exclude('outsideAnalysisPeriod'); continue; }
    const deposit = numeric(row.GRFE);
    if (deposit === null) { exclude('invalidDeposit'); continue; }
    if (!isDistrict(row.CGG_CD) || !/^\d{5}$/.test(row.STDG_CD) || !validName(row.STDG_NM)) { exclude('invalidRegion'); continue; }
    if (!HOUSING_TYPES.includes(row.BLDG_USG)) { exclude('unsupportedHousingType'); continue; }
    const area = numeric(row.RENT_AREA);
    if (area !== null && !Number.isFinite(deposit / area)) { exclude('invalidArea'); continue; }
    const year = Number(date.slice(0, 4));
    const key = `${row.CGG_CD}:${row.STDG_CD}:${row.BLDG_USG}:${year}`;
    const month = date.slice(0, 7), monthKey = `${key}:${month}`;
    const monthLast = new Date(Date.UTC(year, Number(month.slice(5)), 0)).toISOString().slice(0, 10);
    state.monthly[monthKey] ??= { ...baseGroup(row, year), month, periodStart: `${month}-01`, periodEnd: monthLast < state.period.end ? monthLast : state.period.end, isPartialMonth: monthLast > state.period.end };
    add(state.monthly[monthKey], deposit, area);
    state.allIncludedCount++;
    if (date > comparisonEnd(year, state.period.end)) continue;
    state.groups[key] ??= { ...baseGroup(row, year), periodStart: `${year}-01-01`, periodEnd: comparisonEnd(year, state.period.end) };
    add(state.groups[key], deposit, area);
    state.includedCount++;
  }
  return state;
}
const sums = ['transactionCount', 'sumDepositManwon', 'areaPriceCount', 'sumDepositPerM2Manwon'];
export function mergeAccumulators(target, source) {
  if (target.period.start !== source.period.start || target.period.end !== source.period.end) throw new Error('PERIOD_MISMATCH');
  for (const counter of ['sourceRows', 'includedCount', 'allIncludedCount']) target[counter] += source[counter];
  for (const [reason, count] of Object.entries(source.excludedCounts)) target.excludedCounts[reason] = (target.excludedCounts[reason] ?? 0) + count;
  for (const kind of ['groups', 'monthly']) for (const [key, group] of Object.entries(source[kind])) {
    if (!target[kind][key]) target[kind][key] = { ...group };
    else for (const field of sums) target[kind][key][field] += group[field];
  }
  return target;
}
function finish(group, previous) {
  const n = group.transactionCount, a = group.areaPriceCount;
  return { ...group,
    meanDepositManwon: n >= 10 ? group.sumDepositManwon / n : null,
    meanDepositPerM2Manwon: a >= 10 ? group.sumDepositPerM2Manwon / a : null,
    reliability: n >= 30 ? 'sufficient' : n >= 10 ? 'small' : 'suppressed',
    previousTransactionCount: previous?.transactionCount ?? 0,
    yearOverYearPercent: n >= 30 && previous?.transactionCount >= 30 ? (group.sumDepositManwon / n / (previous.sumDepositManwon / previous.transactionCount) - 1) * 100 : null,
  };
}
export function finalizeAccumulator(state) {
  const yearly = {};
  for (const group of Object.values(state.groups)) for (const type of [group.housingType, 'all']) {
    const key = `${group.year}:${type}`;
    yearly[key] ??= { districtCode: group.districtCode, housingType: type, year: group.year, periodStart: group.periodStart, periodEnd: group.periodEnd, ...Object.fromEntries(sums.map(field => [field, 0])) };
    for (const field of sums) yearly[key][field] += group[field];
  }
  return {
    sourceRows: state.sourceRows, includedCount: state.includedCount, allIncludedCount: state.allIncludedCount, excludedCounts: state.excludedCounts,
    groups: Object.entries(state.groups).map(([key, group]) => finish(group, state.groups[key.replace(/:\d{4}$/, `:${group.year - 1}`)])),
    monthly: Object.values(state.monthly).map(group => finish(group)),
    yearly: Object.entries(yearly).map(([key, group]) => finish(group, yearly[key.replace(/^\d{4}:/, `${group.year - 1}:`)])),
  };
}
export function aggregate(records, period) { return finalizeAccumulator(addRecords(createAccumulator(period), records)); }

export function validateAccumulator(state, district, period) {
  if (!state || state.period?.start !== period.start || state.period?.end !== period.end) throw new Error('INVALID_ARCHIVE');
  for (const count of ['sourceRows', 'includedCount', 'allIncludedCount']) if (!Number.isSafeInteger(state[count]) || state[count] < 0) throw new Error('INVALID_ARCHIVE');
  const reasons = ['archiveOverlap', 'notJeonse', 'invalidDate', 'outsideAnalysisPeriod', 'invalidDeposit', 'invalidRegion', 'unsupportedHousingType', 'invalidArea'];
  if (!state.excludedCounts || Object.entries(state.excludedCounts).some(([reason, count]) => !reasons.includes(reason) || !Number.isSafeInteger(count) || count < 0)) throw new Error('INVALID_ARCHIVE');
  if (Object.values(state.excludedCounts).reduce((a, b) => a + b, 0) + state.allIncludedCount !== state.sourceRows) throw new Error('INVALID_ARCHIVE');
  for (const kind of ['groups', 'monthly']) {
    if (!state[kind] || typeof state[kind] !== 'object' || Array.isArray(state[kind])) throw new Error('INVALID_ARCHIVE');
    let count = 0;
    for (const [key, g] of Object.entries(state[kind])) {
      if (g.districtCode !== district || !/^\d{5}$/.test(g.dongCode) || !validName(g.dongName) || !HOUSING_TYPES.includes(g.housingType) || !ANALYSIS_YEARS.includes(g.year)) throw new Error('INVALID_ARCHIVE');
      const base = `${district}:${g.dongCode}:${g.housingType}:${g.year}`;
      if (key !== (kind === 'groups' ? base : `${base}:${g.month}`)) throw new Error('INVALID_ARCHIVE');
      for (const field of sums) if (typeof g[field] !== 'number' || !Number.isFinite(g[field]) || g[field] < 0) throw new Error('INVALID_ARCHIVE');
      if (!Number.isSafeInteger(g.transactionCount) || !Number.isSafeInteger(g.areaPriceCount) || g.transactionCount < 1 || g.areaPriceCount > g.transactionCount || g.sumDepositManwon <= 0 || (g.areaPriceCount === 0 ? g.sumDepositPerM2Manwon !== 0 : g.sumDepositPerM2Manwon <= 0)) throw new Error('INVALID_ARCHIVE');
      if (!validDate(g.periodStart) || !validDate(g.periodEnd) || g.periodStart > g.periodEnd || g.periodStart < period.start || g.periodEnd > period.end) throw new Error('INVALID_ARCHIVE');
      if (kind === 'groups' && (g.periodStart !== `${g.year}-01-01` || g.periodEnd !== comparisonEnd(g.year, period.end))) throw new Error('INVALID_ARCHIVE');
      if (kind === 'monthly') {
        if (!/^202[2-6]-(?:0[1-9]|1[0-2])$/.test(g.month)) throw new Error('INVALID_ARCHIVE');
        const last = new Date(Date.UTC(g.year, Number(g.month.slice(5)), 0)).toISOString().slice(0, 10);
        if (Number(g.month.slice(0, 4)) !== g.year || g.periodStart !== `${g.month}-01` || g.periodEnd !== (last < period.end ? last : period.end) || g.isPartialMonth !== (last > period.end)) throw new Error('INVALID_ARCHIVE');
      }
      count += g.transactionCount;
    }
    if (count !== state[kind === 'groups' ? 'includedCount' : 'allIncludedCount']) throw new Error('INVALID_ARCHIVE');
  }
  return state;
}
