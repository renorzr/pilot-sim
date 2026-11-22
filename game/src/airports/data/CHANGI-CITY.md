# Singapore / Changi continuous city scenery

The original Changi terminals, Jewel, control tower and source stand A16 / 02L
route remain in place. The city layer adds continuous eligible building
footprints across the 60 km terrain rather than a sampled approach strip.
The packed database contains **176,208 buildings** in **577 source chunks**,
with **200** shared far district groups. Building download size is **13.7 MiB**;
shared decoded contact data occupy approximately **26.4 MiB**. The image pack is
**12.3 MiB** before its small masks.

This is a visual game scene, not an architectural survey or current obstacle
and navigation database.

## Sources

- © OpenStreetMap contributors, [Geofabrik Malaysia/Singapore/Brunei snapshot
  2026-11-20](https://download.geofabrik.de/asia/malaysia-singapore-brunei/malaysia-singapore-brunei-261120.osm.pbf),
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The same pinned
  PBF supplies the airport and city context. All eligible source ways and
  building multipolygons are retained, including courtyard holes. The source
  covers Singapore and neighbouring Malaysian territory, not all of Indonesia.
  Unmapped buildings are not invented in parks or offshore water.
- Contains modified Copernicus Sentinel data (2025–2026), processed by ESA /
  [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a).
  Tiles 48NUG and 48NVG, dated **2025-12-05, 2026-03-20, 2026-03-25 and
  2026-08-22**. RGB TCI source pixels have **10 m native resolution**. The
  [Sentinel data terms](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice)
  apply. Larger output dimensions do not provide sub-metre aerial detail.
- The original OurAirports endpoints and Mapzen/USGS DEM stay unchanged;
  [airport source notes](CHANGI.md) document their provenance.

All eight RGB and scene-classification source assets retain their source URLs,
item identifiers, exact datetimes and SHA-256 hashes. The output imagery,
marine masks and building binary also retain hashes. No reference photograph,
commercial model, Esri texture or external runtime map API is included.

## Image processing and geography

The [Sentinel-2 scene classification](https://sentiwiki.copernicus.eu/web/s2-processing)
rejects cloud, cirrus, cloud-shadow, bad and missing pixels. A roughly 100 m
margin reduces cloud fringes. Valid dated RGB observations are averaged to
soften variable baked illumination. Approximately **99.61%** of the output
pixel grid has a screened valid observation. Remaining pixels use a least-bright
observed fallback; this is not a guarantee of zero cloud or a single-date photo.
No generative replacement pixels are used.

The 2048² regional base, 4096² overview and 36 camera-prioritised 1024² detail
tiles are north-up EPSG:4326 images with explicit south/west/north/east bounds.
They map onto the existing shared DEM triangles. The marine masks are derived
from the original source sea polygons and preserve island holes. The authoritative
sea surface remains separate. Broad legacy flat road/inland-water overlays are
omitted over the new imagery; airport pavement, taxi lines and runway paint
retain their existing clipping/depth order and physical heights.

## Building interpretation and runtime

OSM height fields take priority, followed by building levels at 3.1 m per floor.
These are mapped source attributes, not independently verified survey heights.
Missing values use deterministic building-ID and neighbourhood estimates:
landed houses, apartment/HDB estates, shops and logistics differ in height and
palette. Small missing-height residential footprints stay low rather than being
turned into tall apartment towers. Source heights are not capped to the template
height or adjusted to clear flight paths.

Roof colours sample the screened satellite neighbourhood with vegetation/shadow
rejection. Facade colours are coherent estimated cream/pastel/grey palettes,
not colours measured from street photographs. Shared flat/hip/gable meshes use
compact per-instance attributes. Complex outlines/courtyards remain source-based
nearby; ordinary middle-distance buildings use shared boxes, and distant low
buildings use source-derived district massing. Tall buildings stay individual.
All middle/far models prepare before flight; nearby models warm in every direction.
Prepared CPU models persist through camera turns/revisits until world disposal.

Full decoded source polygons/heights drive camera avoidance, swept contact and
obstacle prediction independently of render LOD. Their index is scoped to Changi
and only activates for the accepted world. No changes are made to aircraft
physics, terrain, controls, missions, scores, language or radio.

The terminal pass adds original glazed bridge sections, roof/floor trims,
mullions, support piers and local cast/received shadows. Source bridge paths,
terminal outlines and all active-stand clearances remain unchanged. Detail is a
plausible visual interpretation, not a construction drawing.

## Rebuild and verify

Runtime assets are included. An ordinary build needs no Python, credentials or
source downloads. Optional source rebuilding requires Python with numpy, Pillow,
osmium, Shapely and rasterio. Preserve the pinned airport PBF in
`/tmp/pilot-sim-changi-data/` (the airport builder can download it).

```sh
python ops/fetch-changi-city.py
python ops/build-changi-imagery.py
python ops/build-changi-city.py
node ops/pack-city-buildings.mjs /tmp/pilot-changi-city/buildings.jsonl changi
node ops/check-changi-city-data.mjs
npm --prefix game run test:flight
npm --prefix game run build
npm --prefix game run test:sites
```

Building/imagery manifests and the combined source index are downloadable under
`assets/cities/changi/`. Binary rings are quantised to 0.02 m for storage; that
precision is not the accuracy of the source map. Original code and architectural
templates remain MIT; source-derived geography retains ODbL, and imagery retains
Copernicus attribution/terms. Source cache files are build inputs, not runtime
API dependencies. Delete `osm-context.pickle` when changing extraction rules.

Render-only browser checks cover the terminal, overview, Tampines, Punggol and
Pulau Ubin coast. Real-game browser checks use actual keyboard/pointer actions,
with external network requests blocked. Flight regression installs the real
building contact index and completes both takeoff and landing using physical
controls. Camera reversals must reuse prepared model identities without work
queues, and world disposal releases the airport-specific resources.


Recorded inspection results: five independently rendered views used 94–224 draw
calls and about 0.31–0.59 million triangles. Prepared geometry grew from 32.5 to
65.2 MiB as additional neighbourhoods were visited; models stayed resident.
Estimated texture allocations were 142.7–148 MiB (including mipmaps and marine
masks). These are scene/buffer measurements, not a guarantee of total browser
RAM use or device frame rate. All 176,208 buildings and 577 middle chunks were
prepared before ready; reverse views had no model regeneration or pending queues.
