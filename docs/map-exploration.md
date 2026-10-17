# Coordinated map exploration

Geographic Overview now combines zoom-aware grouping, local spatial/time selection, proportional event symbols, and persistent source-record inspection. The default map keeps a neutral background; the optional choropleth remains separate from event-marker colors.

## Explore a subset

Open **Explore this selection** below the map. The panel starts collapsed to keep the overview compact, and opens when a marker/group or spatial selection is activated. Its filters affect only section 01; the dashboard's summary cards, historical chart, rankings, seasonality, streamgraph, and treemap retain their own scopes.

- Choose a **Country** or click its polygon to select that country's records locally. Country reference records are included when **Include country reference points** is enabled.
- Click **Select area**, then drag a rectangle on the map. This selects only records with source coordinates inside that rectangle. After the gesture, the map returns to pan mode and keeps an outline tied to the map as it zooms. Escape cancels an unfinished gesture.
- **Enter area bounds** provides keyboard-accessible west/east/south/north inputs. West greater than east represents a date-line crossing. Area selection and country selection replace one another, preventing reference points from being mistaken for measured event locations inside an area.
- Brush an interval on the selection histogram, or use **From date / To date / Apply dates**. Endpoints are inclusive UTC days. Spatial and date filters intersect. Applying an exploration filter pauses playback and returns to Selected period so the complete selected subset is visible.
- **Full period** removes the date refinement; **Clear area / country** removes only the spatial refinement. **Reset exploration** clears both, search, group focus, and event highlight. It retains global filters, map years, marker-size choice, grouping preference, and camera position.

The histogram retains the full spatial context rather than rescaling its time domain to each brush. It uses monthly bins for spans longer than two years and daily bins for shorter spans. It includes all fully dated records in that spatial context on or before the export cutoff, including unplaceable country records. Its selected interval drives the summary, composition and list. Replay has its own daily cursor; its histogram and date slider span the entire selected map period or local date interval, and the year slider provides a navigation shortcut. During replay, records accumulate across years in the summaries/list through the cursor. Markers show a short trail of starts, disappearing after 2.5 real seconds; the histogram always retains every matching date, including future starts.

## Replay sparse hazard types

Changing the global hazard/geography selection pauses any active playback and reveals the next matching reported date within the map's explicit years and local filters, wrapping to the first available date when necessary. Entering Animated timeline does the same. A deliberate year-slider or date-slider change is preserved; **Next recorded start** moves to the next reported date. Seeking clears the visual trail and shows starts on the requested date without clearing the cumulative record history. The histogram always retains all matching dates in the selected period, independently of the cursor's year.

Default playback advances a calendar year in four, twelve or twenty-four real seconds on Fast, Normal or Slow respectively. An elapsed-time clock keeps the rate independent of event density and rendering frame rate. Each batch emits all starts crossed since the previous frame, including same-day records. Optional **Skip quiet gaps (compress time)** jumps across gaps longer than 30 days, at most four jumps per second, and stops at the last recorded date. The status reports skipped dates and explains the changed time scale. The 2.5-second marker trail remains independent of calendar speed; pulses never imply physical propagation.

Both timelines retain fully dated records even when country-reference markers are hidden. The map's precision toggle still controls its markers and selection summaries. The timeline caption/status makes that difference explicit, and **Show country references** restores available country placements without inventing event coordinates. Date and area filters still apply to both timelines; an area selection continues to exclude approximate records. Missing days are excluded from daily replay and reported in the status. If a scope contains only incomplete dates or no records, Play is disabled with an explanation. Explicit map-year bounds are never expanded automatically, and conflicting local filters can be removed with **Clear local map filters**.

## Preserve location and date precision

Source coordinates and approximate country references never enter the same geographic group. Area selections exclude approximate records even if their country reference point happens to lie in the rectangle. Country selection is the explicit alternative for including those records.

The default scope contains 10,896 source rows, of which 10,636 can be placed using a coordinate or available country reference. The selection summary, composition and list retain unplaceable records. The status line explicitly distinguishes placeable and selected counts. Disabling references limits the selection to source-located records.

Missing/invalid start days remain excluded from date refinements and replay. Full-period totals restore them. Source dates after the export cutoff remain in full-period totals, with an explicit status note, and are excluded from brushed dates and replay. The detail panel preserves year-only and month-only precision and flags post-export starts.

## Group overlapping marks

**Group overlaps** is enabled by default. At the current zoom, source coordinates group into a screen-space grid with 44px cells; zooming changes this grouping while preserving membership totals. This is display aggregation, not a geographic-distance or statistical cluster analysis. Points at identical coordinates may remain grouped at maximum zoom.

Approximate records group by country, independently of the coordinate grid. Numbered badges have a constant radius; their counts refer to country-disaster records. Colored ring segments show the group's hazard composition. Approximate badges use a dashed inner border. Source clusters are drawn above approximate groups. Some marks can still overlap, especially across location-precision groups; the searchable list provides access to every selected record without targeting a small mark.

Click a group to focus the record list on its members. **Zoom into group** refines the source-coordinate view while keeping the original group list available. Approximate country groups do not offer geographic drill-down. **All selected records** clears group focus. Toggling grouping changes the display, not selection counts or reported impacts.

## Compare reported impacts

**Marker size** offers Equal, Reported deaths, Reported affected, and Adjusted damage (2025 US$). It is independent of the dashboard's impact-measure selector. With a numerical choice, circle area represents the source record's reported value. The scale uses the maximum over the complete dataset and remains fixed across local selections, time steps, global filters, and zoom. Its largest radius is 18 screen pixels. Positive values smaller than a 1.5px radius use that minimum so they remain visible; the legend states this floor.

Reported zero uses a diamond; missing values use a cross. They never substitute for each other. Positive exact locations have filled circles; positive approximate references have hollow circles. The detail panel always states location precision regardless of mark shape. Pulses retain their one-second duration and 38px radius and represent recorded starts rather than impact extent.

Numbered groups continue to encode counts and composition, not impact sums. Their legend explicitly recommends ungrouping to compare every individual impact symbol. Selection impact cards show reported sums with reporting coverage; missing totals remain Not reported when no selected record reports a value.

## Inspect source records

The record list supports text search and 25-row pages. It sorts by reported start date, with incomplete dates placed within their reported year for list ordering only; that ordering does not assign a replay date. A record's displayed date retains its actual precision.

Clicking a record or single marker opens persistent details: source identifier, event identifier, date/location precision, original type/subtype, reported deaths, affected people and adjusted damage. Clicking a record pauses playback. Details link all source country records sharing `event_id`, including records outside the current filters. Opening such a record does not change the map selection; the panel labels it as outside the selection. Dark halos identify visible matching records, including groups containing a match. No causal or propagation paths are inferred.

The summary distinguishes country-disaster records from distinct source event IDs. The 2004 Indian Ocean tsunami example has 12 country records sharing `2004-0659`; the detail panel exposes that relationship directly.

## Layout and verification

Expanded mode collapses the exploration panel to preserve the map viewport, restoring its prior open state on exit. Users can open it while expanded in a scrollable area. Small screens stack the selection controls, cards, composition, list and details without horizontal page overflow.

Automated checks:

```powershell
node --test tests/data.test.js tests/hazards.test.js tests/map-analysis.test.js
python -m unittest discover -s tests -p test_data.py
# With the local HTTP server running:
python tests/event_map_check.py
python tests/map_controls_check.py
python tests/map_exploration_check.py
python tests/sparse_replay_check.py
python tests/playback_performance_check.py
```

The new exploration browser suite verifies real-data counts through zoom, separation of location precision, group drill-down, local country/date intersection, actual map and time brush gestures, fixed impact scales, missing values, source event grouping and out-of-selection details, replay within an interval, unrelated-chart independence, expanded layout, and 390px/320px mobile behavior. Pure tests cover lossless grouping, date-line bounds, inclusive dates, missing dates, replay cutoff, and area-based size scaling. These are implementation checks, not a participant usability study.

The sparse-replay suite selects every one of the 34 recorded hazard categories through the actual checkbox UI and checks marker counts and full-period timeline record IDs against source rows. For Tsunami, it plays all 17 recorded dates and verifies that every one of the 33 source records produces a pulse and remains in the cumulative history after markers fade, including the 12 country records on 26 December 2004. It also checks future-bar seeking, backward scrubbing, rare ranking rows, hidden country references, multi-year playback gaps, changing hazards during playback, explicit scopes, missing-day explanations, and narrow layouts. The performance suite measures all three real-clock year rates, checks complete dense-year pulse delivery, verifies no data/panel rebuilds during panning or timeline rebuilds across replay years, and confirms marker expiry preserves history and inspection.
