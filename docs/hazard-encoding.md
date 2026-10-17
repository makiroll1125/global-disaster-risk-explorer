# Hazard colors and hover descriptions

The shared categorical palette and short descriptions live in `js/hazards.js`. Map markers, pulses, histograms, type-ranking bars, filter-menu swatches and streamgraph layers use the same colors. Heatwave is orange and Wildfire is crimson. Flood, Riverine flood, Flash flood and Coastal flood use indigo, green, magenta and turquoise respectively, rather than adjacent blue shades. Earthquake remains amber and Tsunami remains blue. Every category has its own color and a visible text label.

The descriptions explain terminology in the disaster-type ranking, global checkbox menu, map color key, individual map-marker tooltips, streamgraph layers and its legend. The menu, ranking and legends also expose descriptions when focused with the keyboard. The text is explanatory, not a replacement for the source classifications or an inference about an individual event. General Flood, Storm and Severe weather labels explicitly retain the source's lack of a more specific classification. Sinkhole and Firestorm remain unavailable because the export has no explicitly classified records for them.

The summaries are paraphrased from these primary references:

- EM-DAT: [meteorological hazards](https://doc.emdat.be/docs/data-structure-and-content/glossary/meteorological-hazards/), [hydrological hazards](https://doc.emdat.be/docs/data-structure-and-content/glossary/hydrological-hazards/), [geophysical hazards](https://doc.emdat.be/docs/data-structure-and-content/glossary/geophysical-hazards/), [climatological hazards](https://doc.emdat.be/docs/data-structure-and-content/glossary/climatological-hazards/), [biological hazards](https://doc.emdat.be/docs/data-structure-and-content/glossary/biological-hazards/) and [extra-terrestrial hazards](https://doc.emdat.be/docs/data-structure-and-content/glossary/extra-terrestrial-hazards/).
- UNDRR: [insect pest infestations](https://www.undrr.org/hips-cluster/insect-related-diseases).
- USGS: [types of landslides](https://www.usgs.gov/media/images/types-landslides) and [sinkholes](https://www.usgs.gov/faqs/what-a-sinkhole?page=1).
- NOAA: [what is a firestorm?](https://www.nesdis.noaa.gov/about/k-12-education/scijinks/what-firestorm).

Clicking a disaster-type ranking row or checkbox always toggles that type alone. Starting from All, clicking Earthquake excludes only Earthquake; clicking it again restores it. None provides a starting point for choosing a small subset. All and None retain the same meaning in both controls, and unavailable source categories are excluded from the All selection.

Selected-period map dragging batches input into animation frames, reuses existing geometry and glyphs, and suspends SVG feature hit testing and hover-tooltip layout during a gesture. Map painting is contained within its viewport, and the map layers can be composited independently. Browser checks cover final marker positions and counts after a drag, country/marker inspection after the gesture, expanded layouts, real area/date brushing, keyboard navigation and narrow viewports.
