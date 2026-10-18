"""Source-backed acceptance checks for the coordinated map exploration."""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import platform
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)
ROWS = json.loads((ROOT / 'data/processed/disasters.json').read_text(encoding='utf-8'))['records']


def selected(page):
    return int(page.locator('#map').get_attribute('data-selected-records'))


def represented(page):
    return page.locator('.event-cluster').evaluate_all('(nodes) => nodes.reduce((s,n) => s + +n.dataset.count,0)') + page.locator('.event-pin').count()


def date_value(row):
    try:
        return datetime(row['year'], int(row['start_month']), int(row['start_day']), tzinfo=timezone.utc).date().isoformat()
    except (ValueError, TypeError):
        return None


def apply_dates(page, start, end):
    page.locator('#map-selection-start').fill(start)
    page.locator('#map-selection-end').fill(end)
    page.click('#map-apply-dates')


def svg_point(page, selector, x, y):
    return page.locator(selector).evaluate('(n,p) => {const point = new DOMPoint(p[0],p[1]).matrixTransform(n.getScreenCTM());return [point.x,point.y]}', [x, y])


def drag(page, start, end):
    page.mouse.move(*start)
    page.mouse.down()
    page.mouse.move(*end, steps=8)
    page.mouse.up()


with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8000')
    page.wait_for_selector('body[data-ready="true"]')
    page.locator('[name="map-encoding"][value="events"]').check()
    page.locator('#map-approximate').check()
    page.locator('#map-clusters').check()
    assert selected(page) == len(ROWS)
    assert represented(page) == 10636
    assert page.locator('.event-cluster').count() > 20
    assert page.locator('.event-cluster').evaluate_all('(nodes) => nodes.every(n => n.__data__.members.every(d => d.exact === n.__data__.exact))')
    assert page.locator('.event-cluster.approximate').evaluate_all('(nodes) => nodes.every(n => new Set(n.__data__.members.map(d => d.row.iso)).size === 1)')
    before_count = represented(page)
    page.click('#zoom-in')
    assert represented(page) == before_count and selected(page) == len(ROWS)
    page.click('#zoom-reset')
    # A click without a drag must still target the marker, rather than its SVG.
    page.locator('.event-cluster.located').first.click()
    assert page.locator('#map-exploration').get_attribute('open') is not None
    assert 'Selected marker group' in page.locator('#map-list-context').inner_text()
    page.click('#map-reset-selection')
    page.locator('.event-cluster.located').first.focus()
    cluster_count = int(page.locator('.event-cluster.located').first.get_attribute('data-count'))
    page.keyboard.press('Enter')
    assert page.locator('#map-exploration').get_attribute('open') is not None
    assert page.locator('#map-record-page').inner_text().startswith(f'{cluster_count:,} records')
    record_id = page.locator('.event-record').first.get_attribute('data-id')
    page.locator('.event-record').first.click()
    assert record_id in page.locator('#map-event-detail').inner_text()
    assert 'Source coordinate:' in page.locator('#map-event-detail').inner_text()
    assert page.locator('.linked-event').count() > 0
    page.click('#map-list-all')
    assert page.locator('#map-record-page').inner_text().startswith('10,896 records')
    page.click('#map-record-next')
    assert '2 /' in page.locator('#map-record-page').inner_text()
    page.click('#map-reset-selection')
    unrelated = {key: page.locator('#' + key).inner_html() for key in ['timeline', 'ranking', 'stats', 'seasonal', 'streamgraph']}

    # Country/date selection intersects, including country references only when requested.
    page.select_option('#map-local-country', 'JPN')
    assert selected(page) == sum(r['iso'] == 'JPN' for r in ROWS)
    apply_dates(page, '2011-03-01', '2011-03-31')
    expected = [r for r in ROWS if r['iso'] == 'JPN' and date_value(r) and '2011-03-01' <= date_value(r) <= '2011-03-31']
    assert selected(page) == len(expected) == 1
    assert represented(page) == 1
    assert page.locator('#map-selection-stats .selection-stat').nth(1).locator('strong').get_attribute('title') == '1'
    assert 'Tsunami' in page.locator('#map-selection-composition').inner_text()
    page.locator('.event-record').first.click()
    assert '19,846' in page.locator('#map-event-detail').inner_text()
    page.locator('[name="map-mode"][value="timeline"]').check()
    assert page.input_value('#map-year') == '2011'
    assert page.locator('#map-current-date').inner_text() == '11 Mar 2011'
    page.select_option('#map-speed', '4000')
    page.click('#map-play')
    page.wait_for_function('document.querySelector("#map").dataset.selectedRecords === "1"')
    page.click('#map-play')
    assert 'Mar 2011' in page.locator('#map-current-date').inner_text()
    page.locator('[name="map-mode"][value="period"]').check()
    page.select_option('#map-size', 'deaths')
    pin = page.locator('.event-pin[data-id="2011-0082-JPN"]')
    radius = float(pin.get_attribute('r')) * pin.evaluate('(n) => n.getScreenCTM().a')
    expected_radius = 18 * (19846 / max(r['deaths'] or 0 for r in ROWS)) ** .5
    assert abs(radius - expected_radius) < .01
    page.click('#map-clear-dates')
    page.locator('#map-clusters').uncheck()
    pin = page.locator('.event-pin[data-id="2011-0082-JPN"]')
    assert abs(float(pin.get_attribute('r')) * pin.evaluate('(n) => n.getScreenCTM().a') - radius) < .01
    assert page.locator('.unknown-impact').count() > 0
    assert 'unreported' in page.locator('#map-size-legend').inner_text()
    # The full selection restores incomplete dates. Invalid intervals do not change it.
    full_japan = selected(page)
    apply_dates(page, '2012-01-01', '2011-01-01')
    assert selected(page) == full_japan
    assert 'ordered date interval' in page.locator('#map-selection-status').inner_text()
    page.click('#map-reset-selection')
    page.select_option('#map-size', 'equal')
    page.locator('#map-clusters').check()

    # Keyboard area bounds use real coordinates, never country reference positions.
    page.locator('.map-coordinate-inputs summary').click()
    for key, value in [('west', 125), ('east', 150), ('south', 25), ('north', 48)]:
        page.locator('#map-' + key).fill(str(value))
    page.click('#map-apply-area')
    expected_area = [r for r in ROWS if r['latitude'] is not None and 125 <= r['longitude'] <= 150 and 25 <= r['latitude'] <= 48]
    assert selected(page) == len(expected_area)
    assert page.locator('.event-cluster.approximate,.event-pin.approximate').count() == 0
    assert page.locator('.map-area-outline').is_visible()
    page.click('#zoom-in')
    assert selected(page) == len(expected_area)
    page.click('#zoom-reset')
    page.click('#map-reset-selection')

    # Draw an actual projected rectangle around a known source coordinate.
    points = page.locator('.event-cluster.located').evaluate_all('(nodes) => nodes.flatMap(n => n.__data__.members).map(d=>({id:d.row.id,point:d.point}))')
    points += page.locator('.event-mark').evaluate_all('(nodes) => nodes.map(n=>n.__data__).filter(d=>d.exact).map(d=>({id:d.row.id,point:d.point}))')
    target = next(d['point'] for d in points if d['id'] == '2011-0082-JPN')
    page.click('#map-area-tool')
    start = svg_point(page, '#map', target[0] - 10, target[1] - 10)
    end = svg_point(page, '#map', target[0] + 10, target[1] + 10)
    drag(page, start, end)
    box = page.locator('.map-area-outline').evaluate('(n) => {const b=n.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height}}')
    area_ids = {d['id'] for d in points if box['x'] <= d['point'][0] <= box['x'] + box['width'] and box['y'] <= d['point'][1] <= box['y'] + box['height']}
    assert selected(page) == len(area_ids) > 0, (selected(page), len(area_ids), page.locator('#map-selection-status').inner_text(), target, start, end)
    assert page.locator('#map-area-tool').get_attribute('aria-pressed') == 'false'
    assert page.locator('.event-cluster.approximate').count() == 0

    # Brush a time interval; date inputs and exact source-derived counts must agree.
    page.locator('#selection-timeline').scroll_into_view_if_needed()
    width = page.locator('#selection-timeline').evaluate('(n)=>n.viewBox.baseVal.width')
    lo = datetime(2000, 1, 1, tzinfo=timezone.utc).timestamp()
    hi = datetime(2026, 9, 15, tzinfo=timezone.utc).timestamp()
    def time_x(year):
        timestamp = datetime(year, 1, 1, tzinfo=timezone.utc).timestamp()
        return 15 + (width - 30) * (timestamp - lo) / (hi - lo)
    drag(page, svg_point(page, '#selection-timeline', time_x(2010), 40), svg_point(page, '#selection-timeline', time_x(2013), 40))
    start, end = page.input_value('#map-selection-start'), page.input_value('#map-selection-end')
    assert start != '2000-01-01' and end != '2026-09-15'
    expected = [r for r in ROWS if r['id'] in area_ids and date_value(r) and start <= date_value(r) <= end]
    assert selected(page) == len(expected)
    assert unrelated == {key: page.locator('#' + key).inner_html() for key in unrelated}
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'linked-map-brushes.png'))

    # Persistent details link source event identifiers, including out-of-selection countries.
    page.click('#map-reset-selection')
    page.locator('#map-record-search').fill('2004-0659')
    assert page.locator('.event-record').count() == 12
    page.locator('.event-record').first.click()
    assert page.locator('.related-records button').count() == 12
    assert '2004-0659' in page.locator('#map-event-detail').inner_text()
    assert page.locator('.linked-event').count() > 0
    page.locator('#map-exploration').screenshot(path=str(ARTIFACTS / 'cross-country-event-detail.png'))
    page.click('#map-reset-selection')
    page.select_option('#map-local-country', 'IDN')
    before_related = selected(page)
    page.locator('#map-record-search').fill('2004-0659')
    page.locator('.event-record').first.click()
    page.locator('.related-records button[data-id="2004-0659-MDV"]').click()
    assert 'outside the current map selection' in page.locator('#map-event-detail').inner_text()
    assert '2004-0659-MDV' in page.locator('#map-event-detail').inner_text()
    assert selected(page) == before_related
    page.click('#map-reset-selection')

    # Progressive disclosure and expanded/mobile controls preserve a usable viewport.
    page.click('#map-expand')
    page.wait_for_timeout(100)
    assert page.locator('#map-exploration').get_attribute('open') is None
    assert page.locator('#geography').bounding_box()['height'] <= 980
    page.keyboard.press('Escape')
    assert page.locator('#map-exploration').get_attribute('open') is not None
    for width, height in [(390, 844), (320, 740)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(200)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        page.select_option('#map-local-country', 'JPN')
        apply_dates(page, '2011-03-01', '2011-03-31')
        assert selected(page) == 1
        page.locator('.event-record').first.click()
        assert '2011-0082-JPN' in page.locator('#map-event-detail').inner_text()
        page.locator('#geography').screenshot(path=str(ARTIFACTS / f'exploration-mobile-{width}.png'))
    assert not errors, errors
    browser.close()
    print('PASS: lossless zoom clustering, location precision, group drill-down, local space/time intersection, real brush gestures, fixed impact sizing, unknown values, related event IDs, independent charts, expanded/mobile layouts.')
