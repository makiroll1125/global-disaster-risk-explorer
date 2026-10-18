"""Event overview and source-backed comparisons. Serve the project on :8000."""
from pathlib import Path
import json
import os
import platform
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROWS = json.loads((ROOT / 'data/processed/disasters.json').read_text(encoding='utf-8'))['records']
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)

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
    assert not page.locator('#map-approximate').is_checked()
    assert page.locator('#rank-grouped').get_attribute('aria-pressed') == 'true'
    assert page.locator('#map').get_attribute('data-selected-records') == '1864'
    assert page.locator('.map-analysis-tools').is_visible()
    assert len(set(page.locator('#map .country').evaluate_all('(nodes) => nodes.map(n => n.getAttribute("fill"))'))) == 1
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'country-overview.png'))

    # The second mode defaults to source coordinates only. Country totals never
    # inherit that coordinate-completeness filter.
    assert page.locator('.event-pin.located').count() == 1864
    assert page.locator('.event-pin.approximate').count() == 0
    assert set(page.locator('.event-pin').evaluate_all('(nodes) => nodes.map(n => n.getAttribute("fill"))')) == {'#167c75'}
    assert page.locator('.event-cluster').count() == 0
    assert page.locator('.event-cluster path').count() == 0
    page.locator('#map-approximate').check()
    assert page.locator('.event-pin.approximate').count() > 0
    page.locator('#map-approximate').uncheck()
    assert page.locator('#map').get_attribute('data-selected-records') == '1864'

    # The opening comparison must match source sums, including coverage and units.
    assert page.locator('main > section.panel').first.get_attribute('id') == 'period-comparison'
    for metric in ['records', 'deaths', 'affected', 'damage_adjusted_usd']:
        totals = []
        for start, end in [(2000, 2005), (2020, 2025)]:
            selected = [row for row in ROWS if start <= row['year'] <= end]
            totals.append(len(selected) if metric == 'records' else sum(row[metric] for row in selected if row[metric] is not None))
        expected = f'{100 * (totals[1] / totals[0] - 1):+.1f}%'
        card = page.locator(f'#period-overview [data-metric="{metric}"]')
        assert card.locator('strong').inner_text().replace(chr(0x2212), '-') == expected, (metric, card.inner_text(), expected)
        assert 'annual averages' in card.locator('svg').get_attribute('aria-label')
        assert card.locator('rect').count() == 2
    overview_before_country = page.locator('#period-overview').inner_text()

    # Same color domain for both periods; verify against independent Python sums.
    ranges = {key: (int(page.input_value(f'#period-{key}-start')), int(page.input_value(f'#period-{key}-end'))) for key in ['a', 'b']}
    assert ranges == {'a': (2000, 2005), 'b': (2020, 2025)}
    maxima = []
    for start, end in ranges.values():
        counts = {}
        for row in ROWS:
            if start <= row['year'] <= end:
                counts[row['iso']] = counts.get(row['iso'], 0) + 1
        maxima.append(max(counts.values()) / (end - start + 1))
    for key in ['a', 'b']:
        assert float(page.locator(f'#period-map-{key}').get_attribute('data-scale-max')) == max(maxima)

    # Native SVG focus outlines must stay hidden while a country is pressed,
    # both before and after selection, on either comparison map.
    for key in ['a', 'b']:
        country = page.locator(f'#period-map-{key} .period-country[data-iso="IND"]')
        country.scroll_into_view_if_needed()
        point = country.evaluate('''el => {
            const box = el.getBBox();
            const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2)
                .matrixTransform(el.getScreenCTM());
            return {x: point.x, y: point.y};
        }''')
        for _ in range(2):
            page.mouse.move(point['x'], point['y'])
            page.mouse.down()
            assert country.evaluate('el => el === document.activeElement')
            assert country.evaluate('el => getComputedStyle(el).outlineStyle') == 'none'
            page.wait_for_timeout(150)
            assert country.evaluate('el => getComputedStyle(el).outlineStyle') == 'none'
            page.mouse.up()
    page.click('#period-zoom-in')
    transforms = [page.locator(f'#period-map-{key}>g').get_attribute('transform') for key in ['a', 'b']]
    assert transforms[0] == transforms[1] and '1.4' in transforms[0]
    page.locator('#period-map-b').scroll_into_view_if_needed()
    box = page.locator('#period-map-b').bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] / 2 + 40, box['y'] + box['height'] / 2 + 10, steps=4)
    page.mouse.up()
    assert page.locator('#period-map-a>g').get_attribute('transform') == page.locator('#period-map-b>g').get_attribute('transform')
    page.click('#period-zoom-reset')
    page.keyboard.press('Tab')
    page.locator('#period-map-a .period-country[data-iso="IND"]').focus()
    assert page.locator('#period-map-a .period-country[data-iso="IND"]').evaluate(
        'el => getComputedStyle(el).strokeWidth') == '2.4px'
    page.keyboard.press('Enter')
    assert page.input_value('#period-country') == 'IND'
    page.locator('#period-map-b .period-country[data-iso="JPN"]').focus()
    page.keyboard.press('Enter')
    assert page.input_value('#period-country') == 'JPN'
    # Countries without polygons still have complete record-based detail access.
    page.select_option('#period-country', 'GUM')
    expected = sum(row['iso'] == 'GUM' and 2000 <= row['year'] <= 2005 for row in ROWS) / 6
    assert page.locator('#period-impact-body tr[data-metric="records"] td').first.inner_text() == f'{expected:,.1f}'
    page.select_option('#period-country', 'JPN')
    assert page.locator('#period-overview').inner_text() == overview_before_country
    for key in ['a', 'b']:
        assert page.locator(f'#period-map-{key} .period-country[data-iso="JPN"]').get_attribute('aria-pressed') == 'true'
    for metric in ['records', 'deaths', 'affected', 'damage_adjusted_usd']:
        tr = page.locator(f'#period-impact-body tr[data-metric="{metric}"]')
        for index, key in enumerate(['a', 'b']):
            start, end = ranges[key]
            rows = [row for row in ROWS if row['iso'] == 'JPN' and start <= row['year'] <= end]
            value = len(rows) if metric == 'records' else sum(row[metric] for row in rows if row[metric] is not None)
            expected = f'{value / (end - start + 1):,.1f}'
            assert expected in tr.locator('td').nth(index).inner_text(), (metric, key, expected)
    page.locator('#period-comparison').screenshot(path=str(ARTIFACTS / 'period-comparison-desktop.png'))

    # Annual average and total differ only by the selected calendar-year count.
    page.select_option('#period-basis', 'total')
    expected = sum(row['iso'] == 'JPN' and 2000 <= row['year'] <= 2005 for row in ROWS)
    assert page.locator('#period-impact-body tr[data-metric="records"] td').first.inner_text() == f'{expected:,}'
    page.click('#period-swap')
    assert page.input_value('#period-a-start') == '2020'
    assert page.input_value('#period-b-start') == '2000'
    assert '2020–2025' in page.locator('#period-impact-note').inner_text()

    # No adjusted damage in partial 2026: hatch unknowns, never infer zero or a decline.
    page.select_option('#period-metric', 'damage_adjusted_usd')
    page.select_option('#period-b-start', '2026')
    assert page.input_value('#period-b-end') == '2026'
    assert '2026 is partial' in page.locator('#period-status').inner_text()
    fills = page.locator('#period-map-b .period-country').evaluate_all('(nodes) => nodes.map(n => n.getAttribute("fill"))')
    assert any(fill.startswith('url(') for fill in fills)
    assert 'Not reported' in page.locator('#period-impact-body tr[data-metric="damage_adjusted_usd"]').inner_text()

    page.click('#rank-none')
    assert 'No reported country values' in page.locator('#period-legend').inner_text()
    assert page.locator('#period-legend .legend-ramp').count() == 0

    # Empty filters clear prior data and retain usable controls.
    assert 'No matching records' in page.locator('#period-status').inner_text()
    assert page.locator('#period-overview strong').all_text_contents() == ['Not comparable'] * 4
    assert 'No records in either' in page.locator('#period-composition').inner_text()
    assert 'No regions match' in page.locator('#period-region-body').inner_text()
    page.click('#rank-all')
    assert page.locator('#ch-network .ch-edge').count() > 0
    assert page.locator('#ch-matrix .ch-cell').count() > 0
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(300)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    left, right = [page.locator(f'#period-map-{key}').bounding_box() for key in ['a', 'b']]
    assert right['y'] > left['y'] + left['height']
    page.locator('#period-comparison').screenshot(path=str(ARTIFACTS / 'period-comparison-mobile.png'))
    assert not errors, errors
    browser.close()
    print('PASS: event-only defaults, coordinate precision, single-color markers/groups, shared map scale and zoom, source-backed period impacts, partial-year/unknown/empty states, network/matrix retained, mobile layout.')
