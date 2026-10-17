"""Event-map acceptance checks. Run against the local server on port 8000."""
from datetime import datetime, timezone
from pathlib import Path
import os
import platform
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)


def day(value):
    return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp() / 86400)


def seek(page, date):
    page.locator('#map-day').fill(str(day(date)))


def choose(page, identifier, value):
    page.click('#' + identifier + '-menu-button')
    page.locator('#' + identifier + '-menu [data-value="' + value + '"]').click()


def hazards(page, types):
    page.click('#type-menu-button')
    page.locator('#type-menu').get_by_role('button', name='None', exact=True).click()
    for hazard in types:
        page.locator('#type-menu [data-value="' + hazard + '"] input').check()
    page.keyboard.press('Escape')


with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    assert page.goto('http://127.0.0.1:8000').status == 200
    page.wait_for_selector('body[data-ready="true"]')
    assert page.locator('.stat-value').first.get_attribute('title') == '10,896'
    assert page.locator('#type option.generated:not([disabled])').count() == 34
    assert page.locator('#type option[value="Sinkhole"]').evaluate('(n) => n.disabled')
    assert page.locator('#type option[value="Firestorm"]').evaluate('(n) => n.disabled')
    page.locator('#map-clusters').uncheck()
    assert page.locator('.event-pin.located').count() == 1864
    page.locator('#map-approximate').uncheck()
    assert page.locator('.event-pin.approximate').count() == 0
    assert page.locator('.event-pin.located').count() == 1864
    hazards(page, ['Tsunami'])
    assert page.locator('.stat-value').first.get_attribute('title') == '33'
    choose(page, 'country', 'JPN')
    page.select_option('#map-start-year', '2011')
    page.select_option('#map-end-year', '2011')
    page.locator('[name="map-mode"][value="timeline"]').check()
    assert page.locator('#event-replay').is_visible()
    seek(page, '2011-03-10')
    assert page.locator('.event-pin').count() == 0
    # Daily playback emits the source-located March 11 tsunami, in the timeline color.
    page.wait_for_timeout(300)
    other_views = page.locator('#timeline').inner_html()
    page.select_option('#map-speed', '4000')
    page.click('#map-play')
    page.wait_for_selector('.event-pulse')
    assert page.locator('.event-pin[data-id="2011-0082-JPN"]').count() == 1
    assert page.locator('.event-pulse').first.get_attribute('stroke') == '#1677c8'
    assert page.locator('.event-tick').first.get_attribute('fill') == '#1677c8'
    page.wait_for_timeout(450)
    pulse = page.locator('.event-pulse').first
    radius = pulse.evaluate('(node) => +node.getAttribute("r") * node.getScreenCTM().a')
    assert 25 <= radius <= 50, radius
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'event-map-pulse.png'))
    page.click('#map-play')
    assert page.locator('#timeline').inner_html() == other_views
    page.wait_for_timeout(1100)
    assert page.locator('.event-pulse').count() == 0
    # Previous/next advance precisely one day; scrub backwards removes future pins.
    seek(page, '2011-03-10')
    page.click('#map-next')
    assert page.locator('#map-current-date').inner_text() == '11 Mar 2011'
    assert page.locator('.event-pin').count() == 1
    page.click('#map-prev')
    assert page.locator('#map-current-date').inner_text() == '10 Mar 2011'
    assert page.locator('.event-pin').count() == 0
    seek(page, '2011-03-11')
    page.click('#zoom-in')
    pin = page.locator('.event-pin').first
    assert abs(pin.evaluate('(n) => +n.getAttribute("r") * n.getScreenCTM().a') - 3) < .1
    page.click('#zoom-reset')
    page.locator('#map-expand').click()
    page.wait_for_timeout(100)
    geo = page.locator('#geography').bounding_box()
    comparison = page.locator('#comparison').bounding_box()
    assert geo['width'] > 1400
    assert geo['height'] <= 980, geo
    assert geo['y'] <= 13, geo
    assert comparison['y'] >= geo['y'] + geo['height']
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.screenshot(path=str(ARTIFACTS / 'event-map-expanded.png'))
    page.keyboard.press('Escape')
    assert page.locator('#map-expand').get_attribute('aria-expanded') == 'false'
    assert page.locator('#map-current-date').inner_text() == '11 Mar 2011'
    # End-of-year rollover and the partial-year export cutoff are respected.
    page.select_option('#map-end-year', '2012')
    seek(page, '2011-12-31')
    page.click('#map-next')
    assert page.locator('#map-current-date').inner_text() == '01 Jan 2012'
    page.select_option('#map-start-year', '2026')
    assert page.locator('#map-day').get_attribute('max') == str(day('2026-09-15'))
    seek(page, '2026-09-15')
    assert page.locator('#map-next').is_disabled()
    # No Japanese tsunami starts in the explicitly selected 2026 range.
    assert page.locator('#map-play').is_disabled()
    assert 'No records match' in page.locator('#map-replay-status').inner_text()
    choose(page, 'country', '')
    hazards(page, ['Avalanche'])
    assert page.locator('.stat-value').first.get_attribute('title') == '56'
    # Mobile and narrow-screen expanded layout, including an open color key.
    for width, height in [(390, 844), (320, 740)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(200)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        page.click('#map-expand')
        page.locator('.hazard-key summary').click()
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert page.locator('#comparison').bounding_box()['y'] > page.locator('#geography').bounding_box()['y']
        page.locator('.hazard-key summary').click()
        page.screenshot(path=str(ARTIFACTS / f'event-map-mobile-{width}.png'))
        page.keyboard.press('Escape')
    # Reduced-motion users see static starts without animated rings.
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.emulate_media(reduced_motion='reduce')
    choose(page, 'country', 'JPN')
    hazards(page, ['Tsunami'])
    page.select_option('#map-start-year', '2011')
    page.select_option('#map-end-year', '2011')
    page.locator('#map-year').fill('2011')
    seek(page, '2011-03-10')
    page.click('#map-next')
    assert page.locator('.event-pin').count() == 1
    assert page.locator('.event-pulse').count() == 0
    assert not errors, errors
    browser.close()
    print('PASS: source coordinates, 34 hazards, dated replay, one-second colored pulses, zoom, independent charts, expansion, rollover/cutoff, mobile, reduced motion, no JS errors.')
