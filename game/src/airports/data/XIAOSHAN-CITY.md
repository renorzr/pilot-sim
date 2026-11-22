# Xiaoshan continuous city scenery

The Hangzhou/Xiaoshan city pass reuses the shared near/middle/district renderer,
advance preparation and persistent model cache approved for LAX. Geography,
colours and architectural estimates come from the Hangzhou region. The existing
07 runway, stand251, Z11/B/B3/A/A1 taxi route, white/silver T4 complex, scores,
airport DEM and aircraft/flight dynamics remain intact.

The included pack has **781,740 buildings** (47,013 OSM and734,727 East Asian
footprints) in1,671 source chunks. Building data are55,773,941 bytes (53.2MiB);
the20 detail images plus overview/regional levels total16,050,574 bytes
(15.3MiB). Heights comprise2,580 source tags,750 floor-derived values and
778,410 programmatic estimates.

## Sources and dates

- Source building polygons: Shi, Zhu, Liu, Guo, Liu, Liu and Liu (2023),
  [East Asian building footprints](https://zenodo.org/records/8174931),
  DOI10.5281/zenodo.8174931, CC BY4.0. Hangzhou, Jiaxing and Shaoxing city members
  are selected from the immutable archived ZIP. Byte-range download avoids
  fetching the entire23GB archive; uncompressed member lengths and CRC32 are
  verified, with SHA256 fingerprints retained. The2023 date is publication,
  not a claim that every footprint was observed that year. Declared source
  UTM49N coordinates are explicitly transformed to WGS84 and the airport frame;
  no GCJ02 offset or reinterpretation of projected metres is applied. Independent
  planar overlays of six airport-neighbourhood patches confirmed registration
  at the native image scale; no scene-wide translation is introduced.
- Updated buildings, heights/floor counts, land-use, water, roads and airport
  context: © OpenStreetMap contributors / ODbL1.0, the already pinned Zhejiang
  2026-11-19 PBF. OSM building polygons take priority; overlapping older East
  Asian detections are removed. Source water/road/airport masks reject conflicting
  footprints. Real parks, fields and river areas are not randomly populated.
- Ground colours: [Copernicus Sentinel-2 L2A](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a),
  tile51RTP, acquired2025-09-16T02:41:41.024Z. Scene cloud cover is0.021493%.
  RGB true colour is **native10m**, not NAIP/sub-metre aerial photography.
  The original COG, STAC item and output hashes are recorded. Use follows the
  [Copernicus Sentinel Data Legal Notice](https://dataspace.copernicus.eu/terms-and-conditions).
  Attribution: Contains modified Copernicus Sentinel data (2025), processed by
  ESA / Microsoft Planetary Computer, with local rendering derivatives.

The combined source-derived geographic database retains ODbL and the East
Asian CC BY attribution separately from MIT game code. The runtime manifest,
binary database, imagery manifest and `sources-v2.json` are downloadable under
`assets/cities/xiaoshan/`. No raw23GB archive, credentials or online imagery
service is required to build/play the included assets. All runtime requests
are local and base-prefix-aware. No Esri integration is used.

## Rendering and estimation

Source coverage spans the existing60km terrain within available city-source
bounds; this is not an exhaustive/current survey of every real building.
Binary format3 retains source IDs/rings/courtyards, tagged-versus-estimated
height flags, inferred roof/wall colours and a compact oriented frame.
External IDs use the `eab/` namespace, never fabricated OSM way/relation IDs.

OSM heights take priority, followed by floor counts ×estimated3.1m. Remaining
heights and building types use source footprint area, local land use, nearby
OSM height statistics and stable source-ID seeds. Village low-rise homes,
apartment/office blocks and industrial halls have different priors. The immediate
airport neighbourhood has a low village/logistics prior only for missing heights;
source-tagged heights are retained and there is no runway collision exemption.
These are visual estimates, not surveyed facade, height or function records.

Repeated homes share original flat/hip/gable templates; simple rectangular
apartments reuse flat templates up to120m without lowering their source roof
heights. Dimensions, orientation and colours remain individual. Near complex
plans/courtyards retain source geometry; middle boxes and distant source-derived
district massing reduce repeated/subpixel geometry. White/grey facade palettes
follow local appearance, with stable variation. Native Sentinel-2 pixels are sampled within each footprint, excluding
courtyard holes and weighting partial boundary pixels. Vegetation/shadow rejection
retains blue and red roof panels rather than classifying blue as an error colour; its10m pixels project weakly over roofs so
small homes do not inherit strong ground/grass patterns as false roof detail.

The regional2048² base and4096² overview cover the terrain. Twenty1024² detail
tiles cover the airport, approach, river and city directions. Larger image grids
never claim more detail than the10m source. Only three details are active, with
four cached textures. The image levels share the same DEM UVs rather than a
second floating ground plane. Freshwater colours come from the dated image instead of stacked flat-colour
river/canal decals; source water polygons remain exclusion masks. The original
DEM, physical contact and source water geography are unchanged. Terminal/raised
bridge meshes now cast local sun shadows; airport plan/stand clearance stays.

All middle/distant variants prepare before world readiness, nearby models warm
within3.2km in every direction, and prepared objects/arrays remain until world
exit. CPU model retention and GPU residency are independent. Building source
contact, camera rays and obstacle prediction are indexed by airport; only an
accepted world activates its data, and obsolete disposal cannot remove a newer
index. Source roof heights never alter the DEM or radio-height reference.

## Optional rebuild

Build-only tools: Python osmium, pyshp, pyproj, shapely, Pillow, NumPy and
rasterio. Raw source data/cache belong outside the checkout.

```sh
python ops/fetch-xiaoshan-city.py
python ops/build-xiaoshan-imagery.py
python ops/build-xiaoshan-city.py
node ops/pack-city-buildings.mjs
node ops/check-xiaoshan-appearance.mjs
node ops/check-xiaoshan-city-data.mjs
```

Ordinary npm builds only verify the included data/hash manifest. Native checks
cover source identities, coverage, frame/UV bounds, compact model sharing,
airport-keyed ownership, actual takeoff/landing and retained model identities.
Isolated render fixtures use independent cameras. Real-game checks use actual
UI inputs, pause/orbit, both languages and blocked external-network requests.


## Revision 2: imagery agreement

`buildings-v2.json` / `.bin.gz` replace the runtime v1 pack. Version 1 remains
available for older cached previews and full before/after geometry validation.
All retained source IDs, coordinates, rings, template frames, roof heights and
height-source flags remain unchanged; only roof appearance and conservative
source selection change. No adjustment is made to airport geometry, DEM or UVs.

Roof colours now come from footprint-weighted pixels of the original native
10 m COG, rather than a 3×3 neighbourhood of the coarser overview. Blue/red metal
roofs are retained. Small roofs remain limited by the 10 m pixel resolution.

Only estimated EAB outlines are excluded when at least 92% of their weighted
footprint samples and 88% of their roughly 50 m surrounding patch are classified
as vegetation by RGB evidence. This is a conservative visual screen, not verified
demolition or a cadastral update. OSM outlines, source heights and ambiguous
bare-ground/shadowed cases remain. The manifest records counts, thresholds and
representative excluded/blue-roof source IDs.

`ops/check-xiaoshan-appearance.mjs` compares every retained building against v1,
including exact source rings, frames and physical heights. The optional
`ops/check-xiaoshan-alignment.py` creates independent footprint/RGB registration
plots from the native COG and cached source JSONL. Native tests cover fixed
blue-roof source anchors and conservative EAB-only exclusions, with existing
actual flight/contact and persistent-model regressions retained.
