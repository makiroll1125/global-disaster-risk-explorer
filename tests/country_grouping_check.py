"""Country totals and automatic timeline references. Serve the project on :8000."""
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import os
import platform
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROWS = json.loads((ROOT / 'data/processed/disasters.json').read_text(encoding='utf-8'))['records']
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)


def date(row):
    try:
        return datetime(row['year'], int(row['start_month']), int(row['start_day']), tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def seek(page, value):
    day = int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp() / 86400)
    page.locator('#map-day').fill(str(day))


def check_totals(page, rows, metric):
    expected = defaultdict(list)
    for row in rows:
        expected[row['iso']].append(row)
    marks = page.locator('#map .event-mark.country-total').evaluate_all('''nodes => nodes.map(el => ({
        iso: el.dataset.iso, count: +el.dataset.recordCount, value: el.dataset.value,
        ids: el.__data__.group.members.map(item => item.row.id)
    }))''')
    assert {mark['iso'] for mark in marks} == set(expected)
    assert len(marks) == len(expected)
    assert int(page.locator('#map').get_attribute('data-rendered-records')) == len(rows)
    for mark in marks:
        records = expected[mark['iso']]
        assert mark['count'] == len(records)
        assert set(mark['ids']) == {row['id'] for row in records}
        values = [row[metric] for row in records if row[metric] is not None] if metric != 'equal' else []
        value = len(records) if metric == 'equal' else sum(values) if values else None
        assert mark['value'] == 'unreported' if value is None else math.isclose(float(mark['value']), value)


with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8000')
    page.wait_for_selector('body[data-ready="true"]')
    assert page.locator('#map-approximate').count() == 0
    assert not page.locator('#map-group-country').is_checked()
    assert page.locator('#map .event-pin.located').count() == 1864
    assert page.locator('#map .event-pin.approximate').count() == 0
    page.locator('#map-group-country').check()
    check_totals(page, ROWS, 'equal')
    assert page.locator('#map-fade-events').is_disabled()
    assert page.locator('#map-color-by-type').is_disabled()
    for metric in ['deaths', 'affected', 'damage_adjusted_usd']:
        page.select_option('#map-size', metric)
        check_totals(page, ROWS, metric)
        assert 'accumulated' in page.locator('#map-size-legend').inner_text()

    # Country marker area uses reported country sums, including coordinate-free rows.
    page.select_option('#map-size', 'deaths')
    a, b = [page.locator(f'#map .event-mark[data-iso="{iso}"]') for iso in ['CHN', 'IND']]
    ra, rb = [float(mark.locator('circle.event-pin').get_attribute('r')) for mark in [a, b]]
    assert math.isclose((ra / rb) ** 2, float(a.get_attribute('data-value')) / float(b.get_attribute('data-value')))
    japan = page.locator('#map .event-mark[data-iso="JPN"]')
    japan.focus()
    page.keyboard.press('Enter')
    assert 'Japan' in page.locator('#map-event-detail-title').inner_text()
    assert f'{sum(row["deaths"] or 0 for row in ROWS if row["iso"] == "JPN"):,.0f}' in page.locator('#map-event-detail').inner_text()
    assert int(page.locator('#map-record-page').inner_text().split(' records')[0].replace(',', '')) == sum(row['iso'] == 'JPN' for row in ROWS)
    assert japan.evaluate('el => getComputedStyle(el).outlineStyle') == 'none'
    page.locator('#map-exploration').evaluate('el => el.open = false')
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'country-grouped-deaths.png'), style='.masthead{visibility:hidden!important}')

    # Date and hazard selections recompute full country sums without changing scale.
    page.select_option('#map-start-year', '2010')
    page.select_option('#map-end-year', '2011')
    check_totals(page, [row for row in ROWS if 2010 <= row['year'] <= 2011], 'deaths')
    page.click('#rank-none')
    page.locator('.rank-row[aria-label^="Flood:"]').click()
    check_totals(page, [row for row in ROWS if 2010 <= row['year'] <= 2011 and row['type'] == 'Flood'], 'deaths')
    page.click('#rank-all')

    # Grouped replay accumulates all records through the cursor and never expires totals.
    page.locator('[name="map-mode"][value="timeline"]').check()
    for value in ['2011-03-12', '2010-06-01', '2011-12-31']:
        seek(page, value)
        cutoff = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
        selected = [row for row in ROWS if 2010 <= row['year'] <= 2011 and date(row) is not None and date(row) <= cutoff]
        check_totals(page, selected, 'deaths')
    page.wait_for_timeout(2800)
    check_totals(page, selected, 'deaths')

    # Individual animated locations automatically include hollow country references.
    page.locator('#map-group-country').uncheck()
    assert page.locator('#map-fade-events').is_enabled()
    seek(page, '2011-03-11')
    starts = [row for row in ROWS if date(row) == datetime(2011, 3, 11, tzinfo=timezone.utc)]
    rendered = page.locator('#map .event-pin').evaluate_all('nodes => nodes.map(el => el.dataset.id)')
    assert set(rendered) == {row['id'] for row in starts}
    assert page.locator('#map .event-pin.approximate').count() == sum(row['latitude'] is None or row['longitude'] is None for row in starts)
    page.locator('#map-fade-events').uncheck()
    cutoff = datetime(2011, 3, 11, tzinfo=timezone.utc)
    selected = [row for row in ROWS if 2010 <= row['year'] <= 2011 and date(row) is not None and date(row) <= cutoff]
    assert int(page.locator('#map').get_attribute('data-rendered-records')) == len(selected)
    page.locator('[name="map-mode"][value="period"]').check()
    assert page.locator('#map .event-pin.approximate').count() == 0
    page.locator('#map-group-country').check()
    page.click('#rank-none')
    assert page.locator('#map .event-mark').count() == 0
    page.click('#rank-all')
    page.set_viewport_size({'width': 390, 'height': 844})
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'country-grouped-mobile.png'), style='.masthead{visibility:hidden!important}')
    assert not errors, errors
    browser.close()
    print('PASS: all-country grouping, source-independent reported totals, missing values, proportional areas, record inspection, filters, cumulative replay, automatic timeline references, mobile layout.')
