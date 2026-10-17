import { colorScale, districtMapRows, validateBoundaries } from './map-model.js';
import { HOUSING, label, REGION_COLORS } from './chart-model.js';

const $ = selector => document.querySelector(selector);
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
const meanText = row => row.meanDepositManwon === null ? row.transactionCount === null ? '자료 없음' : row.transactionCount === 0 ? '거래 없음' : '표본 부족 (10건 미만)' : `${number.format(row.meanDepositManwon)}만원${row.reliability === 'small' ? ' (참고용)' : ''}`;
const countText = row => row.transactionCount === null ? '자료 없음' : `${number.format(row.transactionCount)}건`;

// No credentials or source records: join public geometry to the existing Function summary.
export function createDistrictMap({ changeHousing, reloadSummary }) {
  let map, tiles, layer, outlines = [], geometry, geometryRequest, latest, revision = 0, fitted = false;
  const picker = $('#map-housing');
  picker.replaceChildren(new Option('전체 유형', 'all'), ...HOUSING.map(type => new Option(type, type)));
  picker.addEventListener('change', () => changeHousing(picker.value));

  function state(kind, message) {
    revision++;
    if (layer) { map.removeLayer(layer); layer = null; }
    for (const outline of outlines) map.removeLayer(outline);
    outlines = [];
    map?.closePopup();
    $('#map-content').hidden = true;
    $('#map-description').textContent = '';
    $('#map-count').textContent = '';
    $('#map-status').className = `status ${kind}`;
    $('#map-status').textContent = message;
    $('#map-retry').hidden = !['error','not-ready'].includes(kind);
    $('#map-panel').setAttribute('aria-busy', String(kind === 'loading'));
  }

  async function boundaries(districts) {
    if (!geometry && !geometryRequest) geometryRequest = (async () => {
      const response = await fetch('/seoul-districts.geojson', { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const body = await response.text();
      if (body.length > 3000000) throw new Error();
      const result = JSON.parse(body);
      validateBoundaries(result, districts);
      geometry = result;
    })().finally(() => { geometryRequest = null; });
    if (geometryRequest) await geometryRequest;
    validateBoundaries(geometry, districts);
    return geometry;
  }

  function initialize() {
    if (map) return;
    if (!window.L?.geoJSON) throw new Error();
    const L = window.L;
    map = L.map('district-map', { scrollWheelZoom:false, zoomSnap:0.25, minZoom:9, maxZoom:15, maxBounds:[[37.2,126.5],[37.95,127.6]], maxBoundsViscosity:0.8 });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      referrerPolicy:'strict-origin-when-cross-origin', noWrap:true, detectRetina:false,
      updateWhenIdle:true, updateWhenZooming:false, keepBuffer:1,
    });
    // An unavailable public basemap must not erase valid analysis or gu boundaries.
    tiles.on('tileerror', () => { $('#map-basemap-error').hidden = false; });
    tiles.addTo(map);
    new ResizeObserver(() => map.invalidateSize({ animate:false })).observe($('#district-map'));
    $('#map-reset').addEventListener('click', () => { if (layer) map.fitBounds(layer.getBounds(), {padding:[20,20],animate:false}); });
    $('#map-basemap-retry').addEventListener('click', () => { $('#map-basemap-error').hidden = true; tiles.redraw(); });
  }

  function popup(row, period, selections) {
    const box = document.createElement('div'); box.className = 'district-popup';
    const title = document.createElement('strong'); title.textContent = row.districtName; box.append(title);
    const selected = selections.filter(item => item.code === row.districtCode).map(item => item.slot === 0 ? 'A' : 'B');
    for (const text of [`${label(row.housingType)} · 자치구 전체 동`, `평균 보증금 ${meanText(row)}`, `거래 ${countText(row)}`, period, ...(selected.length ? [`선택 지역 ${selected.join(' / ')}가 속한 자치구`] : [])]) {
      const line = document.createElement('p'); line.textContent = text; box.append(line);
    }
    return box;
  }

  async function update(data, type, selections = []) {
    latest = {data,type,selections}; picker.value = type;
    state('loading', '서울 25개 자치구의 경계와 평균 보증금을 준비하고 있습니다.');
    const version = revision;
    try {
      const geo = await boundaries(data.districts);
      if (version !== revision) return;
      let rows;
      try { rows = districtMapRows(data.rows, type, geo); }
      catch { latest = null; throw new Error(); } // Retry invalid summaries through the Function, not this cache.
      const byCode = new Map(rows.map(row => [row.districtCode,row]));
      const scale = colorScale(rows.map(row => row.meanDepositManwon));
      const period = `${data.meta.analysisStart} ~ ${data.meta.analysisEnd}`;
      $('#map-content').hidden = false;
      initialize();
      layer = window.L.geoJSON(geo, {
        style: feature => ({ color:'#fff', weight:1.5, fillColor:scale.color(byCode.get(feature.properties.code).meanDepositManwon), fillOpacity:0.76 }),
        onEachFeature(feature, path) {
          const row = byCode.get(feature.properties.code), name = document.createElement('span'); name.textContent = row.districtName;
          path.bindTooltip(name, {permanent:true,direction:'center',className:'district-label',interactive:false});
          path.bindPopup(popup(row,period,selections), {maxWidth:280});
          path.on('mouseover', () => path.setStyle({weight:3,color:'#775839'}));
          path.on('mouseout', () => layer?.resetStyle(path));
          path.on('add', () => {
            const element = path.getElement();
            if (element) {
              element.setAttribute('tabindex','0'); element.setAttribute('role','button');
              element.setAttribute('aria-label',`${row.districtName}, 평균 보증금 ${meanText(row)}, 거래 ${countText(row)}. 상세 보기`);
              element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); path.openPopup(); } });
            }
          });
        },
      }).addTo(map);
      for (const selection of selections.filter(item => item.code !== 'all')) {
        const outline = window.L.geoJSON(geo, {
          filter:feature => feature.properties.code === selection.code,
          style:{fill:false,color:REGION_COLORS[selection.slot],weight:selection.slot === 0 ? 5 : 3,dashArray:selection.slot === 0 ? null : '6 4',interactive:false},
          interactive:false,
        }).addTo(map);
        outlines.push(outline);
      }
      map.invalidateSize({animate:false});
      if (!fitted) { map.fitBounds(layer.getBounds(), {padding:[20,20],animate:false}); fitted = true; }
      $('#map-description').textContent = `기간 ${period} · 서울 25개 구 · ${label(type)}`;
      const missing = rows.filter(row => row.transactionCount === null).length;
      $('#map-count').textContent = `집계 거래 ${number.format(rows.reduce((sum,row) => sum+(row.transactionCount ?? 0),0))}건${missing ? ` · 자료 없는 구 ${missing}개 (건수 합산 제외)` : ''}`;
      for (const [id,value] of [['min',scale.min],['mid',scale.mid],['max',scale.max]]) $(`#map-legend-${id}`).textContent = value === null ? '—' : `${number.format(value)}만원`;
      $('#map-legend-scale').classList.toggle('single-value',scale.min === scale.max);
      $('#map-selection').textContent = selections.filter(item=>item.code!=='all').map(item=>`${item.slot===0?'A (블루 실선)':'B (네이비 점선)'}: ${item.name}`).join(' / ') || '서울 전체를 보고 있습니다.';
      $('#map-rows').replaceChildren(...rows.map(row => {
        const tr = document.createElement('tr');
        for (const text of [row.districtName,label(type),meanText(row),countText(row)]) {const td=document.createElement('td');td.textContent=text;tr.append(td);}
        return tr;
      }));
      $('#map-status').textContent = scale.min === null ? '표시할 평균이 없습니다. 회색 구는 거래 없음·표본 부족·자료 없음을 뜻합니다. 상세 표를 확인하세요.' : '';
      $('#map-status').className = 'status ready';
      $('#map-panel').setAttribute('aria-busy','false');
    } catch { if (version === revision) state('error','지도를 표시하지 못했습니다. 자료와 연결 상태를 확인하고 다시 시도해 주세요.'); }
  }

  $('#map-retry').addEventListener('click', () => latest ? update(latest.data,latest.type,latest.selections) : reloadSummary());
  return {
    update,
    loading() { latest=null; state('loading','서울 25개 자치구의 요약 자료를 불러오고 있습니다.'); },
    fail(kind) { latest=null; state(kind === 'not-ready' ? 'not-ready' : 'error',kind === 'not-ready' ? '같은 기간의 25개 자치구 자료가 아직 준비되지 않았습니다. 자료 갱신 후 다시 시도해 주세요.' : '지도에 사용할 자치구 요약을 불러오지 못했습니다. 다시 시도해 주세요.'); },
  };
}
