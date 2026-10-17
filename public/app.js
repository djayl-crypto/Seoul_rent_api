import { requestRegions } from './client.js';
import { createAnalysisCharts } from './charts.js';
import { annualRegionFigure, annualRegionRows, regionDifference } from './region-model.js';

const $ = selector => document.querySelector(selector);
const pickers = [[$('#district'), $('#dong')], [$('#district-b'), $('#dong-b')]];
const housing = $('#housing'), compare = $('#compare-regions');
const status = $('#status'), results = $('#results'), dashboard = $('#dashboard');
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
let activeRequest, metadataReady = false, comparedBefore = false, yearQueue = Promise.resolve();
const charts = createAnalysisCharts(loadSummary, type => { housing.value = type; loadSummary(); });

function state(kind, message) {
  status.className = `status ${kind}`; status.textContent = message;
  dashboard.hidden = true;
  $('#retry').hidden = !['error', 'not-ready'].includes(kind);
  results.setAttribute('aria-busy', String(kind === 'loading'));
}
function scopeName(index) {
  const [gu, dong] = pickers[index];
  return gu.value === 'all' ? '서울 전체' : `${gu.selectedOptions[0].textContent} · ${dong.selectedOptions[0].textContent}`;
}
function fillDongs(index, data, selected) {
  const [gu, dong] = pickers[index];
  dong.replaceChildren(new Option('전체 동', 'all'), ...data.dongs.map(item => new Option(item.name, item.code)));
  dong.value = selected; dong.disabled = gu.value === 'all';
}
function renderMetrics(region, index) {
  const suffix = index === 0 ? '' : '-b', overview = region.data.overview;
  $(`#region-${index === 0 ? 'a' : 'b'}-label`).textContent = region.label;
  $(`#mean${suffix}`).textContent = overview.meanDepositManwon === null ? overview.transactionCount ? '표본 부족' : '거래 없음' : number.format(overview.meanDepositManwon);
  $(`#mean${suffix}`).nextElementSibling.hidden = overview.meanDepositManwon === null;
  $(`#count${suffix}`).textContent = number.format(overview.transactionCount);
  $(`#mean-note${suffix}`).textContent = overview.transactionCount < 10 ? '10건 미만으로 평균을 표시하지 않습니다.' : overview.transactionCount < 30 ? '10~29건의 평균입니다. 참고용으로 확인하세요.' : '전체 조회 기간 · 거래당 보증금의 산술평균';
  $(`#metric-period${suffix}`).textContent = `${region.data.meta.analysisStart} ~ ${region.data.meta.analysisEnd}`;
}
async function renderYears(regions, controller) {
  const head = $('#annual-head'), rows = $('#rows'); head.replaceChildren(); rows.replaceChildren();
  const titles = ['계약연도', ...regions.flatMap((region, i) => [regions.length > 1 ? `${i === 0 ? 'A' : 'B'} 평균 보증금 (만원)` : '평균 보증금 (만원)', regions.length > 1 ? `${i === 0 ? 'A' : 'B'} 거래 건수 (건)` : '거래 건수 (건)'])];
  for (const title of titles) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; head.append(th); }
  for (const row of annualRegionRows(regions)) {
    const tr = document.createElement('tr'), values = [`${row.year}년`];
    for (const region of row.regions) values.push(region.meanDepositManwon === null ? region.transactionCount ? '표본 부족' : '거래 없음' : `${number.format(region.meanDepositManwon)}만원${region.transactionCount < 30 ? ' (참고용)' : ''}`, `${number.format(region.transactionCount)}건`);
    for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } rows.append(tr);
  }
  const figure = annualRegionFigure(regions, {type:housing.value});
  yearQueue = yearQueue.catch(() => {}).then(async () => {
    if (controller.signal.aborted) return;
    if (!window.Plotly?.react) throw new Error();
    // Plotly measures a visible container. The outer result is made visible only after current data is set.
    await window.Plotly.react($('#year-chart'), figure.data, figure.layout, { responsive:true, displayModeBar:false, displaylogo:false, showTips:false });
  });
  await yearQueue;
}

async function loadSummary() {
  if (!metadataReady) return;
  activeRequest?.abort();
  const controller = new AbortController(); activeRequest = controller;
  const signal = controller.signal, count = compare.checked ? 2 : 1;
  const selections = pickers.slice(0, count).map(([gu, dong]) => ({ district:gu.value, dong:gu.value === 'all' ? 'all' : dong.value, type:housing.value }));
  const names = selections.map((_, i) => scopeName(i));
  charts.setFilters({ type:housing.value, label:names.join(' ↔ '), selectedDistricts:selections.map((item,slot)=>({code:item.district,name:names[slot],slot})) });
  state('loading', count === 2 ? '같은 기간의 두 지역 자료를 불러오고 있습니다.' : '선택한 지역의 전세 거래를 불러오고 있습니다.');
  const response = await requestRegions(selections, { signal });
  if (signal.aborted || activeRequest !== controller) return;
  if (response.kind !== 'ready') {
    charts.failLocal(response.kind);
    const name = response.regionIndex === undefined ? '선택한 지역' : names[response.regionIndex];
    state(response.kind === 'not-ready' ? 'not-ready' : 'error', response.kind === 'period-mismatch' ? '두 지역의 조회 기간이 달라 비교할 수 없습니다. 자료가 갱신된 후 다시 시도해 주세요.' : response.kind === 'not-ready' ? `${name} 자료 준비가 완료되지 않았습니다. 잠시 후 다시 조회해 주세요.` : `${name} 자료를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.`);
    return;
  }
  try {
    const regions = response.data.map((data, i) => ({ label: count === 2 ? `${i === 0 ? 'A' : 'B'} · ${names[i]}` : names[i], data }));
    regions.forEach((region, i) => fillDongs(i, region.data, selections[i].dong));
    const data = regions[0].data, period = `${data.meta.analysisStart} ~ ${data.meta.analysisEnd}`;
    $('#period').textContent = `조회 기간 ${period} · 계약일 기준 · 2026년은 진행 중`;
    $('#results-title').textContent = count === 2 ? '두 동네의 전세 비교' : `${names[0]}의 전세`;
    charts.setRegions(regions);
    if (count === 1 && !data.overview.transactionCount) { state('empty', `${names[0]} · ${housing.selectedOptions[0].textContent}에 해당하는 전세 거래가 없습니다. 조건을 바꿔 주세요.`); return; }
    $('#region-cards').classList.toggle('paired', count === 2);
    $('#region-b-result').hidden = count !== 2;
    regions.forEach(renderMetrics);
    $('#pair-note').hidden = count !== 2;
    if (count === 2) $('#pair-note').textContent = `${names[0] === names[1] ? '두 선택이 같은 지역입니다. 다른 자치구나 동을 고르면 지역 차이를 비교할 수 있습니다. ' : ''}${regionDifference(regions)} 서울 전체·자치구·동의 범위가 겹칠 수 있어 각 지역을 별도로 해석하세요.`;
    $('#comparison-period').textContent = `각 연도 01.01 ~ ${data.meta.analysisEnd.slice(5).replace('-', '.')} · ${count === 2 ? 'A와 B는 같은 기간·주택유형 기준' : '상단 지표는 전체 조회 기간 기준'}`;
    await renderYears(regions, controller);
    if (signal.aborted || activeRequest !== controller) return;
    state('ready', `${names.join(' ↔ ')} · ${housing.selectedOptions[0].textContent}`);
    dashboard.hidden = false;
    window.Plotly.Plots.resize($('#year-chart'));
  } catch { if (!signal.aborted) state('error', '자료를 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
}

async function initialize() {
  state('loading', '조회 화면을 준비하고 있습니다.');
  try {
    await document.fonts.ready;
    const response = await fetch('/api/meta'); if (!response.ok) throw new Error();
    const meta = await response.json();
    if (!Array.isArray(meta.districts) || !Array.isArray(meta.housingTypes)) throw new Error();
    for (const [gu] of pickers) gu.replaceChildren(new Option('서울 전체', 'all'), ...meta.districts.map(item => new Option(item.name, item.code)));
    pickers[0][0].value = 'all'; pickers[1][0].value = '11680';
    housing.replaceChildren(new Option('전체 유형', 'all'), ...meta.housingTypes.map(type => new Option(type, type)));
    pickers[0][0].disabled = housing.disabled = compare.disabled = $('#submit').disabled = false;
    metadataReady = true; await loadSummary();
  } catch { state('error', '조회 서비스를 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
}

pickers.forEach(([gu, dong]) => {
  gu.addEventListener('change', () => { dong.replaceChildren(new Option('전체 동', 'all')); dong.disabled = true; loadSummary(); });
  dong.addEventListener('change', loadSummary);
});
compare.addEventListener('change', () => {
  if (compare.checked && !comparedBefore) { pickers[1][0].value = pickers[0][0].value === '11680' ? '11110' : '11680'; comparedBefore = true; }
  $('#region-b-fields').hidden = !compare.checked;
  pickers[1][0].disabled = !compare.checked;
  if (!compare.checked) pickers[1][1].disabled = true;
  loadSummary();
});
housing.addEventListener('change', loadSummary);
$('#filters').addEventListener('submit', event => { event.preventDefault(); loadSummary(); });
$('#retry').addEventListener('click', () => metadataReady ? loadSummary() : initialize());
initialize();
