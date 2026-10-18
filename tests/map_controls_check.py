"""Neutral/impact maps, multi-selection and sticky-filter scroll regression checks."""
from pathlib import Path
import os
import platform
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)


def mouse_click(page, locator):
    # A real viewport click avoids Playwright's own automatic scrolling of sticky controls.
    box = locator.bounding_box()
    page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)


def scroll_position(page):
    return page.evaluate('scrollY')


with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8000')
    page.wait_for_selector('body[data-ready="true"]')
    distances = page.evaluate('''async () => {
      const {hazardColors} = await import('/js/hazards.js');
      const distance = (a, b) => { a = d3.lab(hazardColors[a]); b = d3.lab(hazardColors[b]); return Math.hypot(a.l-b.l, a.a-b.a, a.b-b.b); };
      const floods = ['Flood', 'Riverine flood', 'Flash flood', 'Coastal flood'];
      return { heatFire: distance('Heatwave', 'Wildfire'), floods: floods.flatMap((a, i) => floods.slice(i+1).map(b => distance(a, b))) };
    }''')
    assert distances['heatFire'] > 45
    assert min(distances['floods']) > 30
    assert page.locator('[name="map-encoding"][value="choropleth"]').is_checked()
    assert page.locator('#rank-type').get_attribute('aria-pressed') == 'true'
    assert not page.locator('#map-clusters').is_checked()
    assert page.locator('.country').evaluate_all('(nodes) => new Set(nodes.map(n => n.getAttribute("fill"))).size') > 3
    assert page.locator('.map-footer').is_visible()
    assert page.locator('.event-layer').get_attribute('display') == 'none'
    page.locator('[name="map-encoding"][value="events"]').check()
    assert page.locator('.country').evaluate_all('(nodes) => new Set(nodes.map(n => n.getAttribute("fill"))).size') == 1
    assert page.locator('.event-pin').first.is_visible()

    country_height = page.locator('#ranking-scroll').evaluate('(n) => n.clientHeight')
    page.click('#rank-type')
    assert page.locator('#ranking-scroll').evaluate('(n) => n.clientHeight') == country_height
    assert page.locator('#ranking-scroll').evaluate('(n) => n.scrollHeight > n.clientHeight * 2')
    eq = page.locator('.rank-row[aria-label^="Earthquake:"]')
    eq.click()
    assert page.locator('.stat-value').first.get_attribute('title') == '10,222'
    assert eq.get_attribute('aria-pressed') == 'false'
    tsu = page.locator('.rank-row[aria-label^="Tsunami:"]')
    tsu.click()
    assert page.locator('.stat-value').first.get_attribute('title') == '10,189'
    eq.click()
    assert page.locator('.stat-value').first.get_attribute('title') == '10,863'
    page.click('#rank-all')
    tsu.click()
    assert page.locator('.stat-value').first.get_attribute('title') == '10,863'
    assert eq.get_attribute('aria-pressed') == 'true' and tsu.get_attribute('aria-pressed') == 'false'
    page.click('#rank-none')
    eq.focus()
    page.keyboard.press('Space')
    assert page.locator('.stat-value').first.get_attribute('title') == '674'
    page.keyboard.press('Space')
    assert page.locator('.stat-value').first.get_attribute('title') == '0'
    eq.click()
    assert page.locator('.stat-value').first.get_attribute('title') == '674'
    tsu = page.locator('.rank-row[aria-label^="Tsunami:"]')
    tsu.click()
    assert page.locator('.stat-value').first.get_attribute('title') == '707'
    assert page.locator('.event-pin').evaluate_all('(nodes) => nodes.every(n => ["Earthquake", "Tsunami"].includes(n.dataset.type))')
    assert page.locator('.rank-row').count() == 34
    assert page.locator('#type-menu-button').inner_text() == 'Earthquake + Tsunami'
    list_scroll = page.locator('#ranking-scroll').evaluate('(n) => n.scrollTop')
    assert list_scroll > 100
    tsu.click()
    assert page.locator('.stat-value').first.get_attribute('title') == '674'
    assert page.locator('#ranking-scroll').evaluate('(n) => n.scrollTop') == list_scroll
    page.click('#rank-none')
    assert page.locator('.event-pin').count() == 0
    assert page.locator('.stat-value').first.get_attribute('title') == '0'
    assert page.locator('.rank-row').count() == 34
    page.click('#rank-all')
    assert page.locator('.stat-value').first.get_attribute('title') == '10,896'
    heat = page.locator('.rank-row[aria-label^="Heatwave:"]')
    heat.hover()
    assert 'unusually hot weather' in page.locator('#tooltip').inner_text()
    heat.focus()
    assert page.locator('#tooltip').is_visible()
    assert not page.locator('.prototype').count()

    # The checkbox menu uses exactly the same exclusion behavior after All.
    page.click('#type-menu-button')
    page.locator('#type-menu').get_by_role('button', name='All', exact=True).click()
    menu_tsunami = page.locator('#type-menu [data-value="Tsunami"]')
    menu_tsunami.scroll_into_view_if_needed()
    menu_tsunami.hover()
    assert 'displacement of water' in page.locator('#tooltip').inner_text()
    menu_tsunami.locator('input').uncheck()
    assert page.locator('.stat-value').first.get_attribute('title') == '10,863'
    assert page.locator('#type-menu [data-value="Earthquake"] input').is_checked()
    menu_tsunami.locator('input').check()
    assert page.locator('.stat-value').first.get_attribute('title') == '10,896'
    page.keyboard.press('Escape')

    # Every sticky filter opens/closes at the reading position, far below its DOM origin.
    for identifier in ['metric', 'type', 'region', 'country']:
        page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight - 1400)')
        before = scroll_position(page)
        mouse_click(page, page.locator(f'#{identifier}-menu-button'))
        assert abs(scroll_position(page) - before) < 2, identifier
        assert page.locator(f'#{identifier}-menu').is_visible()
        page.keyboard.press('Escape')
        assert abs(scroll_position(page) - before) < 2, identifier

    # Select two checkbox hazards while reading another chart; neither page nor menu jumps.
    before = scroll_position(page)
    mouse_click(page, page.locator('#type-menu-button'))
    page.locator('#type-menu').get_by_role('button', name='None', exact=True).click()
    search = page.locator('#type-menu input[type="search"]')
    search.fill('tsunami')
    page.locator('#type-menu [data-value="Tsunami"] input').check()
    assert abs(scroll_position(page) - before) < 2
    search.fill('earthquake')
    page.locator('#type-menu [data-value="Earthquake"] input').check()
    assert page.locator('#type-menu').is_visible()
    assert page.locator('.stat-value').first.get_attribute('title') == '707'
    assert abs(scroll_position(page) - before) < 2
    page.keyboard.press('Escape')
    # Search and arrow/Enter selection work without native select focus scrolling.
    mouse_click(page, page.locator('#country-menu-button'))
    page.locator('#country-menu input[type="search"]').fill('Japan')
    page.keyboard.press('ArrowDown')
    page.keyboard.press('Enter')
    assert page.input_value('#country') == 'JPN'
    assert abs(scroll_position(page) - before) < 2
    page.click('#reset')
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'neutral-event-map.png'))
    page.click('#rank-type')
    page.locator('#comparison').screenshot(path=str(ARTIFACTS / 'scrollable-hazard-ranking.png'))

    # Popovers remain inside small viewports and work with the collapsed filter bar.
    for width, height in [(390, 844), (320, 740)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(200)
        if page.locator('#filter-toggle').get_attribute('aria-expanded') != 'true':
            page.click('#filter-toggle')
        page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight - 1200)')
        before = scroll_position(page)
        mouse_click(page, page.locator('#type-menu-button'))
        popup = page.locator('#type-menu').bounding_box()
        assert popup['x'] >= 0 and popup['x'] + popup['width'] <= width
        assert popup['y'] >= 0 and popup['y'] + popup['height'] <= height
        assert abs(scroll_position(page) - before) < 2
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        page.screenshot(path=str(ARTIFACTS / f'filter-menu-mobile-{width}.png'))
        page.keyboard.press('Escape')
    assert not errors, errors
    browser.close()
    print('PASS: neutral/choropleth views, bounded ranking, union filtering, none/all, scroll preservation, keyboard/search, mobile overlays, no JS errors.')
