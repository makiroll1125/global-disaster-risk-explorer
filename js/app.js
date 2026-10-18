import { rangeControls, setupStickyFilters, setupFilterMenus } from './controls.js';
import { renderExtraCharts } from './charts.js';
import { metrics, summarize, filterRows, groupSummary, timeSeries, validMonth, typeLabel } from './data.js';
import { hazardColors, hazardDescriptions, hazardType, DAY } from './hazards.js';
import { EventMap } from './event-map.js';
import { nextReplayDate, upperBound, advanceReplayDate } from './map-analysis.js';
import { CountryHazardExplorer } from './country-hazard.js';

const $ = id => document.getElementById(id);
const d3 = window.d3;
const tooltip = $('tooltip');
let rows, metadata, features, state, defaults, projection, geoPath, mapLayer, countries, zoom;
// Shared categories, independent historical/map clocks, and local treemap navigation.
let historyState, mapState, treeState, rankingState, seasonState, streamState, timeBounds;
const historyFilters = () => ({ ...state, ...historyState });
let playbackTimer;
let eventMap;
let countryHazardExplorer;
let mapColor, lastCountryPaint = 0;
let syncFilterMenus = () => {};
const cutoffDate = () => Date.parse(metadata.reporting_cutoff + 'T00:00:00Z');
const mapDateBounds = () => {
  const bounds = [Date.UTC(mapState.start, 0, 1), Math.min(Date.UTC(mapState.end + 1, 0, 1) - DAY, cutoffDate())];
  const interval = eventMap?.explorer.selection.interval;
  return interval && interval[1] >= bounds[0] && interval[0] <= bounds[1] ? [Math.max(bounds[0], interval[0]), Math.min(bounds[1], interval[1])] : bounds;
};
let typeColor;
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
let brush, brushGroup, brushScale, syncing = false;
const timelineWidth = () => Math.max(360, $('timeline').clientWidth - 30);
const full = value => value === null ? 'Not reported' : d3.format(',.0f')(value);
const compact = value => value === null ? ' - ' : value === 0 ? '0' : d3.format('.3~s')(value).replace('G', 'B');
const valueLabel = (value, metric = state.metric) => value === null ? 'Not reported' : (metric.includes('usd') ? '$' : '') + compact(value);
const displayType = type => type === 'Mass movement (wet)' ? 'Landslide (wet)' : type;
const countryNames = new Map();
const mapToISO = new Map();

function showTip(event, title, detail, note = '') {
  if (event.buttons) return;
  tooltip.dataset.owner = event.currentTarget?.closest?.('svg,.filter-menu')?.id || '';
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
function hideTip(owner) { if (typeof owner !== 'string' || tooltip.dataset.owner === owner) tooltip.hidden = true; }
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
  defaults = { metric: 'records', types: null, region: '', country: '' };
  timeBounds = { start: minYear, end: maxYear };
  resetLocalStates();
  state = Object.freeze({ ...defaults });
  const recordedTypes = [...new Set(rows.map(r => r.type))].sort();
  typeColor = d3.scaleOrdinal(recordedTypes, recordedTypes.map(type => hazardColors[type])).unknown('#777a99');
  options('type', Object.keys(hazardColors).sort(), type => rows.some(r => r.type === type) ? type : `${type} — no records in source`);
  d3.select('#type').selectAll('option.generated').attr('disabled', type => rows.some(r => r.type === type) ? null : true);
  for (const option of $('type').options) option.selected = !option.disabled;
  options('region', [...new Set(rows.map(r => r.region))].sort());
  updateCountryOptions();
  const years = d3.range(minYear, maxYear + 1);
  for (const id of ['start-year', 'end-year', 'map-start-year', 'map-end-year']) options(id, years, y => y === 2026 ? '2026*' : y);
  for (const id of ['metric', 'type', 'region', 'country']) $(id).addEventListener('change', () => {
    const alignReplay = id !== 'metric';
    if (alignReplay) { stopPlayback(); mapState.lastJumpDays = 0; }
    if (id === 'type') {
      const types = [...$('type').selectedOptions].filter(o => !o.disabled).map(o => o.value);
      state = Object.freeze({ ...state, types: types.length === recordedTypes.length ? null : types });
    } else state = Object.freeze({ ...state, [id]: $(id).value });
    if (id === 'region') { state = Object.freeze({ ...state, country: '' }); updateCountryOptions(); }
    hideTip(); render({ alignReplay });
  });
  $('start-year').addEventListener('change', () => { historyState.start = +$('start-year').value; historyState.end = Math.max(historyState.end, historyState.start); renderTimeline(); });
  $('end-year').addEventListener('change', () => { historyState.end = +$('end-year').value; historyState.start = Math.min(historyState.start, historyState.end); renderTimeline(); });
  $('reset').addEventListener('click', () => { stopPlayback(); mapState.lastJumpDays = 0; state = Object.freeze({ ...defaults }); updateCountryOptions(); render({ alignReplay: true }); });
  $('all-years').addEventListener('click', () => { historyState.start = minYear; historyState.end = maxYear; renderTimeline(); });
  $('clear-country').addEventListener('click', () => eventMap.explorer.clearSpatial());
  for (const group of ['country', 'type']) $('rank-' + group).addEventListener('click', () => { rankingState.rankBy = group; renderRanking(); });
  $('download').addEventListener('click', downloadCSV);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  for (const radio of document.querySelectorAll('[name="aggregation"]')) radio.onchange = () => {
    historyState.aggregation = radio.value; hideTip(); renderTimeline();
  };
  for (const radio of document.querySelectorAll('[name="map-mode"]')) radio.onchange = () => {
    stopPlayback(); mapState.mode = radio.value; renderMap({ alignReplay: radio.value === 'timeline' });
  };
  for (const radio of document.querySelectorAll('[name="map-encoding"]')) radio.onchange = () => {
    eventMap.enableAreaSelection(false); mapState.encoding = radio.value; renderMap();
  };
  $('rank-all').onclick = () => selectHazards(null);
  $('rank-none').onclick = () => selectHazards([]);
  $('map-start-year').onchange = () => {
    stopPlayback(); mapState.start = +$('map-start-year').value; mapState.end = Math.max(mapState.start, mapState.end); renderMap();
  };
  $('map-end-year').onchange = () => {
    stopPlayback(); mapState.end = +$('map-end-year').value; mapState.start = Math.min(mapState.start, mapState.end); renderMap();
  };
  $('map-year').oninput = () => seekDate(Date.UTC(+$('map-year').value, 0, 1));
  $('map-day').oninput = () => seekDate(+$('map-day').value * DAY);
  $('map-approximate').onchange = () => { mapState.approximate = $('map-approximate').checked; renderMap(); };
  for (const [id, step] of [['map-prev', -1], ['map-next', 1]]) $(id).onclick = () => {
    seekDate(mapState.date + step * DAY);
  };
  $('map-speed').onchange = () => { mapState.speed = +$('map-speed').value; updatePlaybackControls(); };
  $('map-play').onclick = () => { if (mapState.playing) { stopPlayback(); updatePlaybackControls(); } else startPlayback(); };
  $('map-skip-quiet').onchange = () => {
    mapState.skipQuiet = $('map-skip-quiet').checked;
    if (mapState.playing) { stopPlayback(); startPlayback(); } else updatePlaybackControls();
  };
  $('map-next-recorded').onclick = () => {
    const days = eventMap.explorer.replayDays;
    const next = nextReplayDate(days, mapState.date) ?? days[0];
    if (next !== undefined) seekDate(next);
  };
  $('map-show-references').onclick = () => {
    mapState.approximate = true; $('map-approximate').checked = true; renderMap({ alignReplay: true });
  };
  $('map-clear-replay-selection').onclick = () => {
    eventMap.explorer.resetSelection(); mapState.mode = 'timeline'; renderMap({ alignReplay: true });
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopPlayback(); updatePlaybackControls(); } });
  $('map-expand').onclick = () => setMapExpanded(!$('map-expand').matches('[aria-expanded="true"]'));
  document.querySelector('.hazard-key').addEventListener('toggle', fitExpandedMap);
  $('map-exploration').addEventListener('toggle', () => {
    if ($('map-exploration').open && eventMap?.state) {
      eventMap.explorer.drawTimeline(); eventMap.explorer.update(eventMap.selected, { force: true });
    }
    fitExpandedMap();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (eventMap.areaSelecting) eventMap.enableAreaSelection(false); else setMapExpanded(false); } });
  syncFilterMenus = setupFilterMenus({ showTip, hideTip });
  countryHazardExplorer = new CountryHazardExplorer({ rows, metadata, colors: hazardColors, showTip, hideTip });
  setupStickyFilters(); setupMap(); setupBrush(); render();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { setupBrush(); render(); fitExpandedMap(); }, 120);
  });
}
function resetLocalStates() {
  historyState = { ...timeBounds, aggregation: 'yearly' };
  mapState = { ...timeBounds, year: timeBounds.start, date: Date.UTC(timeBounds.start, 0, 1), mode: 'period', encoding: 'events', playing: false, speed: 12000, country: '', approximate: true, skipQuiet: false, lastJumpDays: 0 };
  treeState = { ...timeBounds, region: '', country: '', type: '' };
  rankingState = { ...timeBounds, rankBy: 'country', country: '', type: '' };
  seasonState = { ...timeBounds };
  streamState = { ...timeBounds, type: '' };
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
  mapLayer = svg.append('g').attr('class', 'map-geography');
  mapLayer.append('path').datum(d3.geoGraticule10()).attr('class', 'graticule').attr('d', geoPath);
  countries = mapLayer.selectAll('.country').data(features).join('path').attr('class', 'country').attr('d', geoPath).attr('data-iso', d => mapToISO.get(d.id) || '');
  accessibleClick(countries, (event, d) => {
    const iso = mapToISO.get(d.id);
    if (!iso) return;
    if (state.region && !rows.some(r => r.iso === iso && r.region === state.region)) return;
    hideTip(); eventMap.explorer.chooseCountry(eventMap.explorer.selection.country === iso ? '' : iso);
  });
  eventMap = new EventMap({ svg, projection, features, showTip, hideTip, onDate: seekDate, allRows: rows,
    onChange: kind => {
      if (kind === 'selection') { stopPlayback(); mapState.mode = 'period'; mapState.country = eventMap.explorer.selection.country; renderMap(); }
      else { eventMap.clearPulses(); eventMap.render(); fitExpandedMap(); }
    },
    onInspect: () => { stopPlayback(); updatePlaybackControls(); },
    onClusterZoom: point => svg.call(zoom.scaleBy, 2, point),
  });
  let pendingTransform, panFrame;
  const paintTransform = () => {
    panFrame = null;
    if (!pendingTransform) return;
    const transform = pendingTransform; pendingTransform = null;
    mapLayer.attr('transform', transform);
    if (eventMap.state) eventMap.zoom(transform);
  };
  zoom = d3.zoom().filter(event => !eventMap.areaSelecting && (!event.ctrlKey || event.type === 'wheel') && !event.button)
    .scaleExtent([1, 6]).translateExtent([[0, 0], [900, 435]]).extent([[0,0],[900,435]])
    .on('start', hideTip)
    .on('zoom', event => {
      svg.classed('is-interacting', true);
      pendingTransform = event.transform;
      if (!panFrame) panFrame = requestAnimationFrame(paintTransform);
    })
    .on('end', () => { cancelAnimationFrame(panFrame); paintTransform(); svg.classed('is-interacting', false); });
  svg.call(zoom).on('dblclick.zoom', null);
  $('zoom-in').onclick = () => svg.call(zoom.scaleBy, 1.4);
  $('zoom-out').onclick = () => svg.call(zoom.scaleBy, 1 / 1.4);
  $('zoom-reset').onclick = resetZoom;
}
function resetZoom() { d3.select('#map').call(zoom.transform, d3.zoomIdentity); }

function setMapExpanded(expanded) {
  const button = $('map-expand');
  if ((button.getAttribute('aria-expanded') === 'true') === expanded) return;
  document.querySelector('.main-grid').classList.toggle('map-expanded', expanded);
  document.body.classList.toggle('map-is-expanded', expanded);
  document.documentElement.classList.toggle('map-is-expanded', expanded);
  button.setAttribute('aria-expanded', expanded);
  button.setAttribute('aria-label', expanded ? 'Restore map size' : 'Expand map');
  button.textContent = expanded ? '↙' : '⛶';
  if (expanded) { button.dataset.explorationOpen = $('map-exploration').open; $('map-exploration').open = false; }
  else $('map-exploration').open = button.dataset.explorationOpen === 'true';
  eventMap.clearPulses();
  if (!expanded) $('map').style.removeProperty('height');
  requestAnimationFrame(() => { fitExpandedMap(); eventMap.render(); if (expanded) $('geography').scrollIntoView({ block: 'start' }); else button.focus({ preventScroll: true }); });
}

function fitExpandedMap() {
  if ($('map-expand').getAttribute('aria-expanded') !== 'true') return;
  const map = $('map');
  const otherHeight = $('geography').getBoundingClientRect().height - map.getBoundingClientRect().height;
  map.style.height = Math.max(180, innerHeight - 24 - otherHeight) + 'px';
  if (eventMap.state) eventMap.render();
}

function updatePlaybackControls() {
  const [min, max] = mapDateBounds();
  $('map-day').min = min / DAY; $('map-day').max = max / DAY; $('map-day').value = mapState.date / DAY;
  $('map-current-date').textContent = d3.utcFormat('%d %b %Y')(mapState.date);
  $('map-day').setAttribute('aria-valuetext', $('map-current-date').textContent);
  $('map-year').value = mapState.year; $('map-current-year').textContent = mapState.year;
  $('map-prev').disabled = mapState.date <= min; $('map-next').disabled = mapState.date >= max;
  $('map-play').textContent = mapState.playing ? 'Pause' : 'Play';
  $('map-play').setAttribute('aria-pressed', mapState.playing);
  if (mapState.mode === 'timeline') {
    $('map-subtitle').textContent = `${mapState.encoding === 'choropleth' ? metrics[state.metric].label + ' by country' : 'Recorded starts · ' + typeLabel(state)} · through ${$('map-current-date').textContent} · map range ${mapState.start}–${mapState.end}`;
    if (mapState.encoding === 'choropleth' && mapColor && (!mapState.playing || performance.now() - lastCountryPaint > 150)) {
      const totals = new Map(groupSummary(eventMap.selected, 'iso', state.metric).map(d => [d.key, d]));
      countries.interrupt().attr('fill', d => {
        const summary = totals.get(mapToISO.get(d.id));
        return !summary ? '#e7ecec' : summary.value === null ? 'url(#unknown-pattern)' : mapColor(summary.value);
      });
      countries.attr('aria-label', d => {
        const summary = totals.get(mapToISO.get(d.id));
        return `${d.properties.name}: ${summary ? valueLabel(summary.value) : 'No matching records'}. Highlight country in this map.`;
      });
      lastCountryPaint = performance.now();
    }
  }
  updateReplayGuidance();
}

function updateReplayGuidance() {
  $('map-replay-guidance').hidden = mapState.mode !== 'timeline';
  if (!eventMap?.explorer.state) return;
  const explorer = eventMap.explorer, days = explorer.replayDays || [];
  const context = explorer.timelineItems();
  const dated = explorer.timelineDated;
  const throughDate = upperBound(dated, mapState.date, d => d.day);
  const missing = explorer.missingDates;
  const next = nextReplayDate(days, mapState.date);
  $('map-play').disabled = !days.length;
  $('map-next-recorded').disabled = !days.length;
  $('map-next-recorded').textContent = next === null ? 'First recorded start' : 'Next recorded start';
  $('map-skip-quiet').checked = mapState.skipQuiet;
  const hiddenReferences = !mapState.approximate && explorer.referenceDates;
  $('map-show-references').hidden = !hiddenReferences;
  $('map-clear-replay-selection').hidden = !(explorer.selection.area || explorer.selection.country || explorer.selection.interval);
  let message;
  if (!context.length) message = 'No records match these hazards, geography, map years, and local filters. Adjust the map range or clear local map filters.';
  else if (!days.length) message = `${context.length.toLocaleString()} matching records have no complete start date within the export cutoff. Use Selected period to inspect them; daily replay requires a reported day.`;
  else {
    message = `${dated.length.toLocaleString()} dated records across ${days.length.toLocaleString()} recorded dates in the selected period · ${throughDate.toLocaleString()} through the current date. `;
    if (!throughDate) message += `No starts yet. Jump to ${d3.utcFormat('%d %b %Y')(days[0])} with the recorded-start button. `;
    message += `1 year / ${mapState.speed / 1000} ${mapState.speed === 1000 ? 'second' : 'seconds'}. Markers fade after 2.5 seconds.`;
    if (mapState.skipQuiet) message += ' Quiet gaps are skipped; elapsed years are compressed.';
  }
  if (hiddenReferences) message += ' Records without source coordinates remain in the timeline; show country references to place those with mapped countries.';
  if (mapState.approximate && throughDate && !eventMap.selected.some(d => d.point)) message += ' These records lack both source coordinates and mapped country references; they remain in the timeline and record list.';
  if (missing && days.length) message += ` ${missing.toLocaleString()} records with incomplete dates remain available in Selected period.`;
  if (mapState.lastJumpDays > 1) message += ` Last jump skipped ${(mapState.lastJumpDays - 1).toLocaleString()} dates without matching recorded starts.`;
  $('map-replay-status').textContent = message;
}

function seekDate(date) {
  stopPlayback();
  const [min, max] = mapDateBounds();
  mapState.date = Math.max(min, Math.min(max, date));
  mapState.lastJumpDays = 0;
  mapState.year = new Date(mapState.date).getUTCFullYear();
  eventMap.clearPulses(); eventMap.clearTrail(); eventMap.renderDate = null;
  eventMap.render(mapState.date - DAY); updatePlaybackControls();
}

function stopPlayback() {
  cancelAnimationFrame(playbackTimer); mapState.playing = false;
  if (eventMap?.selected) eventMap.explorer.update(eventMap.selected, { force: true });
}
function startPlayback() {
  const [min, max] = mapDateBounds();
  const days = eventMap.explorer.replayDays;
  if (!days.length) { stopPlayback(); updatePlaybackControls(); return; }
  if (mapState.skipQuiet) {
    if (mapState.date >= days.at(-1) || mapState.date < days[0]) mapState.date = days[0];
  } else if (mapState.date >= max) mapState.date = min;
  mapState.lastJumpDays = 0;
  mapState.year = new Date(mapState.date).getUTCFullYear();
  mapState.playing = true;
  eventMap.clearTrail(); eventMap.clearPulses(); eventMap.renderDate = null;
  eventMap.render(mapState.date - DAY);
  updatePlaybackControls();
  let cursor = mapState.date, lastTime = performance.now(), lastPaint = lastTime, lastJump = -Infinity;
  const end = mapState.skipQuiet ? days.at(-1) : max;
  const tick = now => {
    if (!mapState.playing) return;
    cursor = Math.min(end, advanceReplayDate(cursor, Math.max(0, now - lastTime), mapState.speed));
    lastTime = now;
    // Render at most 30 times/second; every source start crossed is still emitted.
    if (now - lastPaint >= 32 || cursor >= end) {
      lastPaint = now;
      let target = Math.min(end, Math.floor(cursor / DAY) * DAY);
      const next = nextReplayDate(days, target);
      if (mapState.skipQuiet && next !== null && next - target > 30 * DAY && now - lastJump >= 250) {
        mapState.lastJumpDays = Math.round((next - target) / DAY);
        cursor = target = next; lastJump = now;
      }
      if (target !== mapState.date) {
        const previous = mapState.date;
        mapState.date = target; mapState.year = new Date(target).getUTCFullYear();
        eventMap.render(previous); updatePlaybackControls();
      }
    }
    if (cursor >= end) { stopPlayback(); updatePlaybackControls(); return; }
    playbackTimer = requestAnimationFrame(tick);
  };
  playbackTimer = requestAnimationFrame(tick);
}
function renderMap({ alignReplay = false } = {}) {
  if (tooltip.dataset.owner === 'map') hideTip();
  mapState.year = Math.max(mapState.start, Math.min(mapState.end, mapState.year));
  if (new Date(mapState.date).getUTCFullYear() !== mapState.year) mapState.date = Date.UTC(mapState.year, 0, 1);
  const [dateMin, dateMax] = mapDateBounds();
  mapState.date = Math.max(dateMin, Math.min(mapState.date, dateMax));
  mapState.year = new Date(mapState.date).getUTCFullYear();
  $('clear-country').hidden = !mapState.country;
  const animated = mapState.mode === 'timeline';
  const rangeContext = filterRows(rows, { ...state, start: mapState.start, end: mapState.end });
  $('event-replay').hidden = !animated;
  eventMap.setData(rangeContext, mapState, cutoffDate(), { alignReplay });
  const impacts = mapState.encoding === 'choropleth';
  $('geography').dataset.encoding = mapState.encoding;
  document.querySelector(`[name="map-encoding"][value="${mapState.encoding}"]`).checked = true;
  $('map-encoding-note').textContent = impacts ? 'Country color shows the selected impact measure' : 'Color identifies disaster type';
  $('map').setAttribute('aria-label', impacts ? 'Choropleth of reported country disaster impacts' : 'Disaster locations colored by hazard type on a neutral world map');
  const period = animated ? String(mapState.year) + (mapState.year === metadata.partial_year ? ' · partial year' : '') : `${mapState.start}–${mapState.end}`;
  document.querySelector(`[name="map-mode"][value="${mapState.mode}"]`).checked = true;
  $('map-start-year').value = mapState.start; $('map-end-year').value = mapState.end; $('playback').hidden = !animated;
  $('map-year').min = new Date(dateMin).getUTCFullYear(); $('map-year').max = new Date(dateMax).getUTCFullYear(); $('map-year').value = mapState.year;
  $('map-current-year').textContent = mapState.year; $('map-current-year').title = period; $('map-speed').value = mapState.speed;
  $('map-play').textContent = mapState.playing ? 'Pause' : 'Play';
  $('map-play').setAttribute('aria-pressed', mapState.playing);
  $('map-prev').disabled = mapState.year <= mapState.start; $('map-next').disabled = mapState.year >= mapState.end;
  updatePlaybackControls();
  const context = eventMap.explorer.select(eventMap.items).map(item => item.row);
  $('event-replay').hidden = !animated;
  const summaries = new Map(groupSummary(context, 'iso', state.metric).map(d => [d.key, d]));
  // Cumulative replay uses a fixed domain from full-period country totals.
  const max = d3.max(animated ? groupSummary(rangeContext, 'iso', state.metric) : [...summaries.values()], d => d.value) || 1;
  const color = d3.scaleSequentialSqrt(d3.interpolateRgbBasis(['#d5eeea', '#59ada7', '#086b70', '#14364e'])).domain([0, max]);
  mapColor = color;
  countries.interrupt();
  const colored = animated ? countries.transition().duration(motion()) : countries;
  colored.attr('fill', d => {
    if (!impacts) return '#e5ebe8';
    const s = summaries.get(mapToISO.get(d.id));
    return !s ? '#e7ecec' : s.value === null ? 'url(#unknown-pattern)' : color(s.value);
  });
  countries.classed('selected', d => mapToISO.get(d.id) === mapState.country && summaries.has(mapState.country))
    .attr('aria-pressed', d => mapToISO.get(d.id) === mapState.country && summaries.has(mapState.country) ? 'true' : 'false')
    .attr('aria-label', d => {
      const s = summaries.get(mapToISO.get(d.id));
      return `${d.properties.name}: ${s ? valueLabel(s.value) : 'No matching records'}. Highlight country in this map.`;
    });
  const tip = (event, d) => {
    const iso = mapToISO.get(d.id);
    const s = animated ? groupSummary(eventMap.selected.filter(item => item.row.iso === iso).map(item => item.row), 'iso', state.metric)[0] : summaries.get(iso);
    showTip(event, countryNames.get(iso) || d.properties.name,
      s ? `${valueLabel(s.value)} ${metrics[state.metric].unit}` : 'No matching records in this selection',
      s ? `${animated ? 'Starts through ' + d3.utcFormat('%d %b %Y')(mapState.date) : period}. ${coverage(s)}. Select to highlight in this map.` : 'Absence of records does not establish absence of disasters.');
  };
  countries.on('pointermove', tip).on('focus', tip).on('pointerleave', hideTip).on('blur', hideTip);
  $('map-title').textContent = !impacts || state.metric === 'records' ? 'Where are disasters recorded?' : 'Where are reported impacts greatest?';
  d3.select('#map').attr('data-start', mapState.start).attr('data-end', mapState.end);
  $('map-subtitle').textContent = `${impacts ? metrics[state.metric].label + ' by country' : 'Recorded starts · ' + typeLabel(state)} · ${period} · map range ${mapState.start}–${mapState.end}${impacts ? ` · ${animated ? 'starts through replay date' : 'selected-period totals'}` : ''}${mapState.country ? ` · Local selection: ${countryNames.get(mapState.country)}${summaries.has(mapState.country) ? '' : ' (unavailable under current filters)'}` : ''}`;
  document.querySelector('.map-footer').hidden = !impacts;
  eventMap.layer.attr('display', impacts ? 'none' : null);
  eventMap.pulses.attr('display', impacts ? 'none' : null);
  const legend = $('legend'); legend.replaceChildren();
  const ramp = document.createElement('div'); ramp.className = 'legend-ramp';
  ramp.style.background = `linear-gradient(90deg, ${d3.range(0, 1.01, .1).map(t => color(t * t * max)).join(',')})`;
  const labels = document.createElement('div'); labels.className = 'legend-labels';
  for (const v of [...new Set([0, state.metric === 'records' ? Math.round(max / 4) : max / 4, max])]) { const span = document.createElement('span'); span.textContent = valueLabel(v); labels.append(span); }
  const extra = document.createElement('div'); extra.className = 'legend-extra';
  extra.innerHTML = '<span><i class="swatch"></i>No records</span><span><i class="swatch unknown"></i>Unreported</span><span>Square-root scale</span>';
  if ([...summaries.values()].some(s => s.value !== null)) {
    legend.append(ramp, labels, extra);
  } else {
    const empty = document.createElement('div'); empty.className = 'legend-extra';
    empty.textContent = context.length ? 'No reported values for the selected measure' : 'No records match these filters';
    legend.append(empty, extra);
  }
  legend.setAttribute('aria-label', 'Country shading: reported impact totals. Event markers use disaster colors.');
  const mapIds = new Set(features.map(f => f.id));
  const unmapped = context.filter(r => !mapIds.has(r.map_id));
  $('map-coverage').textContent = impacts ? `${unmapped.length.toLocaleString()} selected records lack map polygons; retained in selection totals. ${animated ? 'Country shading shows records accumulated through the replay date; the scale is fixed across playback years.' : 'Colors rescale with filters.'} Country totals are not adjusted for population.` : 'Countries share a neutral fill. Color identifies disaster type. Numbered groups count records; select a group to inspect them or ungroup to compare individual impacts.';
  fitExpandedMap();
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
  hideTip();
  rangeControls('ranking-range', rankingState, timeBounds, renderRanking);
  const byCountry = rankingState.rankBy === 'country';
  const context = filterRows(rows, { ...state, start: rankingState.start, end: rankingState.end }, { ignoreType: !byCountry });
  const groups = groupSummary(context, byCountry ? 'iso' : 'type', state.metric);
  const ranked = groups.sort((a,b) => (b.value ?? -1) - (a.value ?? -1) || a.key.localeCompare(b.key)).slice(0, byCountry ? 10 : Infinity);
  const svg = d3.select('#ranking'); svg.selectAll('*').remove();
  $('rank-country').setAttribute('aria-pressed', byCountry);
  $('rank-type').setAttribute('aria-pressed', !byCountry);
  $('rank-title').textContent = byCountry ? 'Compare countries' : 'Compare disaster types';
  const height = Math.max(410, ranked.length * 38 + 24);
  svg.attr('viewBox', `0 0 430 ${height}`);
  $('rank-selection').hidden = false;
  $('rank-selection').style.visibility = byCountry ? 'hidden' : 'visible';
  $('rank-filter-count').textContent = state.types === null ? 'All hazards selected' : `${state.types.length} selected`;
  $('ranking-note').textContent = `${byCountry ? 'Top ' : ''}${ranked.length} · ${rankingState.start}–${rankingState.end} · ${metrics[state.metric].unit} · ${byCountry ? 'global filters applied' : 'all types shown for selection; geography filters applied'}`;
  $('ranking-instructions').textContent = byCountry ? 'Select a country bar to highlight it only here. Values show reported totals.' : 'Click a checked type to exclude it; click an unchecked type to include it. Use None to start a smaller selection. Bar lengths retain the full type context.';
  if (!ranked.length) { svg.append('text').attr('x', 215).attr('y', 150).attr('text-anchor', 'middle').attr('fill', '#60747b').text('No records match these filters.'); return; }
  const x = d3.scaleLinear().domain([0, d3.max(ranked, d => d.value) || 1]).range([0, 300]);
  const groupsSVG = svg.selectAll('.rank-row').data(ranked).join('g').attr('class', 'rank-row').attr('transform', (d,i) => `translate(12,${i * 38 + 16})`);
  groupsSVG.append('rect').attr('width', 405).attr('height', 36).attr('fill', 'transparent');
  groupsSVG.append('text').attr('x', byCountry ? 0 : 18).attr('y', 11).attr('font-size', 11).attr('fill', '#314b53').text(d => {
    const name = byCountry ? countryNames.get(d.key) : displayType(d.key);
    return name.length > 39 ? name.slice(0, 37) + '…' : name;
  });
  groupsSVG.append('rect').attr('y', 19).attr('height', 8).attr('width', 300).attr('rx', 2).attr('fill', '#eff4f2');
  groupsSVG.append('rect').attr('class', 'bar').attr('y', 19).attr('height', 8).attr('width', d => d.value === null ? 0 : x(d.value)).attr('rx', 2)
    .attr('fill', d => byCountry ? (d.key === rankingState.country ? '#c07732' : '#228580') : typeColor(d.key));
  groupsSVG.append('text').attr('x', 400).attr('y', 27).attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', 600).attr('fill', '#173640').text(d => valueLabel(d.value));
  const selected = key => state.types === null || state.types.includes(key);
  groupsSVG.classed('muted-type', d => !byCountry && !selected(d.key))
    .classed('active-type', d => !byCountry && selected(d.key));
  if (!byCountry) {
    groupsSVG.append('rect').attr('x', 0).attr('y', 1).attr('width', 11).attr('height', 11).attr('rx', 2).attr('fill', d => selected(d.key) ? '#228580' : '#fff').attr('stroke', '#78938d');
    groupsSVG.filter(d => selected(d.key)).append('text').attr('x', 2).attr('y', 10).attr('font-size', 10).attr('fill', '#fff').text('✓');
  }
  accessibleClick(groupsSVG, (event, d) => {
    if (byCountry) { rankingState.country = rankingState.country === d.key ? '' : d.key; hideTip(); renderRanking(); }
    else {
      const types = state.types ?? typeColor.domain();
      selectHazards(selected(d.key) ? types.filter(type => type !== d.key) : [...types, d.key]);
    }
  });
  groupsSVG.attr('aria-label', d => `${byCountry ? countryNames.get(d.key) : displayType(d.key)}: ${valueLabel(d.value)}. ${coverage(d)}. ${byCountry ? 'Highlight in this ranking.' : 'Toggle this hazard across all views.'}`)
    .attr('aria-pressed', d => byCountry ? d.key === rankingState.country : selected(d.key));
  const tip = (event, d) => showTip(event, byCountry ? countryNames.get(d.key) : displayType(d.key), `${full(d.value)} ${metrics[state.metric].unit}`, `${byCountry ? '' : hazardDescriptions[d.key] + ' '}${coverage(d)}`);
  groupsSVG.on('pointermove', tip).on('focus', tip).on('pointerleave', hideTip).on('blur', hideTip);
}

function selectHazards(types) {
  const y = scrollY, listY = $('ranking-scroll').scrollTop;
  const focusedType = document.activeElement?.closest('.rank-row')?.__data__?.key;
  stopPlayback(); mapState.lastJumpDays = 0;
  state = Object.freeze({ ...state, types: types?.length === typeColor.domain().length ? null : types });
  render({ alignReplay: true });
  $('ranking-scroll').scrollTop = listY;
  if (focusedType) d3.selectAll('.rank-row').filter(d => d.key === focusedType).node()?.focus({ preventScroll: true });
  window.scrollTo({ top: y, behavior: 'instant' });
}

function annualData() {
  const context = filterRows(rows, historyFilters(), { ignoreYears: true });
  const grouped = new Map(groupSummary(context, 'year', state.metric).map(d => [d.key, d]));
  return d3.range(timeBounds.start, timeBounds.end + 1).map(year => ({ year, ...(grouped.get(year) || summarize([], state.metric)) }));
}
function renderTimeline() {
  hideTip();
  $('start-year').value = historyState.start; $('end-year').value = historyState.end;
  $('year-range').textContent = `${historyState.start}–${historyState.end}${historyState.end === 2026 ? ' · 2026 partial' : ''}`;
  const annual = annualData();
  const monthly = historyState.aggregation === 'monthly';
  $('timeline-title').textContent = `How do ${metrics[state.metric].label.toLowerCase()} change over time?`;
  document.querySelector(`[name="aggregation"][value="${historyState.aggregation}"]`).checked = true;
  const context = filterRows(rows, historyFilters());
  const data = timeSeries(context, historyState.start, historyState.end, state.metric, monthly);
  const cutoff = new Date(`${metadata.reporting_cutoff || '2026-09-15'}T00:00:00Z`);
  // Months after the export are unavailable, never fabricated zero observations.
  for (const d of data) if (monthly && d.date > cutoff) d.value = null;
  const svg = d3.select('#timeline'); svg.selectAll('*').remove();
  svg.attr('aria-label', `${monthly ? 'Monthly' : 'Annual'} time series for ${historyState.start}–${historyState.end}`);
  const width = timelineWidth(), left = 60, right = width - 20;
  svg.attr('viewBox', `0 0 ${width} 260`).attr('data-start', historyState.start).attr('data-end', historyState.end);
  const first = new Date(Date.UTC(historyState.start, 0, 1));
  const last = new Date(Date.UTC(historyState.end, monthly ? 11 : 0, 1));
  const x = d3.scaleUtc().domain(+first === +last ? [new Date(Date.UTC(historyState.start, 0, 1)), new Date(Date.UTC(historyState.start, 11, 31))] : [first, last]).range([left, right]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value) || 1]).nice().range([207, 30]);
  svg.append('g').attr('class', 'axis grid').attr('transform', `translate(${left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(right-left)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(10).tickFormat(v => valueLabel(v)));
  const axis = d3.axisBottom(x).ticks(Math.max(2, Math.floor(width / (monthly ? 105 : 80)))).tickFormat(d3.utcFormat(monthly && historyState.end - historyState.start < 4 ? '%b %Y' : '%Y')).tickSize(0).tickPadding(15);
  if (monthly && historyState.end - historyState.start >= 4) axis.ticks(d3.utcYear.every(Math.max(1, Math.ceil((historyState.end-historyState.start) / (width / 90)))));
  if (!monthly) axis.tickValues(d3.range(historyState.start, historyState.end + 1, Math.max(1, Math.ceil((historyState.end-historyState.start) / (width / 80)))).concat(historyState.end).filter((v,i,a) => a.indexOf(v) === i).map(y => new Date(Date.UTC(y,0,1))));
  svg.append('g').attr('class', 'axis timeline-x').attr('transform', 'translate(0,207)').call(axis);
  svg.append('text').attr('x', left).attr('y', 14).attr('font-size', 10).attr('fill', '#60747b').text(metrics[state.metric].unit + (state.metric.includes('usd') ? ' · 2025 prices' : ''));
  const line = d3.line().defined(d => d.value !== null).x(d => x(d.date)).y(d => y(d.value));
  svg.append('path').datum(data.filter(d => d.year < metadata.partial_year)).attr('fill', 'none').attr('stroke', '#117b78').attr('stroke-width', 2.5).attr('d', line);
  const partialIndex = data.findIndex(d => d.year === metadata.partial_year);
  if (partialIndex >= 0) svg.append('path').datum(data.slice(Math.max(0, partialIndex - 1))).attr('fill', 'none').attr('stroke', '#bc782f').attr('stroke-width', 2).attr('stroke-dasharray', '5 4').attr('d', line);
  const dateLabel = d => (monthly ? d3.utcFormat('%b %Y')(d.date) : d.year) + (d.year === metadata.partial_year ? ' · partial reporting year' : '');
  const dots = svg.selectAll('.timeline-dot').data(data.filter(d => d.value !== null)).join('circle').attr('class', 'timeline-dot').attr('cx', d => x(d.date)).attr('cy', d => y(d.value)).attr('r', monthly ? 3 : 4)
    .style('fill', d => d.year === metadata.partial_year ? '#bc782f' : '#117b78').attr('tabindex', 0).attr('role', 'img')
    .attr('aria-label', d => `${dateLabel(d)}: ${full(d.value)} ${metrics[state.metric].unit}. ${coverage(d)}`);
  const tip = (event, d) => showTip(event, dateLabel(d), `${full(d.value)} ${metrics[state.metric].unit}`, coverage(d));
  dots.on('pointermove', tip).on('focus', tip).on('pointerleave', hideTip).on('blur', hideTip);
  if (!context.length || !data.some(d => d.value !== null)) svg.append('text').attr('x', width / 2).attr('y', 110).attr('text-anchor', 'middle').attr('fill', '#60747b').attr('font-size', 12).text(!context.length ? 'No records match these filters.' : 'No reported values for this selection.');
  const dated = context.filter(validMonth);
  const future = dated.filter(r => new Date(Date.UTC(r.year, r.start_month - 1, 1)) > cutoff).length;
  const known = dated.length - future;
  $('timeline-note').textContent = `${state.country ? countryNames.get(state.country) : state.region || 'Worldwide'} · ${typeLabel(state)} · ${historyState.start}–${historyState.end} · ${monthly ? 'monthly' : 'annual'} ${metrics[state.metric].label.toLowerCase()} by start date${monthly ? ` · ${known.toLocaleString()}/${context.length.toLocaleString()} records have a valid month; ${context.length-dated.length} missing months and ${future} post-export dates excluded. Months after 15 Sep 2026 are unavailable; September and 2026 are partial.` : ''}`;
  const miniY = d3.scaleLinear().domain([0, d3.max(annual, d => d.value) || 1]).range([49, 7]);
  d3.select('#brush .mini-line').datum(annual).attr('d', d3.line().defined(d => d.value !== null).x(d => brushScale(d.year)).y(d => miniY(d.value)));
  if (!brushing) {
    syncing = true;
    brushGroup.call(brush.move, [brushScale(historyState.start - .5), brushScale(historyState.end + .5)]);
    syncing = false;
  }
}
let brushing = false;
function setupBrush() {
  const width = timelineWidth(), left = 60, right = width - 20;
  brushScale = d3.scaleLinear().domain([timeBounds.start - .5, timeBounds.end + .5]).range([left, right]);
  const svg = d3.select('#brush');
  svg.selectAll('*').remove(); svg.attr('viewBox', `0 0 ${width} 70`);
  svg.append('rect').attr('x', left).attr('y', 3).attr('width', right-left).attr('height', 50).attr('fill', '#f1f5f3');
  svg.append('path').attr('class', 'mini-line').attr('fill', 'none').attr('stroke', '#73a49c').attr('stroke-width', 1.5);
  brush = d3.brushX().extent([[left, 3], [right, 53]]).on('brush end', event => {
    if (syncing || !event.sourceEvent) return;
    if (event.selection) {
      historyState.start = Math.max(timeBounds.start, Math.min(timeBounds.end, Math.round(brushScale.invert(event.selection[0]) + .5)));
      historyState.end = Math.max(historyState.start, Math.min(timeBounds.end, Math.round(brushScale.invert(event.selection[1]) - .5)));
    } else { historyState.start = timeBounds.start; historyState.end = timeBounds.end; }
    brushing = event.type !== 'end';
    hideTip(); renderTimeline();
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
  const selected = filterRows(rows, { ...state, ...timeBounds });
  const fields = ['id', 'year', 'start_month', 'start_day', 'year_month', 'iso', 'country', 'region', 'source_type', 'subtype', 'type', 'location', 'latitude', 'longitude', 'deaths', 'affected', 'damage_adjusted_usd'];
  const url = URL.createObjectURL(new Blob([d3.csvFormat(selected, fields)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `emdat-filtered-${timeBounds.start}-${timeBounds.end}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function render({ alignReplay = false } = {}) {
  hideTip();
  for (const id of ['metric', 'region', 'country']) $(id).value = state[id];
  for (const option of $('type').options) option.selected = !option.disabled && (state.types === null || state.types.includes(option.value));
  syncFilterMenus();
  $('filter-toggle').textContent = `Global filters · ${['region', 'country'].filter(k => state[k]).length + (state.types !== null ? 1 : 0) + (state.metric !== 'records' ? 1 : 0)} active`;
  const selected = filterRows(rows, { ...state, ...timeBounds });
  $('scope').textContent = `${state.country ? countryNames.get(state.country) : state.region || 'Worldwide'} / ${typeLabel(state)} / Global scope · all years ${timeBounds.start}–${timeBounds.end} · ${selected.length.toLocaleString()} records`;
  renderStats(selected); renderMap({ alignReplay }); renderRanking(); renderTimeline(); renderInsight(selected); renderTable(selected);
  renderExtraCharts({ rows, state, seasonState, streamState, treeState, defaults: timeBounds, metadata, typeColor, showTip, hideTip, accessibleClick, countryNames });
  countryHazardExplorer.update(selected, state);
  document.body.dataset.ready = 'true';
}

try {
  if (!d3 || !window.topojson) throw new Error('Local D3 or TopoJSON library could not be loaded.');
  const [dataset, world] = await Promise.all([d3.json('data/processed/disasters.json'), d3.json('data/geo/countries-110m.json')]);
  rows = dataset.records.map(row => ({ ...row, source_type: row.type, type: hazardType(row) })); metadata = dataset.metadata;
  if (!rows?.length) throw new Error('No processed disaster records found.');
  features = window.topojson.feature(world, world.objects.countries).features.filter(f => f.properties.name !== 'Antarctica');
  setup();
} catch (error) {
  $('error').hidden = false;
  $('error').textContent = `The explorer could not load its local data. Start it with “python -m http.server 8000 --bind 127.0.0.1” in the project folder and visit http://127.0.0.1:8000. If needed, run scripts/prepare_data.py first. Details: ${error.message}`;
  $('scope').textContent = 'Data unavailable';
  console.error(error);
}
