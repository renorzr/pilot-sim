# Los Angeles International geography and departure data

`lax.json` is the offline KLAX / LAX scenery database. `lax-departure.json`
curates a playable departure from real Terminal 8 stand **86B** to Runway **25R**.
The other three runway pairs are source scenery and are not operational choices.

## Geographic sources and licenses

- [OurAirports](https://github.com/davidmegginson/ourairports-data), public domain /
  Unlicense: airport reference, four runway pairs, dimensions and threshold
  endpoints. The source identifies the active pair as `7L/25R`; 25R uses the
  eastern endpoint and its endpoint-derived true heading, approximately 263°.
  That differs from the magnetic runway number. The active threshold is about
  28.65 m MSL; all game heights remain above that threshold.
- © OpenStreetMap contributors, [BBBike LosAngeles regional extract](https://download.bbbike.org/osm/bbbike/LosAngeles/LosAngeles.osm.pbf),
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/): source dated by its
  `Last-Modified` response to 2026-11-14. The approximately 214 MB PBF is cached as
  `LosAngeles-2026-11-14.osm.pbf`; the URL itself is moving, so the bundled
  provenance SHA-256 and build-time cache identify the actual snapshot.
- [OpenStreetMap API](https://api.openstreetmap.org/api/0.6/), same ODbL license:
  supplements to the continental coastline outside the BBBike city-selection
  boundary. Original coastline way IDs and node-way links are followed until
  the source shore crosses the game's display bounds. Every cached XML payload
  has a SHA-256 in the pack. This retains actual shoreline, rather than closing
  an open coast chain with invented land edges.
- [Mapzen/Tilezen Terrarium terrain](https://registry.opendata.aws/terrain-tiles/),
  with [USGS and other source attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md):
  an independently sampled 129×129 grid, source zoom 10, bilinear RGB elevation
  decoding. Tile payload hashes are retained. The samples include bathymetry and
  actual Santa Monica/Malibu hills; the heightfield is not a flat Los Angeles map.

The OSM-derived database retains ODbL; game code and original mesh-building code
remain MIT. No raster map tiles or reference photographs are bundled. Offline
source distribution is exposed by the build at `assets/maps/lax-source.json`.

## Selection and coastline

The DEM/source display rectangle is 33.58–34.31°N,118.85–117.98°W. Runtime building
and airfield detail is restricted to source airport boundary `way/649268639`,
with three explicitly retained landside landmarks: Theme Building `way/37891817`,
its neighbouring FAA tower `way/534332717`, and tower base `way/413226266`.
Principal nearby roads and substantial land cover are retained at lower detail.
This prevents the surrounding city's residential house database bloating the
package. The current pack has approximately 3,962 features and is about 1.5 MiB.

Sea is derived by polygonizing oriented OSM coastlines with the display boundary;
land is on the left, sea on the right. Polygon faces use segment-length-weighted
offshore versus onshore evidence, preventing a tiny reversed/stub segment
from classifying a land face as sea. The weighted audit matched every existing
marine triangle outline in this pack (zero symmetric difference). Continental shore continuation is required
because the BBBike city polygon clips coastlines inside the larger DEM rectangle.
The single Pacific/Santa Monica Bay polygon preserves 20 source island holes,
including port islands. Render at sea level with the holes; do not drape the
marine surface over individual DEM/bathymetry samples.

Verified probes `(longitude,latitude,isSea)`:

- `(-118.3975,33.9404,false)` — Terminal 8 stand area.
- `(-118.4039,33.9440,false)` — FAA tower/central terminal area.
- `(-118.5,33.94,true)` — Pacific offshore.
- `(-118.40,33.8,false)` — Palos Verdes land.
- `(-118.35,33.99,false)` — urban land east/north of airport.
- `(-118.7,34.1,false)` — Malibu hills.
- `(-118.5,34.015,false)` / `(-118.5,34.0,true)` — Santa Monica shore/offshore.

## Stand, taxi and operational scope

Real stand 86B uses parking-position`way/1096142912`. The source lead-in's final
endpoint anchors the aircraft nose; the visual CG is 15 m behind it. Automatic
crew preparation abstracts push/start and a roughly 27 m apron reposition to an
adjacent actual C6 network vertex. This handoff is documented and stationary;
manual taxi does not jump across a missing connection.

The selected source corridor is **86B → C6 → C → C3 → B3 → 25R**. The manual taxi
portion is about 845.7 m. The game holding CG is on actual C3 at local
`(+110,-940.927)`, behind source B3 holding node `node/7992560258`. It provides
nose clearance outside the runway protected strip and is not a claim of the
published/current stop-line clearance. Separate entry and takeoff permissions
are game radio events.

B3's native source entry arc is retained. A 60 m straight centerline segment after
the source curve lets steering settle before the final stopped target at local
`(0,-1088.573)`. Approximately 2,847 m of runway remains. The source curve ends
about 0.4 m from the endpoint-derived runway axis, so that final alignment is an
explicit game connection rather than a new surveyed taxiway. Optional taxi skip
stops outside the runway; actual manual entry, lineup and stopping still apply.

The synthetic three-degree approach, local missed approach, automatic clearances
and aircraft performance are game procedures. They are not current certified
ILS/SID/STAR data or a live airspace/NOTAM source.

## Rebuild

Build-time dependencies: Python 3, Pillow, osmium and Shapely. Runtime has no
external map, terrain or speech request.

```sh
python ops/fetch-lax-data.py
python ops/fetch-lax-data.py --departure-only
```

`--cache`, `--pbf` and `--output` select alternate source caches and destinations;
`--geography-only` omits the departure derivative. Default cache is
`/tmp/pilot-sim-lax-data`. Complete source snapshots are stored outside Git.
Use the recorded source hashes to compare a refreshed source snapshot before
replacing the bundled database.

## Recorded radio

`lax-radio.json` includes ten event pairs per language, 40 total self-hosted
MP3 clips. Actual stand 86B/runway25R agree with the departure data. Voices,
rate/pitch and 300–3300 Hz filtering match the existing Changi pack; durations
and a text/profile/filter cache fingerprint are measured during generation.
Use `ops/generate-lax-radio.py --stand 86B --runway 25R` to regenerate.
