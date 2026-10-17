# Interim deliverables and demo

Completed locally on 16 September 2026. Nothing has been committed, published or deployed.

## Deliverable checklist

| Interim goal | Status | Evidence |
|---|---|---|
| Download and inspect EM-DAT | Complete | User-supplied original XLSX in `data/raw/`; source checksum and inspection in `data/processed/quality-report.json` |
| Initial cleaning and transformation | Complete | Reproducible pandas pipeline, cleaned CSV/JSON, geographic join audit and null-preserving aggregates |
| Initial analysis | Complete | [Generated analysis](initial-analysis.md), country/type/year tables, impact distributions and largest-impact records |
| Finalize research questions | Complete; confirmed with user | [Four questions and rationale](research-questions.md) |
| Interface sketches / mockups | Complete | [Wireframe](interface-wireframe.svg), [design rationale](interface-design.md), desktop/mobile screenshots |
| Preliminary D3 world map | Complete | Choropleth, country selection, metric switching, region/hazard/year filtering, zoom/pan and details |
| Additional interactive visualization | Complete | Brushable annual timeline plus country/hazard ranking, coordinated with map and summaries |

## Initial findings to communicate

**Frequency and impact give different answers.** Floods account for 4,291 of 10,896 country-disaster records (39.4%). Earthquakes lead reported deaths at 805,285; storms lead reported adjusted damage at approximately $2.56 trillion in 2025 USD. These are different dimensions of severity.

**Country rankings also change with the measure.** China leads record count (674), Haiti leads reported deaths (240,575), and the United States leads adjusted damage (approximately $2.09 trillion). The database alone does not establish per-capita risk or explain those differences.

**Large events dominate some totals.** The 2010 Haiti earthquake record contains 222,570 reported deaths. The 2011 Japan earthquake record contains approximately $300.56 billion adjusted damage. Across all reported records, median deaths are 12 and the maximum is 222,570; median adjusted damage is $154.40 million and the maximum is $300.56 billion. Distributional skew motivates the map's square-root scale and the detailed linear ranking.

**Reporting coverage changes the interpretation.** Deaths are reported in 71.8% of records; adjusted damage in only 30.3%. Epidemics have no adjusted damage values in this export. Drought deaths are reported for just 6.6% of its records. Missing data should remain visible throughout the exploration.

**2026 is incomplete.** Its 160 records are retained, marked partial, and separated with an amber dashed timeline segment. No 2026 adjusted damage figures are available. Its lower record count does not establish a decline in annual disasters.

All numbers above derive from the supplied export. Supporting totals and coverage appear in [initial-analysis.md](initial-analysis.md) and its generated CSV files.

## Suggested five-minute demonstration

1. **Question and data (45 seconds).** Explain that a record is one disaster's impact in one country. Introduce the four questions, 14 hazards, 2000–2026 scope and partial current year.
2. **Overview (45 seconds).** Show the default map and country ranking. Select “Disaster types” in the ranking: floods lead frequency. Switch to deaths and then adjusted damage to reveal different leaders.
3. **Follow a country (60 seconds).** Reset. Choose Haiti using the country selector or map, then deaths. Inspect the 2010 point and its record details. Clear the country and choose Japan with adjusted damage; inspect 2011.
4. **Filter a period (45 seconds).** Drag timeline brush handles or use From/To selectors. Show the changed summaries, map colors and ranking. Explain that the full timeline stays visible for context.
5. **Explain a missing value (45 seconds).** Reset, select adjusted damage, then start year 2026. Explain the hatched map, unreported total and coverage. Return to all years and select Epidemic to illustrate hazard-specific missingness.
6. **Methods and next steps (40 seconds).** Show the original/cleaned data, quality audit, research questions and wireframe. Identify the two planned final visualization idioms and final communication deliverables.

## Verification completed

- Five Python tests cover null versus zero, currency conversion, cross-country event identity, duplicate handling, scope filtering, invalid values and historical geography.
- Two JavaScript tests cover shared filtering and missing-value aggregation.
- Real-data browser integration checks validate all displayed global totals against source-derived totals, map and bar keyboard/click selections, year selectors, brush handles, filtered CSV export, partial-year missingness, empty selections, historical countries, region changes and map zoom/reset.
- Desktop (1440px) and mobile (390px) checks pass with no page errors or horizontal overflow. Timeline layout adapts on resize. Screenshots are saved in `docs/`.
- Browser requests during use remain local; an unavailable data file produces a visible actionable error. No synthetic dataset is used by the prototype.

Commands are in the root README. Browser testing uses Playwright and the locally installed Chrome browser.

## Remaining final-project deliverables

This interim contains **three visualization idioms**, exceeding the interim minimum but not yet satisfying the final five-visualization requirement. Proportional symbols and a relationship scatterplot remain planned. Final usability evaluation, further analysis, final report (~1,500 words), poster and presentation also remain. Publishing is explicitly deferred.

Do not equate five interaction types with five visualization idioms: filtering, selection, brushing/linking, zoom/pan, details, and metric/group changes are already represented, while two final visual idioms remain to implement.
