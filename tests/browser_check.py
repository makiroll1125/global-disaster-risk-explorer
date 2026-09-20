"""Integration checks against the real processed dataset. Start the local server first."""
from pathlib import Path
import json
import os
import platform
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROWS = json.loads((ROOT / 'data/processed/disasters.json').read_text(encoding='utf-8'))['records']
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)


def count(page, expected):
    actual = page.locator('.stat-value').first.get_attribute('title')
    assert actual == f'{expected:,}', (actual, expected)


with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else 'C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
    page.set_default_timeout(15000)
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
    page.screenshot(path=str(ARTIFACTS / 'prototype-desktop.png'), full_page=True)

    # Exact totals across impact modes must agree with the Python source records.
    for metric, stat_index in [('deaths', 1), ('affected', 2), ('damage_adjusted_usd', 3)]:
        page.select_option('#metric', metric)
        expected = sum(r[metric] for r in ROWS if r[metric] is not None)
        actual = page.locator('.stat-value').nth(stat_index).get_attribute('title')
        assert actual == f'{int(expected):,}', (metric, actual, expected)

    # Keyboard activation of a map polygon coordinates country, timeline and totals.
    page.locator('#map [data-iso="USA"]').focus()
    page.keyboard.press('Enter')
    assert page.input_value('#country') == 'USA'
    count(page, sum(r['iso'] == 'USA' for r in ROWS))
    assert 'United States' in page.locator('#timeline-note').inner_text()
    assert page.locator('#map [data-iso="USA"]').get_attribute('aria-pressed') == 'true'
    page.click('#rank-type')
    page.locator('.rank-row').first.click()
    hazard = page.input_value('#type')
    assert hazard
    count(page, sum(r['iso'] == 'USA' and r['type'] == hazard for r in ROWS))
    page.select_option('#start-year', '2010')
    page.select_option('#end-year', '2020')
    count(page, sum(r['iso'] == 'USA' and r['type'] == hazard and 2010 <= r['year'] <= 2020 for r in ROWS))

    # Selected detail domain, contextual composition, and precise monthly averages.
    page.click('#reset')
    page.select_option('#region', 'Asia')
    page.click('#rank-type')
    ranking_before = page.locator('.rank-row').evaluate_all('(nodes) => nodes.map(n => [n.__data__.key, n.querySelector(".bar").getAttribute("width")])')
    flood = page.locator('.rank-row[aria-label^="Flood:"]')
    flood.click()
    assert page.input_value('#type') == 'Flood'
    ranking_after = page.locator('.rank-row').evaluate_all('(nodes) => nodes.map(n => [n.__data__.key, n.querySelector(".bar").getAttribute("width")])')
    assert ranking_before == ranking_after
    assert page.locator('.muted-type').count() > 0
    assert page.locator('.muted-type .bar').first.evaluate('(n) => getComputedStyle(n).opacity') == '0.3'
    page.select_option('#end-year', '2004')
    subset = [r for r in ROWS if r['region'] == 'Asia' and r['type'] == 'Flood' and 2000 <= r['year'] <= 2004]
    count(page, len(subset))
    points = page.locator('.timeline-dot').evaluate_all('(nodes) => nodes.map(n => ({year:n.__data__.year, value:n.__data__.value, x:+n.getAttribute("cx")}))')
    assert [p['year'] for p in points] == list(range(2000, 2005))
    assert sum(p['value'] for p in points) == len(subset)
    assert points[0]['x'] == 60
    chart_width = page.locator('#timeline').evaluate('(n) => n.viewBox.baseVal.width')
    assert points[-1]['x'] == chart_width - 20
    assert page.locator('#streamgraph').get_attribute('data-end') == '2026'
    assert page.locator('#stream-legend button').count() == 14
    assert page.locator('#tree-legend .region-legend-item').count() == 5
    assert page.locator('.stream-layer').count() == 14
    tree_total = page.locator('.tree-cell[data-depth="3"]').evaluate_all('(nodes) => nodes.reduce((s,n) => s + +n.dataset.value, 0)')
    assert tree_total == len(subset)
    page.select_option('#aggregation', 'monthly')
    monthly = page.locator('.timeline-dot').evaluate_all('(nodes) => nodes.map(n => n.__data__.value)')
    known = [r for r in subset if r['start_month'] is not None]
    assert len(monthly) == 60 and sum(monthly) == len(known)
    season = page.locator('.season-bar').evaluate_all('(nodes) => nodes.map(n => n.__data__.value)')
    assert season == [sum(r['start_month'] == month for r in known) / 5 for month in range(1, 13)]

    # Map playback changes only the year slice and retains a fixed legend domain.
    page.select_option('#map-mode', 'timeline')
    page.wait_for_timeout(250)
    fixed_legend = page.locator('#legend .legend-labels').inner_text()
    china2000 = sum(r['iso'] == 'CHN' and r['year'] == 2000 for r in subset)
    assert f': {china2000}.' in page.locator('#map [data-iso="CHN"]').get_attribute('aria-label')
    before_color = page.locator('#map [data-iso="CHN"]').get_attribute('fill')
    page.click('#map-next')
    page.wait_for_timeout(250)
    assert page.input_value('#map-year') == '2001'
    assert page.locator('#legend .legend-labels').inner_text() == fixed_legend
    assert before_color != page.locator('#map [data-iso="CHN"]').get_attribute('fill')
    page.select_option('#map-speed', '350')
    page.click('#map-play')
    page.wait_for_function('document.querySelector("#map-year").value === "2004"')
    page.wait_for_function('document.querySelector("#map-play").textContent === "Play"')
    assert page.input_value('#start-year') == '2000' and page.input_value('#end-year') == '2004'
    count(page, len(subset))
    page.select_option('#map-mode', 'period')
    assert f': {sum(r["iso"] == "CHN" for r in subset)}.' in page.locator('#map [data-iso="CHN"]').get_attribute('aria-label')

    page.select_option('#map-mode', 'timeline')
    page.locator('#map-year').focus()
    page.keyboard.press('Home')
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowRight')
    assert page.input_value('#map-year') == '2002'
    page.click('#map-play')
    page.click('#map-play')
    paused_year = page.input_value('#map-year')
    page.wait_for_timeout(400)
    assert page.input_value('#map-year') == paused_year
    page.select_option('#map-mode', 'period')
    page.locator('#timeline').screenshot(path=str(ARTIFACTS / 'selected-monthly.png'))

    # Stream legend and layers synchronize selection; tooltip disappears on leave.
    page.get_by_role('button', name='Flood', exact=True).click()
    assert page.input_value('#type') == ''
    page.get_by_role('button', name='Flood', exact=True).hover()
    assert page.locator('.stream-layer[data-type="Flood"]').get_attribute('opacity') == '1'
    page.locator('.stream-layer[data-type="Flood"]').focus()
    page.keyboard.press('Enter')
    assert page.input_value('#type') == 'Flood'
    # Select a leaf to drill into its country, then toggle its type.
    china = page.locator('.tree-cell[data-depth="3"][data-iso="CHN"][data-type="Flood"]')
    china.focus()
    page.keyboard.press('Enter')
    assert page.input_value('#country') == 'CHN'
    count(page, sum(r['iso'] == 'CHN' for r in subset))
    china.focus()
    page.keyboard.press('Enter')
    assert page.input_value('#type') == ''
    page.wait_for_timeout(300)
    china.hover()
    assert page.locator('#tooltip').is_visible()
    page.locator('#tree-title').hover()
    assert page.locator('#tooltip').is_hidden()
    page.click('#tree-back')
    assert page.input_value('#country') == '' and page.input_value('#region') == ''
    page.click('#all-years')
    assert page.locator('#timeline').get_attribute('data-end') == '2026'
    page.select_option('#start-year', '2026')
    assert page.locator('.timeline-dot').count() == 9  # Oct–Dec are unavailable.
    assert page.locator('.season-bar').count() == 0
    page.click('#reset')
    page.select_option('#country', 'USA')
    page.select_option('#type', hazard)
    page.select_option('#start-year', '2010')
    page.select_option('#end-year', '2020')

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

    assert page.locator('#timeline').get_attribute('data-start') == str(start)
    assert page.locator('#timeline').get_attribute('data-end') == str(end)
    assert page.locator('.timeline-dot').count() == end - start + 1

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
    page.screenshot(path=str(ARTIFACTS / 'prototype-desktop.png'), full_page=True)

    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(250)
    page.screenshot(path=str(ARTIFACTS / 'prototype-mobile.png'), full_page=True)
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
    print('PASS: animated map/fixed scale/pause/slider, selected timeline domain, monthly and seasonal exact counts, stream selection/full context, treemap drill-down/totals/tooltip, ranking fading/stability, actual data totals, map and ranking selection, year filters, brush, CSV, missing values, empty state, historical geography, zoom/reset, mobile, offline assets and load errors.')
