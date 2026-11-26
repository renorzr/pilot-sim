# Regional woodland scenery

The six mapped airports share `woodland-data.js` and `woodland-world.js`.
This first pass covers source-mapped `natural=wood` and `landuse=forest` areas;
individual street trees, garden trees and automatic planting across all green
image pixels are outside this pass. Grass, farmland and scrub are not treated
as woodland. Source coverage varies by airport and is not an exhaustive canopy map.

Daxing, Xiaoshan, Changi, Kansai and JFK reuse their attributed, pinned airport
OSM features. LAX uses `public/assets/cities/lax/woodlands-v1.json`, extracted by
`ops/build-lax-woodlands.py` from the same cached Los Angeles PBF as its geography.
That derivative retains source WGS84 coordinates, multipolygon holes, source
hash and ODbL attribution. Its generation needs osmium and the pinned PBF;
ordinary play, tests and builds need neither a download nor Python.

## Placement and appearance

The generator deduplicates overlapping woodland coverage on a stable 24 m grid.
Each accepted stand represents three shared, original code-authored trees.
Jitter, rotation, height and colour variation are deterministic across visits.
Missing heights use bounded regional estimates; canopy colours are sampled from
the existing regional/overview imagery with a restrained vegetation fallback.
These are visual estimates, not measured individual tree positions or species.

The generator retains source holes and excludes aerodromes, aprons, mapped water,
roads, runway/taxi strips, protected runway approaches, marine water and source
building envelopes. Trees follow the shared DEM using local ground gradients;
tree heights are never written into the terrain surface or runway radio height.

Near views use irregular rounded crowns and trunks; middle views use simplified
volumetric crowns. Far stands aggregate only complete neighbouring groups into
coarse canopy volumes, retaining individual edge stands and holes. Crowns are
opaque lit geometry, visible from overhead without vertical billboard collapse.
Near geometry supports shadows and derivative-filtered procedural foliage detail.
The geometry/materials are original; no new external tree model/texture is used.

## Residency, persistence and contact

Fine stands use eight float parameters and four colour/type bytes (36 bytes per
stand, shared across the stand's three trees). Spatial batches use shared
geometry templates and compact instanced attributes rather than per-tree meshes
or matrices. Middle/far variants are prepared before world readiness; near models
prepare in all directions ahead of their display range. Prepared models remain
resident until world disposal, so camera reversals do not regenerate them.

Processed fine/far arrays are stored through the existing chunked IndexedDB cache.
Namespaces include generation schema/grid configuration, airport/source features,
DEM/runway frame, imagery hashes and the source-building pack hash. Incomplete/invalid arrays rebuild; denied
storage still permits play. Loading contributes to real model/save progress.

Foreground activation installs a separate per-airport woodland obstacle index.
Camera rays, swept airframe probes and forward obstacle prediction use the same
source trees with simplified crown/trunk envelopes. A hidden destination load
does not activate contacts; disposal cannot remove a newer world's index.
Render LOD does not remove collision data or change assessed aircraft state.

`city.woodlandStats` exposes source bytes, tree estimates, retained batch counts,
visible instance/triangle counts, cache hits and a GPU instance-buffer estimate.
It does not claim measured total browser RAM or a particular frame rate.

## Checks

`node --test game/tests/woodlands.test.mjs` checks placement, exclusions, source
holes, terrain gradients, deterministic cache arrays, LOD volume/retention,
contact ownership and all six source regions. `ops/check-woodlands.mjs` validates
the shipped source derivative and is included in the build. Visual checks should
include side, overhead and distant views under the game's lighting, plus cold
and warm loads, and normal physical takeoff/landing with woodland contacts active.
