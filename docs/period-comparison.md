# Country-first overview and two-period comparison

The main map now uses event locations; see [current controls](main-view.md). This comparison independently offers Country impacts and Event totals (locations), plus local measure controls for records, deaths, affected populations and adjusted damage. Country impacts uses a shared square-root shading scale. Event totals plots individual period records, with source coordinates by default and optional hollow country references. Record-count marks have equal size; impact marks use one shared area scale across periods, with zero and unknown values distinguished. Colors follow the main map's optional color setting and active grouped/expanded sidebar. Numeric event sizes always describe individual records, regardless of the annual-average/period-total basis used for tables.

## Two persistent periods

The comparison uses two country maps with a common projection, common square-root color domain and synchronized zoom/pan. Both remain visible; on phones they stack. Keyboard zoom buttons and a country selector complement direct map interaction.

Period A defaults to 2006–2015 and B to 2016–2025, the two latest complete ten-year blocks in this export. Period controls, comparison basis and detail-country selection are local. Hazard selections in the ranking apply to both periods; the measure selector is local. The global filter row has been removed. Swapping periods reverses A/B, including the sign of changes. Periods can overlap, but an explicit note warns that records then contribute to both.

Annual averages divide reported sums or country-record counts by the number of selected calendar years, including years with no matching records. This makes unequal period durations comparable, but does not correct for incomplete database reporting. Period totals are available with a warning about different durations. Defaults exclude partial 2026; selecting it displays a caution and does not annualize its partial observations into an estimated full year.

Regional rows are sorted by absolute B-minus-A differences in the selected measure and basis. Percent change is unavailable when A is zero or either impact total is unreported. A missing impact total remains null, including when a period has no records; it is never inferred to be zero. Explicitly reported zero remains zero. Gray countries have no matching records; hatching indicates matching records with no reported impact for the selected measure. Both maps always share the maximum across both periods, so identical values have identical shades.

## Country detail

Selecting a country on either map highlights it on both and updates all four measures in the impact table, independently of the measure used for country shading. Coverage is the number of source records reporting that impact over all selected source records, not the number of years. Countries without polygons remain available in the selector.

Hazard composition compares shares of country-disaster records using the same two period colors throughout. The six largest categories by combined A+B counts are shown explicitly; remaining categories form Other. Each period's denominator includes every selected record in that period. An empty period is labeled No records, not presented as a measured zero share. Exact counts accompany shares. Composition always measures records and does not change to deaths or damage with the comparison measure selector.

No comparison estimates population-adjusted vulnerability, unique people affected, future risk, reporting completeness or causal hazard changes. The network and matrix remain available for detailed country–hazard relationships.

## Verification

`tests/period-comparison.test.js` exercises unequal durations, coverage, null versus zero, absent coordinates/polygons and composition conservation. `tests/period_comparison_check.py` verifies defaults, map/source-record inclusion, shared scales and zoom, country details against independently computed Python totals, swapped periods, partial-year unknown impacts, empty selections, mobile layout and preservation of the network/matrix.
