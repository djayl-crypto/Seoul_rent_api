import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DISTRICTS } from '../src/config.js';
import { colorScale, districtMapRows, validateBoundaries } from '../public/map-model.js';
import { convertBoundaryFeature } from '../scripts/prepare-map.mjs';

test('map colors interpolate yellow-orange-red with a factual numeric scale and missing-data color', () => {
  const scale = colorScale([10000,20000,30000]);
  assert.equal(scale.color(10000),'#ffffb2'); assert.equal(scale.color(20000),'#fd8d3c'); assert.equal(scale.color(30000),'#bd0026');
  assert.equal(scale.min,10000); assert.equal(scale.mid,20000); assert.equal(scale.max,30000);
  assert.equal(scale.color(null),'#d5d8d2'); assert.equal(colorScale([20000]).color(20000),'#fd8d3c');
  assert.equal(colorScale([]).min,null);
});

test('map joins by gu code, applies one housing type and never invents a zero for unavailable data', () => {
  const geometry = { features:DISTRICTS.map(d=>({properties:{code:d.code,name:d.name}})) };
  const rows = [
    {districtCode:'11110',districtName:'종로구',housingType:'all',transactionCount:100,meanDepositManwon:50000},
    {districtCode:'11110',districtName:'종로구',housingType:'아파트',transactionCount:5,meanDepositManwon:10000},
    {districtCode:'11140',districtName:'중구',housingType:'아파트',transactionCount:15,meanDepositManwon:30000},
  ];
  const data = districtMapRows(rows,'아파트',geometry);
  assert.equal(data.length,25); assert.equal(data[0].meanDepositManwon,null); assert.equal(data[0].transactionCount,5);
  assert.equal(data[1].meanDepositManwon,30000); assert.equal(data[1].reliability,'small');
  assert.equal(data[2].transactionCount,null); assert.equal(data[2].meanDepositManwon,null);
  assert.ok(!data.some(row=>row.meanDepositManwon===50000));
  assert.throws(()=>districtMapRows([{...rows[0],meanDepositManwon:null}],'all',geometry));
});

test('boundary conversion maps SGIS Seoul gu names to API codes and respects CRS axis order', () => {
  const feature = { type:'Feature', properties:{SIGUNGU_CD:'11010',SIGUNGU_NM:'종로구'}, geometry:{type:'Polygon',coordinates:[[[1000000,2000000],[1001000,2000000],[1000000,2001000],[1000000,2000000]]]} };
  const result = convertBoundaryFeature(feature,'EPSG:5179');
  assert.deepEqual(result.properties,{code:'11110',name:'종로구'});
  assert.ok(Math.abs(result.geometry.coordinates[0][0][0]-127.5)<0.000001);
  assert.ok(Math.abs(result.geometry.coordinates[0][0][1]-38)<0.000001);
  assert.equal(convertBoundaryFeature({...feature,properties:{SIGUNGU_CD:'21010',SIGUNGU_NM:'중구'}},'EPSG:5179'),null);
});

test('shipped geometry covers exactly the 25 official gu with valid closed Seoul rings', async () => {
  const geometry = JSON.parse(await readFile(new URL('../public/seoul-districts.geojson',import.meta.url),'utf8'));
  assert.equal(validateBoundaries(geometry),true);
  assert.deepEqual(geometry.features.map(f=>f.properties.code).sort(),DISTRICTS.map(d=>d.code).sort());
  assert.equal(geometry.source.date,'2025-06-30');
  const swapped = structuredClone(geometry);
  swapped.features[0].geometry.coordinates[0][0] = [37.5,127];
  assert.throws(()=>validateBoundaries(swapped));
  assert.throws(()=>validateBoundaries({...geometry,features:geometry.features.slice(1)}));
});
