# Third-party notices

Pilot Sim's original source code, scripts, dialogue and documentation are
licensed under [MIT](LICENSE). Third-party packages retain their own licenses.
The repository does not vendor `node_modules` or speech-generation tools.

## JavaScript dependencies

Versions below are the versions currently recorded in `game/package-lock.json`.

| Package | Version | License | Notice |
| --- | --- | --- | --- |
| [React](https://github.com/facebook/react) | 19.2.0 | MIT | [License text](LICENSES/react-MIT.txt) |
| [React DOM](https://github.com/facebook/react) | 19.2.0 | MIT | [License text](LICENSES/react-dom-MIT.txt) |
| [Three.js](https://github.com/mrdoob/three.js) | 0.187.0 | MIT | [License text](LICENSES/three-MIT.txt) |
| [Phosphor Icons React](https://github.com/phosphor-icons/react) | 2.1.10 | MIT | [License text](LICENSES/phosphor-icons-MIT.txt) |
| [Vite](https://github.com/vitejs/vite) | 6.4.2 | MIT, with bundled dependency notices | [License text](LICENSES/vite-LICENSE.md) |
| [Vite React plugin](https://github.com/vitejs/vite-plugin-react) | 5.0.4 | MIT | [License text](LICENSES/vite-plugin-react-MIT.txt) |

Transitive dependency licenses accompany their npm packages. Preserve the
relevant notices when redistributing dependencies or a bundled application.

## Generated media and optional tools

- Raster images were generated for this project; their provenance and roles
  are listed in [ASSETS.md](ASSETS.md). No stock cockpit photograph or purchased
  airport model is included. The Daxing airport scene adds the datasets below.
- Dialogue text was authored for the game. Included MP3 files are synthesized
  speech, rather than recordings of real pilots, controllers or radio traffic.
- [edge-tts](https://github.com/rany2/edge-tts) is an optional generation tool
  using Microsoft Edge's online speech service. Its upstream software license
  and the speech provider's terms remain separate from this project's license.
  No voice model or provider software is distributed or relicensed here.
- FFmpeg and optional espeak-ng are separately installed generation tools;
  their binaries are not included in this repository.

Airbus names and avionics abbreviations describe the project's inspiration.
No affiliation, certification or endorsement is implied.

## Daxing airport scene geographic data

- © OpenStreetMap contributors. The OSM subset in
  `game/src/airports/data/daxing.json` is available under the
  [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  Source: [Geofabrik Hebei, including Beijing and Tianjin](https://download.geofabrik.de/asia/china/hebei.html).
  The underlying modified database is supplied with the source and copied to
  `assets/maps/daxing-source.json` by the build for download from the game.
  The curated stand/taxi derivative `daxing-departure.json` retains the same ODbL
  attribution and is supplied as `assets/maps/daxing-departure.json`.
- Airport/runway records: [OurAirports](https://github.com/davidmegginson/ourairports-data),
  Unlicense/public-domain dedication.
- Terrain data courtesy of the U.S. Geological Survey; Mapzen/Tilezen Terrain
  Tiles. [Dataset](https://registry.opendata.aws/terrain-tiles/) and
  [source attribution/terms](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

These data are not relicensed under MIT. See the
[geography pack notes](game/src/airports/data/README.md) for provenance,
resolution, build dependencies and reproducible processing. Building height,
roof detail, airport grading and aircraft are game approximations; no current
operational navigation accuracy is claimed.

## Xiaoshan and the offline route map

The Xiaoshan pack and taxi derivative use the same OurAirports public-domain,
OpenStreetMap ODbL and Mapzen/USGS source terms described above. The fixed
Geofabrik Zhejiang snapshot, hashes, bounds, precision and rebuild commands
are documented in `game/src/airports/data/XIAOSHAN.md`. The source and derivative
are downloadable from the built app as `assets/maps/xiaoshan-source.json` and
`assets/maps/xiaoshan-departure.json`. These datasets are not relicensed as MIT.

The route-selection land silhouettes derive from Natural Earth 1:110m land,
made with Natural Earth. The dataset is public domain under the official
[terms of use](https://www.naturalearthdata.com/about/terms-of-use/); the source
URL is embedded in `world-land.json`. It is a selection map, not a navigation
or live airspace database.

## Changi geographic data

Changi adds OurAirports (public domain), OpenStreetMap geometry including derived coastline polygons (ODbL 1.0; © OpenStreetMap contributors) and Mapzen/USGS terrain under their existing source terms. Offline source distribution is available at `assets/maps/changi-source.json`. See [source provenance and licenses](game/src/airports/data/CHANGI.md). Original game geometry is MIT; geographic data retains its separate terms.

## Kansai, Kennedy and LAX geographic data

The three airport packs use OurAirports public-domain runway data, OSM-derived
geography/coastlines under ODbL 1.0 (© OpenStreetMap contributors), and the
attributed Mapzen/USGS terrain sources. Each source database and departure
geometry is downloadable under `assets/maps/`. Original scene code is MIT;
source geography retains its separate license. Exact source snapshots,
attribution and modelling scope are in [Kansai](game/src/airports/data/KANSAI.md),
[JFK](game/src/airports/data/JFK.md) and [LAX](game/src/airports/data/LAX.md).

## LAX city orthophotos and geographic derivatives

USDA Farm Service Agency NAIP2022 orthophotography is public domain with
attribution; [dataset terms and source access](https://registry.opendata.aws/naip/)
and [USGS collection description](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip).
The original city derivatives are dated2022-05-11. The expanded imagery levels
retain114 source catalog records dated2022-04-24 through2022-05-13.
`assets/cities/lax/imagery.json` and `imagery-lod.json` retain source COG URLs,
STAC fingerprints, capture dates and output checksums. All runtime imagery is
self-hosted; no Esri imagery or service credentials are bundled.

The2026-11-14 OpenStreetMap city geometry, sampled building layout and coastal
mask retain © OpenStreetMap contributors / ODbL1.0. Source and derivatives are
available at `assets/maps/lax-city-source.json`, `lax-city-physics.json` and
`assets/cities/lax/imagery.json`. The expanded source-footprint database is
provided as `assets/cities/lax/buildings-v2.json` and `buildings-v2.bin.gz`,
with source IDs, full rings, height provenance, colours and source/output hashes.
Shared house architecture and district massing are original visual estimates.
These geographic rights remain separate from
the MIT code license. No commercial architecture model or venue logo is bundled.

## Xiaoshan satellite imagery and city footprints

Qian Shi, Jiajun Zhu, Zhengyu Liu, Haonan Guo, Mengxi Liu, Zihong Liu and
Xiaoping Liu (2023), [East Asian building footprints](https://zenodo.org/records/8174931),
DOI10.5281/zenodo.8174931, [CC BY4.0](https://creativecommons.org/licenses/by/4.0/).
Selected Hangzhou/Jiaxing/Shaoxing polygons were reprojected, filtered, merged
with newer OSM geometry/context and assigned estimated heights/appearance.
The combined derived geographic database retains ODbL and this attribution;
original source observations/publication dates are separate from rendering.

Contains modified Copernicus Sentinel data (2025), processed by ESA / Microsoft
Planetary Computer, with local display derivatives. Sentinel-2 L2A tile51RTP
was acquired2025-09-16T02:41:41.024Z; native RGB resolution is10m.
Use follows the [Copernicus Sentinel Data Legal Notice](https://dataspace.copernicus.eu/terms-and-conditions).
The game ships georeferenced WebP derivatives rather than portal screenshots
or an online imagery service. All hashes, dates, source URLs, licences and
downloadable derivatives are linked through `assets/cities/xiaoshan/sources-v2.json`
and the [city data notes](game/src/airports/data/XIAOSHAN-CITY.md).


## Singapore / Changi city derivatives

The regional city footprint/contact database and marine masks under
`assets/cities/changi/` derive from © OpenStreetMap contributors / ODbL 1.0,
Geofabrik Malaysia/Singapore/Brunei 2026-11-20. The downloadable building binary,
manifest and source index retain object IDs, source hashes and inference notes.

Ground and roof images contain modified Copernicus Sentinel data (2025–2026),
processed by ESA / Microsoft Planetary Computer, under the
[Sentinel Data Legal Notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice).
Native 10 m RGB and scene classification from 48NUG/48NVG on 2025-12-05,
2026-03-20, 2026-03-25 and 2026-08-22 produce a cloud-screened composite.
Source/output hashes, exact item times, URLs, classification and residual-pixel
policy are retained in the manifests. This is satellite imagery with estimated
facade colouring, not purchased terminal photography or an Esri service.
Original bridge details, building templates and rendering code remain MIT.
[Full source and rebuild notes](game/src/airports/data/CHANGI-CITY.md).


## Xiaoshan city appearance revision

Xiaoshan city revision 2 retains the same ODbL/CC BY source attribution and
Copernicus imagery terms. Its colour sampling and conservative RGB vegetation
screen are original processing, not verified demolition/survey data. Source
coordinates/heights of retained buildings are unchanged. Both versioned
derivatives and their manifests remain available under `assets/cities/xiaoshan/`.

## JFK / New York city derivatives

Regional source buildings, context and marine masks derive from © OpenStreetMap
contributors, ODbL 1.0, via Geofabrik New York and New Jersey 2026-11-20.
Downloadable geometry retains source IDs; source/output hashes are recorded in
the manifests under `assets/cities/jfk/`. These derivatives retain ODbL terms.

Ground and roof photography uses USDA Farm Service Agency NAIP 2022 imagery,
public domain with attribution, acquired through the Microsoft Planetary Computer
NAIP catalog. All 174 original item IDs, acquisition dates and COG URLs remain
available in the source index. Native 0.6 m images are explicitly reduced for
working and rendering levels. No Esri runtime service is used. Original shared
templates, facade estimates and airport architectural details remain MIT.
[Full source and rebuild notes](game/src/airports/data/JFK-CITY.md).

## Osaka Kansai city derivatives

The regional database combines © OpenStreetMap contributors / ODbL 1.0,
Geofabrik Kansai 2026-11-20, with supplemental Microsoft Global ML Building
Footprints under CDLA Permissive 2.0, pinned repository revision
`82577ce04b0e30668a4eecef124c38ba08b86c13`. Four source Japan partitions,
source-row identities, catalog/file hashes and dates are retained. A complete
Microsoft license copy is provided in `ops/assets/licenses/` and under
`assets/cities/kansai/MICROSOFT-LICENSE.txt`. The combined geographic derivative
retains ODbL terms; machine footprints and inferred heights are not surveys.

Ground and roof imagery derives from GSI Tiles / 国土地理院, `seamlessphoto`,
under the [GSI Content Terms](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html).
Source: [GSI tile catalog](https://maps.gsi.go.jp/development/ichiran.html).
Images were locally mosaicked, reprojected and resampled. Original capture dates
and uniform survey resolution are not exposed by the source JPEG service;
declared zoom-level ground pixels and retrieval dates do not claim those facts.
No reference photographs from terminal brochures or commercial airport models
are redistributed. Original templates, facade estimates, bridge details and
rendering code remain MIT.
[Full source/processing notes](game/src/airports/data/KANSAI-CITY.md).

## Beijing Daxing city derivatives

The regional database combines © OpenStreetMap contributors / ODbL 1.0,
Geofabrik Hebei/Beijing `hebei-261120.osm.pbf`, with Beijing, Langfang and
Baoding members of Qian Shi, Jiajun Zhu, Zhengyu Liu, Haonan Guo, Mengxi Liu,
Zihong Liu and Xiaoping Liu (2023),
[East Asian building footprints](https://zenodo.org/records/8174931), DOI
`10.5281/zenodo.8174931`, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The combined geographic derivative retains ODbL terms and original attribution;
source outlines, mapped heights and inferred appearance are distinguished.

Ground and roof pixels contain modified Copernicus Sentinel data (2025),
processed by ESA / Microsoft Planetary Computer. Two Sentinel-2 L2A same-pass
true-colour tiles from **2025-10-13**, native **10 m**, were windowed, mosaicked,
reprojected and resampled under the Copernicus Sentinel Data Legal Notice.
Item IDs, source URLs and hashes are retained. This is satellite imagery;
resampling does not claim higher native resolution. Original northern Chinese
building templates, facade estimates and rendering code remain MIT.
[Full source/processing notes](game/src/airports/data/DAXING-CITY.md).


## Chinese radio cast recordings

The E/G/H/J Chinese pilot/controller packs are generated speech outputs from the
authorized Fish Audio API using the selected public voice models. The fifth
speaker uses Microsoft Edge Xiaoxiao, the game's previous Chinese controller.
Source voice IDs, titles
and file fingerprints are in `game/src/comms/pilot-voices.json` and ASSETS.md.
No Fish voice model, API key or provider software is distributed. These audio
outputs and voice/provider rights remain separate from the MIT game code.
