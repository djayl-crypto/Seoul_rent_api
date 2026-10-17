import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import { DISTRICTS } from '../src/config.js';
import { validateBoundaries } from '../public/map-model.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
proj4.defs('EPSG:5179','+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs');

export function convertBoundaryFeature(feature, sourceCrs) {
  const properties=feature.properties ?? {};
  if (!String(properties.SIGUNGU_CD).startsWith('11')) return null;
  const name=String(properties.SIGUNGU_NM).trim(), district=DISTRICTS.find(d=>d.name===name);
  if (!district || !['Polygon','MultiPolygon'].includes(feature.geometry?.type)) throw new Error('Invalid Seoul boundary source');
  const coordinates = value => typeof value[0]==='number' ? proj4(sourceCrs,'EPSG:4326',value).map(n=>Number(n.toFixed(6))) : value.map(coordinates);
  return {type:'Feature',properties:{code:district.code,name:district.name},geometry:{type:feature.geometry.type,coordinates:coordinates(feature.geometry.coordinates)}};
}

export async function prepareMap(inputDirectory=resolve(ROOT,'../lecture04_spatial_data_analysis/bnd_all_00_2025_2Q')) {
  const basename='bnd_sigungu_00_2025_2Q';
  const projection=await readFile(resolve(inputDirectory,`${basename}.prj`),'utf8');
  const encoding=(await readFile(resolve(inputDirectory,`${basename}.cpg`),'utf8')).trim();
  if (encoding.toLowerCase()!=='utf-8') throw new Error('Unexpected boundary encoding');
  const source=await shapefile.open(resolve(inputDirectory,`${basename}.shp`),undefined,{encoding:'utf-8'});
  const features=[];
  try {
    for (;;) {
      const row=await source.read(); if(row.done) break;
      const feature=convertBoundaryFeature(row.value,projection);
      if(feature) {
        if(row.value.properties.BASE_DATE!=='20250630') throw new Error('Unexpected boundary date');
        features.push(feature);
      }
    }
  } finally { await source.cancel(); }
  features.sort((a,b)=>a.properties.code.localeCompare(b.properties.code));
  const fingerprints={};
  for(const extension of ['shp','dbf','prj']) fingerprints[`${basename}.${extension}`]=createHash('sha256').update(await readFile(resolve(inputDirectory,`${basename}.${extension}`))).digest('hex');
  const collection={type:'FeatureCollection',source:{title:'실습 제공 통계청 SGIS 시군구 경계',date:'2025-06-30',sourceCrs:'EPSG:5179',outputCrs:'EPSG:4326',precision:6,fingerprints},features};
  validateBoundaries(collection,DISTRICTS);
  const text=JSON.stringify(collection);
  await writeFile(resolve(ROOT,'public/seoul-districts.geojson'),text+'\n');
  return {features:features.length,bytes:Buffer.byteLength(text)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { const result=await prepareMap(process.argv[2]); console.log(`Seoul map geometry prepared: ${result.features} districts, ${result.bytes} bytes.`); }
  catch { console.error('Boundary preparation failed. Check the SGIS2025Q2 input and required projection files.');process.exitCode=1; }
}
