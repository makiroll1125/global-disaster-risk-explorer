import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hazardType, hazardColors, hazardDescriptions, hazardFamilies, hazardFamily, hazardFamilyColors, eventColor, eventDay, hasCoordinates } from '../js/hazards.js';

test('source subtypes expose distinct hazards without inventing sinkholes or firestorms', () => {
  assert.equal(hazardType({ type: 'Earthquake', subtype: 'Tsunami' }), 'Tsunami');
  assert.equal(hazardType({ type: 'Storm', subtype: 'Tropical cyclone' }), 'Hurricane / typhoon');
  assert.equal(hazardType({ type: 'Mass movement (wet)', subtype: 'Sudden Subsidence (wet)' }), 'Subsidence');
  assert.equal(hazardType({ type: 'Wildfire', event_name: 'Fire' }), 'Wildfire');
  assert.notEqual(hazardColors.Earthquake, hazardColors.Tsunami);
});

test('replay requires a complete valid calendar date, including leap year rules', () => {
  assert.equal(eventDay({ year: 2020, start_month: 2, start_day: 29 }), Date.UTC(2020, 1, 29));
  for (const [year, month, day] of [[2021, 2, 29], [2020, 4, 31], [2020, 0, 1], [2020, 1, null], [2020, null, 1], [2020, 2, 0]]) {
    assert.equal(eventDay({ year, start_month: month, start_day: day }), null);
  }
});

test('coordinates preserve zero but exclude missing and out-of-range values', () => {
  assert.ok(hasCoordinates({ latitude: 0, longitude: 0 }));
  for (const row of [{ latitude: null, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }]) assert.equal(hasCoordinates(row), false);
});

test('all real records retain totals and have a defined display color', () => {
  const { records, metadata } = JSON.parse(fs.readFileSync(new URL('../data/processed/disasters.json', import.meta.url)));
  assert.equal(records.length, metadata.cleaned_rows);
  assert.ok(records.every(row => hazardColors[hazardType(row)]));
  assert.equal(new Set(records.map(hazardType)).size, 34);
  assert.equal(records.filter(row => hazardType(row) === 'Tsunami').length, 33);
  assert.equal(records.filter(row => hazardType(row) === 'Avalanche').length, 56);
  assert.equal(records.filter(hasCoordinates).length, metadata.coordinate_coverage.located_records);
  assert.equal(records.filter(row => ['Sinkhole', 'Firestorm'].includes(hazardType(row))).length, 0);
  assert.equal(new Set(Object.values(hazardColors)).size, Object.keys(hazardColors).length);
  assert.deepEqual(Object.keys(hazardDescriptions).sort(), Object.keys(hazardColors).sort());
  assert.ok(Object.values(hazardDescriptions).every(text => text.length > 20 && text.length < 180));
});

test('hazard families partition expanded categories and preserve all real record totals', () => {
  const members = Object.values(hazardFamilies).flat();
  assert.equal(new Set(members).size, members.length);
  assert.deepEqual([...members].sort(), Object.keys(hazardColors).sort());
  assert.equal(hazardFamily('Riverine flood'), hazardFamily('Flood'));
  assert.equal(hazardFamily('Tsunami'), hazardFamily('Earthquake'));
  const { records } = JSON.parse(fs.readFileSync(new URL('../data/processed/disasters.json', import.meta.url)));
  const groups = new Map();
  for (const row of records) {
    const family = hazardFamily(hazardType(row));
    assert.ok(hazardFamilyColors[family]);
    groups.set(family, (groups.get(family) || 0) + 1);
  }
  assert.equal(groups.size, 12);
  assert.equal([...groups.values()].reduce((sum, value) => sum + value, 0), records.length);
  assert.equal(groups.get('Flood'), 4299);
  assert.equal(groups.get('Earthquake / tsunami'), 707);
});

test('event colors are opt-in and follow the selected taxonomy', () => {
  assert.equal(eventColor('Riverine flood'), '#167c75');
  assert.equal(eventColor('Riverine flood', { colorByType: true, hazardLevel: 'grouped' }), hazardFamilyColors.Flood);
  assert.equal(eventColor('Flash flood', { colorByType: true, hazardLevel: 'grouped' }), hazardFamilyColors.Flood);
  assert.equal(eventColor('Riverine flood', { colorByType: true, hazardLevel: 'expanded' }), hazardColors['Riverine flood']);
});
