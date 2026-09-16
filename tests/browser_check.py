"""Integration checks against the real processed dataset. Start the local server first."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROWS = json.loads((ROOT / 'data/processed/disasters.json').read_text(encoding='utf-8'))['records']
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)


def count(page, expected):
    actual = page.locator('.stat-value').first.get_attribute('title')
    assert actual == f'{expected:,}', (actual, expected)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
    errors = []
    requests = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    page.goto('http://127.0.0.1:8000')
    page.wait_for_selector('body[data-ready="true"]')
    count(page, len(ROWS))
    assert page.locator('.country').count() == 176
    assert page.locator('#type option').count() == 15
    assert '279' in page.locator('#map-coverage').inner_text()
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.screenshot(path=str(ROOT / 'docs/prototype-desktop.png'), full_page=True)

    # Exact totals across impact modes must agree with the Python source records.
    for metric, stat_index in [('deaths', 1), ('affected', 2), ('damage_adjusted_usd', 3)]:
        page.select_option('#metric', metric)
        expected = sum(r[metric] for r in ROWS if r[metric] is not None)
        actual = page.locator('.stat-value').nth(stat_index).get_attribute('title')
        assert actual == f'{int(expected):,}', (metric, actual, expected)

    # Keyboard activation of a map polygon coordinates country, timeline and totals.
    page.locator('[data-iso="USA"]').focus()
    page.keyboard.press('Enter')
    assert page.input_value('#country') == 'USA'
    count(page, sum(r['iso'] == 'USA' for r in ROWS))
    assert 'United States' in page.locator('#timeline-note').inner_text()
    assert page.locator('[data-iso="USA"]').get_attribute('aria-pressed') == 'true'
    page.click('#rank-type')
    page.locator('.rank-row').first.click()
    hazard = page.input_value('#type')
    assert hazard
    count(page, sum(r['iso'] == 'USA' and r['type'] == hazard for r in ROWS))
    page.select_option('#start-year', '2010')
    page.select_option('#end-year', '2020')
    count(page, sum(r['iso'] == 'USA' and r['type'] == hazard and 2010 <= r['year'] <= 2020 for r in ROWS))

    # Download exactly the filtered subset, including proper header/escaping.
    page.locator('.record-details summary').click()
    with page.expect_download() as download_info:
        page.click('#download')
    download = download_info.value
    download.save_as(str(ARTIFACTS / download.suggested_filename))
    import csv
    with (ARTIFACTS / download.suggested_filename).open(encoding='utf-8') as f:
        exported = list(csv.DictReader(f))
    assert len(exported) == sum(r['iso'] == 'USA' and r['type'] == hazard and 2010 <= r['year'] <= 2020 for r in ROWS)

    # A mouse brush narrows years and updates all selected totals.
    page.click('#reset')
    page.locator('#brush').scroll_into_view_if_needed()
    box = page.locator('#brush .overlay').bounding_box()
    handle = page.locator('#brush .handle--e').bounding_box()
    page.mouse.move(handle['x'] + handle['width'] / 2, handle['y'] + handle['height'] / 2)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] * .63, box['y'] + box['height'] / 2, steps=15)
    page.mouse.up()
    handle = page.locator('#brush .handle--w').bounding_box()
    page.mouse.move(handle['x'] + handle['width'] / 2, handle['y'] + handle['height'] / 2)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] * .23, box['y'] + box['height'] / 2, steps=15)
    page.mouse.up()
    start, end = int(page.input_value('#start-year')), int(page.input_value('#end-year'))
    assert 2000 < start <= end < 2026, (start, end)
    count(page, sum(start <= r['year'] <= end for r in ROWS))

    # The unknown current-year damage must not become zero.
    page.select_option('#metric', 'damage_adjusted_usd')
    page.select_option('#start-year', '2026')
    assert page.locator('.stat-value').nth(3).get_attribute('title') == 'Not reported'
    assert page.locator('.country[fill="url(#unknown-pattern)"]').count() > 0
    assert 'No reported values' in page.locator('#legend').inner_text()
    assert 'missing number' in page.locator('#insight-title').inner_text()
    count(page, 160)

    # Unmapped historical countries remain selectable and in chart calculations.
    page.click('#reset')
    page.select_option('#country', 'SCG')
    count(page, sum(r['iso'] == 'SCG' for r in ROWS))
    page.select_option('#region', 'Oceania')
    assert page.input_value('#country') == ''
    count(page, sum(r['region'] == 'Oceania' for r in ROWS))
    page.select_option('#type', 'Impact')
    count(page, 0)
    assert 'No records' in page.locator('#insight-title').inner_text()

    # Zoom buttons work independently; reset restores the initial map and filters.
    page.click('#zoom-in')
    assert page.locator('#map > g').get_attribute('transform') != 'translate(0,0) scale(1)'
    page.click('#reset')
    count(page, len(ROWS))
    assert page.locator('#map > g').get_attribute('transform') == 'translate(0,0) scale(1)'
    page.locator('.record-details summary').click()
    page.screenshot(path=str(ROOT / 'docs/prototype-desktop.png'), full_page=True)

    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(250)
    page.screenshot(path=str(ROOT / 'docs/prototype-mobile.png'), full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.select_option('#country', 'JPN')
    count(page, sum(r['iso'] == 'JPN' for r in ROWS))
    assert not errors, errors
    assert all(url.startswith('http://127.0.0.1:8000') or url.startswith('data:') for url in requests), requests

    # Missing data produces an actionable error rather than silently loading sample data.
    missing = browser.new_page()
    missing.route('**/data/processed/disasters.json', lambda route: route.fulfill(status=404, body='Missing'))
    missing.goto('http://127.0.0.1:8000')
    missing.wait_for_selector('#error', state='visible')
    assert missing.locator('.stat').count() == 0
    browser.close()
    print('PASS: actual data totals, map and ranking selection, year filters, brush, CSV, missing values, empty state, historical geography, zoom/reset, mobile, offline assets and load errors.')
