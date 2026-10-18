# Main view controls

The main map shows event locations on neutral country boundaries. The upper branding/navigation header is restored on Explorer and About the data. The global filter row has been removed entirely; map, ranking, comparison and relationship controls remain within their charts. Visible sections use 1), 2), etc., with 3) COMPARE TWO PERIODS as the third section. The former Country totals/choropleth toggle and its quantitative legend have been removed. Filled marks use EM-DAT source coordinates; hollow references identify countries only. References are hidden by default, and source coordinates have not been independently verified.

Three options sit together below the map:

- **Color by disaster type**, off by default. With no type color, source pins and pulses use teal. Optional colors follow the active sidebar tab.
- **Fade event locations (animated timeline)**, on by default. Unchecking this option retains all source-located starts reached by the cursor. With fading disabled, pausing, inspecting a record, or waiting does not remove them. Seeking backwards removes starts after the cursor. Enabling fading restores the 2.5-second trail, including expiry while paused; disabling it restores the cumulative locations.
- **Show approximate country references**, off by default. This allows records without source coordinates to appear at hollow country reference points. Such points are not asserted to be event locations.

Overlap grouping has been removed from the main map. Each visible event is an individual mark. Hovering adds a black circular halo and brings that mark above the others. Keyboard focus uses the same circular cue; selections have no rectangular SVG outline or shadow. Missing or invalid days remain excluded from daily replay, but remain available in full-period views. Pulse animation is a start signal, not a physical hazard footprint.

## Grouped and expanded lists

**Disaster types (grouped)** opens by default with 12 families. **Disaster types (expanded)** retains the 34 recorded display categories. The family definitions in `js/hazards.js` partition the expanded categories: every type belongs to exactly one family. In particular, Flood includes all flood subtypes and glacial lake outburst flood; Storm includes its storm subtypes; Earthquake / tsunami combines those two types; and Landslide / avalanche combines wet/dry mass movement categories.

Checking or unchecking a group affects all its expanded members. If only some members are selected through the expanded list, the group shows a mixed state. Selecting a mixed group includes all its members. Rankings retain all groups/types for selection context while applying geography and local years. Counts and reported sums remain identical when regrouped; source data and classifications are not rewritten.

When optional map colors are enabled, the grouped tab uses one color per family and the expanded tab uses the existing per-type colors. The collapsible map color key follows that tab. Network/matrix and streamgraph labels retain their own expanded categories and legends.

## Comparison and preserved sections

Compare / Two periods has its own measure selector: Event totals, Reported deaths, Reported affected and Adjusted damage. The view selector switches between country-impact shading and event locations for each period. Coordinates are required for event placement unless approximate references are explicitly enabled. All records continue contributing to the country and regional tables. Individual event impact areas use one shared size domain; zero and unreported values have separate symbols. Period basis affects table values and country shading, not an individual source record's impact value. The comparison measure is local and does not change the other charts.

The historical timeline and seasonal sections are commented out in `index.html`. Their functions remain in `js/app.js` and `js/charts.js`; guards skip rendering when markup is absent. Removing the enclosing HTML comment restores both sections without reconstructing their source.

`tests/main_view_check.py` verifies these controls, grouped/expanded totals and colors, mixed selection, persistent and optional fading markers, inspection, comparison metrics/locations, and narrow layouts. The focused replay tests explicitly enable fading when checking the legacy trail behavior.
