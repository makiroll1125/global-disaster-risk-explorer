import { metrics, summarize, filterRows, groupSummary } from './data.js';

const $ = id => document.getElementById(id);
const d3 = window.d3;
const tooltip = $('tooltip');
let rows, metadata, features, state, defaults, projection, geoPath, mapLayer, countries, zoom;
let brush, brushGroup, brushScale, syncing = false;
const timelineWidth = () => Math.max(360, $('timeline').clientWidth - 30);
const full = value => value === null ? 'Not reported' : d3.format(',.0f')(value);
const compact = value => value === null ? '—' : value === 0 ? '0' : d3.format('.3~s')(value).replace('G', 'B');
const valueLabel = (value, metric = state.metric) => value === null ? 'Not reported' : (metric.includes('usd') ? '$' : '') + compact(value);
const displayType = type => type === 'Mass movement (wet)' ? 'Landslide (wet)' : type;
const countryNames = new Map();
const mapToISO = new Map();

function showTip(event, title, detail, note = '') {
  tooltip.replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = title;
  const body = document.createElement('div'); body.textContent = detail;
  const small = document.createElement('div'); small.className = 'muted'; small.textContent = note;
  tooltip.append(heading, body, small); tooltip.hidden = false;
  const rect = event.currentTarget?.getBoundingClientRect();
  const x = event.clientX || rect?.x || 20;
  const y = event.clientY || rect?.y || 20;
  tooltip.style.left = Math.max(8, Math.min(x + 14, innerWidth - tooltip.offsetWidth - 10)) + 'px';
  tooltip.style.top = Math.max(8, Math.min(y + 14, innerHeight - tooltip.offsetHeight - 10)) + 'px';
}
function hideTip() { tooltip.hidden = true; }
function coverage(s) { return s.count ? `${s.reported.toLocaleString()} / ${s.count.toLocaleString()} records reporting (${d3.format('.0%')(s.reported / s.count)})` : 'No matching records'; }
function accessibleClick(selection, handler) {
  selection.attr('tabindex', 0).attr('role', 'button').on('click', handler).on('keydown', function(event, d) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handler.call(this, event, d); }
  });
}
function options(id, items, label = d => d, value = d => d) {
  d3.select('#' + id).selectAll('option.generated').data(items).join('option').attr('class', 'generated').attr('value', value).text(label);
}

function setup() {
  rows.forEach(r => { countryNames.set(r.iso, r.country); if (r.map_id) mapToISO.set(r.map_id, r.iso); });
  const [minYear, maxYear] = metadata.observed_years;
  defaults = { metric: 'records', type: '', region: '', country: '', start: minYear, end: maxYear, rankBy: 'country' };
  state = { ...defaults };
  options('type', [...new Set(rows.map(r => r.type))].sort(), displayType);
  options('region', [...new Set(rows.map(r => r.region))].sort());
  updateCountryOptions();
  const years = d3.range(minYear, maxYear + 1);
  for (const id of ['start-year', 'end-year']) options(id, years, y => y === 2026 ? '2026*' : y);
  for (const id of ['metric', 'type', 'region', 'country']) $(id).addEventListener('change', () => {
    state[id] = $(id).value;
    if (id === 'region') { state.country = ''; updateCountryOptions(); }
    hideTip(); render();
  });
  $('start-year').addEventListener('change', () => { state.start = +$('start-year').value; state.end = Math.max(state.end, state.start); render(); });
  $('end-year').addEventListener('change', () => { state.end = +$('end-year').value; state.start = Math.min(state.start, state.end); render(); });
  $('reset').addEventListener('click', () => { state = { ...defaults }; updateCountryOptions(); resetZoom(); render(); });
  $('all-years').addEventListener('click', () => { state.start = minYear; state.end = maxYear; render(); });
  $('clear-country').addEventListener('click', () => { state.country = ''; render(); });
  for (const group of ['country', 'type']) $('rank-' + group).addEventListener('click', () => { state.rankBy = group; render(); });
  $('download').addEventListener('click', downloadCSV);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  setupMap(); setupBrush(); render();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { setupBrush(); renderTimeline(); }, 120);
  });
}
function updateCountryOptions() {
  const available = [...new Map(rows.filter(r => !state.region || r.region === state.region).map(r => [r.iso, r.country]))].sort((a,b) => a[1].localeCompare(b[1]));
  options('country', available, d => d[1], d => d[0]);
}
function setupMap() {
  const svg = d3.select('#map');
  const pattern = svg.append('defs').append('pattern').attr('id', 'unknown-pattern').attr('patternUnits', 'userSpaceOnUse').attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
  pattern.append('rect').attr('width', 5).attr('height', 5).attr('fill', '#eef1ef');
  pattern.append('line').attr('x1', 0).attr('x2', 0).attr('y2', 5).attr('stroke', '#b7c9c5').attr('stroke-width', 2);
  projection = d3.geoEqualEarth().fitExtent([[18, 15], [882, 414]], { type: 'FeatureCollection', features });
  geoPath = d3.geoPath(projection);
  mapLayer = svg.append('g');
  mapLayer.append('path').datum(d3.geoGraticule10()).attr('class', 'graticule').attr('d', geoPath);
  countries = mapLayer.selectAll('.country').data(features).join('path').attr('class', 'country').attr('d', geoPath).attr('data-iso', d => mapToISO.get(d.id) || '');
  accessibleClick(countries, (event, d) => {
    const iso = mapToISO.get(d.id);
    if (!iso) return;
    if (state.region && !rows.some(r => r.iso === iso && r.region === state.region)) return;
    state.country = state.country === iso ? '' : iso; hideTip(); render();
  });
  zoom = d3.zoom().scaleExtent([1, 6]).translateExtent([[0, 0], [900, 435]]).extent([[0,0],[900,435]]).on('zoom', event => { mapLayer.attr('transform', event.transform); hideTip(); });
  svg.call(zoom).on('dblclick.zoom', null);
  $('zoom-in').onclick = () => svg.call(zoom.scaleBy, 1.4);
  $('zoom-out').onclick = () => svg.call(zoom.scaleBy, 1 / 1.4);
  $('zoom-reset').onclick = resetZoom;
}
function resetZoom() { d3.select('#map').call(zoom.transform, d3.zoomIdentity); }

function renderMap() {
  const context = filterRows(rows, state, { ignoreCountry: true });
  const summaries = new Map(groupSummary(context, 'iso', state.metric).map(d => [d.key, d]));
  const max = d3.max([...summaries.values()], d => d.value) || 1;
  const color = d3.scaleSequentialSqrt(d3.interpolateRgbBasis(['#d5eeea', '#59ada7', '#086b70', '#14364e'])).domain([0, max]);
  countries.attr('fill', d => {
    const s = summaries.get(mapToISO.get(d.id));
    return !s ? '#e7ecec' : s.value === null ? 'url(#unknown-pattern)' : color(s.value);
  }).classed('selected', d => mapToISO.get(d.id) === state.country)
    .attr('aria-pressed', d => mapToISO.get(d.id) === state.country ? 'true' : 'false')
    .attr('aria-label', d => {
      const s = summaries.get(mapToISO.get(d.id));
      return `${d.properties.name}: ${s ? valueLabel(s.value) : 'No matching records'}. Select country.`;
    });
  const tip = (event, d) => {
    const iso = mapToISO.get(d.id), s = summaries.get(iso);
    showTip(event, countryNames.get(iso) || d.properties.name,
      s ? `${valueLabel(s.value)} ${metrics[state.metric].unit}` : 'No matching records in this selection',
      s ? `${coverage(s)}. Select to explore.` : 'Absence of records does not establish absence of disasters.');
  };
  countries.on('pointermove', tip).on('focus', tip).on('pointerleave', hideTip).on('blur', hideTip);
  $('map-title').textContent = state.metric === 'records' ? 'Where are disasters recorded?' : 'Where are reported impacts greatest?';
  $('map-subtitle').textContent = `${metrics[state.metric].label} by country · ${state.start}–${state.end} · map keeps country comparisons in view`;
  const legend = $('legend'); legend.replaceChildren();
  const ramp = document.createElement('div'); ramp.className = 'legend-ramp';
  ramp.style.background = `linear-gradient(90deg, ${d3.range(0, 1.01, .1).map(t => color(t * t * max)).join(',')})`;
  const labels = document.createElement('div'); labels.className = 'legend-labels';
  for (const v of [0, max / 4, max]) { const span = document.createElement('span'); span.textContent = valueLabel(v); labels.append(span); }
  const extra = document.createElement('div'); extra.className = 'legend-extra';
  extra.innerHTML = '<span><i class="swatch"></i>No records</span><span><i class="swatch unknown"></i>Unreported</span><span>Square-root scale</span>';
  if ([...summaries.values()].some(s => s.value !== null)) {
    legend.append(ramp, labels, extra);
  } else {
    const empty = document.createElement('div'); empty.className = 'legend-extra';
    empty.textContent = context.length ? 'No reported values for the selected measure' : 'No records match these filters';
    legend.append(empty, extra);
  }
  const mapIds = new Set(features.map(f => f.id));
  const unmapped = context.filter(r => !mapIds.has(r.map_id));
  $('map-coverage').textContent = `${unmapped.length.toLocaleString()} selected records lack map polygons; retained in the other views. Colors rescale with filters. Country totals are not adjusted for population.`;
}

function renderStats(selected) {
  const data = Object.entries(metrics).map(([metric, info]) => ({ metric, info, ...summarize(selected, metric) }));
  const cards = d3.select('#stats').selectAll('.stat').data(data).join('div').attr('class', 'stat');
  cards.each(function(d) {
    const card = d3.select(this); card.selectAll('*').remove();
    const label = card.append('div').attr('class', 'stat-label'); label.append('span').text(d.info.label); label.append('span').text(d.metric === state.metric ? '↗' : '');
    card.append('div').attr('class', 'stat-value').text(valueLabel(d.value, d.metric)).attr('title', full(d.value));
    card.append('div').attr('class', 'stat-note').text(d.metric === 'records' ? `${new Set(selected.map(r => r.iso)).size} countries & territories` : `${d.count ? d3.format('.0%')(d.reported / d.count) : '0%'} reporting coverage${d.metric.includes('usd') ? ' · 2025 US$' : ''}`);
  });
}

function renderRanking() {
  const byCountry = state.rankBy === 'country';
  const context = filterRows(rows, state, { ignoreCountry: byCountry, ignoreType: !byCountry });
  const groups = groupSummary(context, byCountry ? 'iso' : 'type', state.metric);
  const ranked = groups.sort((a,b) => (b.value ?? -1) - (a.value ?? -1) || a.key.localeCompare(b.key)).slice(0, 10);
  const svg = d3.select('#ranking'); svg.selectAll('*').remove();
  $('rank-country').setAttribute('aria-pressed', byCountry);
  $('rank-type').setAttribute('aria-pressed', !byCountry);
  $('rank-title').textContent = byCountry ? 'Compare countries' : 'Compare disaster types';
  $('ranking-note').textContent = `Top ${Math.min(10, ranked.length)} · ${metrics[state.metric].unit} · ${byCountry ? 'all countries in region' : (state.country ? countryNames.get(state.country) : 'all countries')}`;
  if (!ranked.length) { svg.append('text').attr('x', 215).attr('y', 150).attr('text-anchor', 'middle').attr('fill', '#60747b').text('No records match these filters.'); return; }
  const x = d3.scaleLinear().domain([0, d3.max(ranked, d => d.value) || 1]).range([0, 300]);
  const groupsSVG = svg.selectAll('.rank-row').data(ranked).join('g').attr('class', 'rank-row').attr('transform', (d,i) => `translate(12,${i * 38 + 16})`);
  groupsSVG.append('rect').attr('width', 405).attr('height', 36).attr('fill', 'transparent');
  groupsSVG.append('text').attr('y', 11).attr('font-size', 11).attr('fill', '#314b53').text(d => {
    const name = byCountry ? countryNames.get(d.key) : displayType(d.key);
    return name.length > 39 ? name.slice(0, 37) + '…' : name;
  });
  groupsSVG.append('rect').attr('y', 19).attr('height', 8).attr('width', 300).attr('rx', 2).attr('fill', '#eff4f2');
  groupsSVG.append('rect').attr('class', 'bar').attr('y', 19).attr('height', 8).attr('width', d => d.value === null ? 0 : x(d.value)).attr('rx', 2)
    .attr('fill', d => d.key === (byCountry ? state.country : state.type) ? '#c07732' : '#228580');
  groupsSVG.append('text').attr('x', 400).attr('y', 27).attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', 600).attr('fill', '#173640').text(d => valueLabel(d.value));
  accessibleClick(groupsSVG, (event, d) => { const key = byCountry ? 'country' : 'type'; state[key] = state[key] === d.key ? '' : d.key; hideTip(); render(); });
  groupsSVG.attr('aria-label', d => `${byCountry ? countryNames.get(d.key) : displayType(d.key)}: ${valueLabel(d.value)}. ${coverage(d)}. Select to filter.`)
    .attr('aria-pressed', d => d.key === (byCountry ? state.country : state.type));
  const tip = (event, d) => showTip(event, byCountry ? countryNames.get(d.key) : displayType(d.key), `${full(d.value)} ${metrics[state.metric].unit}`, coverage(d));
  groupsSVG.on('pointermove', tip).on('focus', tip).on('pointerleave', hideTip).on('blur', hideTip);
}

function annualData() {
  const context = filterRows(rows, state, { ignoreYears: true });
  const grouped = new Map(groupSummary(context, 'year', state.metric).map(d => [d.key, d]));
  return d3.range(defaults.start, defaults.end + 1).map(year => ({ year, ...(grouped.get(year) || summarize([], state.metric)) }));
}
function renderTimeline() {
  const annual = annualData();
  const svg = d3.select('#timeline'); svg.selectAll('*').remove();
  const width = timelineWidth(), left = 60, right = width - 20;
  svg.attr('viewBox', `0 0 ${width} 260`);
  const x = d3.scaleLinear().domain([defaults.start - .5, defaults.end + .5]).range([left, right]);
  const y = d3.scaleLinear().domain([0, d3.max(annual, d => d.value) || 1]).nice().range([207, 30]);
  svg.append('rect').attr('x', x(state.start - .5)).attr('y', 24).attr('width', x(state.end + .5) - x(state.start - .5)).attr('height', 183).attr('fill', '#eff7f3');
  svg.append('g').attr('class', 'axis grid').attr('transform', `translate(${left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(right-left)).tickFormat('')).selectAll('text').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(10).tickFormat(v => valueLabel(v)));
  const ticks = d3.range(defaults.start, defaults.end - (width < 600 ? 2 : 0) + 1, width < 600 ? 5 : 2);
  if (!ticks.includes(defaults.end)) ticks.push(defaults.end);
  svg.append('g').attr('class', 'axis').attr('transform', 'translate(0,207)').call(d3.axisBottom(x).tickValues(ticks).tickFormat(v => v === 2026 ? '2026*' : String(v)).tickSize(0).tickPadding(15));
  svg.append('text').attr('x', left).attr('y', 14).attr('font-size', 10).attr('fill', '#60747b').text(metrics[state.metric].unit + (state.metric.includes('usd') ? ' · 2025 prices' : ''));
  const line = d3.line().defined(d => d.value !== null).x(d => x(d.year)).y(d => y(d.value));
  // Keep the partial current year visually separate from complete annual observations.
  svg.append('path').datum(annual.filter(d => d.year < 2026)).attr('fill', 'none').attr('stroke', '#117b78').attr('stroke-width', 2.5).attr('d', line);
  svg.append('path').datum(annual.filter(d => d.year >= 2025)).attr('fill', 'none').attr('stroke', '#bc782f').attr('stroke-width', 2).attr('stroke-dasharray', '5 4').attr('d', line);
  const dots = svg.selectAll('.timeline-dot').data(annual.filter(d => d.value !== null)).join('circle').attr('class', 'timeline-dot').attr('cx', d => x(d.year)).attr('cy', d => y(d.value)).attr('r', 4)
    .style('fill', d => d.year === 2026 ? '#bc782f' : '#117b78').attr('tabindex', 0).attr('role', 'img')
    .attr('aria-label', d => `${d.year}${d.year === 2026 ? ' partial year' : ''}: ${full(d.value)} ${metrics[state.metric].unit}. ${coverage(d)}`);
  const tip = (event, d) => showTip(event, `${d.year}${d.year === 2026 ? ' · partial year' : ''}`, `${full(d.value)} ${metrics[state.metric].unit}`, coverage(d));
  dots.on('pointermove', tip).on('focus', tip).on('pointerleave', hideTip).on('blur', hideTip);
  if (!annual.some(d => d.value !== null)) svg.append('text').attr('x', width / 2).attr('y', 110).attr('text-anchor', 'middle').attr('fill', '#60747b').attr('font-size', 12).text('No reported values for this selection.');
  svg.append('line').attr('x1', x(2025.5)).attr('x2', x(2025.5)).attr('y1', 26).attr('y2', 207).attr('stroke', '#c6a47a').attr('stroke-dasharray', '3 3');
  $('timeline-note').textContent = `${state.country ? countryNames.get(state.country) : state.region || 'Worldwide'} · ${state.type ? displayType(state.type) : 'all natural hazards'} · annual ${metrics[state.metric].label.toLowerCase()} by start year`;
  const miniY = d3.scaleLinear().domain(y.domain()).range([49, 7]);
  d3.select('#brush .mini-line').datum(annual).attr('d', d3.line().defined(d => d.value !== null).x(d => brushScale(d.year)).y(d => miniY(d.value)));
  syncing = true;
  brushGroup.call(brush.move, [brushScale(state.start - .5), brushScale(state.end + .5)]);
  syncing = false;
}
function setupBrush() {
  const width = timelineWidth(), left = 60, right = width - 20;
  brushScale = d3.scaleLinear().domain([defaults.start - .5, defaults.end + .5]).range([left, right]);
  const svg = d3.select('#brush');
  svg.selectAll('*').remove(); svg.attr('viewBox', `0 0 ${width} 70`);
  svg.append('rect').attr('x', left).attr('y', 3).attr('width', right-left).attr('height', 50).attr('fill', '#f1f5f3');
  svg.append('path').attr('class', 'mini-line').attr('fill', 'none').attr('stroke', '#73a49c').attr('stroke-width', 1.5);
  brush = d3.brushX().extent([[left, 3], [right, 53]]).on('end', event => {
    if (syncing || !event.sourceEvent) return;
    if (event.selection) {
      state.start = Math.max(defaults.start, Math.min(defaults.end, Math.round(brushScale.invert(event.selection[0]) + .5)));
      state.end = Math.max(state.start, Math.min(defaults.end, Math.round(brushScale.invert(event.selection[1]) - .5)));
    } else { state.start = defaults.start; state.end = defaults.end; }
    hideTip(); render();
  });
  brushGroup = svg.append('g').attr('class', 'brush').call(brush);
}

function renderInsight(selected) {
  const types = groupSummary(selected, 'type', state.metric).filter(d => d.value !== null).sort((a,b) => b.value - a.value);
  const total = summarize(selected, state.metric);
  if (!selected.length) {
    $('insight-title').textContent = 'No records match this selection.';
    $('insight-text').textContent = 'Broaden the time period, change the hazard, or reset the filters to continue exploring.';
  } else if (!types.length) {
    $('insight-title').textContent = 'A missing number is part of the story.';
    $('insight-text').textContent = `None of the ${selected.length.toLocaleString()} selected records report this measure. Try another measure; missing figures do not establish zero impact.`;
  } else {
    const top = types[0];
    $('insight-title').textContent = `${displayType(top.key)} leads this selection in ${metrics[state.metric].label.toLowerCase()}.`;
    $('insight-text').textContent = `${valueLabel(top.value)} ${metrics[state.metric].unit}${total.value > 0 ? `, or ${d3.format('.1%')(top.value / total.value)} of the selected total` : ''}. ${state.metric === 'records' ? 'Switch to deaths or damage to see whether the most frequent hazards also have the greatest reported impacts.' : `${coverage(total)}. Differences in reporting can influence this comparison.`}`;
  }
}
function renderTable(selected) {
  $('record-count').textContent = `(${selected.length.toLocaleString()})`;
  const tr = d3.select('#record-body').selectAll('tr').data(selected.slice(0, 100), d => d.id).join('tr');
  tr.selectAll('td').data(d => [d.id, d.year, d.country, displayType(d.type), full(d.deaths), full(d.affected), full(d.damage_adjusted_usd)]).join('td').text(d => d);
  $('download').disabled = !selected.length;
}
function downloadCSV() {
  const selected = filterRows(rows, state);
  const fields = ['id', 'year', 'iso', 'country', 'region', 'type', 'deaths', 'affected', 'damage_adjusted_usd'];
  const url = URL.createObjectURL(new Blob([d3.csvFormat(selected, fields)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `emdat-filtered-${state.start}-${state.end}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function render() {
  for (const id of ['metric', 'type', 'region', 'country']) $(id).value = state[id];
  $('start-year').value = state.start; $('end-year').value = state.end;
  $('year-range').textContent = `${state.start}–${state.end}${state.end === 2026 ? ' · 2026 partial' : ''}`;
  $('clear-country').hidden = !state.country;
  const selected = filterRows(rows, state);
  $('scope').textContent = `${state.country ? countryNames.get(state.country) : state.region || 'Worldwide'} / ${state.type ? displayType(state.type) : 'All 14 natural hazards'} / ${state.start}–${state.end} · ${selected.length.toLocaleString()} records`;
  renderStats(selected); renderMap(); renderRanking(); renderTimeline(); renderInsight(selected); renderTable(selected);
  document.body.dataset.ready = 'true';
}

try {
  if (!d3 || !window.topojson) throw new Error('Local D3 or TopoJSON library could not be loaded.');
  const [dataset, world] = await Promise.all([d3.json('data/processed/disasters.json'), d3.json('data/geo/countries-110m.json')]);
  rows = dataset.records; metadata = dataset.metadata;
  if (!rows?.length) throw new Error('No processed disaster records found.');
  features = window.topojson.feature(world, world.objects.countries).features.filter(f => f.properties.name !== 'Antarctica');
  setup();
} catch (error) {
  $('error').hidden = false;
  $('error').textContent = `The explorer could not load its local data. Start it with “python -m http.server 8000 --bind 127.0.0.1” in the project folder and visit http://127.0.0.1:8000. If needed, run scripts/prepare_data.py first. Details: ${error.message}`;
  $('scope').textContent = 'Data unavailable';
  console.error(error);
}
