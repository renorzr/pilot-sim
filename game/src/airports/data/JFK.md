# New York John F. Kennedy airport data

`jfk.json` is an offline source-geography database for KJFK / JFK. The playable runway is **22R**, with **stand 9** as the actual OSM departure anchor. Other runway strips are source scenery. This is game routing, not an airport operating chart or a live clearance.

## Sources and licensing

- [OurAirports data](https://github.com/davidmegginson/ourairports-data): airport and all four open runway pairs, public domain / Unlicense. Source runway endpoints define the active tangent frame, including the true heading derived from 22R toward 04L; the game does not substitute magnetic runway numbers for true bearings.
- © OpenStreetMap contributors, [Geofabrik New York pinned extract, 20 November 2026](https://download.geofabrik.de/north-america/us/new-york/new-york-261120.osm.pbf), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/): source airport outline, stand lead-ins, taxiways, terminal/building footprints, roads, land use and coastlines. The pinned extract is approximately 476 MB; only a compact selected derivative is shipped. Source CSV/PBF/terrain hashes are recorded in the pack.
- [Mapzen / Tilezen terrain tiles](https://registry.opendata.aws/terrain-tiles/), source elevations courtesy of USGS: 129 × 129 bilinear Terrarium samples in a separate airport DEM. [Source attribution and terms](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) remain separate from the MIT game code.

The download is available through the game's airport-source link as `assets/maps/jfk-source.json`. No online map, raster-tile or speech request is needed during play.

## Route and coordinates

Coordinates are metres in the active 22R local tangent frame: x is runway-right, z is the approach side; forward yaw 0 follows runway 22R along −z. Stand 9 uses source parking-position **way/1011116770**. The source stand nose endpoint anchors the visual aircraft, with its game CG set back 15 m along the final source lead-in segment. Automatic crew preparation abstracts pushback/reposition, handing control to the player at the source lead-in/taxiway connection.

The connected source route follows **9 → W → A → DB → C → 22R**. Its manual taxi portion is about 1.4 km; the optional skip ends stationary at the runway-external hold. The hold is a game CG stop at x = 110 m on a real entry taxiway, retaining 15 m nose clearance outside the protected strip. It is explicitly not a claimed published holding position.

Runway entry remains manual after a distinct tower entry clearance. A documented 50 m radius game alignment arc joins the OurAirports threshold-based centreline, then a further 50 m straight portion allows steering to settle before the player stops for takeoff clearance. This connects source datasets whose centreline positions can differ; it does not claim surveyed entry accuracy. All source identities and estimated/synthetic route segments are distinguished in `jfk-departure.json`.

## Coast and scope

Sea surfaces are polygonized from oriented source `natural=coastline` ways (land on the left, sea on the right). The display rectangle is only a clipping boundary; shorelines are not guessed. Closed land rings remain island holes. Render sea polygons with their holes at actual sea level relative to the active threshold, and retain the shared terrain/contact grid. Jamaica Bay and the Atlantic are not extruded or draped over the DEM as land surfaces.

Airport source presence is not proof of current runway, stand or terminal availability. Detailed scene geometry omits explicitly proposed/construction or “New Terminal” features and uses documented exterior estimates. The stand route uses stable source identifiers and the selected operational game runway. See [scene notes](../jfk-scene-notes.md) for the primary visual references and deliberate simplifications.

## Rebuild

Build-time tools: Python 3, Pillow, osmium and Shapely. Run `python ops/fetch-jfk-data.py`; the default cache is `/tmp/pilot-sim-jfk-data`. `--cache` and `--output` override paths; `--geography-only` rebuilds geography and `--departure-only` re-curates the route from the existing pack. These tools are not runtime dependencies.


## Supplementary source objects and validation

The New York state extract ends at the New Jersey boundary, leaving four coastline chain endpoints inside the displayed region. The builder follows exact connected `natural=coastline` objects through bounded, cached [OpenStreetMap API](https://wiki.openstreetmap.org/wiki/API_v0.6) lookups. It adds 83 actual source ways rather than drawing guessed closing segments. Each fetched object has a cached response hash; the `coastlineSupplement` metadata records identities, source URLs and the derivation. The API's full [Terminal 7 relation](https://api.openstreetmap.org/api/0.6/relation/3778808/full) supplies its outer plan and two courtyards because those untagged relation-member ways are omitted by the regional tagged-way selection. This bounded source supplement is recorded separately from the PBF hash.

Whole coastal faces are classified by the length-weighted votes of right-side (offshore) and left-side (land) samples along the oriented source coast. A single dangling pier sample cannot mark the entire Long Island or Manhattan face as water. The final source package contains 6,982 selected features, two marine polygons and 241 island holes. Independent geographic probes keep JFK, stand 9, Long Island, Manhattan, Brooklyn, Jersey City, Broad Channel and Long Beach on land, while Jamaica Bay and the Atlantic are water. All marine polygons are valid; source IDs, 16,641 DEM samples and numeric values are checked before output.

A complete manual ground-control regression travelled about 1,582 m, including 190 m of actual runway entry. It earned both clearances, stopped on the centreline at x≈0.44 m / z≈−218.76 m with heading error below 0.5°, and did not use the taxi skip. The source route is about 1,399 m; the extra physical distance includes the final entry and steering path.


## Continuous regional layer

The expanded city layer supplements this compact airport source with a separate
NY/NJ footprint database and self-hosted NAIP 2022 aerial imagery. See
[city source, resolution and rebuild notes](JFK-CITY.md). The selected source
terminal/stand/taxi/runway plans and original DEM/coast remain unchanged.
