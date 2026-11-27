# LaGuardia airport operations

LGA (`KLGA`, IATA `LGA`) is the second airport in the New York menu group.
The operational runway is **04**; 22 and 13/31 are source scenery. Airport
practice and the twelve directional routes involving LGA use the existing
permission, flight assessment, explicit cruise transition and arrival-taxi
lifecycle. The short JFK pair is a game route, not a published airline service.

`lga.json` stores only the local airfield supplement. It reuses the NYC/JFK DEM,
water, photographs, decoded building sources, prepared vegetation and regional
road tiles. Source airport/runway data comes from [OurAirports](https://github.com/davidmegginson/ourairports-data);
airfield ways/gates come from the same pinned Geofabrik New York 2026-11-20 PBF
used by the shared city. The JSON records source URLs, license and PBF checksum.

The selected departure begins at source stand **5**, with a 15 m CG setback.
The real parking lead-in and connected taxiway vertices lead to the west side
of 04 via BB/AA/YY. Holding clearance is a game estimate; the final alignment
arc and stop offset are explicitly synthetic. Holding heading follows the
incoming taxiway; runway entry still needs a separate clearance and a manual
turn. Arrival alternatives use the source taxiway graph, rejecting paths that
re-enter an already-vacated active runway, including crossings between vertices.
Source network, stand orientation and stop offsets are not an operational chart.

Airline initial departure uses the **LAGUARDIA SEVEN, Bronx Climb**:
heading 044°M to 500 ft MSL, then a climbing left turn to 360°M, maintaining
5000 ft MSL. The charted headings/altitude trigger are retained; the 14 km radar
vector endpoint is a game navigation extent, not a published fix. Source:
[FAA cycle 2612, effective 26 Nov–24 Dec 2026](https://aeronav.faa.gov/d-tpp/2612/00289LAGUARDIA_C.PDF).
Approach guidance remains the game's simplified runway-aligned guidance.

The flight stays in its 04 runway tangent frame. `regions/runway-city.js` bridges
that frame to the canonical NYC source frame using an affine parent transform,
a source camera and transformed obstacle queries. Footprint holes and live
vehicle timestamps survive the bridge. The DEM mesh is transformed from the
canonical triangular grid; collision samples that same grid. Roof imagery uses
the active flight frame after the model matrix, so photography stays registered.
Existing shared sources are never rewritten or rotated in place. Active LGA's
custom terminals replace dense-city duplicates only in its own scene profile.

Rebuild the local airfield and taxi routes offline:

```bash
python ops/fetch-lga-data.py --pbf /path/to/new-york-261120.osm.pbf
PILOT_TAXI_AIRPORT=lga node ops/build-arrival-taxi.mjs
node ops/build-nyc-tree-models.mjs
```

The extractor needs the same Python dependencies as `fetch-jfk-data.py`.
Current LGA radio text lives in `comms/lga-radio.json`; approved-cast speech is
staged with `ops/generate-lga-radio.py`, using hidden stdin for Fish free-model
credentials. English pilots retain clean recordings for cockpit playback;
controllers and exterior pilots retain VHF treatment. Build preflights require
all five approved Chinese voices before a release can be published.
