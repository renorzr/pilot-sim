# Singapore Changi geography and departure data

`changi.json` is the offline WSSS / SIN scenery database used by the game.
The schema and coordinate conventions match the other airport packs. The
source database is downloadable separately from the game code.

## Sources and scope

- Airport reference and all three runway pairs: [OurAirports](https://github.com/davidmegginson/ourairports-data),
  Unlicense / public domain. The active runway is **02L**, using the real
  02L/20R threshold endpoints and their derived true bearing. Source threshold
  02L is 1.348970° N, 103.977997° E, elevation 6.7056 m. Runways 02C/20C and
  02R/20L remain source scenery; source presence does not imply a live runway
  availability or clearance.
- Airport structures, stands, taxiways, roads, land use and coastlines:
  © OpenStreetMap contributors, [Geofabrik Malaysia/Singapore/Brunei dated
  extract](https://download.geofabrik.de/asia/malaysia-singapore-brunei/malaysia-singapore-brunei-261120.osm.pbf),
  under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The approximately
  242 MB source is pinned rather than a moving `latest` URL.
- Terrain: [Mapzen / Tilezen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/),
  Terrarium zoom 10. Retain [original source attribution and terms](https://github.com/tilezen/joerd/blob/master/docs/attribution.md),
  including USGS SRTM/GMTED source credit. The 129 × 129 grid is bilinearly sampled
  to 0.1 m; that rounding is not survey precision.

The scenery and terrain selection bounds are
`[1.05,103.65,1.65,104.25]` (south, west, north, east), approximately 67 km each
side. Airport building detail bounds are `[1.30,103.965,1.405,104.04]`.
Horizontal geometry is real source geometry; building heights, roof details,
local ground grading, three-degree guidance and missed approach behaviour are
explicit game modelling choices. No current certified ILS, SID, STAR, airspace,
obstacle or operational taxi clearance is supplied.

The JSON retains a SHA-256 for the PBF, airport/runway CSV snapshots and every
source terrain tile. `fetchedAt` records packaging time, not the observation date
of individual features. Existing caches are reused deliberately.

Important source structures include T1 `way/26561741` (its overlapping roof
outline is `way/744653030`), T2 `way/173010412`, T3 `way/173010413`, T4
`way/409015814`, Jewel's main dome `way/744520551`, and the 78 m Changi Control
Tower `way/173010406`. Jewel's basement outline `way/547383951` must not become
a second opaque roof. The two source T5 outlines `way/683354842` and
`way/683354843` are tagged `building=construction`, not opened terminals.

In the original airport-only pack, ordinary buildings are restricted to the source Changi
aerodrome boundary `way/174037464`; only nearby primary/motorway roads and
substantial land use are retained. Coastlines and substantial water cover the
full terrain bounds. Ordinary building detail retains source ways; standalone
building-only multipolygons are omitted to avoid incidental hotel/fire-building
volumes over the curated terminal roofs. All retained geometry is clipped to
that rectangle, with
original object IDs and explicit clipping metadata. Small clipped extra pieces
carry `/clipN` IDs and a `sourceId` pointing back to the original object.

The expanded city layer now loads additional regional footprints and local
Sentinel-2 imagery from a separate pack; see [city source notes](CHANGI-CITY.md).
The original airport-only restriction above describes this source JSON, not
the coverage of the expanded city renderer.

## Real stand A16 departure derivative

`changi-departure.json` uses actual parking lead-in `way/1302460669`, ref
**A16**, at Terminal 3. The nose is its terminal-side endpoint, local
x=376.082, z=−245.670. Gate node `1838456044` identifies the associated passenger
gate; its coordinates are not used as the aircraft stop position. The aircraft
CG is set back 15 m along the lead-in. Automatic departure preparation abstracts
push/reposition and hands control to the actual apron-side endpoint at
x=245.263, z=−239.513 on V, with a heading matching the cleared taxi route.

The compact **A16 → V → V9 → W8 → 02L** route has 230.107 m of manual taxi to
the game holding point. Its V-to-V9 bend retains native curve
`way/173010614`; route graph intersections and only sub-metre joins preserve
source geometry. Rounded source-attributed route points are at most 0.244 m
from their corresponding ways. This is a curated game route, not a current
published clearance.

The holding CG reference is x=109.999, z=−124.203, approximately 47 m behind
real W8 holding-position node `6373464905`, retaining nose clearance outside
the protected game runway. W8 `way/173061512` then leads toward the runway.
The total runway-entry/alignment path is 188.648 m. After following W8 to x=50,
an explicit game alignment arc of about 50 m radius joins the runway centerline
at x=0,z=−175. A further 50 m straight segment allows steering to settle before
the lineup stop at x=0,z=−225. The optional taxi skip never grants runway entry
or takeoff permission; these remain separate game clearances.

The OSM western runway centerline is about 55 m from the axis derived from the
OurAirports threshold endpoints. The source thresholds define a 4035.427 m local
strip at true bearing 22.711468°, while the tabulated runway length rounds to
about 4000 m. The game deliberately keeps one consistent OurAirports frame and
labels its final alignment arc/holding reference as game choices, rather than
claiming precise surveyed or current published runway-entry geometry. The lineup
point leaves 3810.427 m of this game strip ahead.

## Coastal water

The source retains oriented OSM `natural=coastline` ways. Derived
`derived/sea/*` features use `natural=water, water=sea`, retaining per-feature
`sourceFeatureIds`, outer rings and island `holes`. Polygonization combines real
shorelines with the rectangular scenery clipping boundary. The boundary is a
display extent, not an invented shoreline. OSM's coastline direction places land
to the left and sea to the right; that orientation classifies marine faces.

Render those polygons with their holes at sea level, relative to the active
threshold elevation. Do not drape the sea surface over individual DEM samples.
The sea derivative is also ODbL and does not alter the licensing of the source
terrain or the MIT code.

## Rebuild

Build-time dependencies only:

```sh
python3 -m venv /tmp/changi-geography-env
/tmp/changi-geography-env/bin/pip install Pillow osmium Shapely
/tmp/changi-geography-env/bin/python ops/fetch-changi-data.py
```

The default source cache is `/tmp/pilot-sim-changi-data`. `--cache`, `--pbf`
and `--output` override source/output paths. `--departure-only` regenerates the
curated derivative from the bundled pack without network calls;
`--geography-only` regenerates just geography. The game makes no online map or
terrain requests and does not scrape OSM public raster tiles.

## Validation

The builder was run against the pinned cached PBF, CSVs and all nine terrain
tiles. An independent full source extraction matches every retained feature,
all terrain samples and provenance hashes after the documented selection,
excluding packaging timestamps. A departure-only rebuild matches the shipped
derivative exactly; graph construction is limited to the actual apron corridor
and completes in about one second on the development machine. The source pack and departure derivative contain only finite numeric
values, all seven departure source IDs resolve, and the DEM contains exactly
16,641 samples. Route lengths, 15 m CG setback, external holding/nose clearance,
final straight alignment and source-distance bounds were checked numerically.
All four derived marine polygons are valid, with 85 island holes in the main
marine polygon. Geographic probes keep the airport, central Singapore, Johor,
Pulau Ubin and Pulau Tekong on land, while sea east/south of Changi is water.
The integrated physical-control regression completed the full manual taxi and
entry, reaching final alignment at about x=0.43,z=−217.42 with heading error
under 0.5°. The final 50 m straight segment is required for steering to settle
before the lineup stop.
