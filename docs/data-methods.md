# Data methods

The source is the bundled EM-DAT export dated **15 September 2026**, scoped to natural hazards starting in **2000–2026**. The source checksum and audit are in `data/processed/quality-report.json`. The original XLSX is unchanged.

## Records and impacts

Each row is a country-disaster record, not a unique worldwide event. A disaster affecting several countries contributes one record per country. The 10,896 records represent 9,001 event identifiers. Existing rows, identifiers, impact fields and annual totals are preserved.

`year` is the recorded start year; `start_month` is the recorded start month, validated as an integer from 1 through 12. `year_month` is `YYYY-MM` for a valid month and null otherwise. Multi-month disasters are counted once, in their start month. `iso`, `country`, `region` and `type` retain the existing source categories.

Blank or invalid impact values remain null. Totals sum reported values only, and remain null when no values are reported. Zero is retained only when explicitly reported. Damage fields are converted from thousands of US dollars to dollars; adjusted damage retains the **2025 price basis**. Nominal damage does not fill adjusted-damage gaps. Per-record reporting coverage accompanies impact totals.

## Monthly coverage

10,823 of 10,896 records (**99.33%**) have a valid start month; **73** lack a month. There are no invalid nonblank month values in this export. Missing-month records remain in annual summaries and all period-based views, and are excluded from monthly summaries. No month is imputed.

One source record starts in **November 2026**, after the export date. It is preserved unchanged in annual data, but excluded from observed monthly aggregation. The monthly CSV therefore counts **10,822** records. The chronological monthly chart treats October–December 2026 as unavailable, not as zero. September 2026 and the entire 2026 annual total are partial. The export date and partial year are explicit metadata for this particular supplied export; update them when processing a different snapshot.

`by-country-month-type.csv` groups valid, in-period start months by year/month, region, country and disaster type, with reported sums and coverage for each impact measure. The browser derives the same aggregates from individual records so all filters remain available. Zero-count bins mean no dated records in the export, not proof that no disasters occurred. Missing impacts remain gaps in monthly impact lines.

## Seasonal averages

For each calendar month, sum dated country-disaster records in the selected years and divide by the number of selected calendar years **excluding partial-year 2026 entirely**. For 2000–2004, every month uses a denominator of five. All other selected years remain in the denominator even if no records match the filters. Missing-month records do not contribute to any numerator. Each filtered view displays its own dated-record coverage and denominator.

A year being a complete calendar year does not establish complete EM-DAT reporting. Missing dates and reporting gaps can understate the averages. A zero bar means no dated records, not verified absence. If there are no eligible complete years or no dated records, show an insufficient-data message rather than a set of inferred seasonal zeros. These averages always measure record frequency, independently of the global impact measure.

## Encoding and linked views

Shared `state` in `js/app.js` holds metric, type, region, country and ranking tab. Two separate time objects apply those shared categories independently: `historyState` holds start/end years and yearly/monthly resolution; `mapState` holds its own start/end years, playback year, mode, playing flag and speed. `filterRows` in `js/data.js` applies the resulting categories and range. Contextual views explicitly ignore selected dimensions: type ranking retains all types, country ranking and the period map retain country comparisons, and the streamgraph retains all years and types while respecting geography.

The detail timeline uses the historical years for its horizontal domain and values; the overview uses the complete annual domain. Brush movement updates only `historyState`; a guard suppresses recursive programmatic brush events. From/To controls and All years synchronize through the historical render path. Summary cards, rankings, seasonal averages, the streamgraph highlight and treemap continue using this historical range. Changing historical resolution redraws only the line and overview.

Map controls call `renderMap` only, so local range changes and playback do not redraw other views. Historical range changes use `render({ includeMap: false })`, leaving the map DOM, playback timer and map range untouched. Animated mode respects all shared filters, including country, and uses the maximum annual country value over the map's entire range for its fixed square-root color domain. Period mode restores the existing country-comparison map. Gray means no matching records; hatching means records exist but the impact is unreported. Playback stops at the final year and pauses when the page is hidden. Reduced-motion preferences suppress D3 transitions. Reset filters resets both clocks and local treemap navigation.

The streamgraph uses record counts, a stable alphabetical type order, `stackOffsetWiggle`, and a unique categorical palette shared with type-ranking bars. Its baseline is not an absolute count axis; thickness encodes counts. The selected interval is outlined and outside periods muted.

The treemap uses World → Region → Country → Disaster Type, with leaf record counts summed exactly to country and world totals. Squarify layout, depth-aware padding, text-fit checks and hover behavior adapt `js/lab6.js`. Small label gutters slightly reduce available child area. Region hues and country shades are determined from the complete dataset and stay stable across filters. The provided `convert_hierarchy.py` demonstrates recursive grouping into named children; `disasterHierarchy` applies that structure to region/country/type counts at runtime so filters update the hierarchy. Treemap location is held separately in `treeState` (region/country). Region headers and legend buttons open a region; country rectangles open a country. Breadcrumb parents, one-level Back and Reset to World change only this local state. They preserve every global filter and both clocks. World remains scoped by global filters; incompatible local and global geographies show an explicit empty state. Within a country, a type rectangle explicitly toggles the shared type filter. Global country selection remains available through the map, ranking and dropdown.

These are reported major disasters, not every hazard occurrence, predicted risk, per-capita vulnerability, or causal climate effects. Countries without map polygons remain in all calculations and other views.
