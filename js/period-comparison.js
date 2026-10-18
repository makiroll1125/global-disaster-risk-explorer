import { filterRows, groupSummary, metrics, summarize } from './data.js';
import { eventColor, hasCoordinates } from './hazards.js';
import { impactRadius, recordDateLabel } from './map-analysis.js';

// Both maps and the detail tables use these same null-preserving calculations.
export function periodSummary(rows, range, metric, basis = 'annual') {
  const selected = rows.filter(row => row.year >= range.start && row.year <= range.end);
  const summary = summarize(selected, metric);
  const years = range.end - range.start + 1;
  return { ...summary, years, total: summary.value,
    value: summary.value === null ? null : summary.value / (basis === 'annual' ? years : 1) };
}

export function periodChanges(rows, key, a, b, metric, basis = 'annual') {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return [...groups].map(([key, records]) => {
    const left = periodSummary(records, a, metric, basis), right = periodSummary(records, b, metric, basis);
    const delta = left.value === null || right.value === null ? null : right.value - left.value;
    return { key, a: left, b: right, delta,
      percent: delta === null || left.value === 0 ? null : delta / left.value };
  });
}

export function periodComposition(rowsA, rowsB, limit = 6) {
  const counts = rows => new Map(groupSummary(rows, 'type', 'records').map(d => [d.key, d.value]));
  const a = counts(rowsA), b = counts(rowsB);
  const types = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) =>
    ((a.get(y) || 0) + (b.get(y) || 0)) - ((a.get(x) || 0) + (b.get(x) || 0)) || x.localeCompare(y));
  const top = types.slice(0, limit);
  const result = top.map(type => ({ type, a: a.get(type) || 0, b: b.get(type) || 0 }));
  if (types.length > limit) result.push({ type: 'Other',
    a: types.slice(limit).reduce((sum, type) => sum + (a.get(type) || 0), 0),
    b: types.slice(limit).reduce((sum, type) => sum + (b.get(type) || 0), 0) });
  return result.map(row => ({ ...row, shareA: rowsA.length ? row.a / rowsA.length : null,
    shareB: rowsB.length ? row.b / rowsB.length : null }));
}

export class PeriodComparison {
  constructor({ rows, metadata, features, countryNames, showTip, hideTip }) {
    Object.assign(this, { rows, metadata, features, countryNames, showTip, hideTip });
    this.d3 = window.d3;
    const [first, last] = metadata.observed_years;
    const completeEnd = last === metadata.partial_year ? last - 1 : last;
    const length = Math.max(1, Math.min(6, Math.floor((completeEnd - first + 1) / 2)));
    this.a = { start: first, end: Math.min(completeEnd, first + length - 1) };
    this.b = { start: Math.max(first, completeEnd - length + 1), end: completeEnd };
    this.basis = 'annual'; this.country = ''; this.metric = 'records'; this.view = 'countries'; this.approximate = false; this.appearance = {}; this.projected = new WeakMap();
    this.isoByMap = new Map(rows.filter(row => row.map_id).map(row => [row.map_id, row.iso]));
    this.mapIds = new Set(features.map(feature => feature.id));
    for (const period of ['a', 'b']) for (const bound of ['start', 'end']) {
      const select = this.$(`period-${period}-${bound}`);
      for (let year = first; year <= last; year++) select.add(new Option(year === metadata.partial_year ? `${year} (partial)` : String(year), year));
      select.onchange = () => {
        this[period][bound] = +select.value;
        if (bound === 'start') this[period].end = Math.max(this[period].start, this[period].end);
        else this[period].start = Math.min(this[period].start, this[period].end);
        this.render();
      };
    }
    this.$('period-metric').onchange = event => { this.metric = event.target.value; this.render(); };
    this.$('period-view').onchange = event => { this.view = event.target.value; this.render(); };
    this.$('period-approximate').onchange = event => { this.approximate = event.target.checked; this.render(); };
    this.$('period-basis').onchange = event => { this.basis = event.target.value; this.render(); };
    this.$('period-swap').onclick = () => { [this.a, this.b] = [this.b, this.a]; this.render(); };
    this.$('period-country').onchange = event => { this.country = event.target.value; this.render(); };
    this.setupMaps();
  }

  $(id) { return document.getElementById(id); }
  label(range) { return `${range.start}–${range.end}`; }
  number(value, metric = this.metric) {
    if (value === null) return 'Not reported';
    return (metric.includes('usd') ? '$' : '') + this.d3.format(this.basis === 'annual' ? ',.1f' : ',.0f')(value);
  }
  short(value) {
    if (value === null) return 'Not reported';
    return (this.metric.includes('usd') ? '$' : '') + this.d3.format('.3~s')(value).replace('G', 'B');
  }
  signed(value, metric) { return value === null ? 'Not comparable' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${this.number(Math.abs(value), metric)}`; }
  coverage(summary) { return `${summary.reported.toLocaleString()} / ${summary.count.toLocaleString()} records reporting`; }

  setupMaps() {
    const d3 = this.d3;
    this.transform = d3.zoomIdentity;
    const projection = d3.geoEqualEarth().fitExtent([[10, 12], [590, 294]], { type: 'FeatureCollection', features: this.features });
    this.projection = projection;
    this.centers = new Map(this.features.map(feature => [feature.id, d3.geoCentroid(feature)]));
    const path = d3.geoPath(projection);
    this.maps = ['a', 'b'].map(id => {
      const svg = d3.select(`#period-map-${id}`);
      const pattern = svg.append('defs').append('pattern').attr('id', `period-unknown-${id}`)
        .attr('patternUnits', 'userSpaceOnUse').attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
      pattern.append('rect').attr('width', 5).attr('height', 5).attr('fill', '#eef1ef');
      pattern.append('line').attr('y2', 5).attr('stroke', '#a6b9b1').attr('stroke-width', 2);
      const layer = svg.append('g');
      const countries = layer.selectAll('path').data(this.features).join('path').attr('d', path)
        .attr('class', 'period-country').attr('data-iso', d => this.isoByMap.get(d.id) || '')
        .attr('tabindex', 0).attr('role', 'button')
        .on('click', (_, d) => this.chooseCountry(this.isoByMap.get(d.id)))
        .on('keydown', (event, d) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.chooseCountry(this.isoByMap.get(d.id)); }
        })
        .on('pointermove focus', (event, d) => {
          const summary = this.countryChanges?.get(this.isoByMap.get(d.id));
          const current = summary?.[id];
          this.showTip(event, this.countryNames.get(this.isoByMap.get(d.id)) || d.properties.name,
            current ? `Period ${id.toUpperCase()}: ${this.number(current.value)} ${this.unit}` : 'No matching records',
            current ? `${this.coverage(current)}. B − A: ${this.signed(summary.delta)}. Select for impact and composition details.` : 'No records does not establish absence of disasters.');
        }).on('pointerleave blur', this.hideTip);
      const events = layer.append('g').attr('class', 'period-events');
      return { id, svg, layer, countries, events };
    });
    this.zoom = d3.zoom().scaleExtent([1, 6]).extent([[0, 0], [600, 310]]).translateExtent([[0, 0], [600, 310]])
      .on('zoom', event => {
        const changedScale = this.transform.k !== event.transform.k;
        this.hideTip(); this.transform = event.transform;
        for (const map of this.maps) {
          map.svg.property('__zoom', event.transform);
          map.layer.attr('transform', event.transform);
        }
        if (changedScale && this.view === 'events') this.drawEvents();
      });
    for (const map of this.maps) map.svg.call(this.zoom).on('dblclick.zoom', null);
    this.$('period-zoom-in').onclick = () => this.maps[0].svg.call(this.zoom.scaleBy, 1.4);
    this.$('period-zoom-out').onclick = () => this.maps[0].svg.call(this.zoom.scaleBy, 1 / 1.4);
    this.$('period-zoom-reset').onclick = () => this.maps[0].svg.call(this.zoom.transform, d3.zoomIdentity);
  }

  chooseCountry(iso) {
    if (!iso || !this.context.some(row => row.iso === iso)) return;
    this.country = this.country === iso ? '' : iso;
    this.hideTip(); this.render();
  }

  setAppearance(appearance) {
    this.appearance = { colorByType: appearance.colorByType, hazardLevel: appearance.hazardLevel };
    if (this.context) this.render();
  }

  update(filters, appearance = {}) {
    if (this.globalMetric !== filters.metric) this.metric = filters.metric;
    this.globalMetric = filters.metric;
    this.appearance = { colorByType: appearance.colorByType, hazardLevel: appearance.hazardLevel };
    this.filters = filters;
    this.context = filterRows(this.rows, filters, { ignoreYears: true });
    const names = [...new Map(this.context.map(row => [row.iso, row.country]))].sort((a, b) => a[1].localeCompare(b[1]));
    if (this.country && !names.some(([iso]) => iso === this.country)) this.country = '';
    const select = this.$('period-country');
    select.replaceChildren(new Option('Worldwide / filtered geography', ''));
    for (const [iso, name] of names) select.add(new Option(name, iso));
    this.render();
  }

  render() {
    this.hideTip();
    const d3 = this.d3, metric = this.metric;
    this.$('period-metric').value = metric;
    this.$('period-reference-option').hidden = this.view !== 'events';
    this.periodRows = Object.fromEntries(['a', 'b'].map(id => [id, this.context.filter(row => row.year >= this[id].start && row.year <= this[id].end)]));
    this.unit = metrics[metric].unit + (this.basis === 'annual' ? ' / year' : '');
    for (const id of ['a', 'b']) {
      for (const bound of ['start', 'end']) this.$(`period-${id}-${bound}`).value = this[id][bound];
      this.$(`period-${id}-label`).textContent = `Period ${id.toUpperCase()} · ${this.label(this[id])} · ${this[id].end - this[id].start + 1} calendar years`;
    }
    this.$('period-country').value = this.country;
    const changes = periodChanges(this.context, 'iso', this.a, this.b, metric, this.basis);
    this.countryChanges = new Map(changes.map(row => [row.key, row]));
    const observed = changes.flatMap(row => [row.a, row.b]).filter(summary => summary.count && summary.value !== null).map(summary => summary.value);
    const observedMax = d3.max(observed);
    const max = observedMax || 1;
    const color = d3.scaleSequentialSqrt(d3.interpolateRgb('#e2f0ed', '#096e69')).domain([0, max]);
    for (const map of this.maps) {
      map.svg.attr('data-scale-max', max).attr('data-start', this[map.id].start).attr('data-end', this[map.id].end)
        .attr('aria-label', `Period ${map.id.toUpperCase()}, ${this.label(this[map.id])}: ${this.unit}; shared country scale`);
      map.countries.attr('fill', feature => {
        const summary = this.countryChanges.get(this.isoByMap.get(feature.id))?.[map.id];
        if (this.view === 'events') return '#e5ebe8';
        return !summary || !summary.count ? '#e7ecec' : summary.value === null ? `url(#period-unknown-${map.id})` : color(summary.value);
      }).classed('selected', feature => this.isoByMap.get(feature.id) === this.country)
        .attr('aria-pressed', feature => String(this.isoByMap.get(feature.id) === this.country))
        .attr('aria-label', feature => {
          const iso = this.isoByMap.get(feature.id), summary = this.countryChanges.get(iso)?.[map.id];
          return `${this.countryNames.get(iso) || feature.properties.name}: ${summary?.count ? this.number(summary.value) + ' ' + this.unit : 'No matching records'}. Select to compare periods.`;
        });
    }
    const partial = [this.a, this.b].some(range => range.start <= this.metadata.partial_year && range.end >= this.metadata.partial_year);
    const overlap = this.a.start <= this.b.end && this.b.start <= this.a.end;
    this.$('period-status').textContent = `${metrics[metric].label} · ${this.view === 'events' ? 'Individual record locations; table values use ' : ''}${this.basis === 'annual' ? 'annual averages' : 'period totals'}${partial ? ' · 2026 is partial' : ''}${overlap ? ' · Overlapping periods' : ''}${this.context.length ? '' : ' · No matching records'}.`;
    this.drawEvents();
    if (this.view === 'events') this.renderEventLegend();
    else this.renderLegend(color, max, observedMax);
    const counts = [this.a, this.b].map(range => this.context.filter(row => row.year >= range.start && row.year <= range.end && !this.mapIds.has(row.map_id)).length);
    this.$('period-map-coverage').textContent = this.view === 'events'
      ? ['a', 'b'].map(id => `${id.toUpperCase()}: ${this.periodRows[id].filter(hasCoordinates).length.toLocaleString()} source locations / ${this.periodRows[id].length.toLocaleString()} records`).join(' · ') + '. Hollow references identify countries only; all records remain in tables.'
      : `No polygon: A ${counts[0]} · B ${counts[1]}. Records remain in tables.`;
    this.renderRegions();
    this.renderDetails();
    this.renderOverview();
  }

  renderOverview() {
    const host = this.$('period-overview');
    host.replaceChildren();
    const changes = [];
    for (const metric of ['records', 'deaths', 'affected', 'damage_adjusted_usd']) {
      const a = periodSummary(this.context, this.a, metric, this.basis);
      const b = periodSummary(this.context, this.b, metric, this.basis);
      const percent = a.value === null || b.value === null || a.value === 0 ? null : (b.value - a.value) / a.value;
      const card = document.createElement('article'); card.className = 'period-overview-card'; card.dataset.metric = metric;
      const title = document.createElement('h3'); title.textContent = metrics[metric].label;
      const change = document.createElement('strong'); change.className = 'period-overview-change';
      change.textContent = percent === null ? 'Not comparable' : this.d3.format('+.1%')(percent);
      const format = value => value === null ? 'Not reported' : (metric.includes('usd') ? '$' : '') + this.d3.format('.3~s')(value).replace('G', 'B');
      const max = Math.max(a.value || 0, b.value || 0) || 1;
      const chart = this.d3.create('svg').attr('viewBox', '0 0 300 78').attr('role', 'img')
        .attr('aria-label', `${metrics[metric].label}, ${this.basis === 'annual' ? 'annual averages' : 'period totals'}: A ${this.number(a.value, metric)}, B ${this.number(b.value, metric)}. Bars start at zero; scale is local to this measure.`);
      for (const [index, summary] of [a, b].entries()) {
        chart.append('text').attr('x', 0).attr('y', 19 + index * 36).text(index ? 'B' : 'A');
        chart.append('rect').attr('x', 20).attr('y', 5 + index * 36).attr('height', 19)
          .attr('width', Math.max(0, (summary.value || 0) / max * 160)).attr('fill', index ? '#086b70' : '#9ebbb6');
        chart.append('text').attr('x', 190).attr('y', 19 + index * 36).text(format(summary.value));
      }
      const note = document.createElement('p');
      note.textContent = metric === 'records' ? 'One record = one disaster’s impact in one country.'
        : `Reporting coverage: A ${this.d3.format('.1%')(a.count ? a.reported / a.count : 0)} · B ${this.d3.format('.1%')(b.count ? b.reported / b.count : 0)}.`;
      card.append(title, change, chart.node(), note); host.append(card);
      if (metric !== 'records') changes.push(`${metrics[metric].label}: ${percent === null ? 'not comparable' : this.d3.format('+.1%')(percent)}`);
    }
    this.$('period-overview-scope').textContent = `All countries under the selected disaster-type filters · A ${this.label(this.a)} / B ${this.label(this.b)} · ${this.basis === 'annual' ? 'Annual averages' : 'Period totals'}. Each measure has its own zero-based bar scale.`;
    this.$('period-finding').textContent = `${changes.join('; ')}. These are differences between the selected periods, not evidence of a continuous trend or its causes. Reporting completeness and individual extreme events affect the comparison.`;
  }

  drawEvents() {
    if (!this.maps || !this.periodRows) return;
    const d3 = this.d3, k = this.transform.k;
    this.eventObservedMax = d3.max([...this.periodRows.a, ...this.periodRows.b], row => row[this.metric]);
    this.eventMax = this.eventObservedMax || 1;
    for (const map of this.maps) {
      const items = this.view !== 'events' ? [] : this.periodRows[map.id].map(row => {
        if (this.projected.has(row)) return this.projected.get(row);
        const exact = hasCoordinates(row), coords = exact ? [row.longitude, row.latitude] : this.centers.get(row.map_id);
        const item = { row, exact, point: coords ? this.projection(coords) : null };
        this.projected.set(row, item); return item;
      }).filter(item => item.point?.every(Number.isFinite) && (item.exact || this.approximate))
        .sort((a, b) => (b.row[this.metric] || 0) - (a.row[this.metric] || 0));
      map.svg.attr('data-event-count', items.length).attr('data-event-size-max', this.eventMax);
      if (this.view === 'events') map.svg.attr('aria-label', `Period ${map.id.toUpperCase()}, ${this.label(this[map.id])}: ${items.length} record locations; area represents ${metrics[this.metric].label}`);
      const marks = map.events.selectAll('.period-event').data(items, item => item.row.id).join('g')
        .attr('class', item => `period-event ${item.exact ? 'located' : 'approximate'}`)
        .attr('data-id', item => item.row.id).attr('data-type', item => item.row.type)
        .attr('transform', item => `translate(${item.point})`).attr('tabindex', 0).attr('role', 'button');
      const unknown = item => this.metric !== 'records' && !Number.isFinite(item.row[this.metric]);
      const zero = item => this.metric !== 'records' && item.row[this.metric] === 0;
      marks.selectAll('circle.period-symbol').data(item => unknown(item) || zero(item) ? [] : [item]).join('circle').attr('class', 'period-symbol')
        .attr('r', item => (this.metric === 'records' ? 2.5 : impactRadius(item.row[this.metric], this.eventMax, 12)) / k)
        .attr('fill', item => item.exact ? eventColor(item.row.type, this.appearance) : '#fff')
        .attr('stroke', item => item.exact || this.appearance.colorByType ? eventColor(item.row.type, this.appearance) : '#71817d')
        .attr('stroke-width', .8).attr('vector-effect', 'non-scaling-stroke');
      marks.selectAll('path').data(item => unknown(item) || zero(item) ? [item] : []).join('path')
        .attr('d', item => unknown(item) ? `M${-3/k},${-3/k}l${6/k},${6/k}m0,${-6/k}l${-6/k},${6/k}` : `M0,${-3/k}l${3/k},${3/k}l${-3/k},${3/k}l${-3/k},${-3/k}Z`)
        .attr('fill', 'none').attr('stroke', item => eventColor(item.row.type, this.appearance)).attr('stroke-width', 1.2).attr('vector-effect', 'non-scaling-stroke');
      marks.selectAll('circle.period-hit').data(item => [item]).join('circle').attr('class', 'period-hit')
        .attr('r', item => Math.max(6, this.metric === 'records' ? 2.5 : impactRadius(item.row[this.metric], this.eventMax, 12)) / k).attr('fill', 'transparent');
      const tip = (event, item) => this.showTip(event, `${item.row.type} · ${item.row.country}`,
        `${recordDateLabel(item.row)} · ${this.metric === 'records' ? '1 country-disaster record' : this.number(item.row[this.metric]) + ' ' + metrics[this.metric].unit}`,
        `${item.exact ? 'Source coordinate' : 'Approximate country reference'} · ${item.row.id}`);
      marks.attr('aria-label', item => `${item.row.type}, ${item.row.country}, ${recordDateLabel(item.row)}. ${item.exact ? 'Source coordinate' : 'Country reference'}. Select country.`)
        .on('pointermove focus', tip).on('pointerleave blur', this.hideTip)
        .on('click', (_, item) => this.chooseCountry(item.row.iso))
        .on('keydown', (event, item) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.chooseCountry(item.row.iso); } });
    }
  }

  renderEventLegend() {
    const host = this.$('period-legend'); host.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = this.metric === 'records' ? 'One mark = one country-disaster record' : `Area = ${metrics[this.metric].label} · shared size scale · ◇ zero · × unreported`;
    host.append(title);
    if (this.metric !== 'records' && this.eventObservedMax > 0) {
      const svg = this.d3.select(host).append('svg').attr('viewBox', '0 0 360 54').attr('aria-label', 'Shared event impact size scale');
      for (const [index, fraction] of [.0625, .25, 1].entries()) {
        svg.append('circle').attr('cx', 55 + index * 120).attr('cy', 17).attr('r', 12 * Math.sqrt(fraction)).attr('fill', 'none').attr('stroke', '#167c75');
        svg.append('text').attr('x', 55 + index * 120).attr('y', 48).attr('text-anchor', 'middle').attr('font-size', 10).text(this.short(this.eventMax * fraction));
      }
    } else if (this.metric !== 'records') {
      const empty = document.createElement('span'); empty.textContent = this.eventObservedMax === 0 ? 'Reported values are zero.' : 'No reported impacts in these periods.'; host.append(empty);
    }
    const note = document.createElement('span'); note.textContent = `Filled = source coordinate · hollow = country reference${this.appearance.colorByType ? ' · Colors: ' + this.appearance.hazardLevel : ''}`; host.append(note);
  }

  renderLegend(color, max, observedMax) {
    const host = this.$('period-legend'); host.replaceChildren();
    const title = document.createElement('strong'); title.textContent = `${this.unit} · same square-root scale on both maps`;
    const ramp = document.createElement('div'); ramp.className = 'legend-ramp';
    ramp.style.background = `linear-gradient(90deg,${this.d3.range(0, 1.01, .1).map(t => color(t * t * max)).join(',')})`;
    const labels = document.createElement('div'); labels.className = 'legend-labels';
    for (const value of [0, max / 4, max]) {
      const span = document.createElement('span'); span.textContent = this.short(value); labels.append(span);
    }
    const key = document.createElement('div'); key.className = 'legend-extra';
    key.innerHTML = '<span><i class="swatch"></i>No matching records</span><span><i class="swatch unknown"></i>Impact unreported</span>';
    if (observedMax === undefined || observedMax === 0) {
      const message = document.createElement('p'); message.textContent = observedMax === 0 ? 'All reported country values are zero.' : 'No reported country values in either period for this measure.';
      host.append(title, message, key);
    } else host.append(title, ramp, labels, key);
  }

  renderRegions() {
    const changes = periodChanges(this.context, 'region', this.a, this.b, this.metric, this.basis)
      .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity) || a.key.localeCompare(b.key));
    this.$('period-region-a').textContent = `A · ${this.label(this.a)} · ${this.unit}`;
    this.$('period-region-b').textContent = `B · ${this.label(this.b)} · ${this.unit}`;
    this.$('period-region-delta').textContent = `B − A · ${this.unit}`;
    const leader = changes.find(row => row.delta !== null && row.delta > 0);
    this.$('period-region-note').textContent = `${leader ? `${leader.key}: largest increase (${this.signed(leader.delta)}).` : 'No comparable increase.'} ${this.unit}.`;
    this.d3.select('#period-region-body').selectAll('tr').data(changes, row => row?.key).join('tr').each((row, i, nodes) => {
      const tr = nodes[i]; tr.replaceChildren();
      const name = document.createElement('th'); name.scope = 'row'; name.textContent = row.key; tr.append(name);
      for (const id of ['a', 'b']) tr.append(this.valueCell(row[id], this.metric));
      for (const text of [this.signed(row.delta), row.percent === null ? '—' : this.d3.format('+.1%')(row.percent)]) {
        const td = document.createElement('td'); td.textContent = text; tr.append(td);
      }
    });
    if (!changes.length) {
      const tr = document.createElement('tr'), cell = document.createElement('td');
      cell.colSpan = 5; cell.textContent = 'No regions match the current filters.'; tr.append(cell); this.$('period-region-body').append(tr);
    }
  }

  valueCell(summary, metric) {
    const cell = document.createElement('td'); cell.append(document.createTextNode(this.number(summary.value, metric)));
    if (metric !== 'records') {
      const coverage = document.createElement('small'); coverage.textContent = this.coverage(summary); cell.append(coverage);
    }
    return cell;
  }

  renderDetails() {
    const rows = this.country ? this.context.filter(row => row.iso === this.country) : this.context;
    const place = this.country ? this.countryNames.get(this.country) : this.filters.country ? this.countryNames.get(this.filters.country) : this.filters.region || 'Worldwide';
    this.$('period-impact-note').textContent = `${place} · ${this.basis === 'annual' ? 'Annual averages' : 'Period totals'} · A ${this.label(this.a)} / B ${this.label(this.b)} .`;
    const metricKeys = ['records', 'deaths', 'affected', 'damage_adjusted_usd'];
    const body = this.$('period-impact-body'); body.replaceChildren();
    for (const metric of metricKeys) {
      const a = periodSummary(rows, this.a, metric, this.basis), b = periodSummary(rows, this.b, metric, this.basis);
      const tr = document.createElement('tr'); tr.dataset.metric = metric;
      const label = document.createElement('th'); label.scope = 'row'; label.textContent = metrics[metric].label; tr.append(label);
      tr.append(this.valueCell(a, metric), this.valueCell(b, metric));
      const change = document.createElement('td'); change.textContent = this.signed(a.value === null || b.value === null ? null : b.value - a.value, metric); tr.append(change);
      body.append(tr);
    }
    const selected = range => rows.filter(row => row.year >= range.start && row.year <= range.end);
    const a = selected(this.a), b = selected(this.b), composition = periodComposition(a, b);
    const host = this.$('period-composition'); host.replaceChildren();
    if (!composition.length) { host.textContent = 'No records in either selected period.'; return; }
    for (const row of composition) {
      const item = document.createElement('div'); item.className = 'period-composition-row';
      const label = document.createElement('strong'); label.textContent = row.type; item.append(label);
      for (const id of ['a', 'b']) {
        const share = id === 'a' ? row.shareA : row.shareB;
        const line = document.createElement('div'); line.className = `period-share period-share-${id}`;
        const track = document.createElement('span'); track.className = 'period-share-track';
        const bar = document.createElement('i'); bar.style.width = `${100 * (share || 0)}%`; track.append(bar);
        const value = document.createElement('span'); value.textContent = share === null ? 'No records' : `${this.d3.format('.1%')(share)} · ${row[id].toLocaleString()}`;
        line.setAttribute('aria-label', `${row.type}, Period ${id.toUpperCase()}: ${share === null ? 'no records' : this.d3.format('.1%')(share) + ', ' + row[id] + ' records'}`);
        line.append(track, value); item.append(line);
      }
      host.append(item);
    }
  }
}
