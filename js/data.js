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

export const validMonth = row => Number.isInteger(row.start_month) && row.start_month >= 1 && row.start_month <= 12;

// Empty bins count recorded rows only; unknown impact sums remain null.
export function timeSeries(rows, start, end, metric, monthly = false) {
  const groups = new Map();
  for (const row of rows) {
    if (monthly && !validMonth(row)) continue;
    const key = monthly ? `${row.year}-${row.start_month}` : String(row.year);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [];
  for (let year = start; year <= end; year++) {
    for (let month = 1; month <= (monthly ? 12 : 1); month++) {
      const key = monthly ? `${year}-${month}` : String(year);
      result.push({ year, month, date: new Date(Date.UTC(year, month - 1, 1)), ...summarize(groups.get(key) || [], metric) });
    }
  }
  return result;
}

export function seasonalData(rows, start, end, partialYear) {
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter(y => y !== partialYear);
  const eligible = rows.filter(r => years.includes(r.year));
  const known = eligible.filter(validMonth);
  return { years, excluded: eligible.length - known.length, eligible: eligible.length, known: known.length,
    months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1,
      value: years.length && known.length ? known.filter(r => r.start_month === i + 1).length / years.length : null })) };
}

export function disasterHierarchy(rows) {
  const world = { name: 'World', children: [] };
  const regions = new Map();
  for (const row of rows) {
    if (!regions.has(row.region)) regions.set(row.region, new Map());
    const countries = regions.get(row.region);
    if (!countries.has(row.iso)) countries.set(row.iso, { name: row.country, iso: row.iso, region: row.region, types: new Map() });
    const country = countries.get(row.iso);
    country.types.set(row.type, (country.types.get(row.type) || 0) + 1);
  }
  for (const [region, countries] of regions) world.children.push({ name: region, region, children: [...countries.values()].map(c => ({
    name: c.name, iso: c.iso, region, children: [...c.types].map(([type, value]) => ({ name: type, type, iso: c.iso, country: c.name, region, value }))
  })) });
  return world;
}
