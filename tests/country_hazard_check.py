"""Browser checks for the coordinated country–hazard views. Start the local server first."""
import os
import platform
from playwright.sync_api import sync_playwright


with sync_playwright() as playwright:
    chrome = os.environ.get('CHROME_PATH') or (
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        if platform.system() == 'Darwin' else None
    )
    browser = playwright.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page.goto('http://127.0.0.1:8000/index.html')
    page.wait_for_selector('body[data-ready="true"]')

    assert page.locator('#ch-network .ch-country-node').count() == 10
    assert page.locator('#ch-network .ch-hazard-node').count() == 8
    assert page.locator('#ch-matrix .ch-cell').count() == 80
    # Four of the top-three relationships lie outside the displayed top-eight
    # hazards: the USA's Tornado/Wildfire/Blizzard and Japan's Heatwave.
    assert page.locator('#ch-network .ch-edge:not(.ch-edge-hidden)').count() == 26
    assert 'Showing 10 of 220' in page.locator('#ch-subset-note').inner_text()
    assert 'all 34 hazard types' in page.locator('#ch-denominator-note').inner_text()

    # A matrix cell reveals its matching edge even when the top-three network limit hides it.
    hidden = page.locator('#ch-network .ch-edge-hidden').first
    iso = hidden.get_attribute('data-country')
    hazard = hidden.get_attribute('data-hazard')
    page.locator(f'#ch-matrix .ch-cell[data-country="{iso}"][data-hazard="{hazard}"]').hover()
    assert 'is-revealed' in hidden.get_attribute('class')

    # Persistent country selection is coordinated and limited to two comparison profiles.
    countries = page.locator('#ch-network .ch-country-node')
    first_iso = countries.nth(0).get_attribute('data-country')
    second_iso = countries.nth(1).get_attribute('data-country')
    countries.nth(0).click()
    countries.nth(1).click()
    assert page.locator('#ch-details .ch-compare-heading h3').count() == 2
    assert page.locator(f'#ch-matrix .ch-row-label[data-country="{first_iso}"]').get_attribute('class').find('is-country-active') >= 0
    assert page.locator(f'#ch-matrix .ch-row-label[data-country="{second_iso}"]').get_attribute('class').find('is-country-active') >= 0
    assert 'profile similarity' in page.locator('#ch-details').inner_text()

    page.locator('[name="ch-metric"][value="count"]').check()
    assert 'Record count' in page.locator('#ch-matrix .ch-matrix-legend').text_content()
    page.select_option('#ch-order', 'similarity')
    assert 'average-linkage hierarchical clustering' in page.locator('#country-hazard .footnote').inner_text()

    page.click('#ch-poster-open')
    assert page.locator('#ch-poster-dialog').is_visible()
    assert page.locator('#ch-poster-svg').get_attribute('viewBox') == '0 0 1500 1050'
    assert 'Both views use the same underlying disaster records.' in page.locator('#ch-poster-svg').text_content()
    page.click('#ch-poster-close')

    # Narrow layouts stack the two views and do not widen the document.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(100)
    columns = page.locator('.ch-view-grid').evaluate('(node) => getComputedStyle(node).gridTemplateColumns')
    assert len(columns.split()) == 1
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')

    browser.close()
