# JFK / New York continuous city scenery

The regional layer adds continuous source buildings over the existing 60 km
terrain, with shared housing templates, source high-rise heights, advance
preparation and retained model caches. It preserves stand 9, runway 22R,
9/W/A/DB/C taxi route, the original airport DEM/coast, aircraft dynamics,
mission IDs, scores and bilingual radio. T4, the TWA shell and the control tower
retain their original source plans.

## Sources and dates

- © OpenStreetMap contributors / [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/),
  Geofabrik [New York](https://download.geofabrik.de/north-america/us/new-york/new-york-261120.osm.pbf)
  and [New Jersey](https://download.geofabrik.de/north-america/us/new-jersey/new-jersey-261120.osm.pbf),
  pinned **2026-11-20**. Both source hashes and sizes are recorded. Combining
  both states avoids losing the city buildings across the Hudson. Shared
  source identities are deduplicated; real water/airport/road conflicts are
  excluded. No sparse selection of one building per arbitrary cell is used.
- USDA Farm Service Agency / [NAIP](https://registry.opendata.aws/naip/), public
  domain with attribution, from the
  [Microsoft Planetary Computer NAIP catalog](https://planetarycomputer.microsoft.com/api/stac/v1/collections/naip).
  Selected New York/New Jersey acquisitions are dated **2022**, with **0.6 m
  native source pixels**. The manifests retain every source item ID, exact
  acquisition date, original COG URL, native GSD, STAC fingerprint and working
  image hash. This is dated aerial photography, not a current airport survey.
- The original OurAirports threshold endpoints and Mapzen/USGS DEM remain
  unchanged; see [airport source notes](JFK.md).

All runtime imagery and geometry are self-hosted and base-prefix-aware. No
World Imagery/Esri runtime API, credentials, online raster tiles or speech
provider are used. Native-resolution COGs are build-time range reads, not
browser map dependencies. The geographic derivative retains ODbL independently
of MIT original rendering and template code.

## Resolution and image processing

The source 0.6 m imagery is read through its reduced pyramids: **1.2 m working
pixels** around the airport and **2.4 m** regionally. Lossless local working COGs
retain their declared CRS and affine transforms. These are explicitly reduced
working images; rendered detail does not claim to show every 0.6 m source pixel.

A 2048² regional image and 4096² overview cover the whole terrain. The detail
layout contains 252 north-up 2048² WebPs: a 4 km spatial grid with its central
12 km square replaced by 2 km cells. After rotation to geographic bounds this
samples approximately **1.4 m** near the airport and **2.8 m** regionally.
Levels are bilinearly reprojected into EPSG:4326 with explicit south/west/north/east
bounds. Alpha marks absent source coverage; no generated replacement pixels
are used. Only three details are active, with four cached textures.

Terrain UVs derive from the same airport projection as the building geometry.
The images map onto the existing DEM triangles, without a floating image plane.
Masks use the original source marine polygons, including their 241 island holes.
Jamaica Bay, the Atlantic, Hudson water and source islands retain their physical
land/water classification. Ground photography does not redefine coastline or
terrain height. Legacy broad road/inland-water decals are omitted over the new
imagery; runway/taxi surfaces and clipped paint retain their established depth
order and physical grading.

## Buildings and original detail

The included pack contains **1,759,833 source buildings in 1,084 chunks**:
1,082,276 heights from explicit tags, 6,526 from floor counts and 671,031
estimated heights. Compressed geometry is **124.2 MiB**, decompressing to a
**173.8 MiB** binary; expanded runtime source arrays occupy **221.1 MiB** before
additional indexes and render models. Imagery levels total **281.5 MiB**, plus small masks.
These are disk/download sizes, not total browser memory consumption.

Source height tags take priority, followed by source floor counts at an estimated
3.1 m per floor. Valid high-rise tags are retained up to 650 m; template thresholds
never lower a source tower. Missing values use stable neighbourhood/type/area
priors for low houses, apartments, offices and warehouses. These mapped and
estimated heights are not independently verified surveys or live obstacle data.
Explicit underground, construction and unsuitable roof-only features are excluded.

Roofs sample photographic pixels inside source footprints, weighting boundary
pixels and excluding courtyard holes. Blue/red panels and dark tar roofs are
retained; all OSM outlines remain independent of photographic colour screening.
Colour comes from the reduced working files, not hypothetical native-resolution
facades. Facades use estimated coherent brick/stone/siding palettes and metre-scaled
window patterns. Source roof-shape tags influence shared flat/gable/hip selection
where supported; untagged roof forms are stable visual estimates.

Repeated houses reuse compact per-instance parameters and shared prototype
vertices. Complex nearby outlines/courtyards retain their source geometry.
Middle-distance ordinary buildings share boxes; distant low housing uses
source-derived district massing while towers stay individual. All middle/far
models prepare before ready, and nearby detail warms in every direction.
Prepared objects and arrays survive camera turns/revisits until world disposal.
GPU residency is managed separately. Full source polygons/heights drive camera
avoidance, swept contact and obstacle prediction independently of render LOD.
Only the accepted world activates the JFK-specific contact index.

The original airport pass adds source-clipped rooflights, modest roof services,
glazed bridge sections, narrow framing and local cast/received sun shadows.
These are plausible original construction details, not reproduced commercial
models or engineering drawings. The airport source path/terminal/stand boundaries
are unchanged. Source geography/photography dates can differ; neither implies
current terminal availability, a certified procedure or real-world clearance.

## Optional rebuilding and verification

Included assets allow normal builds and play without Python or network access.
Build-time source tools require numpy, Pillow, rasterio, pyproj, osmium and Shapely.
An optional C compiler accelerates the identical footprint sampling kernel;
without it, the original Python sampler remains available. Run
`python ops/check-jfk-roof-sampling.py` to compare actual source footprints.
The recorded audit matched 241 footprints exactly; a separate 399-building
anchor comparison retained original colours and attributes after spatial bucketing.
Source/working caches stay outside the checkout in `/tmp/pilot-jfk-city/` and
`/tmp/pilot-sim-jfk-data/`.

```sh
python ops/fetch-jfk-city.py
python ops/build-jfk-imagery.py
python ops/build-jfk-city.py
node ops/pack-city-buildings.mjs /tmp/pilot-jfk-city/buildings.jsonl jfk
node ops/check-jfk-city-data.mjs
npm --prefix game run test:flight
npm --prefix game run build
npm --prefix game run test:sites
```

The airport builder can acquire the pinned New York PBF first. `--context-only`
extracts the reusable OSM context without waiting for imagery. Remove the context
pickle when changing source extraction rules. Ordinary builds only check the
included hashes and do not reacquire source data.
`--from-candidates --from-buckets --resume-colours` can resume a colour pass
only with unchanged candidate inputs, imagery and processing rules.

`buildings-v1.json`, `.bin.gz`, `imagery-v1.json` and `sources-v1.json` are
separately downloadable under `assets/cities/jfk/`. Binary 0.02 m quantisation is
storage precision, not map accuracy. Native regression verifies source coverage,
heights/courtyards, marine exclusions, real flights with city collisions active,
shared roof/height behaviour and persistent model identities. Independent browser
scenes cover the terminal, Queens roofs, city, approach and bay; real UI checks
exercise both camera modes, airport presentation, pause/orbit and both languages,
with external requests blocked.

Six independent 1000 × 625 browser views recorded 34–144 draw calls,
0.4–13.3 MiB of visible building geometry and approximately 191–212 MiB of
estimated imagery GPU memory. Prepared model arrays grew from 89.2 to 118.3 MiB
as nearby variants were encountered. A camera-away/return check retained every
prepared variant, with all 1,759,833 buildings preloaded and zero pending chunks.
These measurements describe the fixture, not whole-browser RAM or a frame-rate
guarantee; source contact arrays and rendering infrastructure consume more memory.

The complete native suite passed 332 tests and the static-hosting suite passed
four tests. The production build and real-game browser checks passed, including
paused introductory presentation at flight time zero, cockpit/exterior selection,
orbit and wheel zoom with an unchanged paused flight snapshot, both languages,
19 same-origin city requests and zero recorded browser errors. Browser evidence
is saved in `qa/jfk-city-game.json` and `qa/jfk-city-scenes.json`.
