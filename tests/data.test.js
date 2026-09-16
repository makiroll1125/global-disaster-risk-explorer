import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, filterRows, groupSummary } from '../js/data.js';

const rows = [
  { iso: 'USA', country: 'United States', type: 'Flood', region: 'Americas', year: 2000, deaths: null },
  { iso: 'USA', country: 'United States', type: 'Storm', region: 'Americas', year: 2001, deaths: 0 },
  { iso: 'CAN', country: 'Canada', type: 'Flood', region: 'Americas', year: 2001, deaths: 5 },
];
test('unknown, zero, and empty subsets retain distinct meanings', () => {
  assert.deepEqual(summarize([rows[0]], 'deaths'), { value: null, reported: 0, count: 1 });
  assert.equal(summarize([rows[1]], 'deaths').value, 0);
  assert.equal(summarize([], 'records').value, 0);
  assert.equal(summarize(rows, 'deaths').reported, 2);
});
test('coordinated filters and context exclusions', () => {
  const state = { start: 2001, end: 2001, country: 'USA', type: 'Flood', region: '' };
  assert.equal(filterRows(rows, state).length, 0);
  assert.equal(filterRows(rows, state, { ignoreCountry: true }).length, 1);
  assert.equal(filterRows(rows, state, { ignoreYears: true }).length, 1);
  assert.equal(groupSummary(rows, 'iso', 'deaths').find(r => r.key === 'USA').reported, 1);
});
