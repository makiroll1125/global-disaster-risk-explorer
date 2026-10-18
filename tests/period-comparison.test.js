import test from 'node:test';
import assert from 'node:assert/strict';
import { periodSummary, periodChanges, periodComposition } from '../js/period-comparison.js';

const a = { start: 2000, end: 2001 }, b = { start: 2010, end: 2013 };
const rows = [
  { year: 2000, iso: 'AAA', region: 'Asia', type: 'Flood', deaths: null },
  { year: 2001, iso: 'AAA', region: 'Asia', type: 'Storm', deaths: 0 },
  { year: 2010, iso: 'AAA', region: 'Asia', type: 'Flood', deaths: 8 },
  { year: 2010, iso: 'BBB', region: 'Europe', type: 'Storm', deaths: null },
];

test('different period lengths compare annual averages with all calendar years in the denominator', () => {
  const change = periodChanges(rows, 'iso', a, b, 'records').find(row => row.key === 'AAA');
  assert.equal(change.a.value, 1);
  assert.equal(change.b.value, .25);
  assert.equal(change.delta, -.75);
  assert.equal(change.percent, -.75);
  assert.equal(periodSummary(rows, b, 'records', 'total').value, 2);
});

test('reported zero, missing impacts and missing periods retain distinct meanings', () => {
  const change = periodChanges(rows, 'region', a, b, 'deaths');
  const asia = change.find(row => row.key === 'Asia');
  assert.equal(asia.a.value, 0);
  assert.equal(asia.a.reported, 1);
  assert.equal(asia.a.count, 2);
  assert.equal(asia.b.value, 2);
  assert.equal(asia.delta, 2);
  assert.equal(asia.percent, null); // No percentage against a zero baseline.
  const europe = change.find(row => row.key === 'Europe');
  assert.equal(europe.a.value, null);
  assert.equal(europe.b.value, null);
  assert.equal(europe.delta, null);
  assert.equal(periodSummary([], a, 'records').value, 0);
});

test('country comparisons include records without event coordinates or map polygons', () => {
  const values = periodChanges(rows, 'iso', a, b, 'records', 'total');
  assert.equal(values.length, 2);
  assert.equal(values.find(row => row.key === 'BBB').b.value, 1);
  assert.equal(values.reduce((sum, row) => sum + row.b.value, 0), 2);
});

test('composition preserves both period totals through Other and handles empty periods', () => {
  const values = periodComposition(rows.slice(0, 2), rows.slice(2), 1);
  assert.equal(values.length, 2);
  assert.equal(values[1].type, 'Other');
  assert.equal(values.reduce((sum, row) => sum + row.a, 0), 2);
  assert.equal(values.reduce((sum, row) => sum + row.b, 0), 2);
  assert.equal(values.reduce((sum, row) => sum + row.shareA, 0), 1);
  assert.ok(periodComposition([], rows).every(row => row.shareA === null));
});
