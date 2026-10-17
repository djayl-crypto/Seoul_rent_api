export const HOUSING = ['아파트', '단독다가구', '연립다세대', '오피스텔'];
export const HOUSING_COLORS = { all: '#2563EB', 아파트: '#FF00FF', 단독다가구: '#00FFFF', 연립다세대: '#CCFF00', 오피스텔: '#191970' };
export const REGION_COLORS = ['#2563EB','#191970'];
export const CHART_FONT = 'Pretendard, sans-serif';
const palette = HOUSING_COLORS;
const format = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
export const label = type => type === 'all' ? '전체 유형' : type;
export const seriesTypes = ({ type = 'all', compareTypes = false }) => compareTypes ? HOUSING : [type];
const base = { paper_bgcolor: '#fff', plot_bgcolor: '#fff', font: { family: CHART_FONT, color: '#52617b', size: 12 }, separators: '.,', showlegend: true, legend: { orientation: 'h', x: 0, y: 1.18 }, margin: { t: 60, r: 20, b: 60, l: 76 }, hoverlabel: { bgcolor: '#fff', font: { family: CHART_FONT, size: 12 } } };

export function monthlyFigure(rows, options) {
  const months = [...new Set(rows.map(row => row.month))].sort();
  const first = months[0], last = months.at(-1);
  const range = first ? [`${first}-01`, rows.find(row => row.month === last)?.periodEnd ?? `${last}-28`] : undefined;
  return { data: seriesTypes(options).map(type => {
    const selected = rows.filter(row => row.housingType === type);
    return { name: label(type), type: 'scatter', mode: 'lines+markers', x: selected.map(row => `${row.month}-01`), y: selected.map(row => row.meanDepositManwon),
      connectgaps: false, line: { color: palette[type], width: 2.5 }, marker: { color:palette[type], size: 5.5, line:{color:'#191970',width:0.7}, symbol: selected.map(row => row.isPartialMonth ? 'diamond-open' : 'circle') },
      customdata: selected.map(row => [row.transactionCount, row.isPartialMonth ? '진행 중인 부분월' : '완결월', row.transactionCount < 30 ? '참고용 표본' : '30건 이상']),
      hovertemplate: '%{x|%Y년 %m월}<br>평균 %{y:,.1f}만원<br>거래 %{customdata[0]:,}건<br>%{customdata[1]} · %{customdata[2]}<extra>%{fullData.name}</extra>' };
  }), layout: { ...base, height: 360, xaxis: { type: 'date', range, tickformat: '%Y.%m', nticks: 7, gridcolor: '#f2f1ec', title: { text: '계약월' } }, yaxis: { title: { text: '평균 전세 보증금 (만원)' }, tickformat: ',.0f', rangemode: 'tozero', gridcolor: '#ecebe5' } } };
}

export function districtFigure(rows, options) {
  const types = seriesTypes(options);
  const orderType = options.type ?? 'all';
  const order = rows.filter(row => row.housingType === orderType).sort((a, b) => (a.meanDepositManwon ?? -1) - (b.meanDepositManwon ?? -1)).map(row => row.districtName);
  return { data: types.map(type => {
    const selected = rows.filter(row => row.housingType === type);
    return { type: 'bar', orientation: 'h', name: label(type), x: selected.map(row => row.meanDepositManwon), y: selected.map(row => row.districtName),
      marker: { color: palette[type], line:{color:'#191970',width:0.6}, cornerradius:3 }, customdata: selected.map(row => [row.transactionCount, row.transactionCount < 30 ? '참고용 표본' : '30건 이상']),
      hovertemplate: '%{y}<br>평균 %{x:,.1f}만원<br>거래 %{customdata[0]:,}건<br>%{customdata[1]}<extra>%{fullData.name}</extra>' };
  }), layout: { ...base, height: types.length > 1 ? 1260 : 860, legend: { orientation: 'h', x: 0, y: 1.04 }, barmode: 'group', margin: { t: 65, r: 18, b: 60, l: 66 }, xaxis: { title: { text: '평균 전세 보증금 (만원)' }, tickformat: ',.0f', rangemode: 'tozero', gridcolor: '#ecebe5' }, yaxis: { categoryorder: 'array', categoryarray: order, automargin: true, tickfont: { size: 11 } } } };
}

export function monthlyObservations(rows, types) {
  return types.map(type => {
    const eligible = rows.filter(row => row.housingType === type && !row.isPartialMonth && row.transactionCount >= 30 && Number.isFinite(row.meanDepositManwon)).sort((a, b) => a.month.localeCompare(b.month));
    if (eligible.length < 2) return `${label(type)}: 완결월·30건 이상인 비교 표본이 부족해 변화 방향을 요약하지 않습니다.`;
    const first = eligible[0], last = eligible.at(-1), change = (last.meanDepositManwon / first.meanDepositManwon - 1) * 100;
    return `${label(type)}: ${first.month} 평균 ${format.format(first.meanDepositManwon)}만원(${format.format(first.transactionCount)}건)에서 ${last.month} ${format.format(last.meanDepositManwon)}만원(${format.format(last.transactionCount)}건)으로, 두 관측월의 차이는 ${change > 0 ? '+' : ''}${format.format(change)}%입니다. 중간의 모든 달이 같은 방향으로 움직였다는 뜻은 아닙니다.`;
  });
}

export function districtObservations(rows, types) {
  return types.map(type => {
    const eligible = rows.filter(row => row.housingType === type && row.transactionCount >= 30 && Number.isFinite(row.meanDepositManwon)).sort((a, b) => a.meanDepositManwon - b.meanDepositManwon);
    if (eligible.length < 2) return `${label(type)}: 30건 이상인 자치구 비교 표본이 부족합니다.`;
    const low = eligible[0], high = eligible.at(-1);
    if (low.meanDepositManwon === high.meanDepositManwon) return `${label(type)}: 30건 이상인 ${eligible.length}개 구의 관측 평균이 같습니다.`;
    return `${label(type)}: 30건 이상인 ${eligible.length}개 구 중 ${high.districtName} ${format.format(high.meanDepositManwon)}만원(${format.format(high.transactionCount)}건), ${low.districtName} ${format.format(low.meanDepositManwon)}만원(${format.format(low.transactionCount)}건)으로 관측 평균의 차이는 ${format.format(high.meanDepositManwon - low.meanDepositManwon)}만원입니다.`;
  });
}
