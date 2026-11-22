# LAX city scenery source pack

This first city pass covers urban ground, Dockweiler, SoFi/Kia Forum and a
light Downtown skyline. It retains the original LAX25R/stand86B/DEM/coast/taxi
pack and all mission IDs/revisions. Santa Monica Pier and northern hill
landmarks remain outside this pass.

## Datasets, dates and distribution

- City geometry: © OpenStreetMap contributors, ODbL1.0, the fingerprinted
  BBBike LosAngeles2026-11-14 PBF used by the existing LAX pack. The reduced city
  database has1,900 real sampled building footprints and3,534 context features;
  it is not an exhaustive house model. Source IDs/tags are retained.
- Ground imagery: genuine USDA FSA NAIP, captured2022-05-11, public domain with
  attribution.31 COG records and catalog hashes are preserved in
  `assets/cities/lax/imagery.json`. The original unsigned COG URLs point to the
  NAIP collection distributed by Microsoft Planetary Computer. Source0.6m RGB
  data are reprojected/resampled into a4000×2650 regional WebP and eight1024²
  details. The game uses those self-hosted outputs, not runtime service calls.
- The second imagery pass adds `imagery-lod.json`: a2048² regional base covering
  all four corners of the existing60km terrain, the original4000×2650 city
  image as a middle level, and nineteen2048² details. Eighteen details cover
  the airport and25R approach through the22km arrival entry; one covers Downtown.
  The114 catalog COG records span24 April–13 May2022; per-source dates and hashes
  remain in the manifest. These are genuine new source reads, not upscaled old
  screenshots. Runtime imagery is entirely self-hosted; no Esri integration,
  credentials, map proxy or external imagery request is needed.
- Geography and imagery have deliberately separate dates. The imagery is not
  described as a photograph of2026 construction. Existing airport meshes,
  current sampled footprints and estimated architecture sit above the dated
  base. See [original airport sources](LAX.md) for runway/DEM/coast licenses.

`lax-city.json` and downloadable `assets/maps/lax-city-source.json` are identical.
The compact `lax-city-physics.json` derivative is also downloadable and retains
ODbL. It selects1,507 ordinary source-aligned boxes outside the existing airport
and includes the16 curated landmark records. Its frame is the fixed25R runway
frame, and its source SHA256 is checked by tests.

## Landmarks and estimates

SoFi uses source way860635712 and the union of ETFE roof parts860635710/711,
not the nearby same-named bus stop. Its roughly319×398m canopy plan is source
geometry;45m top height is a documented visual estimate. Forum uses way26320999
and tagged19.3m height. Its real NAIP roof is light grey/white, with red exterior
and white colonnade. Fourteen source-positioned Downtown towers include
Wilshire Grand Building way496246723 (335.3m) and U.S. Bank Tower (309.9m).
Architectural subdivisions remain original visual estimates; see the
[landmark geometry notes](../lax-city-landmarks-notes.md).

## Continuous source-footprint city and shared models

`buildings-v2.json` / `buildings-v2.bin.gz` contain the expanded source database
across the full 60 km LAX terrain, replacing the old airport-radius / narrow
approach strip selection. Selection is exhaustive within the available source
PBF, with airport/curated-landmark exclusions, duplicate/invalid-footprint
filtering and source sea tests. This is not a claim of surveyed completeness.
The included pack contains 1,894,606 buildings in 947 source chunks (263
shared far draw batches), compressed to
168,222,583 bytes (160.4 MiB). It retains 1,725,870 tagged heights, 3,455
floor-derived heights and 165,281 programmatic estimates.
Exact count, packed bytes, tile bounds, tagged/floor/estimated height counts,
source/output hashes and dates are in the runtime manifest. The previous v1
pack remains only for reproducibility and cached older previews.

The format3 header retains source rings/courtyard holes and adds a precomputed
oriented frame (centre, width, depth, angle, footprint fill) to each 76-byte
record. Oriented dimensions/offsets and ring points are quantised at 2 cm;
angles use 0.0001 radians. Collision, camera rays
and obstacle prediction retain the entire decoded source geometry and spatial
index regardless of rendering LOD. Building heights never modify the DEM.
Tagged heights need not be surveyed; missing heights use type/area/ID estimates.
NAIP neighbourhood roof medians reject vegetation/shadows; walls use neutral,
stable neighbourhood palettes. Coarse regional imagery supplies the outer city.
Neither an LLM nor an external runtime service is used.

Repeated low homes share three original flat/hip/gable templates. Each instance
stores 39 bytes of position/rotation, dimensions/roof rise, type and roof/wall
colours instead of its own vertices or a 64-byte transform matrix. Template
vertex arrays are shared between spatial batches; attribute wrappers/GPU
lifetimes are independent. Nearby simple rectangular non-residential buildings
also share flat templates. Irregular near footprints and courtyard holes retain
individual source geometry. Templates and roof slopes are visual architectural
estimates; source polygon prisms remain conservative contact proxies.

Middle-distance ordinary buildings share boxes, preserving oriented dimensions,
height, position and colour. Large/irregular towers retain source silhouettes.
Beyond about 13 km (11 km return hysteresis), low homes use 100 m source-derived
district proxies: area, height and roof/wall colours are aggregated from actual
buildings, with occupied area retained. This reduces subpixel geometry rather
than filling parks or oceans with random buildings. Tall buildings remain
individual. Neighbouring 2×2 source tiles share each far draw batch and switch
LOD together without overlaps. The renderer uses inexpensive distant materials, with metre-scaled
procedural windows and the shared NAIP roof projection only for nearby detail.

All middle/district chunks are prepared before accepting the world. Detail
warms within 3.2 km in every direction, displays below 2.2 km and uses 3 km
return hysteresis. All prepared model objects and compact instance arrays
remain cached until world disposal; turns/revisits do not queue reconstruction.
GPU buffers have an independent soft 256 MiB budget, reclaiming only cold,
unused buffers beyond 6 km while retaining CPU models. Lit and shadow programs
apply the same instance transforms; chunk bounds include deformed models.
An obsolete asynchronous world cannot replace the accepted collision index.

The lossless4000×2650 R8 sea mask comes from the existing OSM marine polygon,
retains all source island holes and is conservatively inset0.708 pixels to
avoid removing land. The sea remains a flat polygon surface; land keeps the
same DEM. The mask prevents coarse submerged grid triangles producing visible
sand teeth inside the real ocean.

The expanded base has its own2048² mask from the same authoritative sea
polygons. The original fine coastal mask remains active within the city image
so the coarser outer mask cannot weaken the existing shoreline treatment.

## Runtime imagery levels

`imagery-stream.js` prioritises the camera position and the ground ahead of its
view. Three detail sampler slots share a four-image cache with at most two
concurrent requests. The base and middle level remain visible during loading
and missing optional details. Returning to a nearby view reuses cached tiles;
evicted textures and late results after an airport switch are disposed.
The estimated image/mipmap/mask residency is below200MiB at full cache size;
this excludes other scene assets and transient browser image decoding.
Texture arrivals invalidate the renderer even during a paused flight, without
advancing physics. Terrain vertices, contact and GPWS remain unchanged.

## Rebuild and checks

Ordinary clone/install/build does not need geographic tooling or network data:
all runtime media and derived JSON are included. `npm run build` regenerates
the compact layout with Node and checks the finalized selection.

Optional source refresh needs Python osmium, ijson, shapely, Pillow, NumPy and
rasterio, plus the original fingerprinted PBF and source COG access:

```sh
python ops/build-lax-city-data.py --pbf /path/to/LosAngeles-2026-11-14.osm.pbf
python ops/build-lax-imagery-lod.py
python ops/build-lax-regional-city.py --pbf /path/to/LosAngeles-2026-11-14.osm.pbf
node ops/pack-lax-regional-city.mjs
node ops/build-lax-city-layout.mjs
npm --prefix game run test:flight
```

Raw PBF, COG/intermediate reads and raw scan caches belong outside the checkout.
`--skip-imagery` reuses the verified imagery metadata/assets. Keep all acquisition
records, source hashes, licenses, geography/UV alignment and measured image
checksums together when updating. Tests reject provisional or undersized city
layouts. Native checks cover source identities, dense-pack hashes, finite near/far mesh
bounds, courtyard rays, dense-data takeoff/landing, disposal, image hashes, marine surface, warning/impact and
normal flights. Browser render helpers use an explicitly isolated camera-only
asset scene; real-game checks and landing use actual UI/flight controls.
