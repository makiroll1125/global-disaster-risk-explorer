# Global Disaster Risk Explorer

An interactive D3.js dashboard for exploring the occurrence and reported impacts of natural disasters. Built for the data visualization class project by Tobias Garcia and Ha Nguyen.

## Run locally

From this folder:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open **http://127.0.0.1:8000**. Stop the server with Ctrl+C. A local HTTP server is needed to load the data; opening `index.html` directly will not work. No npm installation or build step is required, and all runtime libraries and data are bundled locally.

## Explore

- The main map shows **Event locations** using source coordinates. **Show approximate country references** is off by default; hollow references identify countries, not event locations.
- **Color by disaster type** defaults off. **Fade event locations (animated timeline)** defaults on. Both sit beside the reference toggle; uncheck fading to retain animated locations for inspection.
- The sidebar opens on **Disaster types (grouped)**: 12 mutually exclusive hazard families. **Disaster types (expanded)** retains all 34 categories. A group toggles all member types; a mixed checkbox indicates partial selection. Optional map colors follow the active tab.
- Use **Animated timeline** to replay reported start dates. Playback speeds are 4, 12 or 24 seconds per year. Fading removes markers after 2.5 seconds when enabled; data remain in the timeline and record list.
- Overlap grouping has been removed. Hovered points have a black circular boundary and move above other points. **Marker size** compares individual reported impacts; diamonds indicate zero and crosses indicate unreported values.
- **Explore this selection** provides local country/area/date filters, record search, impact summaries and persistent source details. Area selection uses source coordinates only.
- **Compare two periods** has local settings for event totals, reported deaths, affected populations and adjusted damage. **Country impacts** shares one shading scale; **Event totals (locations)** plots the two periods' records with source coordinates and optional references. Impact-sized event marks share a fixed size scale. Both maps share zoom and pan.
- Comparison defaults are 2006-2015 versus 2016-2025. Annual averages and period totals are available, with reporting coverage and partial-year warnings. Regional changes and country impact/composition details remain available in either view.
- The historical timeline and seasonal sections are temporarily commented out in `index.html`. Their JavaScript and markup remain available for restoration.
- Explore the streamgraph and treemap, then compare detailed country profiles in the linked **Country-Hazard Relationships** network and matrix. Poster export remains available.
- Global category filters apply across views. Local year controls retain their own scopes. Filtered CSV downloads use all years under the global category filters.

See [current main-view behavior](docs/main-view.md), [comparison methods](docs/period-comparison.md) and [data methods](docs/data-methods.md).

The default scope is **2000–2026, all natural hazards**. **2026 is partial.** Adjusted damage uses **2025 USD**. Unknown impacts remain null; recorded totals are not estimates of future risk.

![Working desktop prototype](docs/prototype-desktop.png)

## Data and reproduction

The original EM-DAT export supplied by the project owner is preserved in `data/raw/`. It has 10,896 country-disaster records, 9,001 distinct event identifiers, 220 countries/territories, and 14 broad source hazard types. The interface exposes 34 categories using recorded subtypes; original classifications remain in the processed data and filtered downloads. Sinkhole and firestorm have no explicitly classified records in this export and are shown as unavailable.

Only 1,864 records have source coordinate pairs. Daily replay includes only complete valid start dates on or before the 15 September 2026 export cutoff (9,331 records); other records remain in period totals. Pulses represent recorded starts, not hazard extent or propagation. Reduced-motion preferences suppress the expanding rings.

```powershell
python -m pip install -r requirements.txt
python scripts/prepare_data.py data/raw/public_emdat_custom_request_2026-09-15_8a971085-98e9-420a-9513-c44f4dc5eca4.xlsx --start-year 2000 --end-year 2026 --all-natural
```

Outputs include cleaned CSV/JSON, a source checksum and quality report, aggregates by country/type/year, impact distributions, largest-impact records and a generated analysis report. See [data methods](docs/data-methods.md) for the field dictionary and cleaning rules.

## Interim deliverables

- [Interim checklist, findings and presentation walkthrough](docs/interim-status.md)
- [Finalized research questions](docs/research-questions.md)
- [Initial analysis](docs/initial-analysis.md)
- [Interface rationale and coordination rules](docs/interface-design.md)
- [Desktop/mobile wireframe](docs/interface-wireframe.svg)
- [Mobile prototype screenshot](docs/prototype-mobile.png)
- [Original project proposal](proposal.md)
- [Project rubric](project-rubric.md)

The dashboard includes country/event maps, rankings, a detail/overview timeline, seasonal bars, a streamgraph, a hierarchical treemap, the two-period comparison and the linked country–hazard network/matrix. See [comparison methods](docs/period-comparison.md), [country–hazard methods](docs/country-hazard-explorer.md), [implementation and verification](docs/enhancement-verification.md), and [monthly data methods](docs/data-methods.md).

## Verify

```powershell
python -m unittest discover -s tests -p test_data.py
node --test tests/*.test.js
```

For browser integration checks, leave the local server running, install Playwright if needed (`python -m pip install -r tests/requirements.txt`), then run:

```powershell
python tests/main_view_check.py
python tests/event_map_check.py
python tests/period_comparison_check.py
python tests/map_controls_check.py
python tests/map_exploration_check.py
python tests/sparse_replay_check.py
python tests/playback_performance_check.py
python tests/country_hazard_check.py
```

These browser checks detect installed Chrome on macOS/Windows, or use Playwright Chromium on Linux. Set `CHROME_PATH` to override it. They verify source counts, replay and pulse behavior, map encodings, multi-hazard selection, ranking bounds, scroll preservation, keyboard/search interactions, coordinated network/matrix behavior, poster rendering, expanded layouts and mobile controls. The older `browser_check.py` and `ux_check.py` scripts retain the interim interface contracts.

## Sources

Disaster data: [EM-DAT, CRED / UCLouvain](https://public.emdat.be/), export dated 15 September 2026. Definitions: [EM-DAT documentation](https://doc.emdat.be/docs/). Geography: Natural Earth via [World Atlas 2.0.2](https://github.com/topojson/world-atlas). Local libraries and licenses: [vendor notes](vendor/README.md).

See [event-map behavior](docs/event-map.md) and [map exploration](docs/map-exploration.md) for the current controls and semantics. The [Geographic Overview review](docs/geographic-overview-review.md) records their design rationale and the remaining optional comparison feature. The [UX update](docs/ux-update.md) records the earlier independent-clock and treemap work.
