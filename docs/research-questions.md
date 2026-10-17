# Finalized primary research questions

Confirmed with the project owner on 16 September 2026. Scope: all 14 natural-hazard types in the supplied EM-DAT export, 2000–2026. The year 2026 is partial.

1. **Where are different natural hazards most frequently recorded?**
2. **Which hazard types have the greatest reported deaths, affected populations, and adjusted damage?**
3. **How do country rankings change when the impact measure changes?**
4. **How do annual frequency and reported impacts vary by country and hazard, with reporting gaps and partial 2026 made explicit?**

## Why these questions

The intended audience is the public and university students. A viewer should be able to move from a geographic overview to a comparison and then investigate a country's history. Changing the impact measure reveals how a different definition of severity changes the story.

These questions refine the proposal's four questions while staying within what the source can support. “Recorded” and “reported” distinguish observed database entries from all hazards or all real-world impacts. Country ranking comparisons do not imply population-normalized vulnerability or predicted future risk.

| Question | Data required | Interim view and task | Initial evidence |
|---|---|---|---|
| Geographic frequency | Country, ISO, hazard, start year | Filter hazard/region, scan map, select country | China has the most country-disaster records (674); floods are the most frequently recorded type (4,291) |
| Impact by hazard | Deaths, affected, adjusted damage, reporting counts | Switch metric and rank by disaster type | Earthquakes lead reported deaths; storms lead adjusted damage; floods lead reported affected totals |
| Country comparisons | Country-level aggregates for each measure | Compare ranks while changing metric | Record leader China, death-total leader Haiti, adjusted-damage leader United States |
| Temporal variation | Start year, country, hazard, impacts | Select country, inspect annual points, brush years | Largest annual reported death total: 2010; largest adjusted damage total: 2011. Partial 2026 is separated visually |

All findings describe this export and selected scope. See [initial analysis](initial-analysis.md) and [data methods](data-methods.md) for totals and reporting coverage.

## Design consequences of analysis

- **Frequency and severity differ:** expose the measure control prominently and coordinate the map and rankings.
- **Impacts have long-tailed distributions:** use a labeled square-root map color scale. Keep bar lengths and time-series positions linear for direct comparisons.
- **Missingness differs substantially by hazard:** display coverage in summary cards and chart details. Epidemics have no reported adjusted damage in this export; drought death figures are present in only 6.6% of records. A small or missing sum is not evidence of low impact.
- **Reporting and scope limit trends:** use start-year totals without a causal trend line. Distinguish partial 2026 and preserve gaps in unreported impact series.
- **Some countries lack polygons:** retain a full country selector and tabular access so the map does not define the analysis population.
