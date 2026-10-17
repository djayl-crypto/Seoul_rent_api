export const NO_MAP_VALUE = '#d5d8d2';
const colors = [[255,255,178],[253,141,60],[189,0,38]];
export function colorScale(values) {
  const available = values.filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const min = available.length ? Math.min(...available) : null, max = available.length ? Math.max(...available) : null;
  const mid = min === null ? null : (min + max) / 2;
  return { min, mid, max, color(value) {
    if (value === null || !Number.isFinite(value) || min === null) return NO_MAP_VALUE;
    if (min === max) return '#fd8d3c';
    const position = Math.min(1,Math.max(0,(value-min)/(max-min))) * 2;
    const index = position < 1 ? 0 : 1, ratio = position-index;
    return '#'+colors[index].map((channel,i)=>Math.round(channel+(colors[index+1][i]-channel)*ratio).toString(16).padStart(2,'0')).join('');
  } };
}

export function districtMapRows(rows, type, geometry) {
  const selected = new Map();
  for (const row of rows) if (row.housingType === type) {
    if (selected.has(row.districtCode)) throw new Error('Invalid district summary');
    selected.set(row.districtCode,row);
  }
  return geometry.features.map(feature => {
    const {code,name}=feature.properties, row=selected.get(code);
    if (!row) return {districtCode:code,districtName:name,housingType:type,transactionCount:null,meanDepositManwon:null,reliability:'unavailable'};
    if (!Number.isSafeInteger(row.transactionCount) || row.transactionCount < 0) throw new Error('Invalid district summary');
    const n=row.transactionCount, mean=n>=10 ? row.meanDepositManwon : null;
    if (n>=10 && (!Number.isFinite(mean)||mean<=0)) throw new Error('Invalid district summary');
    return {districtCode:code,districtName:name,housingType:type,transactionCount:n,meanDepositManwon:mean,reliability:n>=30?'sufficient':n>=10?'small':'suppressed'};
  });
}

export function validateBoundaries(geometry, districts = null) {
  if (geometry?.type !== 'FeatureCollection' || !Array.isArray(geometry.features) || geometry.features.length !== 25) throw new Error('Invalid map boundaries');
  const codes = new Set(), expected = districts ? new Map(districts.map(d=>[d.code,d.name])) : null;
  let count=0;
  for (const feature of geometry.features) {
    const {code,name}=feature.properties ?? {};
    if (!/^11\d{3}$/.test(code) || codes.has(code) || typeof name !== 'string' || !/^[가-힣]+구$/.test(name) || (expected && expected.get(code)!==name)) throw new Error('Invalid map boundaries');
    codes.add(code);
    const shape=feature.geometry;
    if (!['Polygon','MultiPolygon'].includes(shape?.type)) throw new Error('Invalid map boundaries');
    const polygons=shape.type==='Polygon'?[shape.coordinates]:shape.coordinates;
    if (!Array.isArray(polygons)||!polygons.length) throw new Error('Invalid map boundaries');
    for (const rings of polygons) {
      if (!Array.isArray(rings)||!rings.length) throw new Error('Invalid map boundaries');
      for (const ring of rings) {
        if (!Array.isArray(ring)||ring.length<4) throw new Error('Invalid map boundaries');
        for (const point of ring) {
          if (!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<126.6||point[0]>127.4||point[1]<37.3||point[1]>37.85||++count>300000) throw new Error('Invalid map boundaries');
        }
        if (ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1]) throw new Error('Invalid map boundaries');
      }
    }
  }
  if (expected && [...expected.keys()].some(code=>!codes.has(code))) throw new Error('Invalid map boundaries');
  return true;
}
