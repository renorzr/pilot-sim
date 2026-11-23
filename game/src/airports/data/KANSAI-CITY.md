# Osaka Kansai / Osaka Bay continuous city scenery

The regional layer uses the existing 60 km airport frame and physical DEM.
It preserves both artificial islands, source coastline holes, T1's silver
airfoil roof, tower, elevated Sky Gate Bridge, stand 33 and the 06R departure.
Taxi permissions, aircraft, route navigation, landing assessment, scores and
bilingual radio remain part of the shared game.

## Source geography and interpretation

- © OpenStreetMap contributors / ODbL 1.0, Geofabrik Kansai extract pinned to
  **2026-11-20**. Full eligible regional footprints and courtyard rings are used;
  source heights/floors take priority over estimates. Airport, road and water
  conflicts are excluded. Source geometry is not shifted to match photographs.
- [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints),
  pinned repository revision `82577ce04b0e30668a4eecef124c38ba08b86c13`,
  under **CDLA Permissive 2.0**. Four Japan quadkey partitions supplement gaps
  in OSM; overlapping OSM buildings have priority. The catalog, original URLs,
  source file hashes and partition upload dates are retained. Japan footprints
  were introduced in the upstream 2023-03-13 release; source imagery spans
  multiple years. Upload dates are not per-building acquisition dates.
  `ms/` IDs encode quadkey and source row; they are deterministic local source
  identities, not OSM object IDs. A complete license copy is included.
- [GSI seamless photographs](https://maps.gsi.go.jp/development/ichiran.html),
  under the [GSI Content Terms](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html).
  Source: GSI Tiles / 国土地理院. Images are locally mosaicked, reprojected and
  resampled. 3,952 available JPEG tiles were retained from a land-restricted
  plan of 3,961; unavailable tiles are recorded rather than fabricated.

The GSI JPEG service does not expose original capture dates or a uniform
photographic survey resolution. Those fields remain unknown. The recorded
retrieval date is explicitly separate from photographic acquisition.
At the airport latitude, tile pixels span approximately **3.94 m** at zoom 15,
**1.97 m** at zoom 16 along the nearby coast, and **0.99 m** at zoom 17 around
the airport. These are tile pixel spacings, not verified original-photo accuracy.

All runtime files are self-hosted. There is no Esri service, key or runtime
request to GSI, Microsoft, OSM, terrain or speech providers. Source geography
retains its separate terms; original rendering/templates remain MIT.

## Appearance and loading

The included pack contains **1,107,260 buildings in 1,035 source chunks**:
602,428 OSM outlines and 504,832 supplemental Microsoft outlines. Its compressed
download is **75.5 MiB**; the raw binary is approximately 106.0 MiB and expanded
source/contact arrays occupy 132.3 MiB. Explicit height tags supply 64,785 values,
floor tags supply 22,097 and the remaining 1,020,378 heights are estimates.
Four explicit underground OSM objects were excluded in addition to normal
airport, road/water and duplicate filtering. The conservative photographic
vegetation screen excluded 225 Microsoft estimates while retaining OSM geometry.

The image pack contains regional/overview levels and 115 local detail WebPs.
These total approximately **98.5 MiB**, including small marine masks. Nearby
airport/coastal details retain WebP quality 91; regional 6 km details use quality
85 to bound distribution size without changing source roof-colour sampling.
Smaller cells serve the airport and nearby coastal housing. Native working
rasters supply footprint-weighted roof colours, preserving dark grey tiles and
blue/red roofs. Shared low-house templates favour gables and hips, with coherent
off-white, grey and muted facade estimates. Missing heights use stable house,
apartment and logistics priors. These are plausible visual estimates, not
surveyed reconstructions or live obstacle information.

All OSM footprints remain independent of photographic colour screening. Only
estimated Microsoft footprints with at least 95% footprint vegetation and 90%
local vegetation can be excluded; this conservative visual screen is not proof
of demolition. Colour sampling never moves a retained building or changes a
mapped height. Both the optional C kernel and original Python algorithm are
compared on actual source footprints while generating the data.

Marine masks retain every original island hole, including both airport islands.
The same DEM triangles supply ground rendering and collision. Photo pixels do
not redefine the coastline or create elevated ground planes. Legacy wide road
and inland-water decals are omitted over photography, while source runway/taxi
surfaces, their paint depth ordering and the elevated bridge stay intact.

The airport pass adds glazed passenger bridges, floor/roof trims and narrow
framing on the original paths, with local sun shadows. The player stand stays
clear. These details are original plausible geometry, not third-party models.

Compact shared models, near/middle/far LOD, all-direction nearby preparation and
full-region advance preparation use the existing mapped-city pipeline. Prepared
CPU models retain identity through camera turns until world disposal. Full
source polygons/heights independently drive camera avoidance, swept contact and
obstacle warnings, scoped only to the accepted Kansai world. IndexedDB persists
processed contact arrays, model arrays and visited images; GPU residency remains
bounded separately. Both languages show actual load/cache progress.

## Optional rebuild

Included runtime assets support ordinary offline tests/builds without Python,
GSI access or source downloads. Optional source tools use numpy, Pillow, osmium,
Shapely, rasterio and pyproj; a C compiler accelerates identical roof sampling.
Source caches stay outside the checkout in `/tmp/pilot-kansai-city/` and
`/tmp/pilot-sim-kansai-data/`.

```sh
python ops/fetch-kansai-city.py
python ops/build-kansai-imagery.py
python ops/build-kansai-city.py
node ops/pack-city-buildings.mjs /tmp/pilot-kansai-city/buildings.jsonl kansai
node ops/check-kansai-city-data.mjs
npm --prefix game run test:flight
npm --prefix game run build
npm --prefix game run test:sites
```

The airport builder can acquire the pinned PBF first. `--context-only` creates
the reusable OSM context before imagery is ready. Remove `osm-context.pickle`
if extraction rules or the source frame change. Do not silently reuse a context
from a different extract. Binary 0.02 m coordinate quantisation is storage
precision, not source-map accuracy. Building/imagery manifests and the combined
source index remain separately downloadable under `assets/cities/kansai/`.

Six native city tests passed, including real takeoff/landing with the complete
source contact index active. Existing 357 regressions also passed. Seven
independent 1000 × 625 browser views recorded 26–162 draw calls, 0–7.4 MiB of
visible building geometry, 50.1–69.1 MiB of prepared model arrays and approximately
191–212 MiB of estimated imagery GPU memory. Returning after a camera turn
retained prepared model identities with zero pending chunks. These describe
the fixtures rather than total browser memory or a frame-rate guarantee.

On a fresh Chromium profile, actual game loading took 25.7 seconds cold and
13.9 seconds warm. The warm run restored 1,362 model variants with building
binary and image network requests blocked. A corrupt model was rebuilt on its
own; denied storage fell back to ordinary loading. Interrupted/quota-limited
source writes remained unpublished. Timings depend on browser and hardware.

The production preview also passed real menu/keyboard/pointer checks for stand
departure, the arrival airport introduction, paused exterior orbit/zoom, cockpit
switching and both languages. Source attribution clears the pause indicator;
no browser runtime errors or external HTTPS data requests were observed.
