# Initial departure procedures

City flights use chart-derived initial departures in
`game/src/missions/departure-procedures.js`. They retain the ordinary takeoff,
force-integrated flight controls, FD/AP, stand permissions and landing assessment.
They do not implement a full SID database, flight dispatch or live ATC. The
airport practice lessons retain their existing training routes.

## Coverage and sources

All coordinates are WGS84. Restrictions and altitude terminators are feet MSL;
Chinese source metres are converted using exactly 0.3048 m/ft. Chart headings
are magnetic and use the published variation for that edition to obtain the
true heading used by the airport frame. Never compare a magnetic chart heading
directly with the registry's true runway bearing.

| Airport/runway | Initial segment | Source |
| --- | --- | --- |
| LAX 25R | HDG 251°M to 640 ft MSL; direct DOCKR, at/below 3000 ft; HDG 236°M | [FAA ORCKA FIVE, cycle 2611](https://aeronav.faa.gov/d-tpp/2611/00237ORCKA_C.PDF), [FAA CIFP 2026-10-29](https://aeronav.faa.gov/upload_313-d/cifp/CIFP_261029.zip) |
| LGA 04 | HDG 044°M to 500 ft MSL, then climbing left turn to HDG 360°M, maintain 5000 ft; radar extent is simulated | [FAA LAGUARDIA SEVEN, cycle 2612](https://aeronav.faa.gov/d-tpp/2612/00289LAGUARDIA_C.PDF) |
| JFK 22R | HDG 224°M followed by a simulated radar clearance; cleared to 5000 ft MSL | [FAA KENNEDY FIVE, cycle 2611](https://aeronav.faa.gov/d-tpp/2611/00610KENNEDY_C.PDF) |
| Changi 02L | MOLVO at/above 2000 ft MSL, left to ATRUM; initial clearance 3000 ft, maximum 230 kt | [CAAS AIP 2026-09-03 archive, AROSO 3E chart dated 2024-10-31](https://aim-sg.caas.gov.sg/aim-content/uploads/aip/17-SEP-2026/AIP/2026-09-03-000000/pdf/SG-AD-2-WSSS-AD-2-WSSS-SID-11-to-11.1.pdf) |
| Xiaoshan 07 | HDG 069°M to 150 m MSL, right direct HC503 at/above 500 m, then toward HC502 or HC504 | CAAC original [coding table 0C-2](https://chart.wuhanqing.cn/Terminal/ZSHC-杭州萧山/ZSHC-0C-2-DATABASE%20CODING%20TABLE.pdf), [waypoint list](https://chart.wuhanqing.cn/Terminal/ZSHC-杭州萧山/ZSHC-0W-1-WAYPOINT%20LIST.pdf); effective 2025-10-29 1600Z, mirrored archive |
| Daxing 17L | AD450, AD451 at/above 600 m MSL; follow the next published leg toward AD456, AD452 or AD472 | CAAC original [waypoint list](https://chart.wuhanqing.cn/Terminal/ZBAD-北京大兴/ZBAD-0W-1-WAYPOINT%20LIST.pdf), [IDKEX/DOTRA chart](https://chart.wuhanqing.cn/Terminal/ZBAD-北京大兴/ZBAD-3P-2-SID%20RNAV%20RWY17L-17R%28IDKEX-DOTRA%29.pdf), [OMDEK/PEGSO chart](https://chart.wuhanqing.cn/Terminal/ZBAD-北京大兴/ZBAD-3P-10-SID%20RNAV%20RWY17L-17R%28OMDEK-PEGSO%29.pdf); effective 2025-04-16 1600Z, mirrored archive |
| Kansai 06R | HDG 059°M to at least 500 ft MSL; B6R10 fly-over, left to B6R11 at/above 2500 ft. Southwest profile instead turns left direct LELUS, then VEKTA | [AIP Japan original, archived copy](https://nagodede.github.io/aip/japan/documents/RJBB_full.pdf#page=65), UPMIN ONE and shared RINKU/NANKO/SOVRI initial segments, effective 2025-03-20 |

These are pinned source editions, not an assertion of current operational
validity. The Chinese and Japanese material is archived original AIS material
served by third-party mirrors. No original chart PDF is redistributed in the
runtime. Updating a procedure requires checking its chart, coding table and
coordinates together. Chart climb-gradient certification and full procedure
containment are outside this initial-segment simulation.

DOCKR is 33°55′54.64″N 118°27′29.17″W in FAA CIFP 2611. Projected into the
game's LAX frame, it is about 7.287 km from the active threshold, 3.352 km beyond
the opposite runway endpoint, rather than the former synthetic 4.5 km point.

## Deliberate game boundaries

Profiles represent initial segments, not complete destination-specific SID
clearances. Daxing selects an east, south or west branch by destination sector;
Xiaoshan selects the HC502/HC504 branch; Kansai selects the southwest UPMIN
prefix or the shared B6R10/B6R11 prefix. Changi uses the MOLVO/ATRUM prefix.
These selections are game assignments, not claims about actual flight plans.
Kansai retains the existing 06R game runway despite the changed real-world
preferred runway division; it uses a procedure published for that runway.

Daxing stops the initial segment 6 km along the published leg beyond AD451.
The remaining real fix's identity and coordinates stay in `targetFix`. This
handoff is labelled EXIT, with no fabricated official fix name. It prevents the
southern branch from requiring a 50 km flight beyond the detailed scenery.

JFK's first radar instruction lasts 12 km from the threshold, followed by an
8 km right turn to HDG 270°M. Those distances and the second heading are authored
game ATC instructions, not distances or fixes published in KENNEDY FIVE. LAX's
236°M heading is published, but its 7 km handoff distance is a game choice; the
game stops before the later vector and KLIPR crossing, not after the full SID.
Radar and handoff segments are dashed on ND. A vector endpoint is not a fix.

Altitude terminators have no published geographical endpoint. ND initially
shows an estimated dashed segment, labelled ALT. Capture requires the observed
MSL altitude, runway-end passage and established heading; its actual aircraft
position replaces the estimate. Waiting for altitude never turns the aircraft
back toward an estimated map location.

## Guidance, restrictions and evidence

Internal world height and existing training/arrival calculations remain
airport-relative. Departure restrictions, the departure PFD altitude, FCU
altitude readout and journey panel use MSL consistently. Clearance altitude is
separate from an altitude terminator and from a crossing minimum/maximum.
Passing the 500 ft gate does not command level flight at 500 ft. Terrain samples
can raise a game clearance, but cannot silently override a published ceiling.

Heading legs fly a heading without track wind correction. Fix legs correct for
wind. FD/AP demand bounded roll and pitch through the normal aerodynamic model;
the procedure never sets aircraft position, velocity or actual climb rate.
Fly-by anticipation uses actual ground speed, a 24° nominal bank radius and
both adjacent leg lengths. Fly-over fixes and altitude gates cannot anticipate.
The terminal segment requires an actual forward endpoint-plane crossing.

Capture requires ordered prior evidence and two seconds established on the
leg. `captures` records observed position, MSL altitude, IAS, time and capture
type. A crossing outside a published altitude window (100 ft game tolerance)
fails that departure; a later climb cannot retroactively satisfy the fix.
Speed limits appear on the panel, prevent an unstable cruise cut and produce a
visual ATC instruction if exceeded by more than 10 kt. Existing matching generic
recordings cover climb/departure turns; detailed numbers remain in the flight
instruments. The visual speed reminder deliberately has no invented audio clip.

Manual cruise-climb requests require ordered initial segments, the current
final segment's track (not the city great-circle bearing), clearance altitude,
three seconds stable and the existing gear/flap/engine/terrain checks.
Default continuous flight additionally requires the initial segment endpoint to
be passed and flaps fully retracted. This does not assert completion of the full
SID or arrival at cruise altitude. Short terminal transfers retain terminal
clearance; longer flights request climb before continuing. Only a player request
starts the skip cinematic. See [continuous flight](CONTINUOUS-FLIGHT.md).

`tests/departures.test.mjs` checks source coordinates, MSL conversions, turn
gates, restrictions, heading/track differences and translations. The physical
42-route checks in `tests/auto-cruise.test.mjs` verify ordered captures through
the public controls, including observed crossing heights and speeds; end-to-end
city-flight tests also retain real arrival, landing and parking assessment.
