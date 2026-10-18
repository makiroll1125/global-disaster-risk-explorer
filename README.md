# Global Disaster Risk Explorer

An interactive D3.js project by Tobias Garcia and Ha Nguyen. Compare reported natural-disaster impacts in 2000-2005 and 2020-2025, then explore locations, hazard composition, geographic concentration and country profiles.

## Run

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. All runtime libraries and datasets are local; no build or npm installation is required. Opening the HTML directly will not load the data.

## Read and explore

The opening comparison shows annual reported deaths down 28.8%, affected totals down 46.8%, and adjusted damage up 54.4%. These describe two selected periods, not a continuous trend or its causes. Damage uses 2025 US dollars. Partial 2026 is excluded from the default comparison but remains available in the archive.

Change periods, measures or comparison basis; select a country on either synchronized map. The regional table includes all records, including those without coordinates. Select disaster types in the ranking to filter across views. Year ranges and country selections belong to their respective charts. The summary cards and CSV download at the bottom cover the full 2000-2026 archive under the selected disaster-type filters.

The event map supports date replay, area selection and source-record inspection. Only 17.1% of records have source coordinates. Hollow country references are optional and do not represent event locations. The treemap supports local drill-down; the network and matrix support linked highlighting, country comparison, similarity ordering and figure export.

- [Final report, regional table and current figures](docs/final-report.md)
- [Data definitions, calculation rules and limitations](docs/data-methods.md)
- [Generated archive analysis](docs/initial-analysis.md)
- [Original proposal](proposal.md) and [assignment rubric](project-rubric.md)

## Reproduce the analysis

The original EM-DAT workbook is in `data/raw/`; cleaned records, audit and aggregates are in `data/processed/`.

```powershell
python -m pip install -r requirements.txt
python scripts/prepare_data.py data/raw/public_emdat_custom_request_2026-09-15_8a971085-98e9-420a-9513-c44f4dc5eca4.xlsx --start-year 2000 --end-year 2026 --all-natural
python scripts/analyze_periods.py
```

The second command generates the report's period comparisons and regional table as JSON and CSV. Update the snapshot-specific cutoff metadata in the cleaning script before processing a different export.

## Verify

```powershell
python -m unittest discover -s tests -p test_data.py
node --test tests/*.test.js
```

With the local server running, install `tests/requirements.txt` and run `tests/main_view_check.py`, `tests/period_comparison_check.py` and `tests/country_hazard_check.py` for current browser checks. Set `CHROME_PATH` to an installed Chrome executable if needed. Other browser scripts include earlier interface contracts.

Source: [EM-DAT, CRED / UCLouvain](https://public.emdat.be/), export 15 September 2026. Boundaries: Natural Earth via World Atlas. Bundled dependency versions and licenses are listed in [vendor notes](vendor/README.md).
