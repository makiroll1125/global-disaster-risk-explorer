/* Pure data operations shared by coordinated D3 views. */
export const metrics = {
  records: { label: 'Disaster records', short: 'Records', unit: 'country-disaster records' },
  deaths: { label: 'Reported deaths', short: 'Deaths', unit: 'reported deaths' },
  affected: { label: 'Reported affected', short: 'Affected', unit: 'reported affected people' },
  damage_adjusted_usd: { label: 'Adjusted damage', short: 'Damage', unit: 'reported damage · adjusted US$' },
};

export function summarize(rows, metric) {
  if (metric === 'records') return { value: rows.length, reported: rows.length, count: rows.length };
  const values = rows.map(r => r[metric]).filter(v => typeof v === 'number' && Number.isFinite(v));
  return { value: values.length ? values.reduce((a, b) => a + b, 0) : null, reported: values.length, count: rows.length };
}

export function filterRows(rows, state, { ignoreCountry = false, ignoreYears = false, ignoreType = false } = {}) {
  return rows.filter(r => (ignoreYears || (r.year >= state.start && r.year <= state.end))
    && (ignoreType || !state.type || r.type === state.type)
    && (!state.region || r.region === state.region)
    && (ignoreCountry || !state.country || r.iso === state.country));
}

export function groupSummary(rows, key, metric) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return [...groups].map(([key, values]) => ({ key, name: values[0].country, ...summarize(values, metric) }));
}
