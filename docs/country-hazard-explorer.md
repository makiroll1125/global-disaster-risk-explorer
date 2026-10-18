# Country–Hazard Multi-View Explorer

## Data and aggregation

The explorer uses the same filtered country-disaster rows as the rest of the dashboard. Global hazard, region, and country filters are applied first; the section’s local year range is applied next. Rankings, percentages, and both views are then rebuilt from that single filtered row set.

Each source row counts once as one country-disaster record. A cross-border event therefore contributes one record to each represented country, matching the dashboard’s existing definition. Exact source duplicates are removed by the preprocessing pipeline; the current export reports zero exact duplicates removed.

Every display record has one hazard category from `hazardType()` in `js/hazards.js`. A recorded subtype replaces its broad source type where the project defines a more specific display category, so a row cannot simultaneously count as both a parent category and its subtype.

For every country–hazard pair, `js/country-hazard.js` calculates:

- country-disaster record count;
- share of the country’s current filtered record total;
- sums of reported deaths, affected population, and 2025-adjusted damage;
- the number of rows reporting each impact measure.

The share denominator includes every hazard remaining after global filters, not only the eight visible matrix columns. With an active disaster-type filter, the denominator is explicitly the country total within that filtered hazard set. Missing impact reports remain `null`; reported zero values remain valid reported values.

## Views and encodings

The default subset contains the top 10 countries and top eight hazards by record frequency in the current filter context. Top 5 and top 15 subsets are available. Country search substitutes the searched country into the final place of the chosen subset when it is not already ranked there.

The network is a stable two-column bipartite layout. Country and hazard nodes use equal radii, and all edges use the same width. Edge presence means at least one supporting country-disaster record; edge color identifies the hazard. The default display shows each country’s three largest relationships by record share, while the complete relationship model remains available to the matrix and interaction layer.

The matrix uses countries as rows and the same hazards as columns. Its single sequential teal scale encodes hazard share by default or absolute record count. A striped cell with an em dash means there is no recorded relationship. Very small nonzero shares can round to `0%` in the compact label; tooltips retain one decimal place and the exact record count.

## Similarity ordering

Similarity mode builds a normalized vector for every displayed country using **all** current hazard dimensions. It calculates cosine distance (`1 − cosine similarity`) and applies deterministic agglomerative hierarchical clustering with average linkage. At each merge, cluster orientation minimizes adjacent endpoint distance, with ISO-based tie-breaking. The result is an ordering aid, not a claim that adjacent countries have identical geography, vulnerability, safety, or future risk.

## Coordinated interactions

One local state object controls both views. Hovering a country, hazard, edge, or populated matrix cell updates matching elements in both SVGs. A matrix hover temporarily reveals its edge when the edge is hidden by the network limit. Country clicks persist across both views; at most two countries are retained for the comparison panel. Hazard clicks persist as a cross-view column/connection highlight. Reset clears local filters and selections.

The comparison panel reports country record totals, distinct hazard counts, leading hazard shares, impact-reporting coverage, shared and country-only hazards, and cosine similarity. These are descriptive summaries of recorded history rather than risk or safety rankings.

## Poster export

Choose **Poster view / Export figure** in section 07. The figure reuses the current country/hazard subset, year range, ordering, and matrix metric, but always shows the three strongest network connections per country. It includes titles, legends, a plain-language caption, years, and the EM-DAT source without interactive controls.

Export options are:

- self-contained SVG for vector editing and print;
- 3000 × 2100 PNG on a white background.

If the live selection contains more than 10 countries, export is disabled until the user chooses the 10-country poster preset so labels are not silently removed.

## Limitations

EM-DAT reflects reported major disasters and reporting practices vary by country, year, hazard, and impact field. Record share describes composition within this export; it is not disaster probability. Counts are not population-normalized, and absent impact reports do not mean zero impact. The 2026 data is partial through the export cutoff of 15 September 2026.
