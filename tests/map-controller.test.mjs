import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { installDom } from './helpers/fake-dom.mjs';
import { createAnalysisCharts } from '../public/charts.js';
import { createDistrictMap } from '../public/map.js';

test('period mismatch cannot repaint cached district/map results during new or failed regional requests', async t=>{
  const dom=installDom();
  const period={analysisStart:'2022-01-01',analysisEnd:'2026-10-16'};
  const row={districtCode:'11110',districtName:'종로구',housingType:'all',month:'2022-01',periodStart:'2022-01-01',periodEnd:'2022-01-31',transactionCount:30,meanDepositManwon:30000};
  const summary={meta:period,monthlySeries:[row]};
  const calls=[], map={update(){calls.push('update');},loading(){calls.push('loading');},fail(kind){calls.push(`fail:${kind}`);}};
  t.mock.method(globalThis,'fetch',async()=>Response.json({meta:period,districts:[],rows:[row]}));
  try {
    const charts=createAnalysisCharts(()=>{},()=>{},{mapFactory:()=>map});
    const filters={type:'all',label:'서울 전체'};
    charts.setFilters(filters); await setImmediate();
    charts.setRegions([{label:'서울 전체',data:summary}]);
    assert.equal(calls.at(-1),'update');
    charts.setFilters(filters); charts.failLocal('period-mismatch');
    assert.equal(calls.at(-1),'fail:not-ready');
    assert.equal(dom.node('#district-content').hidden,true);
    const updates=calls.filter(call=>call==='update').length;
    dom.node('#compare-types').emit('change');
    assert.equal(calls.filter(call=>call==='update').length,updates);
    charts.setFilters({...filters,type:'아파트'});
    assert.equal(calls.at(-1),'loading');
    dom.node('#compare-types').emit('change'); charts.failLocal('error');
    assert.equal(calls.filter(call=>call==='update').length,updates);
    assert.equal(dom.node('#district-content').hidden,true);
    charts.setFilters(filters);
    charts.setRegions([{label:'서울 전체',data:{...summary,meta:{...period,analysisEnd:'2026-10-15'}}}]);
    assert.equal(calls.at(-1),'fail:not-ready');
    charts.setFilters(filters); charts.setRegions([{label:'서울 전체',data:summary}]);
    assert.equal(calls.at(-1),'update');
    await setImmediate();
  } finally {await setImmediate(); dom.restore();}
});

test('map retry refetches corrected summaries after invalid summary values instead of reusing bad cache', async t=>{
  const dom=installDom();
  const geo=JSON.parse(await readFile(new URL('../public/seoul-districts.geojson',import.meta.url),'utf8'));
  t.mock.method(globalThis,'fetch',async()=>Response.json(geo));
  let reloads=0;
  try {
    const map=createDistrictMap({changeHousing(){},reloadSummary(){reloads++;}});
    await map.update({districts:geo.features.map(f=>f.properties),meta:{analysisStart:'2022-01-01',analysisEnd:'2026-10-16'},rows:[{districtCode:'11110',housingType:'all',transactionCount:30,meanDepositManwon:null}]},'all');
    assert.equal(dom.node('#map-content').hidden,true);
    await dom.node('#map-retry').emit('click');
    assert.equal(reloads,1);
  } finally {dom.restore();}
});
