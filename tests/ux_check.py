"""UX acceptance tests; use --capture-previews to refresh genuine About screenshots."""
from pathlib import Path
import json
import os
import platform
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)
ROWS = json.loads((ROOT / 'data/processed/disasters.json').read_text())['records']


def other_views(page):
    return page.evaluate('''() => Object.fromEntries(['timeline','ranking','seasonal','streamgraph','treemap','stats'].map(id => [id, document.getElementById(id).innerHTML]))''')


def map_snapshot(page):
    return page.locator('#map').inner_html()


def crumb(page):
    return page.locator('#tree-breadcrumb [aria-current]').inner_text()


def select_radio(page, name, value):
    page.locator(f'input[name="{name}"][value="{value}"]').check()


with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else 'C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, reduced_motion='reduce')
    page.set_default_timeout(15000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8000/index.html')
    page.wait_for_selector('body[data-ready="true"]')
    page.wait_for_timeout(100)

    if '--capture-previews' in sys.argv:
        folder = ROOT / 'docs/previews'
        folder.mkdir(exist_ok=True)
        for target, filename in [('#geography', 'choropleth'), ('#history', 'timeline'), ('#comparison', 'ranking')]:
            page.locator(target).screenshot(path=str(folder / f'{filename}.png'))

    # Historical selection changes only its associated views, never map DOM or range.
    initial_map = map_snapshot(page)
    page.select_option('#end-year', '2004')
    assert map_snapshot(page) == initial_map
    assert page.input_value('#map-start-year') == '2000'
    assert page.input_value('#map-end-year') == '2026'
    assert '2000–2004' in page.locator('#season-note').inner_text()
    assert '2000–2004' in page.locator('#ranking-note').inner_text()
    assert '2000–2004' in page.locator('#tree-note').inner_text()

    # Map local controls do not redraw or change any of the other charts.
    previous = other_views(page)
    page.select_option('#map-start-year', '2010')
    page.select_option('#map-end-year', '2015')
    assert other_views(page) == previous
    select_radio(page, 'map-mode', 'timeline')
    assert page.locator('#map-year').get_attribute('min') == '2010'
    assert page.locator('#map-year').get_attribute('max') == '2015'
    assert page.input_value('#map-year') == '2010'
    page.click('#map-next')
    assert page.input_value('#map-year') == '2011'
    assert other_views(page) == previous

    # Native radios support arrow-key selection and change only their own chart.
    select_radio(page, 'map-mode', 'period')
    fixed_map = map_snapshot(page)
    page.locator('[name="aggregation"][value="yearly"]').focus()
    page.keyboard.press('ArrowRight')
    assert page.locator('[name="aggregation"][value="monthly"]').is_checked()
    assert page.locator('.timeline-dot').count() == 60
    assert map_snapshot(page) == fixed_map
    assert page.locator('#playback').is_hidden()
    page.locator('[name="map-mode"][value="period"]').focus()
    page.keyboard.press('ArrowRight')
    assert page.locator('[name="map-mode"][value="timeline"]').is_checked()
    assert page.locator('#playback').is_visible()

    # Historical controls and aggregation do not stop or reset active playback.
    page.select_option('#map-speed', '1200')
    page.click('#map-play')
    year_before = int(page.input_value('#map-year'))
    page.select_option('#start-year', '2001')
    page.select_option('#end-year', '2003')
    select_radio(page, 'aggregation', 'yearly')
    assert page.locator('#map-play').inner_text() == 'Pause'
    assert page.input_value('#map-start-year') == '2010' and page.input_value('#map-end-year') == '2015'
    page.wait_for_function('(before) => +document.querySelector("#map-year").value > before', arg=year_before)
    assert page.input_value('#start-year') == '2001' and page.input_value('#end-year') == '2003'
    page.click('#map-play')
    select_radio(page, 'map-mode', 'period')
    paused_map = map_snapshot(page)
    page.click('#all-years')
    assert map_snapshot(page) == paused_map

    # Map range crossing clamps only map years; a one-year range terminates cleanly.
    previous = other_views(page)
    page.select_option('#map-start-year', '2020')
    assert page.input_value('#map-end-year') == '2020'
    assert other_views(page) == previous
    select_radio(page, 'map-mode', 'timeline')
    page.select_option('#map-speed', '350')
    page.click('#map-play')
    page.wait_for_function('document.querySelector("#map-play").textContent === "Play"')
    assert page.input_value('#map-year') == '2020'
    assert page.input_value('#start-year') == '2000' and page.input_value('#end-year') == '2026'

    # Treemap navigates locally through all levels; breadcrumbs and Back preserve filters.
    page.click('#reset')
    page.select_option('#end-year', '2004')
    page.select_option('#metric', 'deaths')
    page.select_option('#type', 'Flood')
    before = {k: v for k, v in other_views(page).items() if k != 'treemap'}
    assert crumb(page) == 'World' and page.locator('#tree-back').is_disabled()
    page.get_by_role('button', name='Open Asia in treemap', exact=True).click()
    assert crumb(page) == 'Asia'
    assert page.input_value('#region') == '' and page.input_value('#country') == ''
    country = page.locator('.tree-cell[data-depth="2"][data-iso="CHN"]')
    country.focus()
    page.keyboard.press('Enter')
    assert crumb(page) == 'China'
    assert page.locator('#tree-breadcrumb li').count() == 3
    total = page.locator('.tree-cell[data-depth="3"]').evaluate_all('(nodes) => nodes.reduce((s,n) => s + +n.dataset.value,0)')
    assert total == sum(r['iso'] == 'CHN' and r['type'] == 'Flood' and 2000 <= r['year'] <= 2004 for r in ROWS)
    assert before == {k: v for k, v in other_views(page).items() if k != 'treemap'}
    page.locator('#tree-breadcrumb').get_by_role('button', name='Asia', exact=True).click()
    assert crumb(page) == 'Asia'
    country.focus()
    page.keyboard.press('Enter')
    page.click('#tree-back')
    assert crumb(page) == 'Asia'
    page.click('#tree-back')
    assert crumb(page) == 'World'
    page.get_by_role('button', name='Open Asia in treemap', exact=True).click()
    country.focus()
    page.keyboard.press('Enter')
    page.locator('#tree-breadcrumb').get_by_role('button', name='World', exact=True).click()
    assert crumb(page) == 'World'
    assert page.input_value('#metric') == 'deaths' and page.input_value('#type') == 'Flood'
    assert page.input_value('#end-year') == '2004'

    # Reset to World preserves global geography even when local navigation is empty.
    page.select_option('#region', 'Asia')
    page.select_option('#country', 'CHN')
    page.get_by_role('button', name='Open Europe in treemap', exact=True).click()
    assert 'No records' in page.locator('#treemap').text_content()
    page.click('#tree-world')
    assert crumb(page) == 'World'
    assert page.input_value('#region') == 'Asia' and page.input_value('#country') == 'CHN'
    assert page.input_value('#type') == 'Flood' and page.input_value('#metric') == 'deaths'
    page.click('#reset')
    assert crumb(page) == 'World'
    assert page.input_value('#map-start-year') == page.input_value('#start-year') == '2000'

    # Ordinary page links support history and the About page uses real previews.
    page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='About the data').click()
    page.wait_for_url('**/about.html')
    assert page.title() == 'About the Data — Global Disaster Risk Explorer'
    for title in ['Dataset','Visualizations','Interaction and Animation Plan','Evaluation Plan']:
        assert page.get_by_role('heading', name=title, exact=True).is_visible()
    assert page.locator('.preview-grid img').count() == 3
    assert page.locator('.preview-grid img').evaluate_all('(imgs) => imgs.every(img => img.complete && img.naturalWidth > 300)')
    assert '10,896' in page.locator('#dataset').inner_text()
    assert '9,001' in page.locator('#dataset').inner_text()
    assert 'no participant results are claimed' in page.locator('#evaluation').inner_text()
    page.screenshot(path=str(ARTIFACTS / 'about-desktop.png'), full_page=True)
    page.go_back()
    page.wait_for_selector('body[data-ready="true"]')
    page.go_forward()
    page.wait_for_url('**/about.html')
    page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='Explorer', exact=True).click()
    page.wait_for_selector('body[data-ready="true"]')

    # Small-screen controls remain within the card and never cover map/zoom controls.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(200)
    select_radio(page, 'map-mode', 'timeline')
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    toolbar = page.locator('.map-toolbar').bounding_box()
    map_box = page.locator('#map').bounding_box()
    playback = page.locator('#playback').bounding_box()
    radios = page.locator('#map-mode').bounding_box()
    years = page.locator('.map-years').bounding_box()
    assert radios['y'] + radios['height'] <= years['y'] + 1
    assert radios['x'] + radios['width'] <= toolbar['x'] + toolbar['width']
    assert toolbar['y'] + toolbar['height'] <= map_box['y'] + 1
    assert map_box['y'] + map_box['height'] <= playback['y'] + 1
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'map-controls-mobile.png'))
    page.set_viewport_size({'width': 320, 'height': 740})
    page.select_option('#map-start-year', '2026')
    page.wait_for_timeout(200)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    controls = page.locator('#playback').bounding_box()
    year = page.locator('#map-current-year').bounding_box()
    assert year['x'] + year['width'] <= controls['x'] + controls['width']
    page.goto('http://127.0.0.1:8000/about.html')
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.screenshot(path=str(ARTIFACTS / 'about-mobile.png'), full_page=True)
    assert not errors, errors
    browser.close()
    print('PASS: independent clocks and redraws, playback continuity, native radio keyboard access, local treemap breadcrumbs/back/reset and preserved filters, About content/previews/history, mobile layout, no JS errors.')
