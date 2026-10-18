import { hazardDescriptions, hazardFamily, eventColor, eventDay, hasCoordinates, DAY } from './hazards.js';
import { impactRadius, recordDateLabel, locationLabel, alignReplayCursor, upperBound } from './map-analysis.js';
import { MapExplorer } from './map-explorer.js';

const d3 = window.d3;
const dateLabel = d3.utcFormat('%d %b %Y');
const MARKER_LIFETIME = 2500, FADE_DURATION = 700;

export class EventMap {
  constructor({ svg, projection, features, showTip, hideTip, onDate, allRows, onChange, onInspect, onClusterZoom }) {
    Object.assign(this, { svg, projection, showTip, hideTip, onDate, onClusterZoom });
    this.centers = new Map(features.map(f => [f.id, d3.geoCentroid(f)]));
    this.transform = d3.zoomIdentity;
    this.areaOutline = svg.append('path').attr('class', 'map-area-outline').attr('pointer-events', 'none');
    this.layer = svg.append('g').attr('class', 'event-layer');
    this.pinLayer = this.layer.append('g');
    this.pulses = svg.append('g').attr('class', 'pulse-layer').attr('pointer-events', 'none');
    this.items = [];
    this.projected = new WeakMap();
    this.active = new Map();
    this.explorer = new MapExplorer(this, allRows, onChange, onInspect);
    this.areaBrush = d3.brush().extent([[0, 0], [900, 435]]).on('end', event => {
      if (!event.sourceEvent) return;
      if (event.selection && event.selection[1][0] - event.selection[0][0] > 2 && event.selection[1][1] - event.selection[0][1] > 2) {
        this.explorer.setArea({ kind: 'projected', bounds: event.selection.map(p => this.transform.invert(p)) });
      }
      this.enableAreaSelection(false);
    });
    this.areaBrushGroup = svg.append('g').attr('class', 'map-area-brush').attr('display', 'none').call(this.areaBrush);
  }

  setData(rows, state, cutoff, { alignReplay = false } = {}) {
    this.state = state;
    this.cutoff = cutoff;
    this.items = rows.map(row => {
      if (this.projected.has(row)) return this.projected.get(row);
      const exact = hasCoordinates(row);
      const coords = exact ? [row.longitude, row.latitude] : this.centers.get(row.map_id);
      const point = coords ? this.projection(coords) : null;
      const item = { row, exact, point: point?.every(Number.isFinite) ? point : null, day: eventDay(row) };
      this.projected.set(row, item);
      return item;
    });
    this.explorer.setData(this.items, state, cutoff);
    if (alignReplay && state.mode === 'timeline') {
      state.date = alignReplayCursor(this.explorer.replayDays, state.date);
      state.year = new Date(state.date).getUTCFullYear();
    }
    this.clearPulses();
    this.clearTrail();
    this.renderDate = null;
    this.periodItems = this.explorer.select(this.items, false);
    this.replayItems = this.periodItems.filter(d => d.day !== null && d.day <= cutoff).sort((a, b) => a.day - b.day);
    this.drawTimeline(this.explorer.timelineItems().map(d => d.row));
    this.render();
    const dated = rows.filter(r => eventDay(r) !== null && eventDay(r) <= cutoff).length;
    document.getElementById('event-coverage').textContent = `${dated.toLocaleString()} fully dated records · ${rows.length - dated} excluded from daily replay. Pulses mark recorded starts.`;
  }

  render(from = null) {
    const { state } = this;
    const replay = state.mode === 'timeline';
    const selected = replay ? this.replayItems.slice(0, upperBound(this.replayItems, state.date, d => d.day)) : this.periodItems;
    this.selected = selected;
    let fresh = [];
    if (replay) {
      if (this.renderDate === null || state.date < this.renderDate || (from === null && state.date !== this.renderDate)) this.clearTrail();
      const start = from ?? (state.date !== this.renderDate ? state.date - DAY : state.date);
      fresh = this.replayItems.slice(upperBound(this.replayItems, start, d => d.day), upperBound(this.replayItems, state.date, d => d.day)).filter(d => d.point);
      const born = performance.now();
      if (state.fadeEvents) {
        for (const [id, item] of this.active) if (born - item.born >= MARKER_LIFETIME) this.active.delete(id);
        for (const item of fresh) this.active.set(item.row.id, { ...item, born });
      } else this.clearTrail();
    } else this.clearTrail();
    this.renderDate = state.date;
    this.visible = replay && state.fadeEvents ? [...this.active.values()] : selected.filter(d => d.point);
    this.unit = 1 / (this.svg.node().getScreenCTM()?.a || 1);
    this.svg.attr('data-selected-records', selected.length);
    this.drawMarkers();
    this.renderAreaOutline();
    this.renderSizeLegend();
    this.explorer.update(selected);
    if (from !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const unit = this.unit, pos = d => d.point.map(v => v * this.transform.k);
      const pulses = this.pulses.selectAll(null).data(fresh).enter().append('circle')
        .attr('class', 'event-pulse').attr('cx', d => pos(d)[0]).attr('cy', d => pos(d)[1])
        .attr('fill', 'none').attr('stroke', d => eventColor(d.row.type, state))
        .attr('stroke-width', unit * 2).attr('r', unit * 3).attr('opacity', .85);
      pulses.transition().duration(1000).ease(d3.easeCubicOut).attr('r', unit * 38).attr('opacity', 0).remove();
    }
    const dayRows = selected.filter(d => d.point && d.day === state.date);
    document.getElementById('event-today').textContent = replay ? `${dateLabel(state.date)} · ${dayRows.length} starts today` : '';
    if (this.explorer.focusIds) document.getElementById('event-today').textContent += ` · Selected group: ${this.explorer.focusIds.size} records; details in Explore this selection below`;
    this.updateCursor();
    if (replay && state.fadeEvents && this.active.size && !this.trailFrame) this.trailFrame = requestAnimationFrame(now => this.animateTrail(now));
  }

  drawMarkers() {
    if (!this.visible) return;
    const unit = this.unit, k = this.transform.k;
    const records = this.visible.map(item => ({ key: item.row.id, members: [item], exact: item.exact, point: item.point.map(v => v * k) }));
    this.renderPins(records, unit);
    this.fadeNodes = this.layer.selectAll('.event-mark').nodes();
    this.svg.attr('data-rendered-records', this.visible.length);
    const replay = this.state.mode === 'timeline';
    document.getElementById('event-count').textContent = `${this.visible.length.toLocaleString()} ${replay && this.state.fadeEvents ? 'recent locations' : 'mapped records'}`;
    this.applyFade(performance.now());
  }

  applyFade(now) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const node of this.fadeNodes || []) {
      if (this.state.mode !== 'timeline' || !this.state.fadeEvents || reduced) { node.style.opacity = 1; continue; }
      const d = node.__data__;
      const born = d.born ?? d3.max(d.members, item => item.born);
      node.style.opacity = Math.max(0, Math.min(1, (MARKER_LIFETIME - (now - born)) / FADE_DURATION));
    }
  }

  animateTrail(now) {
    this.trailFrame = null;
    if (!this.state.fadeEvents) return;
    let expired = false;
    // Playback already expires records in its batched render. Avoid a second join
    // in the same frame; this loop owns expiry only while paused or finished.
    if (!this.state.playing) for (const [id, item] of this.active) if (now - item.born >= MARKER_LIFETIME) { this.active.delete(id); expired = true; }
    if (expired) { this.visible = [...this.active.values()]; this.drawMarkers(); }
    else this.applyFade(now);
    if (this.active.size) this.trailFrame = requestAnimationFrame(time => this.animateTrail(time));
  }

  clearTrail() {
    cancelAnimationFrame(this.trailFrame); this.trailFrame = null;
    this.active.clear();
  }

  renderPins(groups, unit) {
    const { sizeMetric, maxima, highlightEvent } = this.explorer;
    const items = groups.map(g => ({ ...g.members[0], group: g }));
    const unknown = d => sizeMetric !== 'equal' && !Number.isFinite(d.row[sizeMetric]);
    const zero = d => sizeMetric !== 'equal' && d.row[sizeMetric] === 0;
    const radius = d => (sizeMetric === 'equal' ? d.exact ? 3 : 3.5 : impactRadius(d.row[sizeMetric], maxima[sizeMetric])) * unit;
    const groupsSVG = this.pinLayer.selectAll('.event-mark').data(items, d => d.row.id).join('g').attr('class', 'event-mark')
      .classed('linked-event', d => !!highlightEvent && d.row.event_id === highlightEvent)
      .classed('chosen-group', d => !!this.explorer.focusIds?.has(d.row.id))
      .attr('transform', d => `translate(${d.group.point})`);
    const circles = groupsSVG.selectAll('circle.event-pin').data(d => unknown(d) || zero(d) ? [] : [d]).join('circle')
      .attr('class', d => `event-pin ${d.exact ? 'located' : 'approximate'}`)
      .attr('r', radius).attr('fill', d => d.exact ? eventColor(d.row.type, this.state) : '#fff')
      .attr('stroke', d => this.state.colorByType || d.exact ? eventColor(d.row.type, this.state) : '#71817d').attr('stroke-width', unit * 1.4);
    const paths = groupsSVG.selectAll('path.event-pin').data(d => unknown(d) || zero(d) ? [d] : []).join('path')
      .attr('class', d => `event-pin ${d.exact ? 'located' : 'approximate'} ${unknown(d) ? 'unknown-impact' : 'zero-impact'}`)
      .attr('d', d => unknown(d) ? `M${-3 * unit},${-3 * unit}l${6 * unit},${6 * unit}m0,${-6 * unit}l${-6 * unit},${6 * unit}` : `M0,${-3 * unit}l${3 * unit},${3 * unit}l${-3 * unit},${3 * unit}l${-3 * unit},${-3 * unit}Z`)
      .attr('fill', 'none').attr('stroke', d => this.state.colorByType || d.exact ? eventColor(d.row.type, this.state) : '#71817d').attr('stroke-width', unit * 1.5);
    groupsSVG.selectAll('.event-hit').data(d => [d]).join('circle').attr('class', 'event-hit').attr('r', d => Math.max(7 * unit, radius(d))).attr('fill', 'transparent');
    groupsSVG.selectAll('.event-hover-ring').data(d => [d]).join('circle').attr('class', 'event-hover-ring')
      .attr('r', d => Math.max(4 * unit, radius(d)) + 1.5 * unit).attr('fill', 'none')
      .attr('stroke', '#000').attr('stroke-width', 1.5 * unit).attr('pointer-events', 'none');
    const tip = (event, d) => this.showTip(event, `${d.row.type} · ${d.row.country}`,
      `${d.row.event_name || d.row.location || d.row.id} · ${recordDateLabel(d.row)}`,
      `${hazardDescriptions[d.row.type]} ${locationLabel(d.row)}. Click to inspect the source record.`);
    groupsSVG.attr('tabindex', 0).attr('role', 'button').attr('aria-label', d => `${d.row.type}, ${d.row.country}, ${recordDateLabel(d.row)}. Inspect source record.`)
      .on('pointerenter', (_, d) => { this.hoveredId = d.row.id; this.updateHoveredMark(); })
      .on('pointermove', tip)
      .on('focus', (event, d) => { this.focusedId = event.currentTarget.matches(':focus-visible') ? d.row.id : ''; this.updateHoveredMark(); tip(event, d); })
      .on('pointerleave', (_, d) => { if (this.hoveredId === d.row.id) this.hoveredId = ''; this.updateHoveredMark(); this.hideTip(); })
      .on('blur', () => { this.focusedId = ''; this.updateHoveredMark(); this.hideTip(); })
      .on('click', (_, d) => { this.hideTip(); this.explorer.inspectGroup(d.group); })
      .on('keydown', (event, d) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.explorer.inspectGroup(d.group); } });
    circles.attr('data-type', d => d.row.type).attr('data-id', d => d.row.id);
    paths.attr('data-type', d => d.row.type).attr('data-id', d => d.row.id);
    this.updateHoveredMark();
  }

  updateHoveredMark() {
    const id = this.hoveredId || this.focusedId;
    const marks = this.pinLayer.selectAll('.event-mark');
    marks.classed('is-hovered', d => d.row.id === id);
    marks.select('.event-hover-ring').attr('display', d => d.row.id === id ? null : 'none');
    marks.filter(d => d.row.id === id).raise();
  }

  renderSizeLegend() {
    const { sizeMetric, maxima } = this.explorer;
    const key = `${sizeMetric}:${this.state.mode}:${this.state.fadeEvents}`;
    if (key === this.sizeLegendKey) return;
    this.sizeLegendKey = key;
    const container = document.getElementById('map-size-legend'); container.replaceChildren();
    const description = document.createElement('span');
    description.textContent = sizeMetric === 'equal' ? 'Filled = source coordinate · hollow = country reference' : 'Area = impact · ◇ zero · × unreported';
    container.append(description);
    if (this.state.mode === 'timeline') { const note = document.createElement('span'); note.textContent = this.state.fadeEvents ? 'Fade after 2.5s' : 'Locations stay visible'; container.append(note); }
    if (sizeMetric !== 'equal') {
      const max = maxima[sizeMetric];
      const svg = d3.select(container).append('svg').attr('viewBox', '0 0 300 54').attr('aria-label', 'Impact size legend; fixed scale across map selections');
      for (const [i, fraction] of [.0625, .25, 1].entries()) {
        svg.append('circle').attr('cx', 35 + i * 95).attr('cy', 20).attr('r', 18 * Math.sqrt(fraction)).attr('fill', 'none').attr('stroke', '#68877c');
        svg.append('text').attr('x', 35 + i * 95).attr('y', 50).attr('text-anchor', 'middle').attr('font-size', 10).text((sizeMetric.includes('usd') ? '$' : '') + d3.format('.2~s')(max * fraction).replace('G', 'B'));
      }
      const note = document.createElement('span'); note.textContent = 'Fixed scale uses the complete dataset; tiny positive values have a 1.5px minimum radius.'; container.append(note);
    }
  }

  enableAreaSelection(enabled) {
    this.areaSelecting = enabled;
    this.areaBrushGroup.attr('display', enabled ? null : 'none');
    document.getElementById('map-area-tool').setAttribute('aria-pressed', enabled);
    document.getElementById('map-area-tool').textContent = enabled ? 'Cancel area selection' : 'Select area';
    if (enabled) { this.explorer.onInspect(); this.areaBrushGroup.call(this.areaBrush.move, null); }
  }

  renderAreaOutline() {
    const area = this.explorer.selection.area;
    this.areaOutline.attr('display', area && this.state.encoding === 'events' ? null : 'none').attr('transform', this.transform);
    if (!area) return;
    if (area.kind === 'projected') {
      const [[x0, y0], [x1, y1]] = area.bounds;
      this.areaOutline.attr('d', `M${x0},${y0}H${x1}V${y1}H${x0}Z`);
    } else {
      const ranges = area.west <= area.east ? [[area.west, area.east]] : [[area.west, 180], [-180, area.east]];
      const lines = ranges.map(([west, east]) => {
        const line = [];
        for (let t = 0; t <= 1.001; t += .025) line.push([west + (east - west) * t, area.north]);
        for (let t = 0; t <= 1.001; t += .025) line.push([east, area.north + (area.south - area.north) * t]);
        for (let t = 0; t <= 1.001; t += .025) line.push([east + (west - east) * t, area.south]);
        for (let t = 0; t <= 1.001; t += .025) line.push([west, area.south + (area.north - area.south) * t]);
        return line;
      });
      this.areaOutline.attr('d', d3.geoPath(this.projection)({ type: 'MultiLineString', coordinates: lines }));
    }
  }

  drawTimeline(rows) {
    const [start, end] = this.explorer.selection.interval || this.explorer.bounds;
    const dated = rows.filter(r => eventDay(r) !== null && eventDay(r) >= start && eventDay(r) <= end);
    const svg = d3.select('#event-timeline'); svg.selectAll('*').remove();
    const width = Math.max(260, svg.node().clientWidth);
    const description = `${dated.length.toLocaleString()} disaster start records, ${dateLabel(start)} to ${dateLabel(end)}. Bar height counts starts. Click a bar or use the date slider to seek across the selected period.`;
    svg.attr('viewBox', `0 0 ${width} 70`).attr('aria-label', description);
    svg.append('title').text(description);
    // The histogram, seek slider and replay schedule share the full selected interval.
    // The current year is a navigation shortcut, never an additional record filter.
    this.scale = d3.scaleUtc().domain([start, end + DAY]).range([15, width - 15]);
    const bins = d3.groups(dated, eventDay, row => !this.state.colorByType ? 'records' : this.state.hazardLevel === 'grouped' ? hazardFamily(row.type) : row.type);
    const max = d3.max(bins, ([, types]) => d3.sum(types, ([, records]) => records.length)) || 1;
    const barWidth = Math.max(1, Math.min(4, (width - 30) / ((end - start) / DAY + 1)));
    for (const [day, types] of bins) {
      let top = 49;
      for (const [type, records] of types) {
        const height = records.length / max * 34;
        svg.append('rect').datum({ day, records }).attr('x', this.scale(day)).attr('y', top - height)
          .attr('width', barWidth).attr('height', height)
          .attr('fill', eventColor(type, this.state)).attr('class', 'event-tick')
          .on('click', event => { event.stopPropagation(); this.onDate(day); })
          .append('title').text(`${dateLabel(day)} · ${records.length} records`);
        top -= height;
      }
    }
    svg.append('g').attr('class', 'axis').attr('transform', 'translate(0,50)')
      .call(d3.axisBottom(this.scale).ticks(width < 500 ? 4 : 7).tickSize(0))
      .selectAll('text').attr('dy', 12);
    svg.append('line').attr('class', 'event-cursor').attr('y1', 3).attr('y2', 50).attr('stroke', '#173640').attr('stroke-width', 1.5);
    svg.on('click', event => {
      const [x] = d3.pointer(event);
      this.onDate(Math.max(start, Math.min(end, Math.floor(+this.scale.invert(x) / DAY) * DAY)));
    });
  }

  updateCursor() {
    if (this.scale) d3.select('#event-timeline .event-cursor').attr('x1', this.scale(this.state.date)).attr('x2', this.scale(this.state.date));
  }

  clearPulses() { this.pulses.selectAll('*').interrupt().remove(); }
  zoom(transform) {
    const scaleChanged = transform.k !== this.transform.k;
    this.transform = transform;
    // Panning changes two parent transforms, with no data joins or panel rebuilds.
    const translate = `translate(${transform.x},${transform.y})`;
    this.layer.attr('transform', translate); this.pulses.attr('transform', translate);
    this.areaOutline.attr('transform', transform);
    if (scaleChanged) {
      this.drawMarkers();
      this.pulses.selectAll('circle').attr('cx', d => d.point[0] * transform.k).attr('cy', d => d.point[1] * transform.k);
    }
  }
}
