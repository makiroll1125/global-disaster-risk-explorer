# Initial analysis

Source: `public_emdat_custom_request_2026-09-15_8a971085-98e9-420a-9513-c44f4dc5eca4.xlsx`; SHA-256: `b2cca59112d257d3eae8af732239681efbee1e94aefd57fe2c8824108455fb5d`.

Scope: 2000–2026. 10,896 country-disaster records, 9,001 distinct event identifiers, 220 countries/territories.

Counts below refer to country-disaster records, not unique worldwide disasters.

## Reported impact and coverage

| Measure | Reported sum | Records reporting | Coverage |
|---|---:|---:|---:|
| deaths | 1,739,233 | 7,826 / 10,896 | 71.8% |
| affected | 4,901,419,789 | 8,820 / 10,896 | 80.9% |
| damage_usd | 3,945,636,843,920 | 3,340 / 10,896 | 30.7% |
| damage_adjusted_usd | 5,200,866,287,000 | 3,306 / 10,896 | 30.3% |

## Disaster types

| Measure | Largest reported totals (top 5) |
|---|---|
| records | Flood: 4,291; Storm: 2,924; Epidemic: 895; Earthquake: 707; Extreme temperature: 606 |
| deaths | Earthquake: 805,285; Extreme temperature: 377,163; Storm: 228,666; Flood: 149,977; Epidemic: 125,679 |
| affected | Flood: 1,894,696,349; Drought: 1,718,069,310; Storm: 938,512,765; Earthquake: 168,799,215; Extreme temperature: 133,911,278 |
| damage_adjusted_usd | Storm: 2,561,623,325,000; Flood: 1,122,494,845,000; Earthquake: 934,705,840,000; Drought: 276,627,230,000; Wildfire: 213,431,269,000 |

## Countries

| Measure | Largest reported totals (top 5) |
|---|---|
| records | China: 674; United States of America: 660; India: 435; Indonesia: 425; Philippines: 406 |
| deaths | Haiti: 240,575; Indonesia: 191,257; Myanmar: 144,818; China: 116,356; India: 93,258 |
| affected | China: 1,771,244,413; India: 1,148,025,443; Philippines: 258,372,614; Bangladesh: 183,156,196; United States of America: 109,704,801 |
| damage_adjusted_usd | United States of America: 2,094,570,595,000; China: 741,553,581,000; Japan: 602,407,455,000; India: 167,555,333,000; Germany: 127,806,676,000 |

## Years

| Measure | Largest reported totals (top 5) |
|---|---|
| records | 2000: 505; 2002: 491; 2005: 482; 2023: 462; 2006: 458 |
| deaths | 2010: 330,153; 2004: 244,705; 2008: 241,993; 2023: 139,149; 2003: 113,130 |
| affected | 2002: 659,429,710; 2015: 431,871,055; 2010: 260,016,139; 2003: 255,104,693; 2008: 221,833,643 |
| damage_adjusted_usd | 2011: 521,153,727,000; 2017: 429,184,202,000; 2005: 353,196,632,000; 2021: 306,073,747,000; 2008: 285,410,786,000 |

## Hazard frequency and reporting coverage

| Hazard | Records | Deaths coverage | Affected coverage | Adjusted damage coverage |
|---|---:|---:|---:|---:|
| Flood | 4,291 | 73.3% | 90.4% | 28.1% |
| Storm | 2,924 | 74.6% | 74.3% | 48.3% |
| Epidemic | 895 | 86.7% | 94.1% | 0.0% |
| Earthquake | 707 | 65.9% | 97.0% | 43.6% |
| Extreme temperature | 606 | 83.8% | 27.7% | 7.6% |
| Mass movement (wet) | 504 | 96.8% | 66.9% | 10.3% |
| Drought | 426 | 6.6% | 74.4% | 28.6% |
| Wildfire | 355 | 51.5% | 78.0% | 38.3% |
| Volcanic activity | 134 | 18.7% | 93.3% | 14.9% |
| Infestation | 29 | 0.0% | 10.3% | 3.5% |
| Mass movement (dry) | 15 | 100.0% | 53.3% | 6.7% |
| Glacial lake outburst flood | 8 | 87.5% | 50.0% | 25.0% |
| Animal incident | 1 | 100.0% | 100.0% | 0.0% |
| Impact | 1 | 0.0% | 100.0% | 100.0% |

## Distribution of reported impacts per record

| Measure | Median | 95th percentile | Maximum |
|---|---:|---:|---:|
| deaths | 12 | 292 | 222,570 |
| affected | 5,392 | 1,500,000 | 330,000,000 |
| damage_usd | 102,000,000 | 4,200,000,000 | 210,000,000,000 |
| damage_adjusted_usd | 154,396,000 | 5,606,657,250 | 300,561,348,000 |

Adjusted damage reference year identified from CPI=100: **2025**.

**2026 is partial.** Its annual total must not be compared as a complete year with earlier years. Current-year adjusted damage is unavailable in this export.

These distributions describe reported values only, not all disasters. Large gaps between medians and maxima motivate a square-root color scale on the map; ranking bars and time-series axes remain linear.

## Interpretation limits

- Blank impacts remain null. Sums include reported values only; coverage accompanies each aggregate.
- Total Affected already combines injured, affected and homeless. Repeat impacts across events are not unique people.
- Both damage columns are converted from thousands of USD to USD. Adjusted figures retain the source export’s price basis; nominal values never fill adjusted gaps.
- Totals describe recorded impacts, not future risk, per-capita vulnerability, or a causal climate trend.
- A disaster spanning countries contributes one record per country. All impacts are attributed to its start year.
- 279 records in 52 countries/territories lack matching map polygons; they remain in charts and totals.
- See quality-report.json for exclusions, duplicate checks, numeric issues and geographic join coverage.

## Sources

- [EM-DAT public table](https://doc.emdat.be/docs/data-structure-and-content/emdat-public-table/)
- [EM-DAT biases](https://doc.emdat.be/docs/known-issues-and-limitations/specific-biases/)
- [Economic adjustment](https://doc.emdat.be/docs/protocols/economic-adjustment/)
