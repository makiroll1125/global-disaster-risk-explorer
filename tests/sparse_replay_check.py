"""Regression checks for every recorded hazard and sparse animated playback."""
from datetime import datetime, timezone
from collections import Counter
from pathlib import Path
import json
import os
import platform
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)
ROWS = json.loads((ROOT / 'data/processed/disasters.json').read_text(encoding='utf-8'))['records']
TYPE_BY_ID = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import fs from 'node:fs';import {hazardType} from './js/hazards.js';const {records}=JSON.parse(fs.readFileSync('data/processed/disasters.json'));process.stdout.write(JSON.stringify(Object.fromEntries(records.map(r=>[r.id,hazardType(r)]))));"], cwd=ROOT))
WORLD = json.loads((ROOT / 'data/geo/countries-110m.json').read_text(encoding='utf-8'))
MAP_IDS = {feature['id'] for feature in WORLD['objects']['countries']['geometries'] if feature.get('id') is not None and feature['properties']['name'] != 'Antarctica'}


def date_value(row):
    try:
        return datetime(row['year'], int(row['start_month']), int(row['start_day']), tzinfo=timezone.utc).date().isoformat()
    except (ValueError, TypeError):
        return None


def hazards(page, types):
    page.click('#type-menu-button')
    page.locator('#type-menu').get_by_role('button', name='None', exact=True).click()
    for hazard in types:
        page.locator('#type-menu input[type="search"]').fill(hazard)
        page.locator('#type-menu').get_by_role('checkbox', name=hazard, exact=True).check()
    page.keyboard.press('Escape')


def cursor(page):
    return datetime.fromtimestamp(int(page.input_value('#map-day')) * 86400, tz=timezone.utc).date().isoformat()


def mapped(page):
    return int(page.locator('#map').get_attribute('data-rendered-records'))


with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8000')
    page.wait_for_selector('body[data-ready="true"]')
    page.locator('#map-fade-events').check()
    page.locator('#map-approximate').check()
    page.locator('[name="map-mode"][value="timeline"]').check()

    # The animated timeline must expose every Tsunami row, not just the Peru start
    # in the cursor's year. Check full playback by source ID, including same-day rows.
    hazards(page, ['Tsunami'])
    tsunami = [row for row in ROWS if TYPE_BY_ID[row['id']] == 'Tsunami']
    expected_ids = sorted(row['id'] for row in tsunami)
    assert len(expected_ids) == 33
    chart_ids = lambda: sorted(page.locator('.event-tick').evaluate_all('(nodes) => nodes.flatMap(n => n.__data__.records.map(r => r.id))'))
    map_ids = lambda: sorted(page.locator('.event-mark,.event-cluster').evaluate_all('(nodes) => nodes.flatMap(n => n.__data__.members ? n.__data__.members.map(d => d.row.id) : [n.__data__.row.id])'))
    assert chart_ids() == expected_ids
    assert page.locator('.event-tick').count() == len({date_value(row) for row in tsunami}) == 17
    assert '33 dated records' in page.locator('#map-replay-status').inner_text()
    assert page.locator('#map-day').get_attribute('min') == str(int(datetime(2000, 1, 1, tzinfo=timezone.utc).timestamp() / 86400))
    assert page.locator('#map-day').get_attribute('max') == str(int(datetime(2026, 9, 15, tzinfo=timezone.utc).timestamp() / 86400))

    # Clicking a future bar seeks to its exact date; that day's starts appear.
    indian_ocean = page.locator('.event-tick').evaluate_all('(nodes) => nodes.findIndex(n => n.__data__.records.some(r => r.id === "2004-0659-IDN"))')
    page.locator('.event-tick').nth(indian_ocean).dispatch_event('click')
    assert cursor(page) == '2004-12-26'
    assert map_ids() == sorted(row['id'] for row in tsunami if date_value(row) == '2004-12-26')
    assert int(page.locator('#map').get_attribute('data-selected-records')) == sum(date_value(row) <= '2004-12-26' for row in tsunami)
    assert chart_ids() == expected_ids
    for date in ['2025-07-29', '2011-03-11', '2001-06-23']:
        page.locator('#map-day').fill(str(int(datetime.fromisoformat(date).replace(tzinfo=timezone.utc).timestamp() / 86400)))
        assert cursor(page) == date
        assert map_ids() == sorted(row['id'] for row in tsunami if date_value(row) == date)
        assert chart_ids() == expected_ids

    page.evaluate('''() => {
      window.replayedStarts = [];
      window.pulseObserver = new MutationObserver(changes => {
        for (const change of changes) for (const node of change.addedNodes)
          if (node instanceof Element && node.matches('.event-pulse'))
            window.replayedStarts.push(node.__data__.row.id);
      });
      window.pulseObserver.observe(document.querySelector('#map'), { childList: true, subtree: true });
    }''')
    page.select_option('#map-speed', '4000')
    page.locator('#map-skip-quiet').check()
    page.click('#map-play')
    page.wait_for_function('document.querySelector("#map-play").textContent === "Play"', timeout=45000)
    assert sorted(page.evaluate('window.replayedStarts')) == expected_ids
    assert set(map_ids()) <= set(expected_ids)
    assert page.locator('#map').get_attribute('data-selected-records') == '33'
    assert chart_ids() == expected_ids
    assert cursor(page) == max(date_value(row) for row in tsunami)
    page.evaluate('window.pulseObserver.disconnect()')
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'tsunami-complete-replay.png'))
    # Exercise actual checkbox controls for all 34 hazards, including all low-frequency rows.
    types = sorted(set(TYPE_BY_ID.values()), key=lambda name: sum(t == name for t in TYPE_BY_ID.values()))
    assert len(types) == 34
    for hazard in types:
        hazards(page, [hazard])
        date = cursor(page)
        rows = [row for row in ROWS if TYPE_BY_ID[row['id']] == hazard]
        dated = [row for row in rows if date_value(row) and date_value(row) <= '2026-09-15']
        expected = [row for row in dated if date_value(row) == date and (row['latitude'] is not None or row['map_id'] in MAP_IDS)]
        assert dated and expected, (hazard, date)
        assert mapped(page) == len(expected), (hazard, date, mapped(page), len(expected), sorted(set(row['id'] for row in expected) - set(map_ids())))
        assert page.locator('.event-tick').count() == len({date_value(row) for row in dated}), hazard
        assert chart_ids() == sorted(row['id'] for row in dated), hazard
        assert not page.locator('#map-play').is_disabled(), hazard
        assert page.locator('.stat-value').first.get_attribute('title') == f'{len(rows):,}'

    # Missing coordinates must not remove dated records from either timeline.
    hazards(page, ['Impact'])
    assert cursor(page) == '2013-02-15' and mapped(page) == 1
    page.locator('#map-approximate').uncheck()
    assert mapped(page) == 0
    assert page.locator('.event-tick').count() == 1
    assert page.locator('#map-show-references').is_visible()
    assert 'country references only' in page.locator('#map-replay-status').inner_text()
    page.locator('#map-exploration summary').first.click()
    assert 'includes hidden references' in page.locator('#selection-timeline').text_content()
    page.click('#map-show-references')
    assert mapped(page) == 1 and page.locator('#map-approximate').is_checked()

    # The ranking's last rows use the same cursor-alignment path.
    page.click('#rank-expanded')
    page.click('#rank-none')
    page.locator('.rank-row[aria-label^="Impact:"]').click()
    assert mapped(page) == 1 and cursor(page) == '2013-02-15'
    assert page.locator('.event-tick').count() == 1

    # Optional gap skipping compresses sparse dates without losing either start.
    hazards(page, ['Impact', 'Animal incident'])
    assert cursor(page) == '2013-02-15'
    page.select_option('#map-speed', '4000')
    page.locator('#map-skip-quiet').check()
    page.click('#map-play')
    page.wait_for_selector('.event-pulse')
    page.wait_for_function('document.querySelector("#map-current-year").textContent === "2014"')
    assert cursor(page) == '2014-11-17' and mapped(page) == 2
    assert 'Quiet gaps skipped' in page.locator('#map-replay-status').inner_text()
    page.wait_for_function('document.querySelector("#map-play").textContent === "Play"')
    page.click('#map-play')
    hazards(page, ['Derecho'])
    assert page.locator('#map-play').inner_text() == 'Play'
    switched_date = cursor(page)
    page.wait_for_timeout(1100)
    assert cursor(page) == switched_date and mapped(page) > 0
    hazards(page, ['Impact', 'Animal incident'])

    # Deliberate calendar navigation remains available and has an explicit jump action.
    page.locator('#map-year').fill('2010')
    assert mapped(page) == 0 and page.locator('.event-tick').count() == 2
    assert 'No starts yet' in page.locator('#map-replay-status').inner_text()
    page.click('#map-next-recorded')
    assert cursor(page) == '2013-02-15' and mapped(page) == 1
    page.locator('#map-skip-quiet').uncheck()
    page.locator('#map-day').fill(str(int(datetime(2013, 2, 14, tzinfo=timezone.utc).timestamp() / 86400)))
    page.select_option('#map-speed', '4000')
    before = int(page.input_value('#map-day'))
    page.click('#map-play')
    page.wait_for_function('(day) => +document.querySelector("#map-day").value > day', arg=before)
    page.click('#map-play')
    assert before < int(page.input_value('#map-day')) <= before + 25
    page.locator('#map-skip-quiet').check()

    # Honor explicit map years and local filters; offer recovery instead of silently clearing them.
    page.select_option('#map-local-country', 'JPN')
    page.locator('[name="map-mode"][value="timeline"]').check()
    assert page.locator('#map-play').is_disabled()
    assert page.locator('#map-clear-replay-selection').is_visible()
    page.click('#map-clear-replay-selection')
    assert page.input_value('#map-local-country') == '' and mapped(page) == 1
    page.select_option('#map-start-year', '2020')
    page.select_option('#map-end-year', '2020')
    assert page.input_value('#map-year') == '2020'
    assert page.locator('#map-play').is_disabled()
    assert 'No matching records' in page.locator('#map-replay-status').inner_text()
    page.select_option('#map-start-year', '2000')
    page.select_option('#map-end-year', '2000')
    hazards(page, ['Infestation'])
    assert page.locator('#map-play').is_disabled()
    assert 'lack complete dates' in page.locator('#map-replay-status').inner_text()
    page.locator('[name="map-mode"][value="period"]').check()
    assert mapped(page) == sum(TYPE_BY_ID[row['id']] == 'Infestation' and row['year'] == 2000 for row in ROWS)

    # Re-entering animation also finds the selected type, and controls fit narrow screens.
    page.select_option('#map-end-year', '2026')
    hazards(page, ['Glacial lake outburst flood'])
    page.locator('[name="map-mode"][value="timeline"]').check()
    assert cursor(page) == '2021-02-07' and mapped(page) > 0
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'sparse-hazard-replay.png'))
    for width, height in [(390, 844), (320, 740)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(200)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert mapped(page) > 0 and page.locator('.event-tick').count() > 0
    assert not errors, errors
    browser.close()
    print('PASS: all 34 hazard types via UI, rare ranking rows, source-accurate dates and markers, reference visibility independent of timelines, sparse playback and pulse dwell, manual calendar mode, explicit scopes, missing-date explanation, mobile, no JS errors.')
