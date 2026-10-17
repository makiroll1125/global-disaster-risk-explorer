import test from 'node:test';
import assert from 'node:assert/strict';
import { inMapArea, selectMapItems, clusterMapItems, impactRadius, recordDateLabel, replayDates, nextReplayDate, alignReplayCursor, upperBound, advanceReplayDate } from '../js/map-analysis.js';

const items = [
  { row: { id: 'a', iso: 'JPN', year: 2011, latitude: 35, longitude: 140 }, exact: true, point: [10, 12], day: Date.UTC(2011, 2, 10) },
  { row: { id: 'b', iso: 'JPN', year: 2011, latitude: 36, longitude: 141 }, exact: true, point: [12, 14], day: Date.UTC(2011, 2, 11) },
  { row: { id: 'c', iso: 'JPN', year: 2011 }, exact: false, point: [11, 13], day: Date.UTC(2011, 2, 11) },
  { row: { id: 'd', iso: 'JPN', year: 2011 }, exact: false, point: [11, 13], day: null },
  { row: { id: 'e', iso: 'KOR', year: 2011 }, exact: false, point: [11, 13], day: Date.UTC(2011, 2, 11) },
  { row: { id: 'f', iso: 'ZZZ', year: 2011 }, exact: false, point: null, day: null },
];

test('clustering preserves every placeable record and separates reference points from source locations', () => {
  const groups = clusterMapItems(items, p => p, 30);
  assert.equal(groups.length, 3);
  assert.equal(groups.reduce((sum, group) => sum + group.members.length, 0), 5);
  assert.ok(groups.every(group => group.members.every(item => item.exact === group.exact)));
  assert.ok(groups.filter(group => !group.exact).every(group => new Set(group.members.map(item => item.row.iso)).size === 1));
  assert.equal(new Set(groups.flatMap(g => g.members.map(d => d.row.id))).size, 5);
  assert.equal(clusterMapItems(items, p => p, 30, false).length, 5);
});

test('zoom refines screen-space groups without changing their total', () => {
  const before = clusterMapItems(items.slice(0, 2), p => p, 30);
  const after = clusterMapItems(items.slice(0, 2), p => p.map(x => x * 20), 30);
  assert.equal(before.length, 1); assert.equal(after.length, 2);
  assert.equal(before[0].members.length, after.reduce((s, g) => s + g.members.length, 0));
});

test('area and inclusive dates intersect, and country references require explicit country selection', () => {
  const area = { kind: 'projected', bounds: [[0, 0], [30, 30]] };
  const interval = [Date.UTC(2011, 2, 11), Date.UTC(2011, 2, 11)];
  assert.deepEqual(selectMapItems(items, { area, interval }).map(d => d.row.id), ['b']);
  assert.deepEqual(selectMapItems(items, { country: 'JPN', interval }).map(d => d.row.id), ['b', 'c']);
  assert.equal(selectMapItems(items, { country: 'JPN' }).length, 4);
  assert.equal(selectMapItems(items, {}, { approximate: false }).length, 2);
  assert.equal(selectMapItems(items).length, 6); // Unplaceable records remain in the selection summary/list.
  assert.equal(selectMapItems(items, { interval }, { cutoff: Date.UTC(2011, 2, 10) }).length, 0);
  assert.deepEqual(selectMapItems(items, {}, { replay: { year: 2011, date: Date.UTC(2011, 2, 10) } }).map(d => d.row.id), ['a']);
});

test('geographic bounds support crossing the date line without including unrelated points', () => {
  const area = { kind: 'geographic', west: 170, east: -170, south: -10, north: 10 };
  for (const longitude of [179, -179]) assert.ok(inMapArea({ exact: true, row: { longitude, latitude: 0 } }, area));
  assert.equal(inMapArea({ exact: true, row: { longitude: 0, latitude: 0 } }, area), false);
  assert.equal(inMapArea({ exact: false, row: { longitude: 179, latitude: 0 } }, area), false);
});

test('impact area is proportional for readable positive values and date labels retain precision', () => {
  assert.equal(impactRadius(25, 100), 9);
  assert.equal(impactRadius(100, 100), 18);
  assert.equal(impactRadius(null, 100), 3);
  assert.equal(impactRadius(0, 100), 3);
  assert.equal(recordDateLabel({ year: 2011, start_month: 3, start_day: 11 }), '2011-03-11');
  assert.equal(recordDateLabel({ year: 2011, start_month: 3, start_day: null }), '2011-03 (day unknown)');
  assert.equal(recordDateLabel({ year: 2011 }), '2011 (month/day unknown)');
});

test('sparse replay includes country-reference dates, removes duplicates and respects its date bounds', () => {
  const days = replayDates(items, Date.UTC(2011, 2, 10), Date.UTC(2011, 2, 11));
  assert.deepEqual(days, [Date.UTC(2011, 2, 10), Date.UTC(2011, 2, 11)]);
  assert.deepEqual(replayDates(items, Date.UTC(2011, 2, 11), Date.UTC(2011, 2, 11)), [Date.UTC(2011, 2, 11)]);
  const sparse = replayDates([{day: Date.UTC(2013, 1, 15), exact: false}, {day: null}, {day: Date.UTC(2021, 1, 7), exact: false}], Date.UTC(2000, 0, 1), Date.UTC(2026, 0, 1));
  assert.equal(nextReplayDate(sparse, Date.UTC(2013, 1, 15)), Date.UTC(2021, 1, 7));
  assert.equal(nextReplayDate(sparse, Date.UTC(2021, 1, 7)), null);
});

test('replay retains starts from earlier years and removes future starts when seeking backwards', () => {
  const acrossYears = [
    { ...items[0], day: Date.UTC(2001, 5, 23), row: { id: 'peru', year: 2001 } },
    { ...items[0], day: Date.UTC(2004, 11, 26), row: { id: 'indonesia', year: 2004 } },
    { ...items[0], day: Date.UTC(2004, 11, 26), row: { id: 'thailand', year: 2004 } },
    { ...items[0], day: Date.UTC(2011, 2, 11), row: { id: 'japan', year: 2011 } },
    items[3], // Incomplete dates never enter replay.
  ];
  const ids = (date, interval) => selectMapItems(acrossYears, { interval }, { replay: { date } }).map(d => d.row.id);
  assert.deepEqual(ids(Date.UTC(2011, 2, 11)), ['peru', 'indonesia', 'thailand', 'japan']);
  assert.deepEqual(ids(Date.UTC(2004, 11, 26)), ['peru', 'indonesia', 'thailand']);
  assert.deepEqual(ids(Date.UTC(2011, 2, 11), [Date.UTC(2004, 0, 1), Date.UTC(2011, 11, 31)]), ['indonesia', 'thailand', 'japan']);
});

test('selecting a rare hazard reveals a matching date without forcing a manual calendar cursor to change', () => {
  const days = [Date.UTC(2013, 1, 15), Date.UTC(2021, 1, 7)];
  assert.equal(alignReplayCursor(days, Date.UTC(2000, 0, 1)), days[0]);
  assert.equal(alignReplayCursor(days, Date.UTC(2013, 2, 1)), days[1]);
  assert.equal(alignReplayCursor(days, Date.UTC(2015, 0, 1)), days[1]);
  assert.equal(alignReplayCursor(days, Date.UTC(2026, 0, 1)), days[0]);
  assert.equal(alignReplayCursor([], Date.UTC(2000, 0, 1)), Date.UTC(2000, 0, 1));
});

test('calendar replay uses elapsed time and the same year duration in leap years', () => {
  for (const speed of [4000, 12000, 24000]) {
    for (const year of [2000, 2001, 2024]) {
      assert.ok(Math.abs(advanceReplayDate(Date.UTC(year, 0, 1), speed, speed) - Date.UTC(year + 1, 0, 1)) < 1);
      const half = advanceReplayDate(Date.UTC(year, 0, 1), speed / 2, speed);
      assert.ok(Math.abs(half - (Date.UTC(year, 0, 1) + Date.UTC(year + 1, 0, 1)) / 2) < 1);
    }
  }
  assert.equal(upperBound([1, 2, 2, 3], 2), 3);
  assert.equal(upperBound([], 2), 0);
  assert.equal(upperBound([{day: 1}, {day: 2}], 1, d => d.day), 1);
});
