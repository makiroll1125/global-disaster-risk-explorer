# Data methods

## Source and record definition

The preserved EM-DAT workbook was exported on 15 September 2026. It contains 10,896 country-disaster records, representing 9,001 event identifiers, 220 countries and territories, and 14 broad natural-hazard types with start years 2000-2026. A cross-border disaster contributes a record for each affected country. Counts are not unique worldwide events; affected totals are not unique people.

The cleaning script locates the workbook header, trims text, validates required attributes, checks identifiers, removes exact duplicate rows and filters to natural hazards in the selected years. This export required no duplicate removal or scope exclusions. The original file's SHA-256 and all audit counts are in `data/processed/quality-report.json`.

## Fields and missing values

| Fields | Meaning |
|---|---|
| `id`, `event_id` | Country-disaster identifier and shared event identifier |
| `country`, `iso`, `region`, `map_id` | Source geography, alpha-3 ISO and boundary join |
| `type`, `subtype`, `event_name`, `location` | Original hazard classification and available source descriptions |
| `year`, `start_month`, `start_day`, `end_year`, `year_month` | Source date precision; nullable normalized month |
| `latitude`, `longitude` | Source coordinate pair, null if missing or outside geographic bounds |
| `deaths`, `affected` | Nullable reported human impacts |
| `damage_usd`, `damage_adjusted_usd` | Nullable nominal and adjusted damage, converted from thousands of dollars to dollars |

Blank, negative, nonfinite or invalid impacts remain null. Explicit zero remains zero. Sums use reported values only and remain null if no impacts are reported. Coverage is reporting records divided by all records in the selection; it does not estimate the completeness of the reported amounts. Adjusted damage uses the source's 2025 price basis; nominal values never fill adjusted gaps.

The browser derives 34 mutually exclusive display categories from recorded types and subtypes and groups them into 12 hazard families. The expanded label Flood means unspecified flood subtype; the grouped Flood family also includes riverine, flash, coastal and glacial lake outburst floods. Raw classifications remain in the processed files and downloads. Hazard labels follow the [EM-DAT classification glossary](https://doc.emdat.be/docs/data-structure-and-content/glossary/).

## Period comparison

The default comparison is A = 2000-2005 and B = 2020-2025. Each annual average is the reported period sum divided by six calendar years. Other selected ranges use their full inclusive calendar-year count, including years with no matching records. Period-total mode removes this divisor. Difference is B minus A; percentage change is 100 * (B / A - 1), calculated before rounding and unavailable when A is zero or either impact total is unknown.

`python scripts/analyze_periods.py` reproduces the report's comparisons, reporting coverage, regional counts and concentration analysis in `data/processed/period-comparison.json` and `period-regions.csv`. The dashboard calculates the same quantities directly from individual records so disaster-type filters remain available. Regional rows are ordered by B-minus-A change. All records contribute to country and regional aggregates, regardless of coordinate or polygon availability.

The paired choropleths share a square-root color domain and synchronized zoom. The opening bar pairs each have a zero baseline and their own measure-specific linear scale. Country selection affects the detail tables; the opening cards remain worldwide under the active disaster-type filters. All year controls are local. Disaster-type selection is shared across charts; the full-archive summary and CSV use 2000-2026 rather than any chart's local years.

## Geography, time and interpretation

Only 1,864 records (17.1%) have source coordinate pairs. Coverage is 96.2% for earthquakes, 23.4% for floods, 3.9% for storms and zero for epidemic, extreme-temperature and drought records. Point density therefore reflects coordinate availability as well as recorded occurrences. Optional hollow references locate countries only. A further 279 records lack matching polygons in the coarse World Atlas boundaries; they remain in tables and aggregates.

Daily replay requires a complete valid start date on or before the export cutoff; it includes 9,331 records. Incomplete dates are never imputed. One November 2026 start is retained in annual totals but excluded from observed monthly aggregation. The month-level outputs contain 10,822 records. Replay pulses show recorded starts, not event extent or physical propagation. Reduced-motion preferences suppress expanding rings.

2026 is partial, and adjusted damage for that year is unavailable. The default comparison excludes it. EM-DAT reporting varies across places, years, hazards and impact measures. These data do not establish population-adjusted vulnerability, future risk, adaptation effectiveness or causal climate effects. The two selected periods cannot establish a continuous temporal trend.
