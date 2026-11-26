# Airport ground roads and traffic

All six airports have an airport traffic network plus a streamed regional road
network across their existing 60×60 km terrain frame. The detailed airport
network retains the 6 km reference-point radius, junction reservations and
following logic. Regional traffic follows the **aircraft position**, not the
view direction or the airport centre, so departure/approach roads beyond that
radius continue carrying vehicles.

Roads use the same local runway frame as buildings and imagery. Demand, missing
lane values and bridge heights are plausible estimates, not measured traffic.
Changi and Kansai keep left-hand traffic; the other four use right-hand traffic.
Original one-way directions remain intact.

The following table describes the detailed airport networks. Regional datasets
are separately tiled and fetched only around the aircraft.

| Airport | Driving side | Road segments | Compressed source bytes |
| --- | --- | ---: | ---: |
| lax | right | 20,631 | 1,470,073 |
| xiaoshan | right | 6,711 | 414,558 |
| changi | left | 8,711 | 797,779 |
| jfk | right | 16,523 | 1,175,442 |
| kansai | left | 2,125 | 169,895 |
| daxing | right | 1,881 | 122,955 |

## Source and regeneration

- `public/assets/cities/<airport>/traffic-v1.json`: manifest, source identities,
  attribution, class counts and processing assumptions.
- `traffic-v1.source.json.gz`: compressed attributed source nodes, split road
  segments, source controls, node-via restrictions and unioned ground polygons.
- LAX uses BBBike Los Angeles, 2026-11-14. Xiaoshan uses Geofabrik Zhejiang,
  2026-11-19. Changi, JFK, Kansai and Daxing use the existing Geofabrik
  Malaysia/Singapore/Brunei, New York, Kansai and Hebei/Beijing snapshots from
  2026-11-20. Exact URLs and original PBF SHA-256 identities are recorded in each
  manifest and checked against the airport pack before extraction. The original
  PBFs are not required to run, test or build the game.
- Attribution: © OpenStreetMap contributors, ODbL 1.0. The distributed compressed
  JSON is the attributed derivative database, including source way/node IDs and
  retained road tags. See <https://www.openstreetmap.org/copyright>.

Rebuild offline with Python, `osmium` and `shapely`:

```sh
python ops/build-airport-traffic.py --airport changi --pbf /path/to/malaysia-singapore-brunei-261120.osm.pbf
node ops/check-road-traffic.mjs
```

Public motor roads are selected by access tags and road class. Parking aisles,
driveways, private roads and pedestrian-only paths are excluded. Surface roads
are excluded from runway, taxiway and apron reservations. Tunnels preserve
network connectivity but draw neither surface pavement nor surface vehicles.
Actual shared OSM node IDs connect roads; crossings at different levels do not
create false intersections. Node-via `no_*` and `only_*` restrictions are retained;
via-way restrictions, lane-specific turn tags and conditional restrictions are
not modeled in this first version.

Direction, lane counts, width and posted speed use source attributes where
available and stable class defaults otherwise. OSM `layer` gives ordering, not
metres: bridge clearance is explicitly estimated at 6 m per positive layer,
capped at 18 m, with connected approach ramps estimated at a 6.5% grade. For Kansai's coastal connector, estimated decks use 8 m per positive layer
above the higher of terrain and airport datum, so coarse coastal DEM cells
cannot put cars below the water or an unrelated bridge mesh. The former
standalone bridge is delegated to the shared road renderer. These are plausible
scenery elevations, not surveyed bridge heights. Source signal
nodes use estimated alternating phases, not real timings. Junction reservations
provide simple yielding; detailed stop/give-way sign priority is not modeled.

## Aircraft-centred regional streaming

`traffic-region-v1.json` describes 4 km spatial tiles and immutable compressed
source chunks under `traffic-region-v1/`. Their source uses the pinned PBFs above;
JFK additionally uses the pinned New Jersey extract already attributed by the
city building dataset. Whole OSM way identities and cumulative-distance intervals
are preserved across tile boundaries. Nothing is invented to extend roads over
missing source coverage or the sea.

```sh
python ops/build-airport-traffic.py --airport lax --regional --pbf /path/to/LosAngeles-2026-11-14.osm.pbf
# JFK can use --supplemental-pbf /path/to/new-jersey-261120.osm.pbf
node ops/check-regional-traffic.mjs
```

`regional-traffic-world.js` selects nearby tiles using aircraft coordinates and a
15-second velocity lead, capped at 3 km. Near districts include minor roads;
farther districts prepare only major-road geometry. New full-detail replacements
are prepared before replacing an existing major-only district. Camera turns do
not change the requested footprint. At most 28 tiles are requested and 32 are
retained, with unneeded geometry evicted toward an 80 MiB surface budget. Required
nearby tiles remain available even if their combined geometry exceeds that target.

Regional vehicle selection covers approximately 5 km around the aircraft; minor
road traffic tapers beyond 2.5 km. Selection is capped at 3,600 additional vehicles
and shared instance buffers are allocated once. Distant geometry and vehicles are
culled by the camera and projected size after aircraft-based selection. Routes
and lane templates are prepared lazily, avoiding a complete city vehicle fleet.
The airport fleet continues its existing simulation, so both can overlap the
transition vicinity without resetting either system.

`regional-traffic-flow.js` uses reproducible per-lane speeds, headways, vehicle
identities, colours and phases. Position is a function of the shared traffic
clock. Tile eviction, reloading or camera changes cannot rewind a car. These
regional flows use lighter junction behavior than the detailed airport network;
they do not claim exact signal phases, driver priorities or measured local demand.
Vehicles fade at actual source-route ends and the airport transition, rather
than restarting at each tile seam. Normal pause and presentation clocks use the
same rules as airport traffic.

Regional source blobs and prepared major/full geometry are cached in IndexedDB
under source/terrain/model identities. In-memory geometry is bounded; previously
visited districts can reconstruct the same vehicle positions at the current
clock from their cached data. Missing or cancelled tiles cannot install late
models, and denied storage still permits in-memory play. Static bridge contacts
and car contacts use the same committed tile geometry and car poses as rendering.
Initial landing-practice footprints are prepared around the aircraft's starting
position before airport loading completes. Destination warming also waits for
that footprint, keeping prefetch ownership isolated from the accepted world.

## Detailed airport traffic and reference budgets

`road-data.js` builds directed, offset lane paths and smooth junction connectors.
`road-traffic.js` advances a deterministic fleet at 10 Hz and interpolates poses
for rendering and contacts. Normal pause freezes traffic; fast-forward uses
simulation time; airport/cinematic presentation uses its own elapsed clock while
aircraft physics is held. View changes do not respawn cars. Routes avoid interior
dead ends, follow lane direction, respect signals and reserve junctions/exits.
Following cars maintain spacing. Boundary exits fade and recycle at outer entry
roads. This is deliberately lighter than a full traffic microsimulation.

Density is configured independently by road class and scales with lane length:
motorway > primary > secondary > tertiary > residential > service. The detailed airport
fleet is capped at 3,600 per active airport; smaller networks seed fewer cars. Five original
shared body styles cover sedans, SUVs, vans, trucks and buses, with stable colours.
Cars use two geometry levels, hysteresis, frustum and subpixel culling, and a
5.5 km visibility limit. Instanced vehicles require at most ten draw calls.
All logical vehicles continue outside the view, retaining their identity.

Detailed airport road polygons are unioned offline to avoid coplanar overlap.
Regional road strips use source distance intervals and the same graded terrain. Ground
surfaces split on the existing 250 m terrain triangle boundaries. Major-road
markings fade with distance. Opaque elevated decks, rails and piers have volume;
piers avoid lower surface-road footprints. Static geometry uses retained 1.5 km
district batches for frustum culling. New surface road exclusions are also passed
to woodland preparation so trees do not grow through the added streets.
Xiaoshan's legacy road strips are clipped outside the full terrain footprint so
they cannot compete with newly streamed pavement.

The LAX reference region has approximately 457,240 static road triangles,
6.8 MiB of graph arrays, 29.8 MiB of prepared arrays and 38.7 MiB of GPU surface
attributes, plus about 0.55 MiB of vehicle instance buffers. These are array/GPU
budgets, **not total browser memory**: source objects, graph indices, junction
connectors, collision objects, renderer allocations and temporary preparation
add overhead. Connector reuse is bounded to 8,192 cached paths. First preparation
also allocates temporary triangulation data; processed cache hits avoid that work.

## Cache, contacts and ownership

Everything loads from self-hosted assets through `siteUrl`; there is no Esri or
external runtime map request. The existing IndexedDB city cache stores the source
blob and prepared lane/surface arrays plus bridge metadata. Source checksums
support both a raw `.gz` file and HTTP `Content-Encoding:gzip`, which browsers
automatically decode. A small manifest is revalidated; cached metadata and source
allow recovery when offline. Processed namespace identities include source hash,
terrain identity and `ROAD_DATA_REVISION`. Partial, corrupt or cancelled entries
rebuild rather than becoming valid cache hits. Storage denial falls back to an
in-memory load. Current vehicle positions are not persisted across fresh flights.

The accepted world alone installs the road contact provider. Prefetching cannot
replace the active airport's contacts, and obsolete cleanup cannot remove a new
owner. Camera rays, swept airframe contacts and obstacle prediction use the same
interpolated car poses and bridge dimensions as rendering; render LOD does not
remove collisions. Roads do not change the DEM or manufacture aircraft motion.
Vehicle and overpass impacts have Chinese/English messages.

`game/tests/road-traffic.test.mjs` covers graph direction, restrictions, short links,
following, signal phases, pause/presentation clocks, camera reversal, shared
templates, cache corruption/offline/gzip responses, ownership and actual LAX
takeoff/landing with road contacts installed. `airport-traffic.test.mjs` additionally
checks the five other source graphs, fleet continuity, geometry budgets and both
physical takeoff and landing with contacts installed. `ops/check-road-traffic.mjs` checks
distributed hashes, frame, source counts, driving side and protected runway clearance
at all six airports. `ops/check-road-traffic-game.mjs <url> - <airport>` exercises
the real UI, presentation traffic, pause, view changes and resume.

`regional-traffic.test.mjs` covers aircraft-centred tile selection, persistent
vehicle identities through eviction/revisits, dynamic shared instance pools,
major-to-full district upgrades, asynchronous cancellation, cache reuse/denial,
handedness, source intervals and genuine roads beyond 12 km at all six airports.
The LAX browser check additionally moves the real aircraft through normal controls
and asserts that regional focus follows its physical position beyond the airport
while the camera can move independently.
