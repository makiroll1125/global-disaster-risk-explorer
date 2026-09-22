# Dashboard UX update

## Implemented behavior

- Map From/To years, playback year, mode, speed and playing flag live in `mapState`. The compact toolbar sits above the existing map viewport inside the map stage; a playback row appears below the viewport only in timeline mode. The legend is compact and zoom controls remain in their corner. No geographical area is covered by time controls.
- `historyState` independently stores the historical start/end years and yearly/monthly aggregation. The brush derives its selection from these years. Historical changes update the detail chart and its existing dependent summaries/rankings/seasonal/streamgraph/treemap views, while explicitly skipping `renderMap`. Map changes redraw only the map. Aggregation redraws only the historical chart. Shared category filters continue to update all relevant views.
- Native radio inputs replace both mode dropdowns; visible labels show both choices, selected labels use teal, and arrow keys work with a visible focus outline.
- `treeState` holds local region/country navigation. Region headers or geographical legend buttons open regions; countries open their type composition. Breadcrumb parents are clickable, Back moves one level, and Reset to World goes directly to the local overview. None of these changes global filters or either range. Global filters still constrain the treemap, so an incompatible local region can be empty; Reset to World restores the overview within global filters. Clicking a type within an open country retains the explicitly labeled shared type-selection interaction.
- `about.html` is a separate static page with the existing visual style and ordinary links. It covers the actual dataset, preprocessing, six implemented charts, current/planned interactions and a proposed 5–10-participant evaluation. Three genuine chart captures are bundled under `docs/previews/`; no mockups or new framework are used.

## Verified statistics and provenance

Read the original XLSX with the existing `read_export` function, and cross-check `data/processed/quality-report.json` and `disasters.json`:

| Statistic | Verified value |
|---|---:|
| Raw Excel rows / processed rows | 10,896 / 10,896 |
| Start-year coverage | 2000–2026 |
| Countries/territories | 220 |
| Natural disaster types | 14 |
| Event identifiers | 9,001 |
| Source regions | 5 |
| Valid start-month rows | 10,823 (99.33%) |
| Missing start-month rows | 73 |
| Post-export start-month rows | 1 |
| Rows in monthly aggregates | 10,822 |
| Rows without map polygons | 279 |
| Missing deaths / affected / adjusted damage | 3,070 / 2,076 / 7,590 |

The audit records zero duplicate removals, invalid start years, scope exclusions and invalid numeric impacts for this export. Damage uses 2025 USD. 2026 is partial; the reporting cutoff is 15 September 2026. No data or preprocessing outputs were changed in this UX update.

The evaluation tasks use the actual dataset. For example, China leads worldwide Flood record counts in 2000–2004 with 42 records, followed by India (33) and the United States (25), computed directly from processed rows. This is an evaluator check, not a claimed participant result.

## Files

Modified: `index.html`, `styles.css`, `js/app.js`, `js/charts.js`, `tests/browser_check.py`, `README.md`, `docs/data-methods.md`.

Created: `about.html`, `tests/ux_check.py`, `docs/ux-update.md`, `docs/previews/choropleth.png`, `docs/previews/timeline.png`, `docs/previews/ranking.png`.

## Verification

Run the server and then:

```sh
npm test
python -m unittest discover -s tests -p test_data.py
python tests/browser_check.py
python tests/ux_check.py
```

The new suite asserts map and non-map DOM isolation, independent 2010–2015 versus 2000–2004 ranges, continued playback across historical changes, native-radio keyboard interaction, range clamping, local country totals, repeated breadcrumbs/Back/World navigation, preserved global filters, empty navigation states, About content and preview loading, browser Back/Forward, and mobile overflow/control separation. The existing browser regression suite retains exact data totals, filters, fixed-scale playback, brush, CSV, tooltips, zoom, missing-data and mobile checks.

`python tests/ux_check.py --capture-previews` regenerates the About previews from the running app at the full default scope. Other screenshots remain in ignored `tests/artifacts/`.

## Remaining limits

Historical range endpoints and brushing select whole years, including in Monthly mode. Playback is yearly. About screenshots show a documented default snapshot; use their links for live exploration. Browser Back/Forward uses native page history; a fresh visit starts at default filters. The usability study is planned and has not been conducted. Existing missing-data and reporting limitations remain unchanged.

## Results

- Existing browser regression suite: **passed** with the new radio controls and local treemap expectations.
- New UX acceptance suite: **passed**, including playback continuity, DOM isolation between clocks, repeated navigation with global filters, page history, real preview loading and mobile control separation.
- JavaScript data tests: **5 passed**. Python data tests: **6 passed**.
- Desktop and mobile screenshots reviewed; the mobile toolbar now wraps its mode controls and year selectors into separate rows without overlap.
- No browser JavaScript errors in either suite. JavaScript syntax and whitespace checks passed.
