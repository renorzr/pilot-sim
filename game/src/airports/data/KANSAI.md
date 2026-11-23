# Osaka Kansai geography and departure data

`kansai.json` is the offline RJBB / KIX scenery database. The active game runway is **06R**, using the real OurAirports 06R/24L endpoints and their derived true heading. 06L/24R remains scenery. The frame and headings are true; flight altitudes remain heights above the active threshold. The game does not claim current published runway availability, taxi clearances, ILS, SID or STAR fidelity.

## Sources and licenses

- [OurAirports](https://github.com/davidmegginson/ourairports-data): public-domain airport reference and both source runway strips; source CSV hashes are retained.
- [Geofabrik Kansai 2026-11-20 extract](https://download.geofabrik.de/asia/japan/kansai/kansai-261120.osm.pbf): © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Source geometry includes terminals, apron, bridges, taxiways, real parking positions and oriented coastlines. The dated PBF and hash are retained as provenance. The geographic derivative retains its data license independently of MIT code.
- [Mapzen / Tilezen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/): independently decoded Terrarium data with the original [source attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). Nine source tiles are cached and hashed; the local field has 129 × 129 samples in metres.

Coastline polygonization uses real OSM shorelines, with sea on the right of their source direction. Rectangle edges serve only to clip the displayed region. Both artificial airport islands remain land holes in the bounded Osaka Bay water surface. The sea must render flat at sea level relative to the active threshold, rather than draping over the bathymetric source DEM.

## Rebuild

Build-time dependencies are Python 3, Pillow, osmium and Shapely 2. The game performs no live map, terrain or speech requests.

```sh
python3 -m venv /tmp/kansai-geography-env
/tmp/kansai-geography-env/bin/pip install Pillow osmium Shapely
/tmp/kansai-geography-env/bin/python ops/fetch-kansai-data.py
```

The default cache is `/tmp/pilot-sim-kansai-data`. `--cache`, `--pbf`, `--output`, `--geography-only` and `--departure-only` allow controlled rebuilds without overwriting other airport data.

## Curated departure

Start at real T1 stand **33**, source parking node `node/4961036074` and lead-in `way/506332718`. The nose is the mapped parking node; the game CG sits 15 m behind it. Automatic preparation abstracts the lead-in push/reposition and about 35 m of unmarked apron continuation to actual taxiway R. Player control begins stationary on R; this small automatic connection is explicitly documented rather than presented as a mapped centerline.

Manual taxi follows the connected source **R / E9 / L / P / A13** network for about 1,433 m. Optional skipping stops outside the runway at local x = −110 m, z ≈ −132.1 m. A13 is followed into the entry before an explicitly synthetic approximately 50 m radius turn joins the OurAirports centerline, followed by 50 m straight to settle the steering. Source OSM and threshold-derived centerlines differ by about 13 m. Manual entry is about 188 m and still requires separate entry and takeoff clearances. These are game clearances and holding positions, not current published procedures.

## Coastal validation

The source coast chains have no open endpoints inside the display rectangle. After polygonization, length-weighted right/sea samples are compared with left/land samples for each face. This avoids a handful of corner or simplification slivers turning an otherwise land-side mainland face into water. No guessed shoreline is introduced. The main bay surface has 258 land holes, including both airport islands; a second tiny clipped boundary face is retained from source geometry.

Verified geographic probes (longitude, latitude): T1 island (135.244, 34.4273) and second island (135.222, 34.440) are land; Izumisano (135.3273, 34.4056) is land; the bridge midpoint (135.276, 34.421), west bay (135.18, 34.425), and southwest approach (135.10, 34.34) are water. The elevated bridge deck is a scene object above the water and does not turn the underlying bay into land.

The [continuous Kansai city layer](KANSAI-CITY.md) adds self-hosted GSI photo
levels, regional OSM/Microsoft source buildings and persistent prepared models.
Its imagery and model interpretation do not change these geographic probes,
the physical DEM or the curated departure/arrival taxi procedures.
