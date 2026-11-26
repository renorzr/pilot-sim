# Daxing geography pack

The continuous regional buildings and satellite layer are documented separately
in [Daxing city notes](DAXING-CITY.md); this original airport/DEM pack is retained.

`daxing.json` is an offline source-data pack for the local ZBAD airport scene.
It contains actual public geographic data, not a generated approximation of
Beijing's geography. Decorative models, terrain flattening around runways,
navigation procedures and game difficulty are separate implementation choices.
This pack is not an operational navigation product.

## Schema

- `airport`: OurAirports airport reference position, code and elevation.
- `runways`: OurAirports runway endpoint positions, dimensions, elevations and
  **true** headings. Runway names use the source's identifiers. Do not infer
  magnetic variation from a runway number. For map geometry, derive a bearing
  from the endpoints rather than treating the integer source heading as exact.
- `osm.features`: OSM ways, selected tagged points, and assembled multipolygon
  outer rings. `geometry` is an array of **[longitude, latitude]** pairs in
  WGS84. Optional `holes` contains inner rings. Source IDs are preserved.
  Coordinates are rounded to seven decimal places and lines simplified by a
  few metres; features with no points in the selection bounds are omitted.
  Ordinary buildings are included only in the airport area. Outside it,
  selected main roads, waterways, water and land-use polygons form the scenery.
  Missing buildings or heights remain missing; consumers must label any added
  procedural detail appropriately. This is a deliberately incomplete subset.
- `dem`: 129 columns × 129 rows of height **samples**, not cells. `heights` is
  a flat row-major array, starting at the southwest sample and increasing west
  to east, then south to north. Bounds are `[south, west, north, east]` in
  degrees. Samples include both outer boundaries. Elevation is in metres;
  each sample was bilinearly read from the source Terrarium tiles and rounded
  to 0.1 m. Nominal sample spacing is roughly 700 m. Precision does not imply
  survey accuracy. Fine obstructions and runway surface undulations are not
  represented. Source elevations must be reconciled with runway elevations
  and the simulator's eye/gear height before use.
- `sources`, `fetchedAt`: provenance, download time and the regional PBF hash.

The terrain bounds cover `[39.10,115.90,39.95,116.95]`, approximately 90 km in
each direction, including a 60 km runway-aligned scene around Daxing.
The selected OSM area is smaller and concentrates on airport approaches.

## Sources and licenses

The project's MIT code license does **not** replace these source licenses.

1. **OurAirports**, [official downloads](https://github.com/davidmegginson/ourairports-data):
   airport and four civilian runway records, Unlicense/public domain. Data are
   community-maintained and need independent checks before claiming current
   operational accuracy. No SID, STAR, ILS frequency or approach chart is
   included or implied by this pack.
2. **© OpenStreetMap contributors**, downloaded as Geofabrik's
   [Hebei extract, including Beijing and Tianjin](https://download.geofabrik.de/asia/china/hebei.html).
   The `osm` database subset and its modifications are available under the
   [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
   Retain source attribution in the game and accompanying documentation.
   This JSON openly supplies the derived database used by the scene; the
   reproducible extraction script is also included. No OSM public raster map
   tiles were downloaded or bundled.
3. **Mapzen/Tilezen Terrain Tiles**, downloaded from the public
   `elevation-tiles-prod` S3 bucket, Terrarium zoom 10:
   [dataset registry](https://registry.opendata.aws/terrain-tiles/),
   [encoding](https://github.com/tilezen/joerd/blob/master/docs/formats.md),
   [source attribution and terms](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
   Retain the relevant original-source credits, including USGS SRTM/GMTED
   terrain data credit for this region. Terrain data are historical elevation
   observations, not live construction or obstacle data.

## Rebuild

Use a separate Python environment; these are build-time dependencies only:

```sh
python3 -m venv /tmp/pilot-sim-geography-env
/tmp/pilot-sim-geography-env/bin/pip install Pillow osmium
/tmp/pilot-sim-geography-env/bin/python ops/fetch-daxing-data.py
```

The script downloads an approximately 104 MB regional PBF plus airport CSVs
and a small set of public elevation tiles. It caches sources under
`/tmp/pilot-sim-daxing-data`; `--cache`, `--pbf` and `--output` can override
those locations. It does not scrape public OSM map images. Existing caches
are deliberately reused: remove the cache to refresh sources. `fetchedAt`
records packaging time, not the observation date of every feature.

## Stand 107 departure derivative

`daxing-departure.json` selects stand 107 (OSM way 864124042), Y7, G, E13/C8
and G9 from this same source snapshot. Each point retains its source feature ID.
The approximate 1.37 km taxi route and 224 m entry use source geometry; small
sub-metre joins are merged for control guidance. The stand aircraft reference
is set back 15 m from the source nose point for visual clearance. Automatic
departure preparation hands control to the apron-side start of its lead-in.

The runway-external holding point and centerline lineup target are game-defined,
explicitly labelled in the JSON. They do not represent a current published
holding position or taxi clearance. This modified OSM database retains ODbL;
the build also supplies `assets/maps/daxing-departure.json` for download.


## Additional airport and route map

The same schema now also supplies `xiaoshan.json` and `xiaoshan-departure.json`.
See [XIAOSHAN.md](XIAOSHAN.md) for that snapshot, source objects, licenses and
rebuild commands. The shared renderer uses each airport's own projection and
terrain; their coordinates are never mixed in a single physical leg.

`world-land.json` contains rounded outer rings from Natural Earth1:110m land
for the offline route selection map. The embedded source URL identifies the
GeoJSON input; Natural Earth data are [public domain](https://www.naturalearthdata.com/about/terms-of-use/).
It supplies land silhouettes only, without live airspace or navigation routes.
The optional `node ops/fetch-world-land.mjs` build-time helper regenerates these
silhouettes; normal gameplay and builds use the bundled file.

[Regional woodland scenery](WOODLANDS.md) describes shared source-mapped forests, estimated tree placement, persistent arrays and contact/LOD behavior.

Public roads and moving vehicle traffic at all six airports: [source, estimates, runtime and cache notes](ROAD-TRAFFIC.md).
