# Country–Hazard Multi-View Explorer

## Data and aggregation

The explorer uses the same filtered country-disaster rows as the rest of the dashboard. Global hazard, region, and country filters are applied first; the section’s local year range is applied next. Selections and both views are then rebuilt from that single filtered row set.

Each source row counts once as one country-disaster record. A cross-border event therefore contributes one record to each represented country, matching the dashboard’s existing definition. Exact source duplicates are removed by the preprocessing pipeline; the current export reports zero exact duplicates removed.

Every display record has one hazard category from `hazardType()` in `js/hazards.js`. A recorded subtype replaces its broad source type where the project defines a more specific display category, so a row cannot simultaneously count as both a parent category and its subtype.

For every country–hazard pair, `js/country-hazard.js` calculates:

- country-disaster record count;
- sums of reported deaths, affected population, and 2025-adjusted damage;
- the number of rows reporting each impact measure.

Missing impact reports remain `null`; reported zero values remain valid reported values. The interface uses exact country-disaster record counts only.

## Views and encodings

Countries and disaster types have independent searchable multi-select controls. Each offers a reproducible contrast default, top-by-frequency preset, all, and clear. Manual selections persist across unrelated controls and remain selected whenever they are still valid in the filtered data. The contrast default starts with the most-recorded country, greedily adds countries with dissimilar normalized hazard profiles, and then chooses disaster types that best distinguish those countries.

The network is a stable two-column bipartite layout with a height derived from the larger selected node set. Country and hazard nodes use equal radii, and all edges use the same width. Edge presence means at least one supporting country-disaster record; its absence means only that no record matches the current filters, not that the pairing is impossible. Every positive-count relationship is shown by default. Optional Top 2 and Top 3 filters are explicit network-only choices and report the displayed and total relationship counts; the matrix always remains complete. Default, direct-focus, unrelated-focus, and connected-node context edge opacities are 0.40, 1.00, 0.08, and 0.95 respectively.

The matrix uses countries as rows and every selected disaster type as a column. Its sequential teal scale encodes exact record count. A pale outlined cell labelled `0` means no matching record in the current filtered data. Both axes scroll for large selections; no selected row or column is silently removed. Tooltips show exact counts and impact totals with reporting coverage.

## Similarity ordering

Similarity mode builds a normalized vector for every displayed country using **all** current hazard dimensions. It calculates cosine distance (`1 − cosine similarity`) and applies deterministic agglomerative hierarchical clustering with average linkage. At each merge, cluster orientation minimizes adjacent endpoint distance, with ISO-based tie-breaking. The result is an ordering aid, not a claim that adjacent countries have identical geography, vulnerability, safety, or future risk.

## Coordinated interactions

One local state object controls both views. Hovering a country, hazard, edge, or any matrix cell updates matching elements in both SVGs. A populated matrix hover temporarily reveals its edge when the edge is hidden by the network limit. Country clicks persist across both views; at most two countries are retained for the comparison panel. Hazard clicks persist as a cross-view column/connection highlight. Reset restores the data-derived defaults.

The comparison panel reports exact country record totals, selected-type counts, impact-reporting coverage, shared and country-only types, and cosine similarity. These are descriptive summaries of recorded history rather than risk or safety rankings.

## Poster export

Choose **Poster view / Export figure** in section 07. The figure reuses the current country/type selection, year range, ordering, and network edge limit. It uses record counts only, includes every selected type when the selection is legible, and shows overview edges at 0.40 opacity. All Connections is the default; an explicitly selected Top N filter is named in the poster and its caption reports the number of omitted positive-count relationships.

Export options are:

- self-contained SVG for vector editing and print;
- 2× high-resolution PNG on a white background, with dimensions derived from the content.

If the live selection contains more than 10 countries or 12 disaster types, export is disabled until the user explicitly chooses the 6-country × 8-type contrast poster preset. This does not mutate or truncate the explorer selection.

## Limitations

EM-DAT reflects reported major disasters and reporting practices vary by country, year, hazard, and impact field. Counts are not population-normalized or probabilities, and absent impact reports do not mean zero impact. The 2026 data is partial through the export cutoff of 15 September 2026.
