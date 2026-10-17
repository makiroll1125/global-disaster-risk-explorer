"""Real-clock playback, complete event delivery, ephemeral markers and pan cost."""
from pathlib import Path
import os
import platform
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)

with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH') or ('C:/Program Files/Google/Chrome/Application/chrome.exe' if platform.system() == 'Windows' else '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if platform.system() == 'Darwin' else None)
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8000')
    page.wait_for_selector('body[data-ready="true"]')
    page.evaluate('''async () => {
      const {EventMap} = await import('/js/event-map.js');
      const {MapExplorer} = await import('/js/map-explorer.js');
      window.measurements = {};
      for (const [cls, keys] of [[EventMap, ['zoom', 'render', 'setData', 'drawTimeline']], [MapExplorer, ['renderRecords', 'renderDetail']]]) {
        for (const key of keys) {
          const original = cls.prototype[key];
          cls.prototype[key] = function(...args) {
            const before = performance.now();
            const result = original.apply(this, args);
            (measurements[key] ??= []).push(performance.now() - before);
            return result;
          };
        }
      }
    }''')

    page.click('#zoom-in')
    page.evaluate('window.measurements = {}')
    page.locator('#map').scroll_into_view_if_needed()
    box = page.locator('#map').bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] * .7
    for dx in [60, -60, 80, -80]:
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + dx, y + 20, steps=12)
        assert 'is-interacting' in (page.locator('#map').get_attribute('class') or '')
        page.mouse.up()
        assert 'is-interacting' not in (page.locator('#map').get_attribute('class') or '')
        assert page.locator('#tooltip').is_hidden()
    pan = page.evaluate('measurements')
    assert 4 <= len(pan['zoom']) <= 48
    assert not pan.get('render') and not pan.get('renderRecords') and not pan.get('renderDetail')
    assert page.locator('#map').get_attribute('data-rendered-records') == '10636'
    print(f'PAN: {len(pan["zoom"])} updates, mean {sum(pan["zoom"]) / len(pan["zoom"]):.3f} ms; no marker or explorer rebuilds.', flush=True)
    page.click('#zoom-reset')
    page.locator('[name="map-mode"][value="timeline"]').check()
    assert not page.locator('#map-skip-quiet').is_checked()

    # Clock accuracy is independent of event density and rendering frame count.
    for speed in [4000, 12000, 24000]:
        page.locator('#map-year').fill('2005')
        page.select_option('#map-speed', str(speed))
        page.evaluate('''() => {
          window.delivered = [];
          window.observer?.disconnect();
          window.observer = new MutationObserver(changes => {
            for (const change of changes) for (const node of change.addedNodes)
              if (node instanceof Element && node.matches('.event-pulse')) delivered.push({id: node.__data__.row.id, year: node.__data__.row.year});
          });
          observer.observe(document.querySelector('#map'), {childList: true, subtree: true});
          window.measurements = {};
          window.clockStart = performance.now();
          document.querySelector('#map-play').click();
        }''')
        page.wait_for_function('+document.querySelector("#map-current-year").textContent >= 2006', timeout=speed + 5000)
        elapsed = page.evaluate('performance.now() - clockStart')
        page.click('#map-play')
        assert speed * .85 <= elapsed <= speed * 1.4, (speed, elapsed)
        data = page.evaluate('''async () => {
          const {eventDay} = await import('/js/hazards.js');
          const {records} = await (await fetch('/data/processed/disasters.json')).json();
          const world = await (await fetch('/data/geo/countries-110m.json')).json();
          const ids = new Set(world.objects.countries.geometries.filter(f => f.properties.name !== 'Antarctica' && f.id !== undefined).map(f => f.id));
          const expected = records.filter(r => r.year === 2005 && eventDay(r) !== null && (r.latitude !== null || ids.has(r.map_id))).map(r => r.id).sort();
          return { expected, actual: delivered.filter(r => r.year === 2005).map(r => r.id).sort(), measurements };
        }''')
        assert data['actual'] == data['expected'], (speed, set(data['expected']) - set(data['actual']))
        assert not data['measurements'].get('setData') and not data['measurements'].get('drawTimeline')
        assert not data['measurements'].get('renderRecords') and not data['measurements'].get('renderDetail')
        print(f'CLOCK: {speed / 1000:g}s/year measured {elapsed / 1000:.2f}s; every placeable 2005 source start delivered.', flush=True)

    # Stress panning during late-range replay, with thousands of historical rows.
    page.locator('#map-year').fill('2020')
    page.select_option('#map-speed', '4000')
    page.click('#map-play')
    page.wait_for_timeout(1300)
    page.evaluate('window.measurements = {}')
    page.locator('#map').scroll_into_view_if_needed()
    box = page.locator('#map').bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] * .7
    for dx in [70, -70]:
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + dx, y + 20, steps=12)
        page.mouse.up()
    assert page.locator('#map-play').inner_text() == 'Pause'
    page.click('#map-play')
    stress = page.evaluate('measurements')
    assert not stress.get('setData') and not stress.get('drawTimeline')
    assert not stress.get('renderRecords') and not stress.get('renderDetail')
    print(f'REPLAY: {len(stress.get("render", []))} batched renders during pan; mean {sum(stress.get("render", [0])) / max(1, len(stress.get("render", []))):.2f} ms.', flush=True)

    # Fade remains a real-time lifetime, even while paused; historical records stay.
    page.evaluate('window.observer.disconnect()')
    history = page.locator('#map').get_attribute('data-selected-records')
    chart = page.locator('.event-tick').count()
    assert int(history) > 7000 and chart > 1000
    page.wait_for_timeout(2800)
    assert page.locator('.event-mark,.event-cluster,.event-pulse').count() == 0
    assert page.locator('#map').get_attribute('data-rendered-records') == '0'
    assert page.locator('#map').get_attribute('data-selected-records') == history
    assert page.locator('.event-tick').count() == chart
    page.locator('#map-exploration summary').first.click()
    assert page.locator('#map-record-page').inner_text().startswith(f'{int(history):,} records')
    assert page.locator('#map-selection-stats .selection-stat').first.locator('strong').get_attribute('title') == f'{int(history):,}'

    # Inspection still works after the transient markers disappear.
    page.locator('.event-record').first.click()
    assert 'Source record' in page.locator('#map-event-detail').inner_text()
    page.locator('#geography').screenshot(path=str(ARTIFACTS / 'playback-transient-history.png'))
    for width, height in [(390, 844), (320, 740)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(200)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    assert not errors, errors
    browser.close()
    print('PASS: year-based real-time speeds, complete dense-year delivery, no pan rebuilds, no per-frame data/histogram rebuilds, 2.5-second expiry, persistent history/inspection, mobile and no JS errors.')
