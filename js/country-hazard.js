/* Country–hazard aggregation and coordinated network/matrix views. */

const IMPACTS = ['deaths', 'affected', 'damage_adjusted_usd'];
const DEFAULT_COUNTRIES = 6;
const DEFAULT_HAZARDS = 8;
const POSTER_COUNTRIES = 10;
const POSTER_HAZARDS = 12;

function impactSummary(rows, key) {
  const values = rows.map(row => row[key]).filter(Number.isFinite);
  return { value: values.length ? values.reduce((sum, value) => sum + value, 0) : null, reported: values.length, total: rows.length };
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

export function similarityOrder(countries, hazards) {
  if (countries.length < 2) return countries.map(country => country.iso);
  const vectors = new Map(countries.map(country => [country.iso, hazards.map(hazard => (country.relationships.get(hazard)?.count || 0) / Math.max(1, country.totalRecords))]));
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
      const value = clusterDistance(clusters[i], clusters[j]), key = `${clusters[i].key}|${clusters[j].key}`;
      if (!best || value < best.value - 1e-12 || (Math.abs(value - best.value) < 1e-12 && key < best.key)) best = { i, j, value, key };
    }
    const left = clusters[best.i], right = clusters[best.j], variants = [];
    for (const a of [left.order, [...left.order].reverse()]) for (const b of [right.order, [...right.order].reverse()]) {
      variants.push({ order: [...a, ...b], split: a.length }, { order: [...b, ...a], split: b.length });
    }
    variants.sort((a, b) => distance(a.order[a.split - 1], a.order[a.split]) - distance(b.order[b.split - 1], b.order[b.split]) || a.order.join('|').localeCompare(b.order.join('|')));
    const merged = { members: [...left.members, ...right.members], order: variants[0].order, key: [left.key, right.key].sort().join('|') };
    clusters = clusters.filter((_, index) => index !== best.i && index !== best.j);
    clusters.push(merged); clusters.sort((a, b) => a.key.localeCompare(b.key));
  }
  return clusters[0].order;
}

export function aggregateCountryHazards(rows) {
  const countryGroups = new Map(), hazardCounts = new Map();
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
      const relation = { iso: group.iso, country: group.name, hazard, count: hazardRows.length };
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

export function contrastingDefaultSelection(aggregate, { countryCount = DEFAULT_COUNTRIES, hazardCount = DEFAULT_HAZARDS, countryIsos = null } = {}) {
  const hazardNames = aggregate.hazards.map(item => item.name);
  const vectors = new Map(aggregate.countries.map(country => [country.iso, hazardNames.map(hazard => (country.relationships.get(hazard)?.count || 0) / Math.max(1, country.totalRecords))]));
  let chosenCountries;
  if (countryIsos) {
    const allowed = new Set(countryIsos);
    chosenCountries = aggregate.countries.filter(country => allowed.has(country.iso));
  } else {
    const remaining = [...aggregate.countries];
    chosenCountries = remaining.splice(0, Math.min(1, countryCount));
    while (chosenCountries.length < Math.min(countryCount, aggregate.countries.length)) {
      remaining.sort((a, b) => {
        const distanceA = Math.min(...chosenCountries.map(chosen => 1 - cosineSimilarity(vectors.get(a.iso), vectors.get(chosen.iso))));
        const distanceB = Math.min(...chosenCountries.map(chosen => 1 - cosineSimilarity(vectors.get(b.iso), vectors.get(chosen.iso))));
        return distanceB - distanceA || b.totalRecords - a.totalRecords || a.name.localeCompare(b.name);
      });
      chosenCountries.push(remaining.shift());
    }
  }
  const profiles = chosenCountries.map(country => hazardNames.map(hazard => (country.relationships.get(hazard)?.count || 0) / Math.max(1, country.totalRecords)));
  const hazardScores = aggregate.hazards.map((hazard, index) => {
    const values = profiles.map(profile => profile[index]), present = values.filter(value => value > 0).length;
    const prevalenceContrast = chosenCountries.length ? 4 * (present / chosenCountries.length) * (1 - present / chosenCountries.length) : 0;
    const range = values.length ? Math.max(...values) - Math.min(...values) : 0;
    return { ...hazard, score: prevalenceContrast * 2 + range };
  }).sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name));
  const selectedHazards = hazardScores.slice(0, hazardCount).map(item => item.name);
  selectedHazards.sort((a, b) => hazardNames.indexOf(a) - hazardNames.indexOf(b));
  return { countries: chosenCountries.map(country => country.iso), hazards: selectedHazards };
}

export function buildCountryHazardModel(rows, { selectedCountries = null, selectedHazards = null, order = 'frequency' } = {}) {
  const aggregate = aggregateCountryHazards(rows);
  const defaults = selectedCountries === null || selectedHazards === null ? contrastingDefaultSelection(aggregate) : null;
  const countryIds = selectedCountries === null ? defaults.countries : selectedCountries;
  const hazardNames = selectedHazards === null ? defaults.hazards : selectedHazards;
  const countrySet = new Set(countryIds), hazardSet = new Set(hazardNames);
  const countries = aggregate.countries.filter(country => countrySet.has(country.iso));
  const visibleHazards = aggregate.hazards.filter(hazard => hazardSet.has(hazard.name)).map(hazard => hazard.name);
  if (order === 'alphabetical') countries.sort((a, b) => a.name.localeCompare(b.name));
  else if (order === 'similarity') {
    const positions = new Map(similarityOrder(countries, aggregate.hazards.map(item => item.name)).map((iso, index) => [iso, index]));
    countries.sort((a, b) => positions.get(a.iso) - positions.get(b.iso));
  }
  const relations = countries.flatMap(country => visibleHazards.map(hazard => country.relationships.get(hazard)).filter(Boolean));
  return { ...aggregate, allCountries: aggregate.countries, allHazards: aggregate.hazards.map(hazard => hazard.name), countries, visibleHazards, relations, availableCountryCount: aggregate.countries.length };
}

function safeName(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function selectionLabel(count, total, singular, plural) { return count === total && total ? `All ${total} ${plural}` : `${count} ${count === 1 ? singular : plural} selected`; }

export class CountryHazardExplorer {
  constructor({ rows, metadata, colors, showTip, hideTip }) {
    this.allRows = rows; this.metadata = metadata; this.colors = colors; this.showTip = showTip; this.hideTip = hideTip; this.d3 = window.d3;
    this.state = {
      selectedCountries: [], selectedHazards: [], countryMode: 'default', hazardMode: 'default', initialized: false,
      edgeLimit: Infinity, order: 'frequency', start: metadata.observed_years[0], end: metadata.observed_years[1], selected: [], selectedHazard: '', hover: null, posterPreset: false,
    };
    this.bindControls();
  }

  $(id) { return document.getElementById(id); }

  bindControls() {
    const [start, end] = this.metadata.observed_years;
    for (const id of ['ch-start', 'ch-end']) for (let year = start; year <= end; year++) this.$(id).add(new Option(year === 2026 ? '2026*' : String(year), year));
    this.$('ch-start').value = start; this.$('ch-end').value = end;
    this.$('ch-edge-limit').onchange = event => {
      this.state.edgeLimit = event.target.value === 'all' ? Infinity : +event.target.value;
      this.state.hover = null; this.hideTip(); this.renderCharts();
    };
    this.$('ch-order').onchange = event => { this.state.order = event.target.value; this.render(); };
    this.$('ch-start').onchange = event => { this.state.start = +event.target.value; this.state.end = Math.max(this.state.start, this.state.end); this.$('ch-end').value = this.state.end; this.render(); };
    this.$('ch-end').onchange = event => { this.state.end = +event.target.value; this.state.start = Math.min(this.state.start, this.state.end); this.$('ch-start').value = this.state.start; this.render(); };
    this.$('ch-country-search').oninput = () => this.renderSelectorOptions('country');
    this.$('ch-hazard-search').oninput = () => this.renderSelectorOptions('hazard');
    for (const kind of ['country', 'hazard']) {
      this.$(`ch-${kind}-default`).onclick = () => this.applyPreset(kind, 'default');
      this.$(`ch-${kind}-top`).onclick = () => this.applyPreset(kind, 'top');
      this.$(`ch-${kind}-all`).onclick = () => this.applyPreset(kind, 'all');
      this.$(`ch-${kind}-clear`).onclick = () => this.applyPreset(kind, 'clear');
    }
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
    Object.assign(this.state, {
      selectedCountries: [], selectedHazards: [], countryMode: 'default', hazardMode: 'default', initialized: false,
      edgeLimit: Infinity, order: 'frequency', start: this.metadata.observed_years[0], end: this.metadata.observed_years[1], selected: [], selectedHazard: '', hover: null, posterPreset: false,
    });
    this.$('ch-edge-limit').value = 'all'; this.$('ch-order').value = 'frequency'; this.$('ch-start').value = this.state.start; this.$('ch-end').value = this.state.end;
    this.$('ch-country-search').value = ''; this.$('ch-hazard-search').value = ''; this.render();
  }

  update(rows, globalState) { this.contextRows = rows; this.globalState = globalState; this.render(); }

  syncSelections(aggregate) {
    const availableCountries = new Set(aggregate.countries.map(country => country.iso)), availableHazards = new Set(aggregate.hazards.map(hazard => hazard.name));
    const defaults = contrastingDefaultSelection(aggregate, { countryCount: DEFAULT_COUNTRIES, hazardCount: DEFAULT_HAZARDS });
    if (!this.state.initialized) {
      this.state.selectedCountries = defaults.countries; this.state.selectedHazards = defaults.hazards; this.state.initialized = true; return;
    }
    if (this.state.countryMode === 'default') this.state.selectedCountries = defaults.countries;
    else if (this.state.countryMode === 'top') this.state.selectedCountries = aggregate.countries.slice(0, 10).map(country => country.iso);
    else if (this.state.countryMode === 'all') this.state.selectedCountries = aggregate.countries.map(country => country.iso);
    else this.state.selectedCountries = this.state.selectedCountries.filter(iso => availableCountries.has(iso));
    const hazardDefault = contrastingDefaultSelection(aggregate, { countryIsos: this.state.selectedCountries, hazardCount: DEFAULT_HAZARDS }).hazards;
    if (this.state.hazardMode === 'default') this.state.selectedHazards = hazardDefault;
    else if (this.state.hazardMode === 'top') this.state.selectedHazards = aggregate.hazards.slice(0, 8).map(hazard => hazard.name);
    else if (this.state.hazardMode === 'all') this.state.selectedHazards = aggregate.hazards.map(hazard => hazard.name);
    else this.state.selectedHazards = this.state.selectedHazards.filter(hazard => availableHazards.has(hazard));
  }

  applyPreset(kind, mode) {
    if (!this.aggregate) return;
    if (kind === 'country') {
      this.state.countryMode = mode;
      if (mode === 'default') this.state.selectedCountries = contrastingDefaultSelection(this.aggregate, { countryCount: DEFAULT_COUNTRIES }).countries;
      if (mode === 'top') this.state.selectedCountries = this.aggregate.countries.slice(0, 10).map(country => country.iso);
      if (mode === 'all') this.state.selectedCountries = this.aggregate.countries.map(country => country.iso);
      if (mode === 'clear') this.state.selectedCountries = [];
    } else {
      this.state.hazardMode = mode;
      if (mode === 'default') this.state.selectedHazards = contrastingDefaultSelection(this.aggregate, { countryIsos: this.state.selectedCountries, hazardCount: DEFAULT_HAZARDS }).hazards;
      if (mode === 'top') this.state.selectedHazards = this.aggregate.hazards.slice(0, 8).map(hazard => hazard.name);
      if (mode === 'all') this.state.selectedHazards = this.aggregate.hazards.map(hazard => hazard.name);
      if (mode === 'clear') this.state.selectedHazards = [];
    }
    this.state.posterPreset = false; this.render();
  }

  toggleSelection(kind, value, checked) {
    const key = kind === 'country' ? 'selectedCountries' : 'selectedHazards', mode = `${kind}Mode`, next = new Set(this.state[key]);
    if (checked) next.add(value); else next.delete(value);
    this.state[key] = [...next]; this.state[mode] = next.size ? 'manual' : 'clear'; this.state.posterPreset = false; this.render();
  }

  render() {
    if (!this.contextRows) return;
    const rows = this.contextRows.filter(row => row.year >= this.state.start && row.year <= this.state.end);
    this.currentRows = rows; this.aggregate = aggregateCountryHazards(rows); this.syncSelections(this.aggregate); this.model = buildCountryHazardModel(rows, this.state);
    const visibleCountries = new Set(this.model.countries.map(country => country.iso));
    this.state.selected = this.state.selected.filter(iso => visibleCountries.has(iso));
    if (this.state.selectedHazard && !this.model.visibleHazards.includes(this.state.selectedHazard)) this.state.selectedHazard = '';
    this.state.hover = null; this.renderSelectors();
    this.$('ch-subset-note').textContent = `Rendering ${this.model.countries.length} selected of ${this.model.availableCountryCount} available countries / territories and ${this.model.visibleHazards.length} selected of ${this.model.allHazards.length} available disaster types.`;
    this.$('ch-selection-note').textContent = this.selectionMethodNote();
    this.renderCharts(); this.renderDetails();
  }

  selectionMethodNote() {
    const descriptions = { default: 'data-derived contrast default', top: 'top by record frequency preset', all: 'all available items', manual: 'manual selection', clear: 'cleared selection' };
    return `Countries: ${descriptions[this.state.countryMode]}. Disaster types: ${descriptions[this.state.hazardMode]}. The contrast default starts with the most-recorded country, then adds dissimilar profiles and hazards that distinguish them.`;
  }

  renderSelectors() {
    this.$('ch-country-summary').textContent = selectionLabel(this.state.selectedCountries.length, this.aggregate.countries.length, 'country', 'countries');
    this.$('ch-hazard-summary').textContent = selectionLabel(this.state.selectedHazards.length, this.aggregate.hazards.length, 'type', 'types');
    this.renderSelectorOptions('country'); this.renderSelectorOptions('hazard');
  }

  renderSelectorOptions(kind) {
    if (!this.aggregate) return;
    const isCountry = kind === 'country', query = this.$(`ch-${kind}-search`).value.trim().toLocaleLowerCase();
    const items = isCountry ? this.aggregate.countries : this.aggregate.hazards, selected = new Set(isCountry ? this.state.selectedCountries : this.state.selectedHazards);
    const host = this.$(`ch-${kind}-options`); host.replaceChildren();
    const matches = items.filter(item => !query || item.name.toLocaleLowerCase().includes(query) || (isCountry && item.iso.toLocaleLowerCase().includes(query)));
    for (const item of matches) {
      const value = isCountry ? item.iso : item.name, label = document.createElement('label'), input = document.createElement('input');
      label.className = 'ch-option'; input.type = 'checkbox'; input.checked = selected.has(value); input.onchange = () => this.toggleSelection(kind, value, input.checked); label.append(input);
      if (!isCountry) { const swatch = document.createElement('i'); swatch.style.background = this.colors[item.name] || '#65747a'; label.append(swatch); }
      const text = document.createElement('span'); text.textContent = isCountry ? `${item.name} (${item.iso})` : item.name;
      const count = document.createElement('small'); count.textContent = `${item.totalRecords ?? item.count} records`; label.append(text, count); host.append(label);
    }
    if (!matches.length) { const empty = document.createElement('p'); empty.className = 'ch-option-empty'; empty.textContent = 'No matches in the current filtered data.'; host.append(empty); }
  }

  renderCharts() { this.renderNetwork(); this.renderMatrix(); }

  edgeIsVisible(relation) {
    if (this.state.edgeLimit === Infinity) return true;
    const country = this.model.countries.find(item => item.iso === relation.iso);
    return this.model.visibleHazards.map(hazard => country.relationships.get(hazard)).filter(Boolean).sort((a, b) => b.count - a.count || a.hazard.localeCompare(b.hazard)).slice(0, this.state.edgeLimit).some(item => item.hazard === relation.hazard);
  }

  interaction(selection, kind, getKey) {
    selection.attr('tabindex', 0).attr('role', 'button')
      .on('pointerenter focus', (event, datum) => { this.state.hover = { kind, key: getKey(datum) }; this.applyHighlight(); if (kind === 'relation') this.tipRelation(event, datum); })
      .on('pointermove', (event, datum) => { if (kind === 'relation') this.tipRelation(event, datum); })
      .on('pointerleave blur', () => { this.state.hover = null; this.hideTip(); this.applyHighlight(); })
      .on('keydown', (event, datum) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.activate(kind, getKey(datum)); } })
      .on('click', (event, datum) => this.activate(kind, getKey(datum)));
  }

  activate(kind, key) {
    if (kind === 'country') this.state.selected = this.state.selected.includes(key) ? this.state.selected.filter(iso => iso !== key) : [...this.state.selected, key].slice(-2);
    else if (kind === 'hazard') this.state.selectedHazard = this.state.selectedHazard === key ? '' : key;
    this.applyHighlight(); this.renderDetails();
  }

  renderNetwork() {
    const d3 = this.d3, countries = this.model.countries, hazards = this.model.visibleHazards, svg = d3.select('#ch-network'); svg.selectAll('*').remove();
    const height = Math.max(390, Math.max(countries.length, hazards.length) * 36 + 76), width = 520;
    const visibleRelationships = this.model.relations.filter(relation => this.edgeIsVisible(relation)).length;
    const totalRelationships = this.model.relations.length;
    const hiddenRelationships = totalRelationships - visibleRelationships;
    this.$('ch-edge-note').textContent = this.state.edgeLimit === Infinity
      ? `Showing all ${totalRelationships} recorded relationships. Zero-count pairs remain visible in the matrix and do not create network edges.`
      : `Showing ${visibleRelationships} of ${totalRelationships} recorded relationships. ${hiddenRelationships} valid ${hiddenRelationships === 1 ? 'relationship is' : 'relationships are'} filtered from the network only; the matrix remains complete.`;
    svg.attr('viewBox', `0 0 ${width} ${height}`).style('width', `${width}px`).style('height', `${height}px`).attr('aria-label', `Bipartite network showing ${visibleRelationships} of ${totalRelationships} recorded relationships between ${countries.length} selected countries and ${hazards.length} selected hazards.`);
    if (!countries.length || !hazards.length) { svg.append('text').attr('class', 'chart-empty').attr('x', width / 2).attr('y', 150).text('Select at least one country and one disaster type.'); return; }
    const distribute = (items, key) => new Map(items.map((item, index) => [key(item), items.length === 1 ? height / 2 : 48 + index * ((height - 88) / (items.length - 1))]));
    const yCountry = distribute(countries, country => country.iso), yHazard = distribute(hazards, hazard => hazard);
    svg.append('text').attr('class', 'ch-axis-heading').attr('x', 12).attr('y', 19).text('COUNTRIES'); svg.append('text').attr('class', 'ch-axis-heading').attr('x', width - 12).attr('y', 19).attr('text-anchor', 'end').text('DISASTER TYPES');
    const edges = svg.append('g').attr('class', 'ch-network-edges').selectAll('path').data(this.model.relations, relation => `${relation.iso}|${relation.hazard}`).join('path')
      .attr('class', relation => `ch-edge${this.edgeIsVisible(relation) ? '' : ' ch-edge-hidden'}`).attr('data-country', relation => relation.iso).attr('data-hazard', relation => relation.hazard)
      .attr('d', relation => `M160,${yCountry.get(relation.iso)} C230,${yCountry.get(relation.iso)} 275,${yHazard.get(relation.hazard)} 345,${yHazard.get(relation.hazard)}`).attr('stroke', relation => this.colors[relation.hazard] || '#65747a');
    this.interaction(edges, 'relation', relation => `${relation.iso}|${relation.hazard}`);
    const countryNodes = svg.append('g').selectAll('g').data(countries, country => country.iso).join('g').attr('class', 'ch-node ch-country-node').attr('data-country', country => country.iso).attr('transform', country => `translate(155,${yCountry.get(country.iso)})`);
    countryNodes.append('circle').attr('r', 6); countryNodes.append('text').attr('x', -11).attr('dy', '.35em').attr('text-anchor', 'end').text(country => country.name.length > 25 ? `${country.name.slice(0, 24)}…` : country.name);
    countryNodes.attr('aria-label', country => `${country.name}: ${country.totalRecords} records across ${country.hazardCount} disaster types. Select for comparison.`); this.interaction(countryNodes, 'country', country => country.iso);
    const hazardNodes = svg.append('g').selectAll('g').data(hazards, hazard => hazard).join('g').attr('class', 'ch-node ch-hazard-node').attr('data-hazard', hazard => hazard).attr('transform', hazard => `translate(350,${yHazard.get(hazard)})`);
    hazardNodes.append('circle').attr('r', 6).style('fill', hazard => this.colors[hazard] || '#65747a'); hazardNodes.append('text').attr('x', 11).attr('dy', '.35em').text(hazard => hazard.length > 24 ? `${hazard.slice(0, 23)}…` : hazard);
    hazardNodes.attr('aria-label', hazard => `${hazard}. Highlight connected countries and the matching matrix column.`); this.interaction(hazardNodes, 'hazard', hazard => hazard); this.applyHighlight();
  }

  renderMatrix() {
    const d3 = this.d3, countries = this.model.countries, hazards = this.model.visibleHazards, cellW = 68, cellH = 36, left = 190, top = 132;
    const width = Math.max(670, left + hazards.length * cellW + 24), height = Math.max(350, top + countries.length * cellH + 60), svg = d3.select('#ch-matrix');
    svg.selectAll('*').remove(); svg.attr('viewBox', `0 0 ${width} ${height}`).style('width', `${width}px`).style('height', `${height}px`);
    if (!countries.length || !hazards.length) { svg.append('text').attr('class', 'chart-empty').attr('x', width / 2).attr('y', 180).text('Select at least one country and one disaster type.'); return; }
    const max = d3.max(this.model.relations, relation => relation.count) || 1;
    this.matrixColor = d3.scaleSequential().domain([1, max]).interpolator(t => d3.interpolateRgbBasis(['#d9ebe5', '#7ebcb0', '#17877d', '#143b52'])(t));
    const columns = svg.append('g').selectAll('g').data(hazards).join('g').attr('class', 'ch-column-label').attr('data-hazard', hazard => hazard).attr('transform', (hazard, index) => `translate(${left + index * cellW + cellW / 2},${top - 8}) rotate(-48)`);
    columns.append('text').attr('text-anchor', 'start').text(hazard => hazard); columns.attr('aria-label', hazard => `${hazard} column. Select to highlight connected countries.`); this.interaction(columns, 'hazard', hazard => hazard);
    const rowLabels = svg.append('g').selectAll('g').data(countries).join('g').attr('class', 'ch-row-label').attr('data-country', country => country.iso).attr('transform', (country, index) => `translate(0,${top + index * cellH})`);
    rowLabels.append('rect').attr('width', left - 7).attr('height', cellH - 2); rowLabels.append('text').attr('x', left - 14).attr('y', cellH / 2).attr('dy', '.35em').attr('text-anchor', 'end').text(country => country.name);
    rowLabels.attr('aria-label', country => `${country.name} row. Select for comparison.`); this.interaction(rowLabels, 'country', country => country.iso);
    const cells = [];
    countries.forEach((country, row) => hazards.forEach((hazard, column) => cells.push({ row, column, country, hazard, relation: country.relationships.get(hazard) || null })));
    const cellGroups = svg.append('g').selectAll('g').data(cells, cell => `${cell.country.iso}|${cell.hazard}`).join('g').attr('class', cell => `ch-cell${cell.relation ? '' : ' ch-zero-cell'}`).attr('data-country', cell => cell.country.iso).attr('data-hazard', cell => cell.hazard).attr('transform', cell => `translate(${left + cell.column * cellW},${top + cell.row * cellH})`);
    cellGroups.append('rect').attr('width', cellW - 2).attr('height', cellH - 2).attr('rx', 2).attr('fill', cell => cell.relation ? this.matrixColor(cell.relation.count) : '#f4f7f6');
    cellGroups.append('text').attr('x', (cellW - 2) / 2).attr('y', (cellH - 2) / 2).attr('dy', '.35em').attr('text-anchor', 'middle').style('fill', cell => cell.relation && cell.relation.count / max > .42 ? '#fff' : '#173640').text(cell => cell.relation?.count || 0);
    cellGroups.attr('aria-label', cell => `${cell.country.name}, ${cell.hazard}: ${cell.relation?.count || 0} matching disaster records.`); this.interaction(cellGroups, 'relation', cell => `${cell.country.iso}|${cell.hazard}`);
    const legend = svg.append('g').attr('class', 'ch-matrix-legend').attr('transform', `translate(${left},${top + countries.length * cellH + 17})`);
    legend.append('rect').attr('width', 20).attr('height', 10).attr('fill', '#f4f7f6').attr('stroke', '#aebdb8'); legend.append('text').attr('x', 27).attr('y', 9).text('0 · no matching record');
    const steps = d3.range(48); legend.selectAll('rect.ch-scale').data(steps).join('rect').attr('class', 'ch-scale').attr('x', step => 155 + step * 3.2).attr('width', 3.3).attr('height', 10).attr('fill', step => this.matrixColor(1 + (max - 1) * step / 47));
    legend.append('text').attr('x', 155).attr('y', 25).text('1'); legend.append('text').attr('x', 231).attr('y', 25).attr('text-anchor', 'middle').text(d3.format(',.0f')((max + 1) / 2)); legend.append('text').attr('x', 306).attr('y', 25).attr('text-anchor', 'end').text(d3.format(',')(max)); legend.append('text').attr('x', 318).attr('y', 9).text('record count'); this.applyHighlight();
  }

  tipRelation(event, datum) {
    const relation = datum.relation || (datum.count !== undefined ? datum : null), country = datum.country?.name || relation?.country || '', hazard = datum.hazard || relation?.hazard || '';
    if (!relation) { this.showTip(event, `${country} × ${hazard}`, '0 matching disaster records', 'No matching record in the current filtered data. This is not evidence that the event is impossible.'); return; }
    const d3 = this.d3, impact = (label, summary, prefix = '') => `${label}: ${summary.value === null ? 'not reported' : prefix + d3.format(',.0f')(summary.value)} (${summary.reported}/${summary.total} records reporting)`;
    this.showTip(event, `${relation.country} × ${relation.hazard}`, `${relation.count} matching disaster ${relation.count === 1 ? 'record' : 'records'}`, `${impact('Deaths', relation.deaths)} · ${impact('Affected', relation.affected)} · ${impact('Adjusted damage', relation.damage_adjusted_usd, '$')}`);
  }

  applyHighlight() {
    if (!this.model) return;
    const hover = this.state.hover, selected = new Set(this.state.selected), selectedHazard = this.state.selectedHazard;
    let hoverCountry = '', hoverHazard = '', hoverRelation = '';
    if (hover?.kind === 'country') hoverCountry = hover.key;
    if (hover?.kind === 'hazard') hoverHazard = hover.key;
    if (hover?.kind === 'relation') { hoverRelation = hover.key; [hoverCountry, hoverHazard] = hover.key.split('|'); }
    const hasHover = Boolean(hover), hasPersistentFocus = Boolean(selected.size || selectedHazard), hasFocus = hasHover || hasPersistentFocus;
    const status = relation => {
      const key = `${relation.iso}|${relation.hazard}`;
      if (hoverRelation && key === hoverRelation) return 'active';
      if (hasHover) {
        if ((hoverCountry && relation.iso === hoverCountry) || (hoverHazard && relation.hazard === hoverHazard)) return 'context';
        return 'muted';
      }
      if (selected.has(relation.iso) || (selectedHazard && relation.hazard === selectedHazard)) return 'context';
      return hasFocus ? 'muted' : 'default';
    };
    const d3 = this.d3, edgeSelection = d3.selectAll('#country-hazard .ch-edge');
    edgeSelection.classed('is-active', relation => status(relation) === 'active').classed('is-context', relation => status(relation) === 'context').classed('is-muted', relation => status(relation) === 'muted').classed('is-revealed', relation => !this.edgeIsVisible(relation) && hoverRelation === `${relation.iso}|${relation.hazard}`);
    edgeSelection.filter(relation => status(relation) === 'context').raise(); edgeSelection.filter(relation => status(relation) === 'active').raise();
    const contextRelations = this.model.relations.filter(relation => status(relation) === 'active' || status(relation) === 'context'), relatedCountries = new Set(contextRelations.map(relation => relation.iso)), relatedHazards = new Set(contextRelations.map(relation => relation.hazard));
    d3.selectAll('#country-hazard [data-country]').classed('is-country-active', function() { return this.dataset.country === hoverCountry || selected.has(this.dataset.country); }).classed('is-related', function() { return relatedCountries.has(this.dataset.country); });
    d3.selectAll('#country-hazard [data-hazard]').classed('is-hazard-active', function() { return this.dataset.hazard === hoverHazard || this.dataset.hazard === selectedHazard; }).classed('is-related', function() { return relatedHazards.has(this.dataset.hazard); });
    d3.selectAll('#country-hazard .ch-cell').classed('is-active', function() { return hoverRelation === `${this.dataset.country}|${this.dataset.hazard}`; }).classed('is-context', function() {
      if (this.classList.contains('is-active')) return false;
      if (hasHover) return Boolean((hoverCountry && this.dataset.country === hoverCountry) || (hoverHazard && this.dataset.hazard === hoverHazard));
      return selected.has(this.dataset.country) || Boolean(selectedHazard && this.dataset.hazard === selectedHazard);
    }).classed('is-muted', function() { return hasFocus && !this.classList.contains('is-active') && !this.classList.contains('is-context'); });
  }

  renderDetails() {
    const host = this.$('ch-details'), selected = this.state.selected.map(iso => this.model.countries.find(country => country.iso === iso)).filter(Boolean);
    if (!selected.length) { host.innerHTML = '<p><strong>Select one or two countries</strong> in either view to inspect exact record counts and compare their historical profiles.</p>'; return; }
    const selectedHazards = this.model.visibleHazards, top = country => selectedHazards.map(hazard => country.relationships.get(hazard)).filter(Boolean).sort((a, b) => b.count - a.count || a.hazard.localeCompare(b.hazard));
    if (selected.length === 1) {
      const country = selected[0], leaders = top(country).slice(0, 6), max = leaders[0]?.count || 1;
      host.innerHTML = `<div><span>SELECTED COUNTRY</span><h3>${safeName(country.name)}</h3><p>${country.totalRecords.toLocaleString()} records across all current types · ${leaders.reduce((sum, item) => sum + item.count, 0).toLocaleString()} across selected types</p><button class="text-button ch-clear-selection">Clear selection ×</button></div><div class="ch-profile-bars">${leaders.map(item => `<div><span>${safeName(item.hazard)}</span><strong>${item.count.toLocaleString()}</strong><i style="width:${item.count / max * 100}%;background:${this.colors[item.hazard] || '#65747a'}"></i></div>`).join('') || '<p>No matching records for the selected disaster types.</p>'}</div><p class="ch-coverage">Impact coverage — deaths ${country.impacts.deaths.reported}/${country.totalRecords}; affected ${country.impacts.affected.reported}/${country.totalRecords}; adjusted damage ${country.impacts.damage_adjusted_usd.reported}/${country.totalRecords}. Missing reports are not treated as zero.</p>`;
      return;
    }
    const [a, b] = selected, shared = selectedHazards.filter(hazard => a.relationships.has(hazard) && b.relationships.has(hazard)), onlyA = selectedHazards.filter(hazard => a.relationships.has(hazard) && !b.relationships.has(hazard)), onlyB = selectedHazards.filter(hazard => b.relationships.has(hazard) && !a.relationships.has(hazard));
    const vector = country => this.model.allHazards.map(hazard => (country.relationships.get(hazard)?.count || 0) / Math.max(1, country.totalRecords)), score = cosineSimilarity(vector(a), vector(b));
    host.innerHTML = `<div class="ch-compare-heading"><div><span>COUNTRY A</span><h3>${safeName(a.name)}</h3></div><strong>${this.d3.format('.0%')(score)}<small>profile similarity</small></strong><div><span>COUNTRY B</span><h3>${safeName(b.name)}</h3></div></div><button class="text-button ch-clear-selection">Clear selection ×</button><div class="ch-compare-table"><div><b>Disaster type</b><b>${safeName(a.name)}</b><b>${safeName(b.name)}</b></div>${selectedHazards.map(hazard => `<div class="${shared.includes(hazard) ? 'shared' : 'unique'}"><span>${safeName(hazard)}</span><span>${(a.relationships.get(hazard)?.count || 0).toLocaleString()}</span><span>${(b.relationships.get(hazard)?.count || 0).toLocaleString()}</span></div>`).join('')}</div><p class="ch-coverage">${shared.length} shared selected types · ${onlyA.length} unique to ${safeName(a.name)} · ${onlyB.length} unique to ${safeName(b.name)} in the current data. Similarity uses all ${this.model.allHazards.length} currently available type dimensions.</p>`;
  }

  openPoster() { this.state.posterPreset = false; this.renderPoster(); this.$('ch-poster-dialog').showModal(); }

  posterModel() {
    if (!this.state.posterPreset) return this.model;
    const preset = contrastingDefaultSelection(this.aggregate, { countryCount: DEFAULT_COUNTRIES, hazardCount: DEFAULT_HAZARDS });
    return buildCountryHazardModel(this.currentRows, { selectedCountries: preset.countries, selectedHazards: preset.hazards, order: this.state.order });
  }

  renderPoster() {
    const tooLarge = !this.state.posterPreset && (this.model.countries.length > POSTER_COUNTRIES || this.model.visibleHazards.length > POSTER_HAZARDS), empty = !this.model.countries.length || !this.model.visibleHazards.length;
    this.$('ch-poster-warning').hidden = !tooLarge;
    this.$('ch-poster-warning-text').textContent = `The current ${this.model.countries.length} × ${this.model.visibleHazards.length} selection is too large for a legible poster. Use the explicit 6 × 8 contrast preset; the explorer selection will not change.`;
    this.$('ch-export-svg').disabled = tooLarge || empty; this.$('ch-export-png').disabled = tooLarge || empty;
    const svg = this.d3.select('#ch-poster-svg'); svg.selectAll('*').remove(); if (tooLarge || empty) return;
    const model = this.posterModel(), countries = model.countries, hazards = model.visibleHazards, d3 = this.d3, rowH = 46, cellW = 72, top = 280, networkX = 45, matrixX = 535;
    const W = Math.max(1500, matrixX + 220 + hazards.length * cellW + 55), H = Math.max(820, top + Math.max(countries.length, hazards.length) * rowH + 180);
    this.posterDimensions = { width: W, height: H };
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('xmlns', 'http://www.w3.org/2000/svg').style('width', `${W}px`).style('height', `${H}px`); svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#fff');
    svg.append('text').attr('class', 'poster-kicker').attr('x', 45).attr('y', 48).text('6) COUNTRY–HAZARD RELATIONSHIPS'); svg.append('text').attr('class', 'poster-title').attr('x', 45).attr('y', 90).text('How do disaster profiles connect countries?');
    svg.append('text').attr('class', 'poster-subtitle').attr('x', 45).attr('y', 122).text(`EM-DAT country-disaster records · ${this.state.start}–${this.state.end} · ${countries.length} countries · ${hazards.length} disaster types · ${this.state.posterPreset ? 'contrast poster preset' : 'current explorer selection'}`);
    const edgeLabel = this.state.edgeLimit === Infinity ? 'ALL CONNECTIONS' : `TOP ${this.state.edgeLimit} CONNECTIONS PER COUNTRY`;
    svg.append('text').attr('class', 'poster-panel-title').attr('x', networkX).attr('y', 164).text(`BIPARTITE NETWORK · ${edgeLabel}`); svg.append('text').attr('class', 'poster-panel-title').attr('x', matrixX).attr('y', 164).text('COUNTRY–HAZARD MATRIX · RECORD COUNT');
    const span = Math.max(countries.length, hazards.length), plotHeight = Math.max(1, (span - 1) * rowH), distribute = items => new Map(items.map((item, index) => [typeof item === 'string' ? item : item.iso, items.length === 1 ? top + plotHeight / 2 : top + index * plotHeight / (items.length - 1)]));
    const y = distribute(countries), hy = distribute(hazards);
    const visible = relation => this.state.edgeLimit === Infinity || hazards.map(hazard => countries.find(item => item.iso === relation.iso).relationships.get(hazard)).filter(Boolean).sort((a, b) => b.count - a.count || a.hazard.localeCompare(b.hazard)).slice(0, this.state.edgeLimit).some(item => item.hazard === relation.hazard);
    const posterRelations = model.relations.filter(visible);
    svg.append('g').selectAll('path').data(posterRelations).join('path').attr('d', relation => `M${networkX + 135},${y.get(relation.iso)} C${networkX + 220},${y.get(relation.iso)} ${networkX + 240},${hy.get(relation.hazard)} ${networkX + 325},${hy.get(relation.hazard)}`).attr('fill', 'none').attr('stroke', relation => this.colors[relation.hazard] || '#65747a').attr('stroke-opacity', .40).attr('stroke-width', 1.5);
    const cn = svg.append('g').selectAll('g').data(countries).join('g').attr('transform', country => `translate(${networkX + 135},${y.get(country.iso)})`); cn.append('circle').attr('r', 5).attr('fill', '#fff').attr('stroke', '#173640').attr('stroke-width', 1.5); cn.append('text').attr('x', -10).attr('dy', '.35em').attr('text-anchor', 'end').attr('class', 'poster-label').text(country => country.name.length > 19 ? `${country.name.slice(0, 18)}…` : country.name);
    const hn = svg.append('g').selectAll('g').data(hazards).join('g').attr('transform', hazard => `translate(${networkX + 325},${hy.get(hazard)})`); hn.append('circle').attr('r', 5).attr('fill', hazard => this.colors[hazard] || '#65747a'); hn.append('text').attr('x', 10).attr('dy', '.35em').attr('class', 'poster-label').text(hazard => hazard.length > 18 ? `${hazard.slice(0, 17)}…` : hazard);
    const max = d3.max(model.relations, relation => relation.count) || 1, color = d3.scaleSequential().domain([1, max]).interpolator(t => d3.interpolateRgbBasis(['#d9ebe5', '#7ebcb0', '#17877d', '#143b52'])(t));
    svg.append('g').selectAll('text').data(hazards).join('text').attr('class', 'poster-label').attr('transform', (hazard, index) => `translate(${matrixX + 220 + index * cellW + cellW / 2},${top - 13}) rotate(-48)`).text(hazard => hazard.length > 21 ? `${hazard.slice(0, 20)}…` : hazard);
    const posterCells = countries.flatMap((country, row) => hazards.map((hazard, column) => ({ country, row, hazard, column, relation: country.relationships.get(hazard) || null })));
    svg.append('g').selectAll('rect').data(posterCells).join('rect').attr('x', cell => matrixX + 220 + cell.column * cellW).attr('y', cell => y.get(cell.country.iso) - 18).attr('width', cellW - 3).attr('height', 36).attr('rx', 2).attr('fill', cell => cell.relation ? color(cell.relation.count) : '#f4f7f6').attr('stroke', cell => cell.relation ? '#fff' : '#aebdb8');
    svg.append('g').selectAll('text').data(countries).join('text').attr('class', 'poster-row-label').attr('x', matrixX + 210).attr('y', country => y.get(country.iso)).attr('text-anchor', 'end').attr('dy', '.35em').text(country => country.name);
    svg.append('g').selectAll('text').data(posterCells).join('text').attr('class', 'poster-cell-label').attr('x', cell => matrixX + 220 + cell.column * cellW + (cellW - 3) / 2).attr('y', cell => y.get(cell.country.iso) + 4).attr('text-anchor', 'middle').style('fill', cell => cell.relation && cell.relation.count / max > .42 ? '#fff' : '#173640').text(cell => cell.relation?.count || 0);
    const legendY = top + plotHeight + 46, legend = svg.append('g').attr('transform', `translate(${matrixX + 220},${legendY})`); legend.append('rect').attr('width', 20).attr('height', 12).attr('fill', '#f4f7f6').attr('stroke', '#aebdb8'); legend.append('text').attr('class', 'poster-note').attr('x', 28).attr('y', 11).text('0 · no matching record');
    legend.selectAll('rect.scale').data(d3.range(60)).join('rect').attr('class', 'scale').attr('x', step => 180 + step * 4).attr('width', 4.2).attr('height', 12).attr('fill', step => color(1 + (max - 1) * step / 59)); legend.append('text').attr('class', 'poster-note').attr('x', 180).attr('y', 31).text('1'); legend.append('text').attr('class', 'poster-note').attr('x', 300).attr('y', 31).attr('text-anchor', 'middle').text(d3.format(',.0f')((max + 1) / 2)); legend.append('text').attr('class', 'poster-note').attr('x', 420).attr('y', 31).attr('text-anchor', 'end').text(d3.format(',')(max)); legend.append('text').attr('class', 'poster-note').attr('x', 435).attr('y', 11).text('country–disaster records');
    svg.append('text').attr('class', 'poster-caption').attr('x', 45).attr('y', H - 98).text('The network shows selected country–disaster type relationships; the matrix reports exact matching record counts for the same selection.');
    svg.append('text').attr('class', 'poster-caption').attr('x', 45).attr('y', H - 70).text(this.state.edgeLimit === Infinity
      ? `All ${model.relations.length} positive-count relationships are shown. A zero means no matching record in the current filtered data—not that a disaster type is impossible.`
      : `${posterRelations.length} of ${model.relations.length} positive-count relationships are shown because the explicit network filter omits ${model.relations.length - posterRelations.length}; the matrix remains complete.`);
    svg.append('text').attr('class', 'poster-source').attr('x', 45).attr('y', H - 28).text(`Source: EM-DAT, CRED / UCLouvain · Export 15 Sep 2026 · ${this.metadata.cleaned_rows.toLocaleString()} records in full local dataset · 2026 partial`);
  }

  svgBlob() {
    const node = this.$('ch-poster-svg').cloneNode(true), dimensions = this.posterDimensions || { width: 1500, height: 1050 };
    node.setAttribute('width', dimensions.width); node.setAttribute('height', dimensions.height); node.removeAttribute('style');
    const css = `<style>text{font-family:Inter,Segoe UI,Arial,sans-serif;fill:#173640}.poster-kicker,.poster-panel-title{font-size:13px;font-weight:700;letter-spacing:1.5px;fill:#086b70}.poster-title{font-size:34px;font-weight:650}.poster-subtitle,.poster-note,.poster-source{font-size:13px;fill:#60747b}.poster-label{font-size:11px}.poster-row-label{font-size:13px;font-weight:600}.poster-cell-label{font-size:12px;font-weight:650}.poster-caption{font-size:16px}.poster-source{font-size:12px}</style>`;
    node.insertAdjacentHTML('afterbegin', css); return new Blob([new XMLSerializer().serializeToString(node)], { type: 'image/svg+xml;charset=utf-8' });
  }

  download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  exportSVG() { this.download(this.svgBlob(), `country-hazard-figure-${this.state.start}-${this.state.end}.svg`); }
  exportPNG() {
    const dimensions = this.posterDimensions || { width: 1500, height: 1050 }, url = URL.createObjectURL(this.svgBlob()), image = new Image();
    image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = dimensions.width * 2; canvas.height = dimensions.height * 2; const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); canvas.toBlob(blob => this.download(blob, `country-hazard-figure-${this.state.start}-${this.state.end}.png`), 'image/png'); };
    image.src = url;
  }
}
