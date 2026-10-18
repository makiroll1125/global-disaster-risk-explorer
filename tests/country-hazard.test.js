import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCountryHazards, buildCountryHazardModel, contrastingDefaultSelection, cosineSimilarity, similarityOrder } from '../js/country-hazard.js';

const row = (iso, country, type, extras = {}) => ({
  iso, country, type, region: 'Test region', year: 2020,
  deaths: null, affected: null, damage_adjusted_usd: null, ...extras,
});

const rows = [
  row('AAA', 'Alpha', 'Flood', { deaths: 0 }),
  row('AAA', 'Alpha', 'Flood', { deaths: null }),
  row('AAA', 'Alpha', 'Storm', { deaths: 4 }),
  row('BBB', 'Beta', 'Flood'),
  row('BBB', 'Beta', 'Earthquake'),
  row('CCC', 'Gamma', 'Wildfire'),
];

test('country–hazard aggregation preserves exact record counts', () => {
  const result = aggregateCountryHazards(rows);
  const alpha = result.countries.find(country => country.iso === 'AAA');
  assert.equal(alpha.totalRecords, 3);
  assert.equal(alpha.relationships.get('Flood').count, 2);
  assert.equal(alpha.relationships.get('Storm').count, 1);
  assert.equal([...alpha.relationships.values()].reduce((sum, item) => sum + item.count, 0), alpha.totalRecords);
});

test('zero impact and missing impact remain distinct with reporting coverage', () => {
  const flood = aggregateCountryHazards(rows).countries.find(country => country.iso === 'AAA').relationships.get('Flood');
  assert.equal(flood.deaths.value, 0);
  assert.equal(flood.deaths.reported, 1);
  assert.equal(flood.deaths.total, 2);
  assert.equal(flood.affected.value, null);
  assert.equal(flood.affected.reported, 0);
});

test('manual selections share one relationship model and retain countries outside the frequency leaders', () => {
  const model = buildCountryHazardModel(rows, { selectedCountries: ['BBB', 'CCC'], selectedHazards: ['Flood', 'Wildfire'] });
  assert.deepEqual(model.countries.map(country => country.iso), ['BBB', 'CCC']);
  assert.deepEqual(model.visibleHazards, ['Flood', 'Wildfire']);
  assert.ok(model.relations.every(relation => model.countries.some(country => country.iso === relation.iso)));
  assert.ok(model.relations.every(relation => model.visibleHazards.includes(relation.hazard)));
});

test('selected hazard counts are never capped at eight', () => {
  const generated = Array.from({ length: 12 }, (_, index) => row('AAA', 'Alpha', `Hazard ${String(index + 1).padStart(2, '0')}`));
  for (const count of [3, 8, 10, 12]) {
    const hazards = generated.slice(0, count).map(item => item.type);
    const model = buildCountryHazardModel(generated, { selectedCountries: ['AAA'], selectedHazards: hazards });
    assert.equal(model.visibleHazards.length, count);
    assert.equal(model.relations.length, count);
  }
});

test('selected rare and disconnected hazards remain visible with zero matrix relationships', () => {
  const model = buildCountryHazardModel(rows, { selectedCountries: ['AAA'], selectedHazards: ['Flood', 'Wildfire'] });
  assert.deepEqual(model.visibleHazards, ['Flood', 'Wildfire']);
  assert.equal(model.relations.length, 1);
  assert.equal(model.countries[0].relationships.has('Wildfire'), false);
});

test('network relationships exactly match positive-count matrix pairs', () => {
  const model = buildCountryHazardModel(rows, {
    selectedCountries: ['AAA', 'BBB', 'CCC'],
    selectedHazards: ['Flood', 'Storm', 'Earthquake', 'Wildfire'],
  });
  const positivePairs = model.countries.flatMap(country => model.visibleHazards
    .filter(hazard => (country.relationships.get(hazard)?.count || 0) > 0)
    .map(hazard => `${country.iso}|${hazard}`)).sort();
  const edgePairs = model.relations.map(relation => `${relation.iso}|${relation.hazard}`).sort();
  assert.deepEqual(edgePairs, positivePairs);
});

test('contrast defaults are reproducible and data-derived', () => {
  const aggregate = aggregateCountryHazards(rows);
  const first = contrastingDefaultSelection(aggregate, { countryCount: 2, hazardCount: 3 });
  const second = contrastingDefaultSelection(aggregate, { countryCount: 2, hazardCount: 3 });
  assert.deepEqual(first, second);
  assert.equal(first.countries.length, 2);
  assert.equal(first.hazards.length, 3);
  assert.equal(first.countries[0], 'AAA');
});

test('cosine similarity and hierarchical ordering are deterministic', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  const aggregate = aggregateCountryHazards([
    row('A', 'A', 'Flood'), row('A', 'A', 'Flood'), row('A', 'A', 'Storm'),
    row('B', 'B', 'Flood'), row('B', 'B', 'Flood'), row('B', 'B', 'Storm'),
    row('C', 'C', 'Earthquake'), row('C', 'C', 'Earthquake'),
  ]);
  const first = similarityOrder(aggregate.countries, aggregate.hazards.map(item => item.name));
  const second = similarityOrder(aggregate.countries, aggregate.hazards.map(item => item.name));
  assert.deepEqual(first, second);
  assert.equal(Math.abs(first.indexOf('A') - first.indexOf('B')), 1);
});
