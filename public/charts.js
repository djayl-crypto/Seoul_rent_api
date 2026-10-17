import { requestComparison } from './client.js';
import { districtFigure, monthlyObservations, districtObservations, seriesTypes, label } from './chart-model.js';
import { regionMonthlyFigure } from './region-model.js';
import { createDistrictMap } from './map.js';

const $ = selector => document.querySelector(selector);
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
const config = { responsive: true, displayModeBar: false, displaylogo: false, scrollZoom: false, showTips: false };

export function createAnalysisCharts(reloadLocal, changeHousing, { mapFactory = createDistrictMap } = {}) {
  let filters = { type: 'all', label: '' }, local = null, regions = [], comparison = null, comparisonRequest;
  let periodState = 'pending';
  const revision = { monthly: 0, district: 0 }, queue = { monthly: Promise.resolve(), district: Promise.resolve() };
  const compact = window.matchMedia('(max-width:700px)');
  const options = () => ({ ...filters, compareTypes: $('#compare-types').checked, compact: compact.matches });
  const districtMap = mapFactory({ changeHousing, reloadSummary:retryComparison });

  function state(id, kind, message = '') {
    revision[id]++;
    $(`#${id}-status`).textContent = message;
    $(`#${id}-status`).className = `status ${kind}`;
    $(`#${id}-content`).hidden = true;
    $(`#${id}-retry`).hidden = !['error', 'not-ready'].includes(kind);
    $(`#${id}-panel`).setAttribute('aria-busy', String(kind === 'loading'));
    $(`#${id}-count`).textContent = '';
    if (kind === 'loading') $(`#${id}-description`).textContent = '';
  }

  function fillTable(id, rows) {
    const target = $(`#${id}-rows`); target.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      const period = row.month ? `${row.month.replace('-', '년 ')}월${row.isPartialMonth ? ' (부분월)' : ''}` : row.districtName;
      const mean = row.meanDepositManwon === null ? row.transactionCount ? '표본 부족' : '거래 없음' : `${number.format(row.meanDepositManwon)}만원${row.transactionCount < 30 ? ' (참고용)' : ''}`;
      const values = [...(id === 'monthly' ? [row.regionLabel] : []), period, label(row.housingType), mean, `${number.format(row.transactionCount)}건`];
      for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
      target.append(tr);
    }
  }

  function plot(id, figure, observations, rows, countText) {
    const version = ++revision[id];
    // Plotly's responsive SVG container may use height:100%; give its parent a real height.
    $(`#${id}-plot`).style.height = `${figure.layout.height}px`;
    $(`#${id}-content`).hidden = false;
    $(`#${id}-retry`).hidden = true;
    $(`#${id}-status`).textContent = '';
    $(`#${id}-status`).className = 'status ready';
    $(`#${id}-panel`).setAttribute('aria-busy', 'false');
    $(`#${id}-count`).textContent = countText;
    const list = $(`#${id}-observations`);
    list.replaceChildren(...observations.map(text => { const item = document.createElement('li'); item.textContent = text; return item; }));
    fillTable(id, rows);
    queue[id] = queue[id].then(async () => {
      if (version !== revision[id]) return;
      if (!window.Plotly?.react) throw new Error();
      await window.Plotly.react($(`#${id}-plot`), figure.data, figure.layout, config);
    }).catch(() => { if (version === revision[id]) state(id, 'error', '그래프를 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.'); });
  }

  function renderMonthly() {
    if (!local) return;
    const selectedTypes = seriesTypes(options());
    const selected = regions.map(region => ({ ...region, rows: region.data.monthlySeries.filter(row => selectedTypes.includes(row.housingType)) }));
    const rows = selected.flatMap(region => region.rows.map(row => ({ ...row, regionLabel:region.label })));
    $('#monthly-description').textContent = `기간 ${local.meta.analysisStart} ~ ${local.meta.analysisEnd} · ${filters.label} · ${options().compareTypes ? '주택유형 4종 비교' : label(filters.type)}`;
    if (!rows.some(row => row.transactionCount > 0)) { state('monthly', 'empty', '이 조건에 해당하는 월별 전세 거래가 없습니다. 동이나 주택유형을 바꿔 주세요.'); return; }
    const observations = regions.flatMap(region => monthlyObservations(region.data.monthlySeries, selectedTypes).map(text => `${region.label} · ${text}`));
    const counts = selected.map(region => `${region.label}: ${number.format(region.rows.reduce((sum, row) => sum + row.transactionCount, 0))}건`).join(' / ');
    plot('monthly', regionMonthlyFigure(regions, options()), observations, rows,
      `${counts}${regions.length > 1 ? ' · 지역별 건수는 합산하지 않음' : ''} · 10건 미만 평균 제외`);
  }

  function renderDistrict() {
    if (periodState !== 'ready') {
      if (periodState === 'pending') {
        districtMap.loading();
        state('district','loading','선택 지역과 자치구 비교 자료의 조회 기간을 확인하고 있습니다.');
      } else {
        districtMap.fail(periodState === 'mismatch' ? 'not-ready' : 'error');
        state('district',periodState === 'mismatch' ? 'not-ready' : 'error',periodState === 'mismatch' ? '조회 기간이 달라 자치구 자료를 함께 표시할 수 없습니다. 다시 시도해 주세요.' : '선택 지역의 조회 기간을 확인하지 못했습니다. 다시 시도해 주세요.');
      }
      return;
    }
    if (!comparison) return;
    if (local && (local.meta.analysisStart !== comparison.meta.analysisStart || local.meta.analysisEnd !== comparison.meta.analysisEnd)) { periodState = 'mismatch'; districtMap.fail('not-ready'); state('district', 'not-ready', '조회 기간이 다른 자료가 있어 현재 지역과 같은 기간으로 비교할 수 없습니다. 자료를 갱신한 후 다시 시도해 주세요.'); return; }
    districtMap.update(comparison, filters.type, filters.selectedDistricts);
    const selectedTypes = seriesTypes(options()), rows = comparison.rows.filter(row => selectedTypes.includes(row.housingType));
    const n = rows.reduce((sum, row) => sum + row.transactionCount, 0);
    $('#district-description').textContent = `기간 ${comparison.meta.analysisStart} ~ ${comparison.meta.analysisEnd} · 서울 25개 구, 전체 동 · ${options().compareTypes ? '주택유형 4종 비교' : label(filters.type)}`;
    if (!n) { state('district', 'empty', '선택한 주택유형의 자치구별 전세 거래가 없습니다.'); return; }
    plot('district', districtFigure(comparison.rows, options()), districtObservations(comparison.rows, selectedTypes), rows,
      `25개 자치구 · 집계 거래 ${number.format(n)}건 (유형별 비교에서도 거래를 중복 합산하지 않음)`);
  }

  function retryComparison() { loadComparison(); reloadLocal(); }

  async function loadComparison() {
    comparisonRequest?.abort();
    const controller = new AbortController(); comparisonRequest = controller;
    comparison = null;
    districtMap.loading();
    state('district', 'loading', '같은 조회 기간의 25개 자치구 요약을 불러오고 있습니다.');
    const response = await requestComparison({ signal: controller.signal });
    if (controller.signal.aborted) return;
    comparisonRequest = null;
    if (response.kind !== 'ready') { districtMap.fail(response.kind); state('district', response.kind === 'not-ready' ? 'not-ready' : 'error', response.kind === 'not-ready' ? '25개 구의 완료 자료나 동일한 조회 기간이 아직 준비되지 않았습니다.' : '자치구 비교 자료를 불러오지 못했습니다. 다시 시도해 주세요.'); return; }
    comparison = response.data;
    renderDistrict();
  }

  $('#compare-types').addEventListener('change', () => { renderMonthly(); renderDistrict(); });
  compact.addEventListener('change', renderMonthly);
  $('#monthly-retry').addEventListener('click', reloadLocal);
  $('#district-retry').addEventListener('click', retryComparison);
  return {
    setFilters(next) {
      filters = next; local = null; regions = []; periodState = 'pending';
      $('#analysis-section').hidden = false;
      $('#map-panel').hidden = false;
      state('monthly', 'loading', '선택한 조건의 월별 자료를 불러오고 있습니다.');
      renderDistrict();
      if (!comparison && !comparisonRequest) loadComparison();
    },
    setRegions(next) {
      if (!Array.isArray(next) || next.some(region => !Array.isArray(region.data.monthlySeries))) { periodState = 'failed'; renderDistrict(); state('monthly', 'error', '월별 자료를 확인하지 못했습니다. 다시 시도해 주세요.'); return; }
      regions = next; local = regions[0].data; periodState = 'ready'; renderMonthly(); renderDistrict();
    },
    failLocal(kind) { local = null; regions = []; periodState = kind === 'period-mismatch' ? 'mismatch' : 'failed'; renderDistrict(); state('monthly', kind === 'not-ready' ? 'not-ready' : 'error', kind === 'not-ready' ? '선택한 지역의 월별 자료는 아직 준비되지 않았습니다.' : kind === 'period-mismatch' ? '두 지역의 조회 기간이 달라 월별 자료를 비교할 수 없습니다.' : '월별 자료를 불러오지 못했습니다. 다시 시도해 주세요.'); },
  };
}
