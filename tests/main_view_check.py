"""Event-map controls, hazard families and period event views. Serve on :8000."""
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
import json
import os
import platform
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROWS = json.loads((ROOT / 'data/processed/disasters.json').read_text(encoding='utf-8'))['records']
DISPLAY = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import fs from 'node:fs';import {hazardType,hazardFamily,hazardColors,hazardFamilyColors} from './js/hazards.js';const {records}=JSON.parse(fs.readFileSync('data/processed/disasters.json'));process.stdout.write(JSON.stringify({rows:Object.fromEntries(records.map(r=>[r.id,{type:hazardType(r),family:hazardFamily(hazardType(r))}])),hazardColors,hazardFamilyColors}));"], cwd=ROOT))
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)


def day(value):
    return str(int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp() / 86400))


with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, reduced_motion='reduce')
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8000')
    page.wait_for_selector('body[data-ready="true"]')
    assert page.locator('[name="map-encoding"]').count() == 0
    assert page.locator('#history,#seasonal').count() == 0
    assert page.locator('#map-clusters').count() == 0
    assert page.locator('.masthead').is_visible()
    assert page.locator('.filter-bar,#filter-toggle,.filter-menu').count() == 0
    assert page.locator('#map-fade-events').is_checked()
    for control in ['map-color-by-type', 'map-approximate']:
        assert not page.locator('#' + control).is_checked()
        assert page.locator('#' + control).locator('xpath=ancestor::*[contains(@class,"event-status")]').count() == 1
    assert page.locator('.event-pin.located').count() == 1864
    assert page.locator('.event-pin.approximate').count() == 0
    assert page.locator('.rank-row').count() == 12
    assert page.locator('#rank-grouped').get_attribute('aria-pressed') == 'true'
    assert 'Animated timeline' in page.locator('#map-mode').inner_text()
    assert 'COUNTRY TOTALS' not in page.locator('#geography').inner_text()
    family_counts = Counter(DISPLAY['rows'][row['id']]['family'] for row in ROWS)
    for family, count in family_counts.items():
        assert page.locator(f'.rank-row[aria-label^="{family}:"]').get_attribute('aria-label').startswith(f'{family}: ')
        data = page.locator(f'.rank-row[aria-label^="{family}:"]').evaluate('(n) => n.__data__.value')
        assert data == count
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'main-events-default.png'), style='.masthead,.filter-bar{visibility:hidden!important}')

    # Group toggles operate on all members. A partial expanded choice is mixed.
    flood = page.locator('.rank-row[aria-label^="Flood:"]')
    flood.click()
    assert page.locator('.stat-value').first.get_attribute('title') == f'{len(ROWS) - family_counts["Flood"]:,}'
    page.click('#rank-expanded')
    assert page.locator('.rank-row').count() == 34
    page.locator('.rank-row[aria-label^="Flash flood:"]').click()
    page.click('#rank-grouped')
    assert page.locator('.rank-row[aria-label^="Flood:"]').get_attribute('aria-pressed') == 'mixed'
    page.locator('.rank-row[aria-label^="Flood:"]').click()
    assert page.locator('.stat-value').first.get_attribute('title') == f'{len(ROWS):,}'

    # Marker colors switch taxonomy with the sidebar, but default stays monochrome.
    page.locator('#map-color-by-type').check()
    pin = page.locator('.event-pin[data-type="Riverine flood"]').first
    assert pin.get_attribute('fill') == DISPLAY['hazardFamilyColors']['Flood']
    page.click('#rank-expanded')
    assert pin.get_attribute('fill') == DISPLAY['hazardColors']['Riverine flood']
    assert 'expanded' in page.locator('#map-color-key-title').inner_text()
    page.locator('#map-color-by-type').uncheck()
    assert pin.get_attribute('fill') == '#167c75'
    assert page.locator('.event-cluster').count() == 0
    # Hover uses a circular halo and raises the actual pointer target above peers.
    page.locator('.event-mark').first.hover(force=True)
    page.wait_for_selector('.event-mark.is-hovered')
    hovered = page.locator('.event-mark.is-hovered')
    assert hovered.count() == 1
    assert hovered.locator('.event-hover-ring').get_attribute('stroke') == '#000'
    assert hovered.locator('.event-hover-ring').is_visible()
    assert hovered.evaluate('(n) => n === n.parentNode.lastElementChild')
    assert hovered.evaluate('(n) => getComputedStyle(n).outlineStyle') == 'none'
    page.locator('#map-title').hover()
    assert page.locator('.event-mark.is-hovered').count() == 0
    labels = page.locator('main > .panel > .panel-heading .eyebrow, .main-grid .panel-heading .eyebrow').all_text_contents()
    assert [label.split(')')[0] for label in labels] == ['1','2','3','4','5','6']
    assert labels[2] == '3) COMPARE TWO PERIODS'
    page.locator('#map-fade-events').uncheck()

    # Cumulative locations survive pauses, cursor changes and inspection by default.
    page.locator('#map-exploration').evaluate('(el) => el.open = true')
    page.select_option('#map-local-country', 'JPN')
    page.click('#rank-none')
    page.locator('.rank-row[aria-label^="Tsunami:"]').click()
    page.select_option('#map-start-year', '2011')
    page.select_option('#map-end-year', '2011')
    page.locator('[name="map-mode"][value="timeline"]').check()
    page.locator('#map-day').fill(day('2011-03-12'))
    assert page.locator('.event-pin').count() == 1
    page.wait_for_timeout(2800)
    assert page.locator('.event-pin').count() == 1
    page.locator('.event-mark').first.focus()
    page.keyboard.press('Enter')
    assert '2011-0082-JPN' in page.locator('#map-event-detail').inner_text()
    assert page.locator('.event-mark').first.evaluate('(n) => getComputedStyle(n).outlineStyle') == 'none'
    assert page.locator('.event-mark').first.evaluate('(n) => getComputedStyle(n).filter') == 'none'
    country = page.locator('#map .country[data-iso="JPN"]')
    country.focus()
    assert country.evaluate('(n) => getComputedStyle(n).outlineStyle') == 'none'
    page.locator('#map-fade-events').check()
    page.locator('#map-day').fill(day('2011-03-11'))
    assert page.locator('.event-pin').count() == 1
    page.wait_for_timeout(2800)
    assert page.locator('.event-pin').count() == 0
    page.locator('#map-fade-events').uncheck()
    assert page.locator('.event-pin').count() == 1
    page.locator('#map-day').fill(day('2011-03-10'))
    assert page.locator('.event-pin').count() == 0
    page.click('#map-next')
    assert page.locator('.event-pin').count() == 1
    page.reload()
    page.wait_for_selector('body[data-ready="true"]')

    # Comparison has independent local impact controls and source-accurate points.
    ranges = {key: (int(page.input_value(f'#period-{key}-start')), int(page.input_value(f'#period-{key}-end'))) for key in ['a', 'b']}
    for metric in ['records', 'deaths', 'affected', 'damage_adjusted_usd']:
        page.select_option('#period-metric', metric)
        assert 'Disaster records' in page.locator('#ranking-note').inner_text()
        maxima = []
        for start, end in ranges.values():
            values = {}
            for row in ROWS:
                if start <= row['year'] <= end and (metric == 'records' or row[metric] is not None):
                    values[row['iso']] = values.get(row['iso'], 0) + (1 if metric == 'records' else row[metric])
            maxima.append(max(values.values()) / (end - start + 1))
        assert float(page.locator('#period-map-a').get_attribute('data-scale-max')) == max(maxima)
        assert page.locator('#period-map-a').get_attribute('data-scale-max') == page.locator('#period-map-b').get_attribute('data-scale-max')
    page.select_option('#period-view', 'events')
    for key, (start, end) in ranges.items():
        expected = [row for row in ROWS if start <= row['year'] <= end and row['latitude'] is not None and row['longitude'] is not None]
        assert page.locator(f'#period-map-{key} .period-event').count() == len(expected)
        assert page.locator(f'#period-map-{key} .period-event.approximate').count() == 0
    assert page.locator('#period-map-a').get_attribute('data-event-size-max') == page.locator('#period-map-b').get_attribute('data-event-size-max')
    page.locator('#period-approximate').check()
    assert page.locator('#period-map-a .period-event.approximate').count() > 0
    page.locator('#period-approximate').uncheck()
    page.select_option('#period-metric', 'records')
    assert 'One mark' in page.locator('#period-legend').inner_text()
    page.click('#period-zoom-in')
    assert page.locator('#period-map-a>g').get_attribute('transform') == page.locator('#period-map-b>g').get_attribute('transform')
    page.locator('#period-comparison').screenshot(path=str(ARTIFACTS / 'period-event-totals.png'), style='.masthead,.filter-bar{visibility:hidden!important}')
    assert page.locator('#ch-network .ch-edge').count() > 0
    assert page.locator('#ch-matrix .ch-cell').count() == 80
    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.wait_for_timeout(250)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    assert not errors, errors
    browser.close()
    print('PASS: event-only defaults, 12/34 hazard grouping and mixed selection, taxonomy colors, persistent/optional fading markers, inspection, local comparison metrics and event locations, shared scales/zoom, preserved matrix, mobile.')
