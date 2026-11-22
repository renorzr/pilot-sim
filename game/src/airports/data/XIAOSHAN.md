# Hangzhou Xiaoshan geography and departure data

`xiaoshan.json` is an offline public-geography snapshot for ZSHC / HGH.
It uses the same schema as `daxing.json`; the common pack documentation explains
coordinate conventions, row order, source precision and licensing.

## Sources

- Runway endpoints and airport reference: [OurAirports data](https://github.com/davidmegginson/ourairports-data),
  Unlicense / public domain. The snapshot contains 06/24 and 07/25. The game uses
  **07**, derived from its actual endpoint bearing, not an assumed magnetic
  heading or a 07L identifier. Length in the local tangent plane is 3600.760 m;
  source width is 45.1104 m. Threshold 07 elevation is 6.7056 m.
- Geographic objects: © OpenStreetMap contributors,
  [Geofabrik Zhejiang dated extract](https://download.geofabrik.de/asia/china/zhejiang/zhejiang-261119.osm.pbf),
  under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  The dated file is pinned for reproducibility; the `latest` URL was in the
  middle of publishing its next daily file during acquisition. The JSON retains
  the source URL, file SHA-256 and packaging timestamp. Object geometry dates
  are not implied by the packaging timestamp.
- Terrain: Mapzen / Tilezen Terrain Tiles, source observations courtesy of USGS.
  [Dataset](https://registry.opendata.aws/terrain-tiles/) and
  [attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
  Terrarium zoom 10 is sampled into a 129 × 129 grid over
  `[29.80,119.95,30.65,120.95]` (south, west, north, east).

The compact OSM selection bounds are `[30.10,120.28,30.35,120.57]`, retaining
airport infrastructure, nearby major roads, the Qiantang River and local land
use. It is a selected local scenery database, not a complete Hangzhou city or
live airspace dataset. Airport detail bounds are
`[30.195,120.365,30.275,120.485]`. Coordinates are WGS84 longitude/latitude;
runway-relative game coordinates use 07 forward as negative z and runway-right
as positive x.

Important source geometry includes T4 `way/776023304`, T3 `way/775893373`, T2
`way/775893371`, T1 `relation/16330394`, tower `way/1177045534`, and 84 actual
jet-bridge ways. Gate, parking-position and holding-position nodes are retained.
Building and decorative roof heights remain game estimates, separately from
these real horizontal footprints.

## Real stand 251 departure derivative

`xiaoshan-departure.json` selects real parking-position node `9425630483`
(ref **251**) and parking lead-in `way/1021965129`. The source node and lead-in
endpoint coincide. The aircraft reference is set back 15 m along the final
lead-in segment for visual clearance; this offset is not a surveyed stop mark.
Automatic departure preparation hands control to the real apron-side lead-in
start on Z11.

The approximately 2031 m source taxi route is **251 → Z11 → B → B3 → A → A1**.
All turns follow source curves. Segment intersections are split geometrically,
with sub-metre joins only to account for source rounding/simplification. The
largest rounded route-point distance from its attributed source way is 0.652 m.
The roughly 252 m runway entry follows A1 (`way/188883562`) before a final game
lineup target at x=0, z=−175 on the same OurAirports-based runway centerline.

The game holding CG reference at approximately x=−110, z=−10.44 is on A1,
about 20 m before source holding-position node `8621929706`. This leaves the
nose stopped before the marker. The CG reference and lineup target are explicitly
synthetic gameplay choices; no claim of published holding-position precision,
current taxi clearance or live ATC instructions is made. Skipping long taxi must
remain stationary outside the runway and cannot grant entry/takeoff permission.

The derived OSM database retains ODbL independently of the game's MIT code.

## Rebuild

Dependencies are Python 3, Pillow and osmium, used only while building assets.

```sh
python3 -m venv /tmp/xiaoshan-geography-env
/tmp/xiaoshan-geography-env/bin/pip install Pillow osmium
/tmp/xiaoshan-geography-env/bin/python ops/fetch-xiaoshan-data.py
```

The script downloads the pinned approximately 87 MB PBF, caches it along with
airport CSVs and terrain tiles under `/tmp/pilot-sim-xiaoshan-data`, and rebuilds
both JSON files. `--cache`, `--pbf` and `--output` can override those paths.
`--departure-only` regenerates just the curated derivative from the existing
geography pack, without network calls. No public OSM raster tiles are scraped
or used during game play. The source dataset remains subject to the resolution
and scope limitations described above; it is not an operational navigation aid.

## Continuous city scenery

The airport now loads a separately attributed800,485-building city pack and
self-hosted native10m Sentinel-2 imagery across the60km terrain. Shared near,
middle and distant models remain cached through the accepted world. The
original runway, stand, taxi route, terminal plans and DEM remain intact;
see [city sources, estimates and rebuild notes](XIAOSHAN-CITY.md).
