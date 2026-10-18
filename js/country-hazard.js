/* Country–hazard aggregation and coordinated network/matrix views. */

const IMPACTS = ['deaths', 'affected', 'damage_adjusted_usd'];

function impactSummary(rows, key) {
  const values = rows.map(row => row[key]).filter(Number.isFinite);
  return {
    value: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
    reported: values.length,
    total: rows.length,
  };
}

export function cosineSimilarity(a, b) {
  let dot = 0, aa = 0, bb = 0;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const av = a[i] || 0, bv = b[i] || 0;
    dot += av * bv; aa += av * av; bb += bv * bv;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

// Deterministic average-linkage agglomerative clustering. Endpoint orientation
// minimizes the distance at each merge so similar profiles tend to stay adjacent.
export function similarityOrder(countries, hazards) {
  if (countries.length < 2) return countries.map(country => country.iso);
  const vectors = new Map(countries.map(country => [country.iso,
    hazards.map(hazard => (country.relationships.get(hazard)?.count || 0) / country.totalRecords)]));
  const distance = (a, b) => 1 - cosineSimilarity(vectors.get(a), vectors.get(b));
  let clusters = countries.map(country => ({ members: [country.iso], order: [country.iso], key: country.iso })).sort((a, b) => a.key.localeCompare(b.key));
  const clusterDistance = (a, b) => {
    let sum = 0;
    for (const left of a.members) for (const right of b.members) sum += distance(left, right);
    return sum / (a.members.length * b.members.length);
  };
  while (clusters.length > 1) {
    let best = null;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const value = clusterDistance(clusters[i], clusters[j]);
      const key = `${clusters[i].key}|${clusters[j].key}`;
      if (!best || value < best.value - 1e-12 || (Math.abs(value - best.value) < 1e-12 && key < best.key)) best = { i, j, value, key };
    }
    const left = clusters[best.i], right = clusters[best.j];
    const leftWays = [left.order, [...left.order].reverse()], rightWays = [right.order, [...right.order].reverse()];
    const variants = [];
    for (const a of leftWays) for (const b of rightWays) {
      variants.push({ order: [...a, ...b], split: a.length });
      variants.push({ order: [...b, ...a], split: b.length });
    }
    variants.sort((a, b) => {
      const scoreA = distance(a.order[a.split - 1], a.order[a.split]);
      const scoreB = distance(b.order[b.split - 1], b.order[b.split]);
      return scoreA - scoreB || a.order.join('|').localeCompare(b.order.join('|'));
    });
    const merged = { members: [...left.members, ...right.members], order: variants[0].order, key: [left.key, right.key].sort().join('|') };
    clusters = clusters.filter((_, index) => index !== best.i && index !== best.j);
    clusters.push(merged); clusters.sort((a, b) => a.key.localeCompare(b.key));
  }
  return clusters[0].order;
}

export function aggregateCountryHazards(rows) {
  const countryGroups = new Map();
  const hazardCounts = new Map();
  for (const row of rows) {
    if (!countryGroups.has(row.iso)) countryGroups.set(row.iso, { iso: row.iso, name: row.country, region: row.region, rows: [], hazardRows: new Map() });
    const country = countryGroups.get(row.iso);
    country.rows.push(row);
    if (!country.hazardRows.has(row.type)) country.hazardRows.set(row.type, []);
    country.hazardRows.get(row.type).push(row);
    hazardCounts.set(row.type, (hazardCounts.get(row.type) || 0) + 1);
  }
  const hazards = [...hazardCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
  const countries = [...countryGroups.values()].map(group => {
    const relationships = new Map();
    for (const [hazard, hazardRows] of group.hazardRows) {
      const relation = { iso: group.iso, country: group.name, hazard, count: hazardRows.length, share: hazardRows.length / group.rows.length };
      for (const impact of IMPACTS) relation[impact] = impactSummary(hazardRows, impact);
      relationships.set(hazard, relation);
    }
    return {
      iso: group.iso, name: group.name, region: group.region, totalRecords: group.rows.length,
      hazardCount: relationships.size, relationships,
      impacts: Object.fromEntries(IMPACTS.map(impact => [impact, impactSummary(group.rows, impact)])),
    };
  }).sort((a, b) => b.totalRecords - a.totalRecords || a.name.localeCompare(b.name));
  return { countries, hazards };
}

export function buildCountryHazardModel(rows, { countryLimit = 10, includeCountry = '', order = 'frequency', hazardLimit = 8 } = {}) {
  const aggregate = aggregateCountryHazards(rows);
  let countries = aggregate.countries.slice(0, countryLimit);
  const included = includeCountry && aggregate.countries.find(country => country.iso === includeCountry);
  if (included && !countries.some(country => country.iso === included.iso)) countries = [...countries.slice(0, Math.max(0, countryLimit - 1)), included];
  const visibleHazards = aggregate.hazards.slice(0, hazardLimit).map(hazard => hazard.name);
  const allHazards = aggregate.hazards.map(hazard => hazard.name);
  if (order === 'alphabetical') countries.sort((a, b) => a.name.localeCompare(b.name));
  else if (order === 'similarity') {
    const positions = new Map(similarityOrder(countries, allHazards).map((iso, index) => [iso, index]));
    countries.sort((a, b) => positions.get(a.iso) - positions.get(b.iso));
  }
  const relations = countries.flatMap(country => visibleHazards.map(hazard => country.relationships.get(hazard)).filter(Boolean));
  return { ...aggregate, allCountries: aggregate.countries, countries, visibleHazards, allHazards, relations, availableCountryCount: aggregate.countries.length };
}

function safeName(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

export class CountryHazardExplorer {
  constructor({ rows, metadata, colors, showTip, hideTip }) {
    this.allRows = rows; this.metadata = metadata; this.colors = colors; this.showTip = showTip; this.hideTip = hideTip;
    this.d3 = window.d3;
    this.state = { countryLimit: 10, edgeLimit: 3, metric: 'share', order: 'frequency', includeCountry: '', start: metadata.observed_years[0], end: metadata.observed_years[1], selected: [], selectedHazard: '', hover: null, posterPreset: false };
    this.bindControls();
  }

  $(id) { return document.getElementById(id); }

  bindControls() {
    const [start, end] = this.metadata.observed_years;
    for (const id of ['ch-start', 'ch-end']) for (let year = start; year <= end; year++) this.$(id).add(new Option(year === 2026 ? '2026*' : String(year), year));
    this.$('ch-start').value = start; this.$('ch-end').value = end;
    this.$('ch-country-count').onchange = event => { this.state.countryLimit = +event.target.value; this.state.includeCountry = ''; this.render(); };
    this.$('ch-edge-limit').onchange = event => { this.state.edgeLimit = event.target.value === 'all' ? Infinity : +event.target.value; this.renderCharts(); };
    this.$('ch-order').onchange = event => { this.state.order = event.target.value; this.render(); };
    this.$('ch-start').onchange = event => { this.state.start = +event.target.value; this.state.end = Math.max(this.state.start, this.state.end); this.$('ch-end').value = this.state.end; this.render(); };
    this.$('ch-end').onchange = event => { this.state.end = +event.target.value; this.state.start = Math.min(this.state.start, this.state.end); this.$('ch-start').value = this.state.start; this.render(); };
    for (const input of document.querySelectorAll('[name="ch-metric"]')) input.onchange = event => { this.state.metric = event.target.value; this.renderMatrix(); };
    this.$('ch-add-country').onclick = () => this.includeSearch();
    this.$('ch-country-search').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); this.includeSearch(); } };
    this.$('ch-reset').onclick = () => this.reset();
    this.$('ch-details').onclick = event => {
      if (!event.target.closest('.ch-clear-selection')) return;
      this.state.selected = []; this.state.selectedHazard = ''; this.applyHighlight(); this.renderDetails();
    };
    this.$('ch-poster-open').onclick = () => this.openPoster();
    this.$('ch-poster-close').onclick = () => this.$('ch-poster-dialog').close();
    this.$('ch-poster-preset').onclick = () => { this.state.posterPreset = true; this.renderPoster(); };
    this.$('ch-export-svg').onclick = () => this.exportSVG();
    this.$('ch-export-png').onclick = () => this.exportPNG();
  }

  reset() {
    Object.assign(this.state, { countryLimit: 10, edgeLimit: 3, metric: 'share', order: 'frequency', includeCountry: '', start: this.metadata.observed_years[0], end: this.metadata.observed_years[1], selected: [], selectedHazard: '', hover: null, posterPreset: false });
    this.$('ch-country-count').value = '10'; this.$('ch-edge-limit').value = '3'; this.$('ch-order').value = 'frequency';
    this.$('ch-start').value = this.state.start; this.$('ch-end').value = this.state.end; this.$('ch-country-search').value = '';
    document.querySelector('[name="ch-metric"][value="share"]').checked = true;
    this.render();
  }

  includeSearch() {
    const query = this.$('ch-country-search').value.trim().toLocaleLowerCase();
    const country = this.model?.allCountries?.find(item => item.iso.toLocaleLowerCase() === query || item.name.toLocaleLowerCase() === query);
    this.$('ch-search-status').textContent = country ? `${country.name} included in the current subset.` : query ? 'No matching country in the current global filter context.' : 'Enter a country name or ISO code.';
    if (country) { this.state.includeCountry = country.iso; this.render(); }
  }

  update(rows, globalState) {
    this.contextRows = rows;
    this.globalState = globalState;
    this.render();
  }

  render() {
    if (!this.contextRows) return;
    const rows = this.contextRows.filter(row => row.year >= this.state.start && row.year <= this.state.end);
    this.model = buildCountryHazardModel(rows, this.state);
    const available = new Set(this.model.countries.map(country => country.iso));
    this.state.selected = this.state.selected.filter(iso => available.has(iso));
    if (this.state.selectedHazard && !this.model.visibleHazards.includes(this.state.selectedHazard)) this.state.selectedHazard = '';
    this.state.hover = null;
    if (this.state.includeCountry && !this.model.allCountries.some(country => country.iso === this.state.includeCountry)) this.state.includeCountry = '';
    this.populateSearch();
    const filteredTypes = Array.isArray(this.globalState?.types);
    this.$('ch-denominator-note').textContent = `Shares use all ${this.model.allHazards.length} hazard ${this.model.allHazards.length === 1 ? 'type' : 'types'} in each country’s current ${filteredTypes ? 'hazard-filtered ' : ''}${this.state.start}–${this.state.end} record total; displayed columns are not re-normalized.`;
    this.$('ch-subset-note').textContent = `Showing ${this.model.countries.length} of ${this.model.availableCountryCount} countries / territories — ranked by recorded disasters${this.state.includeCountry ? ', including searched country' : ''}. Top ${this.model.visibleHazards.length} hazards are shown.`;
    this.renderCharts(); this.renderDetails();
  }

  populateSearch() {
    const list = this.$('ch-country-list'); list.replaceChildren();
    for (const country of this.model.allCountries) { const option = document.createElement('option'); option.value = country.name; option.label = country.iso; list.append(option); }
  }

  renderCharts() { this.renderNetwork(); this.renderMatrix(); }

  edgeIsVisible(relation) {
    if (this.state.edgeLimit === Infinity) return true;
    const country = this.model.countries.find(item => item.iso === relation.iso);
    return [...country.relationships.values()].sort((a, b) => b.share - a.share || b.count - a.count || a.hazard.localeCompare(b.hazard)).slice(0, this.state.edgeLimit).some(item => item.hazard === relation.hazard);
  }

  interaction(selection, kind, getKey) {
    selection.attr('tabindex', 0).attr('role', 'button')
      .on('pointerenter focus', (event, datum) => { this.state.hover = { kind, key: getKey(datum), relation: kind === 'relation' ? datum : null }; this.applyHighlight(); if (kind === 'relation') this.tipRelation(event, datum); })
      .on('pointermove', (event, datum) => { if (kind === 'relation') this.tipRelation(event, datum); })
      .on('pointerleave blur', () => { this.state.hover = null; this.hideTip(); this.applyHighlight(); })
      .on('keydown', (event, datum) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.activate(kind, getKey(datum)); } })
      .on('click', (event, datum) => this.activate(kind, getKey(datum)));
  }

  activate(kind, key) {
    if (kind === 'country') {
      const selected = this.state.selected.includes(key) ? this.state.selected.filter(iso => iso !== key) : [...this.state.selected, key].slice(-2);
      this.state.selected = selected;
    } else if (kind === 'hazard') this.state.selectedHazard = this.state.selectedHazard === key ? '' : key;
    this.applyHighlight(); this.renderDetails();
  }

  renderNetwork() {
    const d3 = this.d3, countries = this.model.countries, hazards = this.model.visibleHazards;
    const svg = d3.select('#ch-network'); svg.selectAll('*').remove();
    const height = Math.max(390, countries.length * 37 + 66), width = 520;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('aria-label', `Bipartite network of ${countries.length} countries and ${hazards.length} hazards. Uniform edges show recorded relationships; the strongest ${this.state.edgeLimit === Infinity ? 'all' : this.state.edgeLimit} per country are displayed.`);
    if (!countries.length || !hazards.length) { svg.append('text').attr('class', 'chart-empty').attr('x', width / 2).attr('y', 150).text('No country–hazard relationships match these filters.'); return; }
    const yCountry = new Map(countries.map((country, index) => [country.iso, 48 + index * ((height - 82) / Math.max(1, countries.length - 1))]));
    const yHazard = new Map(hazards.map((hazard, index) => [hazard, 48 + index * ((height - 82) / Math.max(1, hazards.length - 1))]));
    svg.append('text').attr('class', 'ch-axis-heading').attr('x', 12).attr('y', 19).text('COUNTRIES');
    svg.append('text').attr('class', 'ch-axis-heading').attr('x', width - 12).attr('y', 19).attr('text-anchor', 'end').text('DISASTER TYPES');
    const edges = svg.append('g').attr('class', 'ch-network-edges').selectAll('path').data(this.model.relations, relation => `${relation.iso}|${relation.hazard}`).join('path')
      .attr('class', relation => `ch-edge${this.edgeIsVisible(relation) ? '' : ' ch-edge-hidden'}`).attr('data-country', relation => relation.iso).attr('data-hazard', relation => relation.hazard)
      .attr('d', relation => `M145,${yCountry.get(relation.iso)} C250,${yCountry.get(relation.iso)} 270,${yHazard.get(relation.hazard)} 375,${yHazard.get(relation.hazard)}`)
      .attr('stroke', relation => this.colors[relation.hazard] || '#65747a');
    this.interaction(edges, 'relation', relation => `${relation.iso}|${relation.hazard}`);
    const countryNodes = svg.append('g').selectAll('g').data(countries, country => country.iso).join('g').attr('class', 'ch-node ch-country-node').attr('data-country', country => country.iso).attr('transform', country => `translate(140,${yCountry.get(country.iso)})`);
    countryNodes.append('circle').attr('r', 6); countryNodes.append('text').attr('x', -11).attr('dy', '.35em').attr('text-anchor', 'end').text(country => country.name.length > 20 ? country.name.slice(0, 19) + '…' : country.name);
    countryNodes.attr('aria-label', country => `${country.name}: ${country.totalRecords} records across ${country.hazardCount} hazards. Select for comparison.`);
    this.interaction(countryNodes, 'country', country => country.iso);
    const hazardNodes = svg.append('g').selectAll('g').data(hazards, hazard => hazard).join('g').attr('class', 'ch-node ch-hazard-node').attr('data-hazard', hazard => hazard).attr('transform', hazard => `translate(380,${yHazard.get(hazard)})`);
    hazardNodes.append('circle').attr('r', 6).style('fill', hazard => this.colors[hazard] || '#65747a'); hazardNodes.append('text').attr('x', 11).attr('dy', '.35em').text(hazard => hazard.length > 20 ? hazard.slice(0, 19) + '…' : hazard);
    hazardNodes.attr('aria-label', hazard => `${hazard}. Highlight connected countries and matrix column.`);
    this.interaction(hazardNodes, 'hazard', hazard => hazard);
    this.applyHighlight();
  }

  renderMatrix() {
    const d3 = this.d3, countries = this.model.countries, hazards = this.model.visibleHazards;
    const cellW = 62, cellH = 36, left = 174, top = 120, width = left + hazards.length * cellW + 20, height = top + countries.length * cellH + 46;
    const svg = d3.select('#ch-matrix'); svg.selectAll('*').remove(); svg.attr('viewBox', `0 0 ${width} ${Math.max(350, height)}`);
    if (!countries.length || !hazards.length) { svg.append('text').attr('class', 'chart-empty').attr('x', width / 2).attr('y', 180).text('No data to display.'); return; }
    const max = this.state.metric === 'share' ? d3.max(this.model.relations, relation => relation.share) || 1 : d3.max(this.model.relations, relation => relation.count) || 1;
    this.matrixColor = d3.scaleSequential().domain([0, max]).interpolator(t => d3.interpolateRgbBasis(['#edf4f1', '#95c9bd', '#17877d', '#143b52'])(t));
    const defs = svg.append('defs');
    const pattern = defs.append('pattern').attr('id', 'ch-no-relationship').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
    pattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#f7f9f8'); pattern.append('line').attr('y2', 6).attr('stroke', '#d9e1de').attr('stroke-width', 1.5);
    const columns = svg.append('g').selectAll('g').data(hazards).join('g').attr('class', 'ch-column-label').attr('data-hazard', hazard => hazard).attr('transform', (hazard, index) => `translate(${left + index * cellW + cellW / 2},${top - 8}) rotate(-48)`);
    columns.append('text').attr('text-anchor', 'start').text(hazard => hazard); columns.attr('aria-label', hazard => `${hazard} column. Select to highlight connected countries.`); this.interaction(columns, 'hazard', hazard => hazard);
    const rows = svg.append('g').selectAll('g').data(countries).join('g').attr('class', 'ch-row-label').attr('data-country', country => country.iso).attr('transform', (country, index) => `translate(0,${top + index * cellH})`);
    rows.append('rect').attr('width', left - 7).attr('height', cellH - 2); rows.append('text').attr('x', left - 14).attr('y', cellH / 2).attr('dy', '.35em').attr('text-anchor', 'end').text(country => country.name);
    rows.attr('aria-label', country => `${country.name} row. Select for comparison.`); this.interaction(rows, 'country', country => country.iso);
    const cells = [];
    countries.forEach((country, row) => hazards.forEach((hazard, column) => cells.push({ row, column, country, hazard, relation: country.relationships.get(hazard) || null })));
    const cellGroups = svg.append('g').selectAll('g').data(cells, cell => `${cell.country.iso}|${cell.hazard}`).join('g').attr('class', 'ch-cell').attr('data-country', cell => cell.country.iso).attr('data-hazard', cell => cell.hazard).attr('transform', cell => `translate(${left + cell.column * cellW},${top + cell.row * cellH})`);
    cellGroups.append('rect').attr('width', cellW - 2).attr('height', cellH - 2).attr('rx', 2).attr('fill', cell => !cell.relation ? 'url(#ch-no-relationship)' : this.matrixColor(this.state.metric === 'share' ? cell.relation.share : cell.relation.count));
    cellGroups.append('text').attr('x', (cellW - 2) / 2).attr('y', (cellH - 2) / 2).attr('dy', '.35em').attr('text-anchor', 'middle')
      .style('fill', cell => cell.relation && (this.state.metric === 'share' ? cell.relation.share : cell.relation.count) / max > .48 ? '#fff' : '#173640')
      .text(cell => !cell.relation ? '—' : this.state.metric === 'share' ? d3.format('.0%')(cell.relation.share) : cell.relation.count);
    cellGroups.attr('aria-label', cell => !cell.relation ? `${cell.country.name}, ${cell.hazard}: no recorded relationship.` : `${cell.country.name}, ${cell.hazard}: ${cell.relation.count} records, ${d3.format('.1%')(cell.relation.share)} of country records.`);
    this.interaction(cellGroups.filter(cell => cell.relation), 'relation', cell => `${cell.country.iso}|${cell.hazard}`);
    const legend = svg.append('g').attr('class', 'ch-matrix-legend').attr('transform', `translate(${left},${top + countries.length * cellH + 16})`);
    const steps = d3.range(50); legend.selectAll('rect').data(steps).join('rect').attr('x', step => step * 3.2).attr('width', 3.3).attr('height', 8).attr('fill', step => this.matrixColor(max * step / 49));
    legend.append('text').attr('y', 22).text('0'); legend.append('text').attr('x', 160).attr('y', 22).attr('text-anchor', 'end').text(this.state.metric === 'share' ? d3.format('.0%')(max) : d3.format(',')(max));
    legend.append('text').attr('x', 170).attr('y', 8).text(this.state.metric === 'share' ? 'Hazard share' : 'Record count');
    legend.append('rect').attr('x', 300).attr('width', 14).attr('height', 9).attr('fill', 'url(#ch-no-relationship)'); legend.append('text').attr('x', 320).attr('y', 8).text('No recorded relationship');
    this.applyHighlight();
  }

  relationFromKey(key) { const [iso, hazard] = key.split('|'); return this.model.countries.find(country => country.iso === iso)?.relationships.get(hazard); }

  tipRelation(event, datum) {
    const relation = datum.relation || datum;
    if (!relation) return;
    const d3 = this.d3, impact = (label, summary, prefix = '') => `${label}: ${summary.value === null ? 'not reported' : prefix + d3.format(',.0f')(summary.value)} (${summary.reported}/${summary.total} records reporting)`;
    this.showTip(event, `${relation.country} × ${relation.hazard}`, `${relation.count} records · ${d3.format('.1%')(relation.share)} of all current country records`, `${impact('Deaths', relation.deaths)} · ${impact('Affected', relation.affected)} · ${impact('Adjusted damage', relation.damage_adjusted_usd, '$')}`);
  }

  applyHighlight() {
    if (!this.model) return;
    const hover = this.state.hover, selected = new Set(this.state.selected), selectedHazard = this.state.selectedHazard;
    let activeCountry = '', activeHazard = '';
    if (hover?.kind === 'country') activeCountry = hover.key;
    if (hover?.kind === 'hazard') activeHazard = hover.key;
    if (hover?.kind === 'relation') [activeCountry, activeHazard] = hover.key.split('|');
    const hasFocus = activeCountry || activeHazard || selected.size || selectedHazard;
    const related = relation => (!activeCountry || relation.iso === activeCountry) && (!activeHazard || relation.hazard === activeHazard)
      && (!selected.size || selected.has(relation.iso)) && (!selectedHazard || relation.hazard === selectedHazard);
    const d3 = this.d3;
    d3.selectAll('#country-hazard .ch-edge').classed('is-active', relation => related(relation)).classed('is-muted', relation => hasFocus && !related(relation))
      .classed('is-revealed', relation => !this.edgeIsVisible(relation) && hover?.kind === 'relation' && hover.key === `${relation.iso}|${relation.hazard}`);
    d3.selectAll('#country-hazard [data-country]').classed('is-country-active', function() { const iso = this.dataset.country; return iso === activeCountry || selected.has(iso); });
    d3.selectAll('#country-hazard [data-hazard]').classed('is-hazard-active', function() { const hazard = this.dataset.hazard; return hazard === activeHazard || hazard === selectedHazard; });
    d3.selectAll('#country-hazard .ch-cell').classed('is-active', function() { return (!activeCountry || this.dataset.country === activeCountry) && (!activeHazard || this.dataset.hazard === activeHazard) && (!selected.size || selected.has(this.dataset.country)) && (!selectedHazard || this.dataset.hazard === selectedHazard); })
      .classed('is-muted', function() { return hasFocus && !this.classList.contains('is-active'); });
  }

  renderDetails() {
    const host = this.$('ch-details'), selected = this.state.selected.map(iso => this.model.countries.find(country => country.iso === iso)).filter(Boolean);
    if (!selected.length) { host.innerHTML = '<p><strong>Select one or two countries</strong> to inspect their profiles and compare historical disaster composition.</p>'; return; }
    const d3 = this.d3, top = country => [...country.relationships.values()].sort((a, b) => b.share - a.share || a.hazard.localeCompare(b.hazard));
    if (selected.length === 1) {
      const country = selected[0], leaders = top(country).slice(0, 4);
      host.innerHTML = `<div><span>SELECTED COUNTRY</span><h3>${safeName(country.name)}</h3><p>${country.totalRecords.toLocaleString()} records · ${country.hazardCount} distinct hazards</p><button class="text-button ch-clear-selection">Clear selection ×</button></div><div class="ch-profile-bars">${leaders.map(item => `<div><span>${safeName(item.hazard)}</span><strong>${d3.format('.1%')(item.share)}</strong><i style="width:${item.share * 100}%;background:${this.colors[item.hazard] || '#65747a'}"></i></div>`).join('')}</div><p class="ch-coverage">Impact coverage — deaths ${country.impacts.deaths.reported}/${country.totalRecords}; affected ${country.impacts.affected.reported}/${country.totalRecords}; adjusted damage ${country.impacts.damage_adjusted_usd.reported}/${country.totalRecords}. Missing reports are not treated as zero.</p>`;
      return;
    }
    const [a, b] = selected, hazards = [...new Set([...a.relationships.keys(), ...b.relationships.keys()])].sort();
    const shared = hazards.filter(hazard => a.relationships.has(hazard) && b.relationships.has(hazard));
    const onlyA = hazards.filter(hazard => a.relationships.has(hazard) && !b.relationships.has(hazard));
    const onlyB = hazards.filter(hazard => b.relationships.has(hazard) && !a.relationships.has(hazard));
    const vector = country => this.model.allHazards.map(hazard => (country.relationships.get(hazard)?.count || 0) / country.totalRecords);
    const score = cosineSimilarity(vector(a), vector(b));
    host.innerHTML = `<div class="ch-compare-heading"><div><span>COUNTRY A</span><h3>${safeName(a.name)}</h3></div><strong>${d3.format('.0%')(score)}<small>profile similarity</small></strong><div><span>COUNTRY B</span><h3>${safeName(b.name)}</h3></div></div><button class="text-button ch-clear-selection">Clear selection ×</button><div class="ch-compare-table"><div><b>Hazard</b><b>${safeName(a.name)}</b><b>${safeName(b.name)}</b></div>${hazards.map(hazard => `<div class="${shared.includes(hazard) ? 'shared' : 'unique'}"><span>${safeName(hazard)}</span><span>${a.relationships.has(hazard) ? d3.format('.1%')(a.relationships.get(hazard).share) : '—'}</span><span>${b.relationships.has(hazard) ? d3.format('.1%')(b.relationships.get(hazard).share) : '—'}</span></div>`).join('')}</div><p class="ch-coverage">${shared.length} shared hazards · ${onlyA.length} recorded only for ${safeName(a.name)} · ${onlyB.length} recorded only for ${safeName(b.name)}. Similarity is cosine similarity across all ${this.model.allHazards.length} current hazard dimensions.</p>`;
  }

  openPoster() { this.state.posterPreset = this.model.countries.length <= 10; this.renderPoster(); this.$('ch-poster-dialog').showModal(); }

  renderPoster() {
    const tooLarge = this.model.countries.length > 10 && !this.state.posterPreset;
    this.$('ch-poster-warning').hidden = !tooLarge;
    this.$('ch-export-svg').disabled = tooLarge; this.$('ch-export-png').disabled = tooLarge;
    if (tooLarge) { this.d3.select('#ch-poster-svg').selectAll('*').remove(); return; }
    const countries = this.state.posterPreset ? this.model.countries.slice(0, 10) : this.model.countries;
    const hazards = this.model.visibleHazards, d3 = this.d3, svg = d3.select('#ch-poster-svg'); svg.selectAll('*').remove();
    const W = 1500, H = 1050, networkX = 45, networkW = 430, matrixX = 535, matrixW = 920, top = 275, rowH = 52, cellW = Math.min(94, (matrixW - 230) / Math.max(1, hazards.length));
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('xmlns', 'http://www.w3.org/2000/svg'); svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#fff');
    svg.append('text').attr('class', 'poster-kicker').attr('x', 45).attr('y', 48).text('06 / COUNTRY–HAZARD RELATIONSHIPS');
    svg.append('text').attr('class', 'poster-title').attr('x', 45).attr('y', 90).text('How do disaster profiles connect countries?');
    svg.append('text').attr('class', 'poster-subtitle').attr('x', 45).attr('y', 122).text(`EM-DAT country-disaster records · ${this.state.start}–${this.state.end} · ${countries.length} countries · ${hazards.length} displayed hazards`);
    svg.append('text').attr('class', 'poster-panel-title').attr('x', networkX).attr('y', 158).text('BIPARTITE NETWORK · TOP 3 CONNECTIONS PER COUNTRY');
    svg.append('text').attr('class', 'poster-panel-title').attr('x', matrixX).attr('y', 158).text(`COUNTRY–HAZARD MATRIX · ${this.state.metric === 'share' ? 'HAZARD SHARE (%)' : 'RECORD COUNT'}`);
    const y = new Map(countries.map((country, index) => [country.iso, top + index * rowH]));
    const hy = new Map(hazards.map((hazard, index) => [hazard, top + index * ((countries.length - 1) * rowH / Math.max(1, hazards.length - 1))]));
    const relations = countries.flatMap(country => [...country.relationships.values()].filter(item => hazards.includes(item.hazard)).sort((a, b) => b.share - a.share).slice(0, 3));
    svg.append('g').selectAll('path').data(relations).join('path').attr('d', relation => `M${networkX + 125},${y.get(relation.iso)} C${networkX + 210},${y.get(relation.iso)} ${networkX + 230},${hy.get(relation.hazard)} ${networkX + 310},${hy.get(relation.hazard)}`).attr('fill', 'none').attr('stroke', relation => this.colors[relation.hazard] || '#65747a').attr('stroke-opacity', .52).attr('stroke-width', 1.5);
    const cn = svg.append('g').selectAll('g').data(countries).join('g').attr('transform', country => `translate(${networkX + 125},${y.get(country.iso)})`); cn.append('circle').attr('r', 5).attr('fill', '#fff').attr('stroke', '#173640').attr('stroke-width', 2); cn.append('text').attr('x', -10).attr('dy', '.35em').attr('text-anchor', 'end').attr('class', 'poster-label').text(country => country.name.length > 18 ? country.name.slice(0, 17) + '…' : country.name);
    const hn = svg.append('g').selectAll('g').data(hazards).join('g').attr('transform', hazard => `translate(${networkX + 310},${hy.get(hazard)})`); hn.append('circle').attr('r', 5).attr('fill', hazard => this.colors[hazard] || '#65747a'); hn.append('text').attr('x', 10).attr('dy', '.35em').attr('class', 'poster-label').text(hazard => hazard.length > 17 ? hazard.slice(0, 16) + '…' : hazard);
    const max = this.state.metric === 'share' ? d3.max(countries.flatMap(country => hazards.map(hazard => country.relationships.get(hazard)?.share || 0))) || 1 : d3.max(countries.flatMap(country => hazards.map(hazard => country.relationships.get(hazard)?.count || 0))) || 1;
    const color = d3.scaleSequential().domain([0, max]).interpolator(t => d3.interpolateRgbBasis(['#edf4f1', '#95c9bd', '#17877d', '#143b52'])(t));
    svg.append('g').selectAll('text').data(hazards).join('text').attr('class', 'poster-label').attr('transform', (hazard, index) => `translate(${matrixX + 220 + index * cellW + cellW / 2},${top - 13}) rotate(-48)`).text(hazard => hazard.length > 19 ? hazard.slice(0, 18) + '…' : hazard);
    const posterCells = countries.flatMap((country, row) => hazards.map((hazard, column) => ({ country, row, hazard, column, relation: country.relationships.get(hazard) })));
    svg.append('g').selectAll('rect').data(posterCells).join('rect').attr('x', cell => matrixX + 220 + cell.column * cellW).attr('y', cell => top + cell.row * rowH - 18).attr('width', cellW - 3).attr('height', rowH - 3).attr('rx', 2).attr('fill', cell => cell.relation ? color(this.state.metric === 'share' ? cell.relation.share : cell.relation.count) : '#f5f7f6').attr('stroke', '#dce4e2');
    svg.append('g').selectAll('text').data(countries).join('text').attr('class', 'poster-row-label').attr('x', matrixX + 210).attr('y', country => y.get(country.iso)).attr('text-anchor', 'end').attr('dy', '.35em').text(country => country.name);
    svg.append('g').selectAll('text').data(posterCells).join('text').attr('class', 'poster-cell-label').attr('x', cell => matrixX + 220 + cell.column * cellW + (cellW - 3) / 2).attr('y', cell => top + cell.row * rowH + 2).attr('text-anchor', 'middle')
      .style('fill', cell => cell.relation && (this.state.metric === 'share' ? cell.relation.share : cell.relation.count) / max > .48 ? '#fff' : '#173640')
      .text(cell => !cell.relation ? '—' : this.state.metric === 'share' ? d3.format('.0%')(cell.relation.share) : cell.relation.count);
    const legend = svg.append('g').attr('transform', `translate(${matrixX + 220},${top + countries.length * rowH + 25})`); legend.selectAll('rect').data(d3.range(60)).join('rect').attr('x', step => step * 4).attr('width', 4.2).attr('height', 12).attr('fill', step => color(max * step / 59)); legend.append('text').attr('class', 'poster-note').attr('y', 30).text('0'); legend.append('text').attr('class', 'poster-note').attr('x', 240).attr('y', 30).attr('text-anchor', 'end').text(this.state.metric === 'share' ? d3.format('.0%')(max) : max); legend.append('text').attr('class', 'poster-note').attr('x', 255).attr('y', 11).text(this.state.metric === 'share' ? 'Share of all country records' : 'Country-disaster records');
    svg.append('text').attr('class', 'poster-caption').attr('x', 45).attr('y', 930).text('The bipartite network represents relationships between countries and disaster types, while the corresponding matrix enables quantitative comparison of hazard profiles.');
    svg.append('text').attr('class', 'poster-caption').attr('x', 45).attr('y', 958).text('Both views use the same underlying disaster records. Network nodes and edges are equal-sized; matrix color encodes magnitude.');
    svg.append('text').attr('class', 'poster-source').attr('x', 45).attr('y', 1018).text(`Source: EM-DAT, CRED / UCLouvain · Export 15 Sep 2026 · ${this.metadata.cleaned_rows.toLocaleString()} records in full local dataset · 2026 partial`);
  }

  svgBlob() {
    const node = this.$('ch-poster-svg').cloneNode(true); node.setAttribute('width', '1500'); node.setAttribute('height', '1050');
    const css = `<style>text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#173640}.poster-kicker,.poster-panel-title{font-size:13px;font-weight:700;letter-spacing:1.5px;fill:#086b70}.poster-title{font-size:34px;font-weight:650}.poster-subtitle,.poster-note,.poster-source{font-size:13px;fill:#60747b}.poster-label{font-size:11px}.poster-row-label{font-size:13px;font-weight:600}.poster-cell-label{font-size:12px;font-weight:650;fill:#173640}.poster-caption{font-size:16px}.poster-source{font-size:12px}</style>`;
    node.insertAdjacentHTML('afterbegin', css); return new Blob([new XMLSerializer().serializeToString(node)], { type: 'image/svg+xml;charset=utf-8' });
  }

  download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  exportSVG() { this.download(this.svgBlob(), `country-hazard-figure-${this.state.start}-${this.state.end}.svg`); }
  exportPNG() {
    const url = URL.createObjectURL(this.svgBlob()), image = new Image();
    image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = 3000; canvas.height = 2100; const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); canvas.toBlob(blob => this.download(blob, `country-hazard-figure-${this.state.start}-${this.state.end}.png`), 'image/png'); };
    image.src = url;
  }
}
