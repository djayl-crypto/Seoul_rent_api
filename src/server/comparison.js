import { DISTRICTS, HOUSING_TYPES } from '../config.js';
import { readSnapshot, rollup } from './summary.js';
import { ServiceError } from './http.js';

export function parseComparisonQuery(url) {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some(key => key !== 'type' || params.getAll(key).length !== 1)) throw new ServiceError('INVALID_QUERY', 400);
  const type = params.get('type') ?? 'all';
  if (type !== 'all' && !HOUSING_TYPES.includes(type)) throw new ServiceError('INVALID_QUERY', 400);
  return type;
}

export async function readComparison(env, type) {
  const rows = [], periods = [];
  // At most three concurrent private reads. Never call or initiate source collection here.
  for (let i = 0; i < DISTRICTS.length; i += 3) {
    const batch = await Promise.all(DISTRICTS.slice(i, i + 3).map(async district => {
      const { snapshot } = await readSnapshot(env, district.code);
      const types = type === 'all' ? ['all', ...HOUSING_TYPES] : [type];
      return { start: snapshot.analysisStart, end: snapshot.analysisEnd, rows: types.map(housingType => ({
        districtCode: district.code, districtName: district.name, housingType,
        ...rollup(snapshot.monthly.filter(group => housingType === 'all' || group.housingType === housingType), snapshot.analysisStart, snapshot.analysisEnd),
      })) };
    }));
    for (const item of batch) { rows.push(...item.rows); periods.push(`${item.start}|${item.end}`); }
  }
  if (new Set(periods).size !== 1) throw new ServiceError('DATA_NOT_READY', 503);
  const [analysisStart, analysisEnd] = periods[0].split('|');
  const transactionCount = rows.filter(row => row.housingType === type).reduce((sum, row) => sum + row.transactionCount, 0);
  return { meta: { analysisStart, analysisEnd, housingType: type, transactionCount, districtCount: 25 }, districts: DISTRICTS, rows };
}
