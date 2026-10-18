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

    assert page.locator('#ch-network .ch-country-node').count() == 6
    assert page.locator('#ch-network .ch-hazard-node').count() == 8
    assert page.locator('#ch-matrix .ch-cell').count() == 48
    assert '6 selected of 220' in page.locator('#ch-subset-note').inner_text()
    assert 'data-derived contrast default' in page.locator('#ch-selection-note').inner_text()
    assert page.locator('[name="ch-metric"]').count() == 0
    assert page.locator('#ch-edge-limit').input_value() == 'all'

    # Overview first: every positive matrix cell has one visible network edge.
    positive_cells = page.locator('#ch-matrix .ch-cell:not(.ch-zero-cell)').count()
    assert page.locator('#ch-network .ch-edge').count() == positive_cells
    assert page.locator('#ch-network .ch-edge-hidden').count() == 0
    assert 'Showing all' in page.locator('#ch-edge-note').inner_text()
    assert page.locator('#ch-network .ch-edge').evaluate_all(
        '(nodes) => nodes.every(node => getComputedStyle(node).strokeOpacity === "0.4")'
    )

    # Country hover emphasizes existing relationships without changing edge count.
    first_country = page.locator('#ch-network .ch-country-node').first
    first_iso = first_country.get_attribute('data-country')
    first_relationships = page.locator(
        f'#ch-matrix .ch-cell[data-country="{first_iso}"]:not(.ch-zero-cell)'
    ).count()
    first_country.hover()
    assert page.locator('#ch-network .ch-edge').count() == positive_cells
    assert page.locator(f'#ch-network .ch-edge.is-context[data-country="{first_iso}"]').count() == first_relationships
    assert page.locator('#ch-network .ch-edge.is-context').first.evaluate(
        '(node) => getComputedStyle(node).strokeOpacity'
    ) == '0.95'
    assert page.locator('#ch-network .ch-edge.is-muted').first.evaluate(
        '(node) => getComputedStyle(node).strokeOpacity'
    ) == '0.08'
    page.locator('#country-hazard-title').hover()
    assert page.locator('#ch-network .ch-edge').evaluate_all(
        '(nodes) => nodes.every(node => getComputedStyle(node).strokeOpacity === "0.4")'
    )

    # The two selectors are independent and render exactly 3, 8, 10, or all hazards.
    page.locator('#ch-hazard-selector summary').click()
    for expected in (3, 8, 10):
        page.click('#ch-hazard-clear')
        for index in range(expected):
            page.locator('#ch-hazard-options input').nth(index).check()
        assert page.locator('#ch-network .ch-hazard-node').count() == expected
        assert page.locator('#ch-matrix .ch-cell').count() == expected * 6
    page.click('#ch-hazard-all')
    all_hazards = page.locator('#ch-hazard-options input').count()
    assert page.locator('#ch-network .ch-hazard-node').count() == all_hazards
    assert page.locator('#ch-matrix .ch-cell').count() == all_hazards * 6

    # A rare type and a country outside the default can be selected without replacement.
    page.click('#ch-hazard-clear')
    page.fill('#ch-hazard-search', 'Volcanic')
    page.locator('#ch-hazard-options input').first.check()
    assert page.locator('#ch-network .ch-hazard-node').count() == 1
    page.locator('#ch-hazard-selector summary').click()
    page.locator('#ch-country-selector summary').click()
    country_options = page.locator('#ch-country-options input')
    outside_index = country_options.evaluate_all('(inputs) => inputs.findIndex(input => !input.checked)')
    # Keep the target stable when rendering replaces the now-checked input.
    country_options.nth(outside_index).check()
    assert '7 countries selected' in page.locator('#ch-country-summary').inner_text()
    page.select_option('#ch-order', 'alphabetical')
    assert '7 countries selected' in page.locator('#ch-country-summary').inner_text()
    page.locator('#ch-country-selector summary').click()
    page.click('#ch-reset')

    # Top 3 is explicit, reports omissions, and never changes the matrix.
    all_relationships = page.locator('#ch-network .ch-edge').count()
    positive_cells = page.locator('#ch-matrix .ch-cell:not(.ch-zero-cell)').count()
    page.select_option('#ch-edge-limit', '3')
    visible_relationships = page.locator('#ch-network .ch-edge:not(.ch-edge-hidden)').count()
    hidden_relationships = page.locator('#ch-network .ch-edge-hidden').count()
    assert visible_relationships + hidden_relationships == all_relationships == positive_cells
    assert f'Showing {visible_relationships} of {all_relationships}' in page.locator('#ch-edge-note').inner_text()
    assert 'matrix remains complete' in page.locator('#ch-edge-note').inner_text()

    # A hidden relationship can be inspected directly from its positive matrix cell.
    hidden = page.locator('#ch-network .ch-edge-hidden').first
    iso = hidden.get_attribute('data-country')
    hazard = hidden.get_attribute('data-hazard')
    # Highlighting raises the edge, so identify it independently of SVG order.
    hidden = page.locator(f'#ch-network .ch-edge[data-country="{iso}"][data-hazard="{hazard}"]')
    page.locator(f'#ch-matrix .ch-cell[data-country="{iso}"][data-hazard="{hazard}"]').hover()
    assert 'is-revealed' in hidden.get_attribute('class')
    assert page.locator('#ch-network .ch-edge.is-active').evaluate('(node) => getComputedStyle(node).strokeOpacity') == '1'
    assert page.locator('#ch-network .ch-edge.is-muted:not(.ch-edge-hidden)').first.evaluate('(node) => getComputedStyle(node).strokeOpacity') == '0.08'
    page.select_option('#ch-edge-limit', 'all')
    assert page.locator('#ch-network .ch-edge-hidden').count() == 0
    assert page.locator('#ch-network .ch-edge').count() == all_relationships

    # Persistent country selection is coordinated and limited to two comparison profiles.
    countries = page.locator('#ch-network .ch-country-node')
    first_iso = countries.nth(0).get_attribute('data-country')
    second_iso = countries.nth(1).get_attribute('data-country')
    countries.nth(0).click()
    countries.nth(1).hover()
    assert page.locator(f'#ch-network .ch-edge.is-context[data-country="{first_iso}"]').count() == 0
    assert page.locator(f'#ch-network .ch-edge.is-context[data-country="{second_iso}"]').count() > 0
    page.locator('#country-hazard-title').hover()
    assert page.locator(f'#ch-network .ch-edge.is-context[data-country="{first_iso}"]').count() > 0
    countries.nth(1).click()
    assert page.locator('#ch-details .ch-compare-heading h3').count() == 2
    assert page.locator(f'#ch-matrix .ch-row-label[data-country="{first_iso}"]').get_attribute('class').find('is-country-active') >= 0
    assert page.locator(f'#ch-matrix .ch-row-label[data-country="{second_iso}"]').get_attribute('class').find('is-country-active') >= 0
    assert 'profile similarity' in page.locator('#ch-details').inner_text()

    assert page.locator('#ch-matrix .ch-matrix-legend').text_content().find('record count') >= 0
    page.select_option('#ch-order', 'similarity')
    assert 'average-linkage hierarchical clustering' in page.locator('#country-hazard .footnote').inner_text()

    page.click('#ch-poster-open')
    assert page.locator('#ch-poster-dialog').is_visible()
    assert page.locator('#ch-poster-svg').get_attribute('viewBox').startswith('0 0 ')
    assert 'current explorer selection' in page.locator('#ch-poster-svg').text_content()
    assert 'exact matching record counts' in page.locator('#ch-poster-svg').text_content()
    assert page.locator('#ch-poster-svg path').count() == page.locator('#ch-matrix .ch-cell:not(.ch-zero-cell)').count()
    assert page.locator('#ch-poster-svg path').evaluate_all(
        '(nodes) => nodes.every(node => node.getAttribute("stroke-opacity") === "0.4")'
    )
    assert 'All ' in page.locator('#ch-poster-svg').text_content()
    assert 'positive-count relationships are shown' in page.locator('#ch-poster-svg').text_content()
    page.click('#ch-poster-close')

    page.select_option('#ch-edge-limit', '3')
    page.click('#ch-poster-open')
    assert 'TOP 3 CONNECTIONS PER COUNTRY' in page.locator('#ch-poster-svg').text_content()
    assert 'explicit network filter omits' in page.locator('#ch-poster-svg').text_content()
    assert page.locator('#ch-poster-svg path').count() < page.locator('#ch-matrix .ch-cell:not(.ch-zero-cell)').count()
    page.click('#ch-poster-close')

    # Narrow layouts stack the two views and do not widen the document.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(100)
    columns = page.locator('.ch-view-grid').evaluate('(node) => getComputedStyle(node).gridTemplateColumns')
    assert len(columns.split()) == 1
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')

    browser.close()
