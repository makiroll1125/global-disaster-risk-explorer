import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCountryHazards, buildCountryHazardModel, cosineSimilarity, similarityOrder } from '../js/country-hazard.js';

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

test('country–hazard aggregation uses country record totals as denominators', () => {
  const result = aggregateCountryHazards(rows);
  const alpha = result.countries.find(country => country.iso === 'AAA');
  assert.equal(alpha.totalRecords, 3);
  assert.equal(alpha.relationships.get('Flood').count, 2);
  assert.equal(alpha.relationships.get('Flood').share, 2 / 3);
  assert.equal(alpha.relationships.get('Storm').share, 1 / 3);
  assert.equal([...alpha.relationships.values()].reduce((sum, item) => sum + item.share, 0), 1);
});

test('zero impact and missing impact remain distinct with reporting coverage', () => {
  const flood = aggregateCountryHazards(rows).countries.find(country => country.iso === 'AAA').relationships.get('Flood');
  assert.equal(flood.deaths.value, 0);
  assert.equal(flood.deaths.reported, 1);
  assert.equal(flood.deaths.total, 2);
  assert.equal(flood.affected.value, null);
  assert.equal(flood.affected.reported, 0);
});

test('top subsets share one relationship model and can include a searched country', () => {
  const model = buildCountryHazardModel(rows, { countryLimit: 2, includeCountry: 'CCC', hazardLimit: 2 });
  assert.equal(model.countries.length, 2);
  assert.ok(model.countries.some(country => country.iso === 'CCC'));
  assert.equal(model.visibleHazards.length, 2);
  assert.ok(model.relations.every(relation => model.countries.some(country => country.iso === relation.iso)));
  assert.ok(model.relations.every(relation => model.visibleHazards.includes(relation.hazard)));
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
