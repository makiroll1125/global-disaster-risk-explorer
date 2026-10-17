import { DAY, hazardColors, eventDay } from './hazards.js';
import { summarize, groupSummary } from './data.js';
import { selectMapItems, recordDateLabel, locationLabel, replayDates } from './map-analysis.js';

const d3 = window.d3;
const $ = id => document.getElementById(id);
const isoDate = value => new Date(value).toISOString().slice(0, 10);
const number = value => value === null || !Number.isFinite(value) ? 'Not reported' : d3.format(',.0f')(value);
const short = value => value === null ? 'Not reported' : d3.format('.3~s')(value).replace('G', 'B');
const metricNames = { deaths: 'Reported deaths', affected: 'Reported affected', damage_adjusted_usd: 'Adjusted damage (2025 US$)' };

export class MapExplorer {
  constructor(map, allRows, onChange, onInspect) {
    Object.assign(this, { map, allRows, onChange, onInspect });
    this.selection = { area: null, country: '', interval: null };
    this.sizeMetric = 'equal'; this.grouping = true; this.page = 0; this.focusIds = null; this.highlightEvent = '';
    this.maxima = Object.fromEntries(Object.keys(metricNames).map(key => [key, d3.max(allRows, r => r[key]) || 1]));
    this.byId = new Map(allRows.map(row => [row.id, row]));
    this.byEvent = d3.group(allRows, row => row.event_id);
    const names = [...new Map(allRows.map(row => [row.iso, row.country]))].sort((a, b) => a[1].localeCompare(b[1]));
    for (const [iso, name] of names) $('map-local-country').add(new Option(name, iso));
    $('map-clusters').onchange = () => { this.grouping = $('map-clusters').checked; this.onChange('marks'); };
    $('map-size').onchange = () => { this.sizeMetric = $('map-size').value; this.onChange('marks'); };
    $('map-area-tool').onclick = () => this.map.enableAreaSelection(!this.map.areaSelecting);
    $('map-clear-spatial').onclick = () => this.clearSpatial();
    $('map-local-country').onchange = () => this.chooseCountry($('map-local-country').value);
    $('map-apply-dates').onclick = () => {
      const start = Date.parse($('map-selection-start').value + 'T00:00:00Z');
      const end = Date.parse($('map-selection-end').value + 'T00:00:00Z');
      if (![start, end].every(Number.isFinite) || start > end || start < this.bounds[0] || end > this.bounds[1]) {
        this.message(`Choose an ordered date interval within ${isoDate(this.bounds[0])}–${isoDate(this.bounds[1])}.`); return;
      }
      this.selection.interval = [start, end]; this.changed();
    };
    $('map-clear-dates').onclick = () => { this.selection.interval = null; this.changed(); };
    $('map-apply-area').onclick = () => {
      const values = ['west', 'east', 'south', 'north'].map(key => $('map-' + key).value.trim());
      const [west, east, south, north] = values.map(Number);
      if (values.some(v => !v) || ![west, east, south, north].every(Number.isFinite) || Math.abs(west) > 180 || Math.abs(east) > 180 || south < -90 || north > 90 || south >= north) {
        this.message('Enter longitudes between −180 and 180 and an ordered latitude range between −90 and 90.'); return;
      }
      this.setArea({ kind: 'geographic', west, east, south, north });
    };
    $('map-reset-selection').onclick = () => this.resetSelection();
    $('map-list-all').onclick = () => { this.focusIds = null; this.cluster = null; this.page = 0; this.map.render(); };
    $('map-cluster-zoom').onclick = () => {
      if (!this.cluster) return;
      const points = this.cluster.members.map(d => d.point);
      this.map.onClusterZoom(this.map.transform.apply([d3.mean(points, p => p[0]), d3.mean(points, p => p[1])]));
    };
    $('map-record-search').oninput = () => { this.page = 0; this.renderRecords(); };
    $('map-record-prev').onclick = () => { this.page--; this.renderRecords(); };
    $('map-record-next').onclick = () => { this.page++; this.renderRecords(); };
  }

  setData(items, state, cutoff) {
    Object.assign(this, { items, state, cutoff });
    this.bounds = [Date.UTC(state.start, 0, 1), Math.min(cutoff, Date.UTC(state.end + 1, 0, 1) - DAY)];
    if (this.selection.interval) {
      const [from, to] = this.selection.interval;
      this.selection.interval = to < this.bounds[0] || from > this.bounds[1] ? null : [Math.max(from, this.bounds[0]), Math.min(to, this.bounds[1])];
    }
    const interval = this.selection.interval || this.bounds;
    for (const [id, value] of [['map-selection-start', interval[0]], ['map-selection-end', interval[1]]]) {
      $(id).min = isoDate(this.bounds[0]); $(id).max = isoDate(this.bounds[1]); $(id).value = isoDate(value);
    }
    $('map-local-country').value = this.selection.country;
    this.spatialCache = selectMapItems(items, { ...this.selection, interval: null }, { approximate: state.approximate, cutoff });
    this.timelineAll = selectMapItems(items, { ...this.selection, interval: null }, { approximate: true, cutoff });
    this.timelineScope = selectMapItems(items, this.selection, { approximate: true, cutoff });
    this.timelineDated = this.timelineScope.filter(d => d.day !== null && d.day <= cutoff).sort((a, b) => a.day - b.day);
    this.missingDates = this.timelineScope.filter(d => d.day === null).length;
    this.referenceDates = this.timelineDated.some(d => !d.exact);
    this.replayDays = replayDates(this.timelineItems(), this.bounds[0], this.bounds[1]);
    this.drawTimeline();
  }

  changed() {
    this.page = 0; this.focusIds = null; this.cluster = null; this.selectedId = ''; this.highlightEvent = '';
    this.map.enableAreaSelection(false);
    $('map-exploration').open = true;
    this.onChange('selection');
  }
  message(text) { $('map-selection-status').textContent = text; }
  resetSelection() {
    this.selection = { area: null, country: '', interval: null }; this.focusIds = null;
    this.selectedId = ''; this.highlightEvent = ''; $('map-record-search').value = ''; this.changed();
  }
  chooseCountry(country) { this.selection.country = country; this.selection.area = null; this.changed(); }
  setArea(area) { this.selection.area = area; this.selection.country = ''; this.changed(); }
  clearSpatial() { this.selection.area = null; this.selection.country = ''; this.changed(); }
  select(items, replay = true) {
    return selectMapItems(items, this.selection, { approximate: this.state.approximate,
      replay: replay && this.state.mode === 'timeline' ? this.state : null, cutoff: this.cutoff });
  }
  spatialItems() {
    return this.spatialCache;
  }
  timelineItems({ ignoreInterval = false } = {}) {
    return ignoreInterval ? this.timelineAll : this.timelineScope;
  }

  update(items, { force = false } = {}) {
    this.currentItems = items;
    $('map-selection-count').textContent = `${items.length.toLocaleString()} records`;
    this.dirty = true;
    if (!$('map-exploration').open || (!force && this.state.playing && performance.now() - (this.lastUpdate || 0) < 200)) return;
    this.dirty = false; this.lastUpdate = performance.now();
    const rows = items.map(d => d.row), mapped = items.filter(d => d.point).length;
    const undated = this.spatialItems().filter(d => d.day === null).length;
    const future = this.spatialItems().filter(d => d.day !== null && d.day > this.cutoff).length;
    const country = this.selection.country && this.allRows.find(r => r.iso === this.selection.country)?.country;
    this.message(`${country || (this.selection.area ? 'Selected area · source coordinates only' : 'All locations')} · ${this.selection.interval ? this.selection.interval.map(isoDate).join(' to ') : 'Full map period'} · ${mapped.toLocaleString()} placeable / ${rows.length.toLocaleString()} selected records. ${undated.toLocaleString()} records in the spatial scope lack a complete valid start date${this.selection.interval || this.state.mode === 'timeline' ? ' and are excluded by date selection or replay' : '; included in full-period totals'}.${future ? ` ${future} source start date${future === 1 ? ' is' : 's are'} after the export cutoff; retained only in full-period totals.` : ''}`);
    const cards = [
      ['Country records', { value: rows.length, reported: rows.length, count: rows.length }],
      ['Distinct event IDs', { value: new Set(rows.map(r => r.event_id)).size, reported: rows.length, count: rows.length }],
      ...Object.entries(metricNames).map(([metric, label]) => [label, summarize(rows, metric)]),
    ];
    d3.select('#map-selection-stats').selectAll('.selection-stat').data(cards).join('div').attr('class', 'selection-stat').each(function([label, s]) {
      this.replaceChildren();
      const title = document.createElement('span'); title.textContent = label;
      const value = document.createElement('strong'); value.textContent = (label.startsWith('Adjusted') && s.value !== null ? '$' : '') + short(s.value); value.title = number(s.value);
      const coverage = document.createElement('small'); coverage.textContent = label === 'Country records' ? 'Selected source rows' : label === 'Distinct event IDs' ? 'Grouped by source identifier' : `${s.reported.toLocaleString()} / ${s.count.toLocaleString()} reporting`;
      this.append(title, value, coverage);
    });
    const types = groupSummary(rows, 'type', 'records').sort((a, b) => b.value - a.value);
    const bars = d3.select('#map-selection-composition').selectAll('.selection-type').data(types, d => d.key).join('div').attr('class', 'selection-type');
    bars.each(function(d) {
      this.replaceChildren(); const label = document.createElement('span'); label.textContent = d.key;
      const count = document.createElement('strong'); count.textContent = d.value.toLocaleString();
      const bar = document.createElement('i'); bar.style.width = 100 * d.value / Math.max(1, rows.length) + '%'; bar.style.background = hazardColors[d.key];
      this.append(label, count, bar);
    });
    d3.select('#map-selection-composition').selectAll('p').data(types.length ? [] : [null]).join('p').text('No records match this selection.');
    this.renderRecords(); this.renderDetail();
  }

  inspectGroup(group) {
    this.onInspect(); this.cluster = group;
    this.focusIds = new Set(group.members.map(d => d.row.id)); this.page = 0;
    this.selectedId = group.members.length === 1 ? group.members[0].row.id : '';
    this.highlightEvent = this.selectedId ? group.members[0].row.event_id : '';
    $('map-record-search').value = ''; $('map-exploration').open = true;
    this.renderRecords(); this.renderDetail(); this.map.render();
  }

  renderRecords() {
    if (!this.currentItems) return;
    const query = $('map-record-search').value.trim().toLowerCase();
    const candidates = this.currentItems.filter(d => (!this.focusIds || this.focusIds.has(d.row.id)) && (!query || [d.row.country, d.row.type, d.row.id, d.row.event_name, d.row.location].join(' ').toLowerCase().includes(query)))
      .sort((a, b) => (b.day ?? Date.UTC(b.row.year, 0, 1)) - (a.day ?? Date.UTC(a.row.year, 0, 1)) || a.row.id.localeCompare(b.row.id));
    const pageSize = 25, pages = Math.max(1, Math.ceil(candidates.length / pageSize));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    $('map-list-context').textContent = this.focusIds ? 'Selected marker group' : 'Current selection';
    $('map-list-all').hidden = !this.focusIds;
    $('map-cluster-zoom').hidden = !this.cluster?.exact || this.cluster.members.length < 2 || this.map.transform.k >= 6;
    const buttons = d3.select('#map-record-list').selectAll('button').data(candidates.slice(this.page * pageSize, (this.page + 1) * pageSize), d => d.row.id).join('button').attr('type', 'button').attr('class', 'event-record')
      .attr('data-id', d => d.row.id).attr('aria-pressed', d => d.row.id === this.selectedId).on('click', (_, d) => this.selectRecord(d.row));
    buttons.each(function({ row }) {
      this.replaceChildren();
      const swatch = document.createElement('i'); swatch.style.background = hazardColors[row.type];
      const label = document.createElement('span'); label.textContent = `${row.type} · ${row.country}`;
      const date = document.createElement('small'); date.textContent = `${recordDateLabel(row)} · ${row.id}`;
      this.append(swatch, label, date);
    });
    d3.select('#map-record-list').selectAll('p').data(candidates.length ? [] : [null]).join('p').text('No records match this list. Clear the search or return to all selected records.');
    $('map-record-page').textContent = `${candidates.length.toLocaleString()} records · ${this.page + 1} / ${pages}`;
    $('map-record-prev').disabled = this.page === 0; $('map-record-next').disabled = this.page >= pages - 1;
  }

  selectRecord(row) {
    this.onInspect(); this.selectedId = row.id; this.highlightEvent = row.event_id;
    $('map-exploration').open = true; this.renderRecords(); this.renderDetail(); this.map.render();
    $('map-event-detail-title').tabIndex = -1; $('map-event-detail-title').focus({ preventScroll: true });
  }

  renderDetail() {
    const panel = $('map-event-detail');
    const row = this.byId.get(this.selectedId);
    panel.replaceChildren();
    const heading = document.createElement('h3'); heading.id = 'map-event-detail-title';
    heading.textContent = row ? `${row.type} · ${row.country}` : this.focusIds ? 'Inspect this marker group' : 'Inspect an event'; panel.append(heading);
    if (!row) {
      const p = document.createElement('p'); p.textContent = this.focusIds ? 'Choose a record from the group list to inspect its source details.' : 'Select a marker, group, or record to keep its details here.'; panel.append(p); return;
    }
    const inSelection = this.currentItems.some(d => d.row.id === row.id);
    const intro = document.createElement('p'); intro.textContent = `${row.event_name || row.location || 'No event name or location text reported.'}${inSelection ? '' : ' · This country record is outside the current map selection.'}${eventDay(row) !== null && eventDay(row) > this.cutoff ? ' · Source start date is after the export cutoff; excluded from date-brushed selections and replay.' : ''}`; panel.append(intro);
    const list = document.createElement('dl');
    for (const [key, value] of [
      ['Source record', row.id], ['Event identifier', row.event_id], ['Start date', recordDateLabel(row)], ['Location precision', locationLabel(row)],
      ['Source classification', `${row.source_type} / ${row.subtype || 'Unspecified'}`],
      ...Object.entries(metricNames).map(([metric, label]) => [label, (metric.includes('usd') && row[metric] !== null ? '$' : '') + number(row[metric])]),
    ]) { const term = document.createElement('dt'); term.textContent = key; const detail = document.createElement('dd'); detail.textContent = value; list.append(term, detail); }
    panel.append(list);
    const related = this.byEvent.get(row.event_id);
    const relatedHeading = document.createElement('p'); relatedHeading.textContent = `${related.length} country record${related.length === 1 ? '' : 's'} share this event identifier. Dark halos identify matching records currently on the map. Other records may be outside the selected dates, geography, or hazards.`; panel.append(relatedHeading);
    const links = document.createElement('div'); links.className = 'related-records';
    for (const other of related) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `${other.country} · ${recordDateLabel(other)}`; button.dataset.id = other.id;
      button.setAttribute('aria-pressed', String(other.id === row.id)); button.onclick = () => this.selectRecord(other); links.append(button);
    }
    panel.append(links);
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'text-button'; clear.textContent = 'Clear event highlight'; clear.onclick = () => { this.highlightEvent = ''; this.selectedId = ''; this.map.render(); }; panel.append(clear);
  }

  drawTimeline() {
    const source = this.timelineItems({ ignoreInterval: true });
    const dated = source.filter(d => d.day !== null && d.day <= this.cutoff);
    const width = Math.max(260, $('selection-timeline').clientWidth);
    const svg = d3.select('#selection-timeline').attr('viewBox', `0 0 ${width} 100`); svg.selectAll('*').remove();
    const scale = d3.scaleUtc().domain(this.bounds.map(d => new Date(d))).range([15, width - 15]);
    const monthly = this.bounds[1] - this.bounds[0] > 2 * 366 * DAY;
    const bins = d3.rollups(dated, r => r.length, d => monthly ? Date.UTC(d.row.year, d.row.start_month - 1, 1) : d.day, d => d.row.type);
    const max = d3.max(bins, ([, types]) => d3.sum(types, ([, count]) => count)) || 1;
    for (const [date, types] of bins) {
      let y = 67;
      for (const [type, count] of types) {
        const height = 45 * count / max;
        svg.append('rect').attr('x', scale(date)).attr('y', y - height).attr('width', Math.max(1, scale(Math.min(this.bounds[1], date + (monthly ? 28 : 1) * DAY)) - scale(date))).attr('height', Math.max(.5, height)).attr('fill', hazardColors[type]);
        y -= height;
      }
    }
    svg.append('g').attr('class', 'axis').attr('transform', 'translate(0,70)').call(d3.axisBottom(scale).ticks(Math.max(2, Math.floor(width / 85))).tickSize(0));
    svg.append('text').attr('x', 15).attr('y', 12).attr('font-size', 9).attr('fill', '#60747b').text(`${dated.length.toLocaleString()} fully dated records · ${monthly ? 'monthly' : 'daily'} bins · ${this.state.approximate ? 'full spatial context' : 'includes records hidden by location toggle'}`);
    const brush = d3.brushX().extent([[15, 18], [width - 15, 68]]).on('end', event => {
      if (!event.sourceEvent) return;
      if (!event.selection || event.selection[1] - event.selection[0] < 3) this.selection.interval = null;
      else this.selection.interval = event.selection.map((x, i) => Math.max(this.bounds[0], Math.min(this.bounds[1], (i ? Math.ceil : Math.floor)(+scale.invert(x) / DAY) * DAY)));
      this.changed();
    });
    const group = svg.append('g').attr('class', 'selection-time-brush').call(brush);
    if (this.selection.interval) group.call(brush.move, this.selection.interval.map(scale));
  }
}
