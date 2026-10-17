import { monthlyFigure, HOUSING_COLORS, REGION_COLORS, CHART_FONT } from './chart-model.js';
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

export function regionMonthlyFigure(regions, options) {
  const figures = regions.map(region => monthlyFigure(region.data.monthlySeries, options));
  const data = figures.flatMap((figure, i) => figure.data.map(trace => ({ ...trace,
    name: regions.length > 1 ? `${regions[i].label} · ${trace.name}` : trace.name,
    line: { ...trace.line, dash: i === 0 ? 'solid' : 'dash' },
  })));
  return { data, layout: { ...figures[0].layout, ...(data.length > 4 ? { height: options.compact ? 650 : 460, margin: { t: options.compact ? 230 : 100, r: 20, b: 60, l: 76 }, legend: { orientation:'h', x:0, y: options.compact ? 1.5 : 1.3, font:{size:10} } } : {}) } };
}

export function annualRegionRows(regions) {
  return [2022,2023,2024,2025,2026].map(year => ({ year, regions: regions.map(region => {
    const group = region.data.yearly.find(row => row.year === year);
    return { label: region.label, meanDepositManwon: group?.meanDepositManwon ?? null, transactionCount: group?.transactionCount ?? 0 };
  }) }));
}

export function annualRegionFigure(regions, {type = 'all'} = {}) {
  const rows = annualRegionRows(regions);
  return { data: regions.map((region, i) => ({ type: 'bar', name: region.label, marker: { color: regions.length > 1 ? REGION_COLORS[i] : HOUSING_COLORS[type], line:{color:'#191970',width:0.6}, cornerradius:4 },
    x: rows.map(row => `${row.year}년`), y: rows.map(row => row.regions[i].meanDepositManwon), customdata: rows.map(row => row.regions[i].transactionCount),
    hovertemplate: '%{x}<br>평균 %{y:,.1f}만원<br>거래 %{customdata:,}건<extra>%{fullData.name}</extra>',
  })), layout: { barmode: 'group', height: 300, paper_bgcolor: '#fff', plot_bgcolor:'#fff', font: {family:CHART_FONT,size:11,color:'#64748b'},
    margin: {t:50,r:16,b:35,l:68}, legend:{orientation:'h',x:0,y:1.22}, xaxis: {type:'category'}, yaxis:{title:{text:'평균 보증금 (만원)'},tickformat:',.0f',rangemode:'tozero',gridcolor:'#eeede7'} } };
}

export function regionDifference(regions) {
  if (regions.length !== 2) return '';
  const [a, b] = regions.map(region => region.data.overview);
  if (a.meanDepositManwon === null || b.meanDepositManwon === null) return '한 지역의 평균이 표본 부족 또는 거래 없음으로 표시되지 않아 평균 차이를 계산하지 않습니다.';
  const difference = b.meanDepositManwon - a.meanDepositManwon;
  return `평균 차이 B − A: ${difference > 0 ? '+' : ''}${number.format(difference)}만원 · A ${number.format(a.transactionCount)}건 / B ${number.format(b.transactionCount)}건. 거래 구성 차이가 반영될 수 있으며, 두 지역의 건수는 합산하지 않습니다.`;
}
