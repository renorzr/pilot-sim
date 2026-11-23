# Beijing Daxing continuous city scenery

The regional layer reuses the existing 60 km Daxing frame and physical DEM.
The selected copper/gold terminal, stand 107, Y7/G taxi route, runway 17L,
aircraft, route navigation, landing assessment, scores and bilingual radio
retain their existing behavior.

## Geographic sources

- © OpenStreetMap contributors / ODbL 1.0, Geofabrik Hebei (including Beijing),
  dated extract `hebei-261120.osm.pbf`, replication timestamp
  **2026-11-19T21:22:20Z**. SHA-256:
  `b18473ed6d18031788baf11d86cf22c2e91bc7c266886e7117b2a21ebe0c6e71`.
  Mapped building heights/floors have priority over estimates. Airport, road,
  water and explicitly underground conflicts are excluded.
- Qian Shi, Jiajun Zhu, Zhengyu Liu, Haonan Guo, Mengxi Liu, Zihong Liu and
  Xiaoping Liu (2023), [East Asian building footprints](https://zenodo.org/records/8174931),
  DOI `10.5281/zenodo.8174931`, **CC BY 4.0**. Beijing, Langfang and Baoding
  geometry members supplement OSM, which has priority at overlaps. Archive
  fingerprint, member names, CRC32 and SHA-256 are retained in the manifest.
  The 2023 release date is not a per-building survey or photographic date.
  `eab/` IDs deterministically encode source city and shape row, not OSM IDs.
  Beijing and Hebei members declare different CRSs; each WKT is transformed
  independently. No GCJ02 conversion or unmeasured scene-wide shift is applied.
- [Copernicus Sentinel-2 L2A](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a),
  **2025-10-13**, native **10 m**, under the Copernicus Sentinel Data Legal Notice.
  Contains modified Copernicus Sentinel data (2025), processed by ESA /
  Microsoft Planetary Computer. Same-pass tiles `T50SMJ` and `T50TMK` have
  reported whole-tile cloud cover of approximately 0.01% and 0.06%. Their
  true-colour COG windows form a lossless UTM50N working mosaic. Source item
  IDs, asset URLs, STAC fingerprints and working raster SHA-256 are included.

Regional and overview images plus 36 local WebPs cover the full terrain.
The source remains 10 m satellite imagery; reprojection and larger output
images do not create sub-metre detail. All runtime data is self-hosted and
ordinary builds/tests need no source downloads, service keys or Python.
The combined geographic derivative retains ODbL terms and source attribution.

## Appearance, contact and loading

The included database contains **755,377 buildings in 1,733 source chunks**:
18,153 OSM outlines and 737,224 EAB outlines. Compressed download size is
**50.9 MiB**, with a **71.4 MiB** raw binary. Heights include 221 explicit values,
2,270 floor-derived values and 752,886 estimates. Of 757,780 eligible candidate
outlines, 2,403 EAB estimates met the conservative vegetation screen. The
regional/overview and 36-detail satellite pack totals **20.4 MiB**.

Full eligible footprints and courtyard topology are retained. Roof colours are
sampled inside the actual polygons on the native 10 m working raster, excluding
courtyards, preserving blue/red panels and rejecting vegetation/shadow for colour
selection. Only estimated EAB footprints with at least 92% footprint vegetation
and 88% vegetation in the surrounding five-pixel patch can be excluded. OSM
outlines and explicit heights remain independent of this visual screen. It is
not proof of demolition or a current obstacle survey.

Missing heights follow stable northern Chinese village, apartment-estate and
logistics priors. Nearby missing-height estimates use a conservative village
prior; tagged heights remain intact. Apartment-like outlines without local
mapped height hints use coherent 3–5-storey estimates by neighbourhood, avoiding
independent tall-building guesses in rural villages. Low houses share gabled/flat roof templates,
larger buildings use shared boxes or source-derived distant district proxies,
and facade colours use a coherent neutral palette. Heights and facades without
source tags are plausible estimates. The original copper terminal now receives
the same local sun/shadow treatment as other mapped airport worlds.

The same DEM triangles render the satellite ground and drive terrain collision.
Source building geometry drives contact and camera avoidance only while the
Daxing world is active. Legacy wide road/inland-water decals and duplicate
off-airport generic blocks are replaced by the mapped city and imagery.
No floating imagery plane or scene-wide footprint shift is introduced.

Full-region advance preparation, nearby all-direction warmup and retained CPU
model identities use the shared mapped-city loader. IndexedDB caches processed
source/contact arrays, model arrays and visited compressed images. GPU residency
is bounded separately. Both languages show actual loading/cache progress;
storage denial, corruption or quota failure has the shared fallback behavior.

## Optional source rebuild

Source caches stay outside the checkout in `/tmp/pilot-daxing-city/` and the
pinned `/tmp/daxing-hebei.osm.pbf`. Python dependencies are numpy, Pillow, osmium,
pyshp, Shapely, rasterio and pyproj. Geometry-only ZIP members are fetched by
verified byte ranges; the full East Asian archive is not downloaded.

```sh
python ops/fetch-daxing-city.py
python ops/build-daxing-city.py --context-only
python ops/build-daxing-imagery.py
python ops/build-daxing-city.py
node ops/pack-city-buildings.mjs /tmp/pilot-daxing-city/buildings.jsonl daxing
node ops/large-assets.mjs pack public/assets/cities/daxing/buildings-v1.bin.gz
node ops/check-daxing-city-data.mjs
npm --prefix game run test:flight
npm --prefix game run build
npm --prefix game run test:sites
```

Remove `osm-context.pickle` if the source extract, extraction rules or local frame
changes. Binary coordinate quantisation of 0.02 m is storage precision, not map
accuracy. The building, imagery and combined source manifests are downloadable
under `assets/cities/daxing/`.

A byte-level comparison of the height refinement verified that all 755,377
source identities, footprint coordinates, roof/facade colours and 2,491 mapped
height/floor values stayed unchanged. It adjusted 62,348 inferred heights and
five inferred types. Native colour/exclusion decisions can be reused for such
height-only refinements with `--reuse-native-colours`; candidate, raster and
previous output hashes must match before reuse. Normal rebuilds still sample
the native raster directly.

The existing 376 regressions and six Daxing city tests passed, including complete
takeoff/landing with the full contact index active. Seven independent 1000 × 625
browser views recorded 85–222 draw calls, 37.9–46.3 MiB of prepared model arrays
and approximately 122.7–128.0 MiB of estimated imagery GPU memory. Model identities
were retained across camera reversals with zero pending chunks. These are fixture
measurements, not total browser memory or a frame-rate guarantee.

On a fresh Chromium profile, complete loading/saving took 39.4 seconds cold and
11.2 seconds warm. A new page with HTTP cache disabled and large city files
blocked restored 2,231 model variants without downloading building/image bytes.
A corrupt model rebuilt independently; quota/cancellation tests kept partial
source saves unpublished and denied storage fell back to ordinary loading.
Timings depend on browser and hardware.

The production preview passed real menu/keyboard/pointer checks for stand
departure, the arrival airport introduction, paused exterior orbit/zoom, cockpit
switching and Chinese/English interfaces. No browser runtime errors were
observed. Source attribution clears the pause indicator. The composed Daxing
procedure headings have explicit English translations and regression assertions.
