import { filterRows, groupSummary, metrics, summarize } from './data.js';

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
    const length = Math.max(1, Math.min(10, Math.floor((completeEnd - first + 1) / 2)));
    this.a = { start: Math.max(first, completeEnd - 2 * length + 1), end: Math.max(first, completeEnd - length) };
    this.b = { start: Math.max(first, completeEnd - length + 1), end: completeEnd };
    this.basis = 'annual'; this.country = '';
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
    this.$('period-basis').onchange = event => { this.basis = event.target.value; this.render(); };
    this.$('period-swap').onclick = () => { [this.a, this.b] = [this.b, this.a]; this.render(); };
    this.$('period-country').onchange = event => { this.country = event.target.value; this.render(); };
    this.setupMaps();
  }

  $(id) { return document.getElementById(id); }
  label(range) { return `${range.start}–${range.end}`; }
  number(value, metric = this.filters.metric) {
    if (value === null) return 'Not reported';
    return (metric.includes('usd') ? '$' : '') + this.d3.format(this.basis === 'annual' ? ',.1f' : ',.0f')(value);
  }
  short(value) {
    if (value === null) return 'Not reported';
    return (this.filters.metric.includes('usd') ? '$' : '') + this.d3.format('.3~s')(value).replace('G', 'B');
  }
  signed(value, metric) { return value === null ? 'Not comparable' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${this.number(Math.abs(value), metric)}`; }
  coverage(summary) { return `${summary.reported.toLocaleString()} / ${summary.count.toLocaleString()} records reporting`; }

  setupMaps() {
    const d3 = this.d3;
    this.transform = d3.zoomIdentity;
    const projection = d3.geoEqualEarth().fitExtent([[10, 12], [590, 294]], { type: 'FeatureCollection', features: this.features });
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
      return { id, svg, layer, countries };
    });
    this.zoom = d3.zoom().scaleExtent([1, 6]).extent([[0, 0], [600, 310]]).translateExtent([[0, 0], [600, 310]])
      .on('zoom', event => {
        this.hideTip(); this.transform = event.transform;
        for (const map of this.maps) {
          map.svg.property('__zoom', event.transform);
          map.layer.attr('transform', event.transform);
        }
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

  update(filters) {
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
    const d3 = this.d3, metric = this.filters.metric;
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
    this.$('period-status').textContent = `${metrics[metric].label} · ${this.basis === 'annual' ? 'Annual averages make different period lengths comparable; years with no matching records remain in the denominator.' : 'Period totals: longer periods can accumulate larger values.'}${partial ? ' Caution: 2026 is partial; averages including it are not complete-year rates.' : ' Both periods use complete calendar years.'}${overlap ? ' Periods overlap, so some records contribute to both.' : ''}${this.context.length ? '' : ' No records match the global filters.'}`;
    this.renderLegend(color, max, observedMax);
    const counts = [this.a, this.b].map(range => this.context.filter(row => row.year >= range.start && row.year <= range.end && !this.mapIds.has(row.map_id)).length);
    this.$('period-map-coverage').textContent = `Records without a map polygon: A ${counts[0].toLocaleString()} · B ${counts[1].toLocaleString()}. They remain in all regional totals and country details. Missing event coordinates never exclude a record from country totals. ${this.metadata.partial_year} is a partial year.`;
    this.renderRegions();
    this.renderDetails();
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
    const changes = periodChanges(this.context, 'region', this.a, this.b, this.filters.metric, this.basis)
      .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity) || a.key.localeCompare(b.key));
    this.$('period-region-a').textContent = `A · ${this.label(this.a)}`;
    this.$('period-region-b').textContent = `B · ${this.label(this.b)}`;
    const leader = changes.find(row => row.delta !== null && row.delta > 0);
    this.$('period-region-note').textContent = `${leader ? `${leader.key} has the largest increase in the selected reported measure: ${this.signed(leader.delta)}.` : 'No positive comparable regional change in this selection.'} Sorted by B − A · ${this.unit}. Impact cells show reporting coverage; unknown totals are not compared as zero.`;
    this.d3.select('#period-region-body').selectAll('tr').data(changes, row => row?.key).join('tr').each((row, i, nodes) => {
      const tr = nodes[i]; tr.replaceChildren();
      const name = document.createElement('th'); name.scope = 'row'; name.textContent = row.key; tr.append(name);
      for (const id of ['a', 'b']) tr.append(this.valueCell(row[id], this.filters.metric));
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
    this.$('period-impact-note').textContent = `${place} · ${this.basis === 'annual' ? 'Annual averages' : 'Period totals'} · A ${this.label(this.a)} / B ${this.label(this.b)}. Impact coverage counts source records, not years.`;
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
