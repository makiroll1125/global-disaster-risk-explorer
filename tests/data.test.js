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

test('monthly bins exclude unknown months and preserve unknown impacts', async () => {
  const {timeSeries} = await import('../js/data.js');
  const fixture = [{year:2000,start_month:2,deaths:null},{year:2000,start_month:null,deaths:8},{year:2000,start_month:13,deaths:3}];
  assert.equal(timeSeries(fixture,2000,2000,'records',true).reduce((s,d)=>s+d.value,0),1);
  assert.equal(timeSeries(fixture,2000,2000,'records')[0].value,3);
  assert.equal(timeSeries(fixture,2000,2000,'deaths',true)[1].value,null);
});
test('seasonal average uses all selected complete years and excludes the partial year', async () => {
  const {seasonalData} = await import('../js/data.js');
  const data=seasonalData([{year:2024,start_month:1},{year:2024,start_month:1},{year:2025,start_month:null},{year:2026,start_month:1}],2024,2026,2026);
  assert.equal(data.months[0].value,1);
  assert.equal(data.months[1].value,0);
  assert.equal(data.excluded,1);
  assert.equal(seasonalData([],2026,2026,2026).months[0].value,null);
});
test('hierarchy preserves country-record counts and geographic parents', async () => {
  const {disasterHierarchy} = await import('../js/data.js');
  const root=disasterHierarchy(rows);
  assert.equal(root.children[0].name,'Americas');
  const countries=root.children[0].children;
  assert.equal(countries.find(c=>c.iso==='USA').children.reduce((s,d)=>s+d.value,0),2);
  assert.equal(countries.flatMap(c=>c.children).reduce((s,d)=>s+d.value,0),rows.length);
});
