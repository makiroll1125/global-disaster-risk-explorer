import { hazardColors, eventDay, hasCoordinates, DAY } from './hazards.js';

const d3 = window.d3;
const dateLabel = d3.utcFormat('%d %b %Y');

export class EventMap {
  constructor({ svg, projection, features, showTip, hideTip, onDate }) {
    Object.assign(this, { svg, projection, showTip, hideTip, onDate });
    this.centers = new Map(features.map(f => [f.id, d3.geoCentroid(f)]));
    this.transform = d3.zoomIdentity;
    this.layer = svg.append('g').attr('class', 'event-layer');
    this.pulses = svg.append('g').attr('class', 'pulse-layer').attr('pointer-events', 'none');
    this.items = [];
  }

  setData(rows, state, cutoff) {
    this.state = state;
    this.cutoff = cutoff;
    this.items = rows.map(row => {
      const exact = hasCoordinates(row);
      const coords = exact ? [row.longitude, row.latitude] : this.centers.get(row.map_id);
      return coords ? { row, exact, point: this.projection(coords), day: eventDay(row) } : null;
    }).filter(d => d && d.point?.every(Number.isFinite));
    this.clearPulses();
    this.drawTimeline(rows);
    this.render();
    const precise = rows.filter(hasCoordinates).length;
    const dated = rows.filter(r => eventDay(r) !== null && eventDay(r) <= cutoff).length;
    document.getElementById('event-coverage').textContent = `${precise.toLocaleString()} / ${rows.length.toLocaleString()} records have source coordinates. Hollow markers use country reference points, not event locations. ${dated.toLocaleString()} have a complete start date on or before the export cutoff; other records remain in period totals but are excluded from daily replay. Pulses show recorded starts, not the physical spread of a hazard.`;
    const counts = d3.rollup(rows, r => r.length, r => r.type);
    const legend = d3.select('#hazard-legend');
    legend.selectAll('span').data(Object.entries(hazardColors)).join('span')
      .classed('unavailable-hazard', d => !counts.has(d[0]))
      .attr('title', d => counts.has(d[0]) ? `${counts.get(d[0])} records in the map range` : 'No records in this selection')
      .each(function([name, color]) {
        this.replaceChildren();
        const dot = document.createElement('i'); dot.style.backgroundColor = color;
        this.append(dot, document.createTextNode(`${name} (${counts.get(name) || 0})`));
      });
  }

  render(from = null) {
    const { state } = this;
    const replay = state.mode === 'timeline';
    const visible = this.items.filter(d => (state.approximate || d.exact)
      && (!replay || (d.row.year === state.year && d.day !== null && d.day <= state.date && d.day <= this.cutoff)));
    const unit = 1 / (this.svg.node().getScreenCTM()?.a || 1);
    const pos = d => this.transform.apply(d.point);
    const pins = this.layer.selectAll('.event-pin').data(visible, d => d.row.id).join('circle')
      .attr('class', d => `event-pin ${d.exact ? 'located' : 'approximate'}`)
      .attr('cx', d => pos(d)[0]).attr('cy', d => pos(d)[1])
      .attr('r', d => (d.exact ? 3 : 3.5) * unit)
      .attr('fill', d => d.exact ? hazardColors[d.row.type] || '#777' : '#fff')
      .attr('stroke', d => hazardColors[d.row.type] || '#777').attr('stroke-width', unit * 1.4)
      .attr('data-type', d => d.row.type).attr('data-id', d => d.row.id)
      .attr('aria-label', d => `${d.row.type}, ${d.row.country}, ${d.day === null ? 'incomplete start date' : dateLabel(d.day)}. ${d.exact ? 'Source coordinate' : 'Approximate country reference point'}.`);
    const tip = (event, d) => this.showTip(event, `${d.row.type} · ${d.row.country}`,
      `${d.row.event_name || d.row.location || d.row.id} · ${d.day === null ? 'Start date incomplete' : dateLabel(d.day)}`,
      `${d.exact ? `Source coordinate: ${d.row.latitude.toFixed(3)}, ${d.row.longitude.toFixed(3)}` : 'Approximate country reference point; event coordinates unavailable.'} · ${d.row.deaths === null ? 'Deaths unreported' : d.row.deaths.toLocaleString() + ' reported deaths'}`);
    pins.on('pointermove', tip).on('pointerleave', this.hideTip).on('click', tip);
    if (from !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const fresh = visible.filter(d => d.day > from && d.day <= state.date);
      const pulses = this.pulses.selectAll(null).data(fresh).enter().append('circle')
        .attr('class', 'event-pulse').attr('cx', d => pos(d)[0]).attr('cy', d => pos(d)[1])
        .attr('fill', 'none').attr('stroke', d => hazardColors[d.row.type] || '#777')
        .attr('stroke-width', unit * 2).attr('r', unit * 3).attr('opacity', .85);
      pulses.transition().duration(1000).ease(d3.easeCubicOut).attr('r', unit * 38).attr('opacity', 0).remove();
    }
    document.getElementById('event-count').textContent = `${visible.length.toLocaleString()} ${replay ? 'recorded starts so far this year' : 'records on the map'}`;
    const dayRows = this.items.filter(d => d.day !== null && d.day === state.date && d.day <= this.cutoff && (state.approximate || d.exact));
    document.getElementById('event-today').textContent = replay ? `${dateLabel(state.date)} · ${dayRows.length} mapped starts` : 'Select Animated timeline to replay recorded starts';
    this.updateCursor();
  }

  drawTimeline(rows) {
    const year = this.state.year;
    const svg = d3.select('#event-timeline'); svg.selectAll('*').remove();
    const width = Math.max(260, svg.node().clientWidth);
    svg.attr('viewBox', `0 0 ${width} 70`);
    this.scale = d3.scaleUtc().domain([new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))]).range([15, width - 15]);
    const bins = d3.rollups(rows.filter(r => r.year === year && eventDay(r) !== null && eventDay(r) <= this.cutoff), r => r.length, eventDay, r => r.type);
    const max = d3.max(bins, ([, types]) => d3.sum(types, ([, count]) => count)) || 1;
    for (const [day, types] of bins) {
      let y = 49;
      for (const [type, count] of types) {
        const height = count / max * 34;
        svg.append('rect').attr('x', this.scale(day)).attr('y', y - height)
          .attr('width', Math.max(1, (width - 30) / 366)).attr('height', Math.max(1, height))
          .attr('fill', hazardColors[type]).attr('class', 'event-tick');
        y -= height;
      }
    }
    svg.append('g').attr('class', 'axis').attr('transform', 'translate(0,50)')
      .call(d3.axisBottom(this.scale).tickValues(d3.utcMonths(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1)), width < 500 ? 3 : 1)).tickFormat(d3.utcFormat('%b')).tickSize(0))
      .selectAll('text').attr('dy', 12);
    svg.append('line').attr('class', 'event-cursor').attr('y1', 3).attr('y2', 50).attr('stroke', '#173640').attr('stroke-width', 1.5);
    svg.on('click', event => {
      const [x] = d3.pointer(event);
      this.onDate(Math.min(this.cutoff, Date.UTC(year + 1, 0, 1) - DAY, Math.max(Date.UTC(year, 0, 1), Math.floor(+this.scale.invert(x) / DAY) * DAY)));
    });
  }

  updateCursor() {
    if (this.scale) d3.select('#event-timeline .event-cursor').attr('x1', this.scale(this.state.date)).attr('x2', this.scale(this.state.date));
  }

  clearPulses() { this.pulses.selectAll('*').interrupt().remove(); }
  zoom(transform) { this.transform = transform; this.clearPulses(); this.render(); }
}
