import { analysisPeriod } from '../../src/analysis.js';
import { ANALYSIS_YEARS, RECEIPT_YEARS, ARCHIVE_YEARS, HOUSING_TYPES, DISTRICTS } from '../../src/config.js';
import { json } from '../../src/server/http.js';

export function onRequestGet() {
  const period = analysisPeriod();
  return json({
    schemaVersion: 2, analysis: period, analysisYears: ANALYSIS_YEARS, receiptYears: RECEIPT_YEARS, apiReceiptYears: RECEIPT_YEARS, archiveFileYears: ARCHIVE_YEARS, housingTypes: HOUSING_TYPES,
    districts: DISTRICTS, comparison: 'samePeriod',
    metrics: { deposit: { label: '거래당 평균 전세보증금', unit: '만원' }, area: { label: '평균 ㎡당 전세보증금', unit: '만원/㎡' } },
    minimumDisplayCount: 10, minimumRankingCount: 30,
  });
}
