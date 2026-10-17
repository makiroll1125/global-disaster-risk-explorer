# Geographic Overview: review and next steps

Reviewed against the implemented map, the [project rubric](../project-rubric.md), and the [research questions](research-questions.md). Steps 1–4 below have now been implemented; see [map exploration](map-exploration.md) for the delivered behavior and verification. Step 5 remains an optional future extension. The text below retains the rationale for the design.

The map now has a coherent encoding: location is geographic position, color is hazard type, and full-year or selected-period country impacts have a separate choropleth mode. Daily replay, multi-type filtering, pan/zoom, hover details, and the linked histogram provide a useful starting point. The main remaining analytical gap is moving from watching events to defining a subset, comparing its consequences, and inspecting the records behind it. The rubric explicitly values coherent questions, brushing/linking, details on demand, and meaningful interpretation; its complex-representation examples already include geography. Additional features should strengthen those tasks rather than serve as a complexity count.

## Recommended development order

### 1. Resolve overlap with zoom-aware aggregation

The initial map draws 10,636 placeable country-disaster records, many directly on top of one another. Only 1,864 of all 10,896 records have source coordinate pairs. A country reference point is not a measured event cluster.

At world scale, combine coincident source-located markers into count badges or compact stacks, expanding them at closer zoom. Aggregate approximate records separately by country and retain the hollow appearance and an explicit approximate-location label. A click opens the underlying records. Never merge approximate country markers into precise geographic clusters or randomly jitter them into apparent event locations. If a badge uses size for count, give it an area scale and legend; keep hazard colors on the expanded event marks.

Success: users can distinguish one event from many overlapping records and recover every record through drill-down. Zoom never changes the represented total.

### 2. Make a spatial selection and a time brush work together

Add a clearly labeled **Select area** tool alongside pan. For exact coordinates, a rectangle or lasso defines a geographic subset. Approximate records should require explicit country selection rather than being included just because the reference point falls inside a drawn area. Preserve a clear selection outline and a Reset selection action.

Let users brush an interval on the event histogram, retaining playback as a separate operation. Link the selected geography and interval to a local impact summary, type composition, and event list. State whether this exploration is local to section 01; avoid silently overwriting every other chart's independent dates.

This supports a concrete task: compare where earthquakes and tsunamis were recorded in Japan during March 2011, then inspect the reported consequences. Temporal proximity alone should not be described as causation.

Success: map and histogram selections intersect, their selected counts agree, and brushing has keyboard/date-input alternatives. Show records excluded for incomplete dates.

### 3. Add impact magnitude to individual event marks

Offer **Marker size: equal / reported deaths / affected / adjusted damage**. Keep color for type; scale circle area, with a visible size legend, for the selected numerical variable. Keep pulse timing and radius constant so a pulse is not mistaken for an impact footprint. Draw missing and explicitly zero values distinctly, with reporting coverage beside the summary. Use a fixed size domain when comparing time periods.

This directly connects the map to the question of frequency versus reported severity. The current impact selector changes summaries but does not change equal-sized event pins, which limits what the main view can answer by itself.

Success: a user can identify frequent small-impact records versus rare large reported impacts without treating missing reports as zero.

### 4. Provide persistent event details and cross-country grouping

Clicking a pin or aggregate should open a compact details panel: source identifier, reported date precision, location precision, type/subtype, and impacts with explicit missing values. List other country records sharing the same source `event_id`, and let users highlight those records on the map. This exposes the existing distinction between 10,896 country records and 9,001 event identifiers.

Do not draw inferred propagation paths or link unrelated events simply because they occur on adjacent dates. Provide a keyboard-accessible event list as an alternative to targeting tiny markers.

Success: users can explain whether a displayed count means country records or distinct identifiers, and inspect the evidence without relying on a transient tooltip.

### 5. Add a controlled two-period comparison

An optional comparison mode could show two maps with synchronized zoom, the same selected hazards, and identical marker-size scales. Pair them with period totals and reporting coverage. Compare equal-duration complete periods by default and label partial intervals. Keep any differences descriptive of recorded data, rather than claims about future risk or a causal climate trend.

Success: changing the period preserves geographic framing and scales, making changes in recorded frequency or impacts interpretable.

## Suggested final-project scope

Prioritize overlap handling, linked spatial/time selection, impact sizing, and a small details panel. Together these form one coordinated geographic analysis view using geographic, categorical, temporal, and quantitative attributes. The two-period comparison is a useful extension if time remains. A brief guided example can then demonstrate the analytical workflow without adding another permanent control panel.

For evaluation, ask classmates to select two hazards, find a concentration in a chosen period, compare reported impacts, and retrieve one source record. Observe completion, mistakes about approximate locations or missing values, and whether users can distinguish country-record counts from event counts. Report observed findings rather than claiming that the feature count alone establishes success.
