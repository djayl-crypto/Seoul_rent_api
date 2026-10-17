// Browser requests only same-origin Pages Functions. Discard all remote error text.
export async function requestSummary(filters, { fetchImpl = fetch, signal } = {}) {
  try {
    const query = new URLSearchParams({ gu: filters.district, dong: filters.dong ?? 'all', type: filters.type ?? 'all', comparison: 'samePeriod', view: 'dashboard' });
    const response = await fetchImpl(`/api/summary?${query}`, { signal });
    const data = await response.json();
    if (!response.ok) return { kind: data?.error?.code === 'DATA_NOT_READY' ? 'not-ready' : 'error' };
    if (!data?.meta || !Array.isArray(data.dongs) || !data.overview || !Array.isArray(data.yearly)) return { kind: 'error' };
    return { kind: 'ready', data };
  } catch { return { kind: signal?.aborted ? 'aborted' : 'error' }; }
}

export async function requestComparison({ fetchImpl = fetch, signal } = {}) {
  try {
    const response = await fetchImpl('/api/comparison?type=all', { signal });
    const data = await response.json();
    if (!response.ok) return { kind: data?.error?.code === 'DATA_NOT_READY' ? 'not-ready' : 'error' };
    if (!data?.meta || !Array.isArray(data.rows) || !Array.isArray(data.districts)) return { kind: 'error' };
    return { kind: 'ready', data };
  } catch { return { kind: signal?.aborted ? 'aborted' : 'error' }; }
}

export async function requestRegions(regions, options = {}) {
  if (!Array.isArray(regions) || regions.length < 1 || regions.length > 2) return { kind: 'error' };
  const requests = new Map();
  const responses = await Promise.all(regions.map(filters => {
    const key = JSON.stringify([filters.district, filters.dong ?? 'all', filters.type ?? 'all']);
    if (!requests.has(key)) requests.set(key, requestSummary(filters, options));
    return requests.get(key);
  }));
  const failed = responses.findIndex(response => response.kind !== 'ready');
  if (failed >= 0) return { kind: responses[failed].kind, regionIndex: failed };
  const data = responses.map(response => response.data);
  const { analysisStart, analysisEnd } = data[0].meta;
  if (!analysisStart || !analysisEnd || data.some(region => region.meta.analysisStart !== analysisStart || region.meta.analysisEnd !== analysisEnd)) return { kind: 'period-mismatch' };
  return { kind: 'ready', data };
}
