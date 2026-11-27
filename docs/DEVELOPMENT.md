# Development

## Setup and build

Use Node.js 22.12+ and npm. From the repository root:

```bash
npm --prefix game ci
npm --prefix game run dev -- --host 127.0.0.1 --port 5173
```

`public/assets/` holds the source media. `game/public/assets` is a relative
symlink to it. On systems without symlink support, recreate that link or copy
`public/assets/` to `game/public/assets/` before running Vite.

```bash
npm --prefix game run test:flight
npm --prefix game run build
npm --prefix game run test:sites
```

Deploy `game/dist/client/` as a static site. The additional
`game/dist/server/index.js` and `game/dist/.openai/hosting.json` support the
optional hosting adapter; plain static hosting does not need them.

Generated bundles and `public/index.html` are intentionally untracked. The
existing live server retains historical hashed bundles so already-open browser
sessions continue to work; they are not needed in a source checkout.

## Architecture

- `flight.js` orchestrates fixed 100 Hz simulation ticks and public controls.
- `sim/` separates air data, forces, actuators, engine availability, weather and
  guidance. AP and FD use attitude demands, not position or velocity assignment.
- `aircraft/` owns immutable versioned definitions, system/cockpit adapters,
  resource identities and declarative visual rigs. See
  [Aircraft foundation](AIRCRAFT-FOUNDATION.md) for model authoring and extension.
- `missions/` owns deterministic faults, continuous circuit/return geometry,
  actual touchdown preparation and whole-lesson completion.
- `terrain/` shares the rendered mesh with swept collision and terrain alerts.
- `comms/` separates event priority and timing from playback and radio effects.
- `i18n/` translates presentation text before JSX/canvas rendering. Simulation
  strings, failure state and stored achievement identities stay canonical.

See [PHYSICS.md](../PHYSICS.md) for equations, conventions and model boundaries.

## Airline map selection

`AirlineSelect.jsx` combines city-to-city flights and airport practice on one
map. Airport picks alternate between origin and destination, starting with origin.
Two map picks form a route without separate confirmation; endpoint fields can
explicitly select which end to replace. A multi-airport dropdown preserves the
current slot until a concrete airport is selected. Practice opens its
briefing directly. The selected route, focused airport and explicitly chosen map
bounds survive a practice visit through the local planner UI preference; flight
recordings remain in memory only.

Airports keep their concrete IDs for missions, routes and records. Registry
`cityId` groups airports into one city marker, with optional `cityLocation` for
the marker position. A single airport resolves immediately; a city containing
several airports opens a keyboard-accessible dropdown and requires an explicit
choice. Adding a second airport requires its own scenery and missions as usual;
there are no placeholder airports in the shipped registry. City and endpoint
selection never automatically zoom or recenter the map.

## Browser checks

The browser helpers use Chromium's DevTools Protocol on localhost port 19333
and the global WebSocket implementation supplied by Node.js 22+. Start the
application, then launch a separate Chrome/Chromium profile, for example:

```bash
chromium --remote-debugging-port=19333 \
  --user-data-dir=/tmp/pilot-sim-browser about:blank
```

Run checks sequentially from the repository root. Bringing another tab to the
front can pause a running flight. Helpers create the ignored `qa/` output
folder automatically and use real keyboard/pointer inputs for flight checks.

```bash
node ops/check-bilingual.mjs http://127.0.0.1:5173/
node ops/check-airline-map.mjs http://127.0.0.1:5173/
node ops/check-airline-city-picker.mjs
node ops/check-original-engine.mjs http://127.0.0.1:5173/
node ops/check-aircraft-sounds.mjs http://127.0.0.1:5173/
node ops/check-arrival-motion.mjs http://127.0.0.1:5173/ menu
node ops/check-arrival-motion.mjs http://127.0.0.1:5173/ landing
node ops/check-stall-recovery.mjs http://127.0.0.1:5173/ stall
node ops/check-touch-and-go.mjs http://127.0.0.1:5173/
```

Some legacy helpers assume Chinese UI or earlier prepared approach entries.
The former `check-engine-tone.mjs` checks an archived, rejected sound mix;
its louder-than-original assertions do not apply to the current sound.
Historical audio references live in `ops/fixtures/`, and required test data in
`game/tests/fixtures/`. No local backup archive or previous QA output is needed
for the default tests or original-engine comparison.

## Localization and recorded radio

The EN/ZH choice is stored in `pilot-sim.language`. Add interface translations
to `game/src/i18n/en.json`; radio text lives in `script.json` and
`script.en.json`. Keep both radio scripts aligned by event, role and line count.

An active transmission replays when language changes. Its event timer uses the
selected language's measured duration so it can finish before the next line.
Pending events, emergency priority and one-shot history are retained.

Existing clips are included, so generation is optional. To regenerate them,
install FFmpeg/ffprobe and the Python requirements:

The five-speaker Chinese pilot/controller cast uses
`ops/generate-radio-cast.py`. Fish generators default to the local plaintext
`.secrets/fish-audio.key` file (one key, optional trailing newline), resolved
relative to the repository by `ops/fish_credentials.py`. The directory is Git-ignored
and stays outside `public/`; use mode 700 for the directory and 600 for the file.
Read it locally when Fish access is needed; never print or copy it into logs,
tracked files or browser assets. Explicit `--fish-stdin` remains available for
stdin input and takes precedence over the file. New Fish requests use the free tier; approved files and cached takes
are reused. It stages the complete manifest/audio under `qa/radio-cast/`. Next run
`ops/generate-pilot-clean.py` with the same local-file credential convention:
it reuses original Chinese takes and exports unfiltered pilot variants and
`qa/radio-climb/english-pilot-clean.json`. Runtime uses those pilot sources in
both views, switching the Web Audio dry/VHF gain paths without reloading media.
ATC stays filtered and selects the saved controller for the active airport.
Publish all content-addressed media before replacing the source manifest and
rebuilding. `ops/check-pilot-voices.mjs` verifies every speaker in both roles
and the canonical production signal sources. Runtime VHF processing lives in
`game/src/comms/radio-effects.js` and `radio-presets.js`.
The older generator below maintains English and legacy radio assets.

```bash
python3 -m venv .venv
.venv/bin/pip install -r ops/requirements-tts.txt
.venv/bin/python ops/generate-radio.py --language en --require-neural \
  --staging-dir qa/radio-stage
```

Omit `--language en` to generate Chinese dialogue/shared callouts. Neural
regeneration contacts an external speech service. Without `--require-neural`,
the generator can fall back to a separately installed espeak-ng.

Review clips and copy the matching `durations[.en].json` and
`voice-version[.en].json` to `game/src/comms/`. Keep corresponding generation
manifests in `ops/.radio-voices[.en].json`. Voice fingerprints must change when
text, speaker, pitch, cadence or signal layout changes, even if clip duration
stays identical. Standard warning clips are shared across languages.

Initial distress/urgency signals use three complete units, followed by the
same pilot voice. Verification requires the generator's cached signal units
in the system temporary directory; regenerate first if they are absent.

```bash
python3 ops/verify-radio-prefixes.py qa/radio-stage en
```

The verifier also requires NumPy (`ops/requirements-tts.txt`).

## GitHub Pages deployment

The public demo is https://renorzr.github.io/pilot-sim/. The workflow in
`.github/workflows/pages.yml` deploys on pushes to `main` or manual dispatch.
It installs dependencies, runs flight tests, builds with the base path reported
by `actions/configure-pages`, checks the hosting adapter and uploads only
`game/dist/client/`. The repository's Pages source is GitHub Actions.

Runtime images, Three.js textures and radio recordings use
the same base URL. To build locally for a project subpath:

```bash
VITE_BASE_PATH=/pilot-sim/ npm --prefix game run build
```

With no `VITE_BASE_PATH`, local development and ordinary root-hosted builds
use `/`. After forking, enable Pages with GitHub Actions; the workflow reads
the new site's base path rather than requiring a hardcoded account URL.

## Optional local static-service deployment

`ops/publish-game.sh` is the deployment helper for the hosted demo:

```bash
bash ops/publish-game.sh
```

It runs flight tests, builds the application, copies assets and replaces
`public/index.html` last. Serve `public/` through
your own HTTP server after publishing, or deploy `game/dist/client/` directly.

For a reviewed staged voice pack, supply the directory containing `radio/`
and matching metadata. An English-only stage also needs copies of the current
Chinese `durations.json` and `voice-version.json` for validation:

```bash
cp game/src/comms/durations.json qa/radio-stage/durations.json
cp game/src/comms/voice-version.json qa/radio-stage/voice-version.json
bash ops/publish-game.sh --radio-stage qa/radio-stage
```

`ops/pilot-sim-http.service` and `ops/flight.caddy` are examples for the existing
demo host. Adjust their absolute paths, account, ports and domain before using
them on another machine. The repository does not provision DNS, certificates,
reverse proxies or a running service automatically.


Changi uses the same mapped-city loader and persistent model templates as
LAX/Xiaoshan. Runtime outputs are included; normal builds verify their hashes
with `ops/check-changi-city-data.mjs` and need no Python or network. Optional
acquisition, cloud screening, extraction and packing are documented in
[Changi city notes](../game/src/airports/data/CHANGI-CITY.md). Browser inspection
uses `ops/check-changi-city-scenes.mjs` (independent render cameras) and
`ops/check-changi-city-game.mjs` (real UI/keyboard/pointer actions, external
requests blocked). Both accept a local base URL and `PILOT_CDP_URL`. Keep
local preview publication separate from any GitHub release.


Xiaoshan appearance revision 2 uses `ops/city_roof_sampling.py` for native RGB
footprint sampling and conservative EAB-only vegetation screening. Optional
`--from-candidates` replays the preserved candidate stage without source downloads.
`ops/check-xiaoshan-appearance.mjs` compares every retained building to the v1
pack, including source rings, frames and physical heights. Keep both versioned
packs so cached old previews stay usable. Independent planar registration can
be inspected with `ops/check-xiaoshan-alignment.py`; visual scene checks include
the `village` and `industry` shots and `PILOT_SCENE_PREFIX` for before/after files.

JFK uses the same loader with NY/NJ OSM footprints and self-hosted NAIP 2022.
Included output hashes are checked by `ops/check-jfk-city-data.mjs` during the
normal offline build. Optional acquisition, source-context extraction, spatially
bucketed roof sampling and packing are documented in
[JFK city notes](../game/src/airports/data/JFK-CITY.md). The optional C sampler
retains the Python algorithm; `ops/check-jfk-roof-sampling.py` compares real
footprints. Source caches belong outside the checkout. Use
`ops/check-jfk-city-scenes.mjs` for independent cameras and
`ops/check-jfk-city-game.mjs` for real UI/keyboard/pointer checks. Both accept
a local URL and `PILOT_CDP_URL`; browser checks block external requests.

Airport loading feedback uses `src/loading-progress.js` to combine concurrent
scene/aircraft work and mapped-city phases. Streamed building bytes, incremental
source indexing and prepared model counts drive the display; weights describe
work rather than estimated time. Progress stays below 100 until accepted-world
readiness. Browser-inflated responses omit the compressed-size denominator.
Disposed loads stop reporting, and source decoding yields between batches.
`tests/loading-progress.test.mjs` covers source-format equivalence, streaming,
cancellation, model preparation and readiness gating. With a local browser CDP,
`ops/check-airport-loading.mjs` checks throttled downloads, both languages,
switching away from an active load and an intentionally blocked transfer.
The recorded browser run captured 597 JFK loading samples with every phase
present, no progress regression, no flight-time advancement and no premature
Start activation. Switching to Kansai reset progress and a blocked Changi
transfer displayed the translated failure state. Evidence is saved in
`qa/airport-loading-browser.json` and `qa/airport-loading-*.png`.

Processed mapped-city data now persists in the browser's origin-scoped
`pilot-sim-city-cache` IndexedDB database. `city-persistent-cache.js` stores
decoded source headers, world-coordinate points and compact contact-index arrays
in 4 MiB chunks, publishing their descriptor only after all writes commit.
`dense-city-data.js` restores the source/contact accessors directly from these
arrays. `city-model-cache.js` stores finished per-chunk/LOD geometry and instance
arrays; shared template vertices, live materials, callbacks and GPU objects are
recreated. Previously visited near variants are also saved. Used compressed
images and small version manifests share the cache; manifests are checked online
and can fall back to the last saved copy when unavailable.

Source hashes, architecture and explicit source/model schema revisions determine
cache identity. Bump the model revision when changing templates, facade colours,
triangulation or serialization; bump the source revision for coordinate/index
rules. Corrupt records rebuild independently. Old airport generations are
pruned after the replacement prepares successfully. Storage denial, insufficient
quota and interrupted writes fall back to ordinary online preparation and never
change flight contacts, scores or geographic coverage. The progress UI reports
local read/save phases; GPU residency remains bounded independently.

`tests/city-persistent-cache.test.mjs` checks source/contact equivalence, model
round trips, corruption, version isolation and unavailable storage. With a
dedicated CDP browser, `ops/check-city-persistent-cache.mjs` checks cold/warm JFK
in separate pages with HTTP cache disabled, blocks large files on the warm pass,
repairs one damaged model and exercises storage denial. Its partial-write checks
import the pure storage module from the existing local Vite server on 18083.

Recorded local JFK preparation took 33.23 s cold and 18.09 s warm (both pages
used disabled HTTP cache). The warm page restored all 1,412 prepared variants,
built zero models, skipped source download/decompression/indexing and made zero
large city-file requests while those URLs were blocked. Damaging one model
rebuilt only that model. Real IndexedDB quota failure and cancellation tests
left partial source writes unpublished; denied storage still loaded Changi.
These timings describe this browser/environment, not a general performance
guarantee. Evidence: `qa/city-persistent-cache-browser.json` and
`qa/city-cache-warm-zh.png`. Native regression passed 342 tests and static
hosting passed four tests.

Large runtime databases are distributed in checked-in 32 MiB parts under
`ops/assets/large-files/`; `ops/assets/large-files.json` records each part and
assembled SHA-256. `npm run test:flight` and `npm run build` restore missing
files before use. Their runtime URLs and bytes are unchanged, and the browser
still downloads the ordinary gzip file. The parts stay outside `public/` so
they do not duplicate the deployed site. A normal checkout needs no Git LFS,
Python, source-data downloads or local QA folder to test and build.

After intentionally rebuilding a registered database, run
`node ops/large-assets.mjs pack` before committing. To register an additional
large file, append its project-relative path to that command; existing entries
are retained. Restoration rejects local mismatched files instead of silently
overwriting new work. Partial or corrupt part sets never publish runtime files.

The accumulated release was verified from a clean staged checkout without the
local QA folder: all four large databases restored with original hashes, 357
flight tests and four hosting tests passed, and a `/pilot-sim/` Pages build
produced an approximately 836.5 MiB site. Repository blobs remain at most 32 MiB.

Kansai reuses the mapped-city loader and persistent source/model cache. Native
building flags reserve bit 64 for the `ms/` source-row identities of supplemental
Microsoft geometry; OSM/EAB formats and other airports are unchanged. The offline
checker is `ops/check-kansai-city-data.mjs`. Optional GSI acquisition, source
context extraction, roof sampling and packing are documented in
[Kansai city notes](../game/src/airports/data/KANSAI-CITY.md). GSI tile pixel
spacing must remain distinct from unknown original photo dates/resolution.

`ops/check-kansai-city-scenes.mjs` supplies seven isolated rendering cameras;
`ops/check-kansai-city-game.mjs` exercises real UI/keyboard/pointer inputs;
`ops/check-kansai-city-cache.mjs` verifies cold/warm restoration with large files
blocked on a fresh page. All accept a local URL and `PILOT_CDP_URL`.
The regional photo encoding budget retains quality 91 near the airport/coast
and uses quality 85 for 6 km regional cells; the original working rasters still
drive roof colours. Large Kansai runtime bytes are included in the same verified
32 MiB repository-parts system. Source caches remain outside the checkout.

## Daxing regional city data

Daxing reuses `loadMappedCity` with a source-frame-specific footprint pack and
same-pass Sentinel-2 mosaic. `ops/fetch-daxing-city.py` acquires only geometry ZIP
members, two 10 m visual COG windows and the verified dated Hebei/Beijing PBF;
source caches remain outside the checkout. Original WKT transforms and native
footprint roof sampling are mandatory. Ordinary builds verify included outputs,
with large binary bytes restored from the existing 32 MiB repository parts.
The isolated scene, actual game and persistent-cache fixtures are
`ops/check-daxing-city-scenes.mjs`, `ops/check-daxing-city-game.mjs` and
`ops/check-daxing-city-cache.mjs`; all accept a local URL and `PILOT_CDP_URL`.
[Source and rebuild notes](../game/src/airports/data/DAXING-CITY.md).

## Cruise transition and prepared destination worlds

`views/cruise-transition.js` owns a presentation clock, the measured-velocity
visual aircraft, and a separate recorded climb-request/clearance/readback radio queue. It leaves the
qualified physical aircraft/evidence untouched until an opaque black frame has
been committed by React. `advanceFlight` / `advanceSimulation` / `advanceAtRate`
accept an optional `onCruiseSkip` hook; native callers keep immediate cuts while
App intercepts the same qualified automatic event and drops the remaining 4x
batch. Manual early skips enter the same state machine.

`views/airport-world-manager.js` retains one foreground world and at most one
prepared destination. Preparation starts on `canSkipCruise`, uses the existing
processed IndexedDB caches and keeps destination contact data inactive. The
prepared intro camera is rendered, its visible image/model work is awaited and
rendered again before progress reaches 100%. Promotion/disposal happens only
under full black; failed loads retry while the physical preview clock is held.
Cancelled readiness callbacks cannot affect a replacement world. Inputs are
blocked by the overlay, root capture handlers and ref guards.

The selected live camera is B: cut overhead, follow for one second, then roll
into a close upward view, fading at 8.5–9.5 seconds. `cruise-camera-track.js`
supplies the aircraft-relative observer track to the game.
The game rotates that offset by actual heading and targets the current rendered
aircraft, retaining terrain/building constraints and the saved player view.
The actual pose, measured velocity, configuration and source world continue
through the presentation; no illustrative altitude or climb is substituted.
Only the observer rolls. Recorded radio plays at normal 1× independently of
the camera. The source scene fades on its existing schedule; unfinished speech
and subtitles continue under black. Browser playback holds each line through
its actual media end, including buffering, before switching airports; muted or
unavailable audio falls back to measured durations. The final transmission gap
and destination loading must also finish before destination fade-in. Neither
the speech hold nor loading consumes destination simulation time.

The three Chinese and three English `airline-cruise-climb-*.mp3` recordings
request and clear climb to FL330 and read back the clearance. They never claim
cruise has already been reached at the departure skip altitude. Regenerate base
lines with `python ops/generate-journey-radio.py --event cruise-climb --staging-dir qa/radio-climb`,
then rebuild the Chinese cast and dry pilot variants.
`ops/check-cruise-transition.mjs` flies through real UI controls, records readonly
camera/flight samples and delays the destination request to verify black holding.
Its browser-side pilot uses DOM control events, never flight pose/state setters.

## Shared New York region

JFK/LGA operations and US1549 use `regions/new-york.js` and the common
`loadNewYorkCity` pipeline. The 80 km region has one horizontal source frame,
shared buildings/photography/tidal masks/vegetation/road sources, and separate
scene IDs, active-airport rules, height datums and prepared geometry. City IDs
in the menu do not determine scenery ownership. LGA is a separate operational airport under the same New York menu city.

LGA's flight frame follows runway 04. `regions/runway-city.js` leaves source
arrays canonical and bridges camera, parent transforms, photographic roof UVs
and live contact queries into that frame. The rendered terrain is the same
canonical triangular mesh transformed into the runway frame; contact samples
that grid rather than resampling a rotated DEM. Airport grading includes both
operational airports. See [LGA data notes](../game/src/airports/data/LGA.md).
The released vegetation manifest is retained; revision 3 uses `woodlands-v2.json`.

Raw imagery, decoded building arrays and compressed road/vegetation sources use
the `new-york` IndexedDB owner. Prepared geometry stays under each scene owner;
pruning one variant cannot delete another variant or shared sources. Existing
per-scene decoded building caches migrate into the common source cache. Historical
skyline suppression and winter branch/crown rendering remain profile choices.
`new-york-city-data.js` shifts archived building bases into the scene datum and
lowers floating bases onto the updated bank grid, using the same records for
rendering/contact and preserving original source arrays and building heights.

Tree positions/colours/heights are prepared offline into one checksummed MSL
array pack, shared by the two profiles. Runtime adjusts the scene datum and
restores typed arrays instead of regenerating approximately 1.19 million trees.
Source-polygon generation remains a checked fallback; processed cache hits skip
both the source polygons and prepared-pack transfer.

The canonical manifests are under `public/assets/cities/new-york/`; immutable
photography, masks and unchanged road tiles retain their existing paths. Road
streaming follows the aircraft, with at most 28 wanted/32 resident tiles, a
bounded fleet and distance-based minor-road detail. Winter trees use shared 3D
branches at all LODs and retain evergreen crowns. Forest placement is sourced;
park cover, individual positions/heights and traffic volumes are estimates.

Offline data rebuilds use the NY/NJ PBF identities already recorded in the JFK
building pack:

```bash
python ops/build-nyc-woodlands.py --new-york <ny.osm.pbf> --new-jersey <nj.osm.pbf>
python ops/build-airport-traffic.py --airport jfk --regional --extent 40000 --output public/assets/cities/new-york/traffic-v1.json --pbf <ny.osm.pbf> --supplemental-pbf <nj.osm.pbf> --reuse-regional-manifest public/assets/cities/jfk/traffic-region-v1.json
node ops/build-nyc-region-metadata.mjs
node ops/build-nyc-tree-models.mjs
node ops/check-nyc-region.mjs
```

The Python rebuild needs osmium, Shapely and Pillow; ordinary build/test uses the bundled
compressed derivatives and the offline Node validator. Read-only telemetry adds
`city.regionId`, `city.season` and `city.sharedSourceCache` alongside the existing
forest and traffic statistics.

## Source-mapped woodlands

Mapped cities load `woodland-world.js` alongside the shared building renderer.
`woodland-data.js` generates deterministic stands from source polygons, applies
source/airport exclusions and provides the independent obstacle index. Processed
fine/far arrays use the existing chunked persistent cache; shared volumetric
templates and spatial LOD control drawing cost. The foreground world's activation
installs contacts, and disposal releases them. Read-only diagnostics live under
`window.__flightSim.stats().city.woodlandStats`.

[Woodland notes](../game/src/airports/data/WOODLANDS.md) cover sources, estimates,
cache identity, contact envelopes and targeted validation.

## Initial departure data

See [Initial departures](DEPARTURES.md) for the six pinned chart sources, MSL
conventions, real fix coordinates, game radar/handoff boundaries and validation.
Changes to a prefix must preserve the force model and pass the physical
30-route departure tests as well as restriction fixtures.

## Mission recording and debrief

[Replay notes](REPLAY.md) describe the full session-only flight recording, segment
boundaries, latest-attempt highlights, independent camera/playback clock and
result-screen controls. No flight recording is persisted, and the full-flight
player is not exposed. `game/tests/replay.test.mjs` covers sampling, interpolation,
retention, scene boundaries and playback; `ops/check-mission-replay.mjs` verifies
normal success and failure results through actual flight controls.

## Historical US1549 scenario

[Scenario design and acceptance notes](HISTORICAL-US1549.md) describe the historical scene profile over the shared NYC region, crew decisions, continuous manual handover and water dynamics.
`game/src/history/` owns the scenario, its bilingual crew script, independent
progress and marked presentation scenes. `sim/water-contact.js` owns swept first
contact, hydrostatic/hydrodynamic forces, damage, flooding and evacuation state.
Normal runway assessment and ordinary mission progress are independent.

Opening and rescue scenes run on private visual copies and independent clocks.
They never modify flight evidence. Session recording starts at the actual bird
strike and seals at the physical result; optional history channels preserve
water contact and control-source data without changing packed flight columns.
The rescue scene precedes the ordinary result replay. Practice never writes
formal historical records; guided/challenge records are separated by revision.

`game/tests/us1549.test.mjs` covers physical outcomes and control-only numerical
flights. `us1549-experience.test.mjs` covers presentation isolation, crew timing,
cast integrity and scoring boundaries. `ops/check-us1549-ui.mjs` verifies a formal
flight or final approach through real UI decisions and captured pointer-stick
input, using read-only telemetry for its test pilot. `ops/check-us1549.mjs` runs
as part of test/build; add `--audio` to measure all speech with ffprobe.

US1549 revision 3 adds `history/navigation.js` and `us1549-tuning.test.mjs`.
`ops/check-us1549-ui.mjs` accepts `full`, `practice` and `return`; the return check
uses the actual early-takeover button, runway selector, captured sidestick, gear,
flaps and brakes. `ops/us1549-ui-pilot.mjs` is QA-only control-event code, not a
runtime autopilot. Optional `PILOT_QA_NO_RASTER=1` suppresses only raster calls
while retaining complete contacts and physical simulation; captures restore it.

US1549 决策分支与选项排序回归位于 `game/tests/us1549-decisions.test.mjs`。浏览器脚本 `ops/check-us1549-ui.mjs` 的 `return-formal` 模式通过真实题卡完成 LGA 正式交接与手动备降；`return` 仍覆盖提前接管练习。选项 ID 独立于显示顺序，QA 不按按钮序号选择。

水上迫降 HUD 的只读模型和组件位于 `game/src/history/ditching-guide.js`、`DitchingGuide.jsx`，建议范围复用 `sim/water-contact.js` 的评分目标。`tests/ditching-guide.test.mjs` 覆盖阶段中性提示、实际构型、重量、首次入水冻结和水相对坐标。浏览器验收可设置 `PILOT_QA_CHECK_ENTRY_GUIDE=1` 运行 `ops/check-us1549-ui.mjs` 的 `practice` 模式，采集实际进近/拉平/入水阶段并核对首次接触记录。

Failure presentation checks: `tests/failure-presentation.test.mjs` and
`tests/failure-audio.test.mjs` cover evidence-based incident classification,
casting, overlap, pause/mute/skip/language behavior, media stalls and stop races.
`ops/check-failure-audio.mjs` validates every bundled recording/mix, source hash,
caption, voice and measured cue boundary as part of tests/builds.

`PILOT_CDP_URL=http://127.0.0.1:19337 PILOT_QA_LANG=zh node ops/check-failure-intro.mjs http://127.0.0.1:18097/ history` flies the declared
US1549 final-approach practice into an actual impact using ArrowUp. `airport`
selects JFK landing through the real menu and checks a solid-surface collision.
The optional `PILOT_QA_CANCEL_CHECKS=0` omits extra retry/skip/menu trials. The
checker samples real playback RMS, records the actual Web Audio output, checks
voice overlap/normal speed, fixed failure evidence, black/captions, small-screen
controls and failure-first replay. Long flight segments suppress raster draws
only; source collision/scenery, dynamics, UI and audio remain active. Captures
restore rendering. All evidence belongs under ignored `qa/`.

Successful water-rescue coverage is in `tests/rescue-media.test.mjs`; media and
source/role identities are verified by `ops/check-rescue-audio.mjs` during builds
and flight tests. Set `PILOT_QA_CHECK_RESCUE=1` and `PILOT_QA_NO_RASTER=1` when
running `ops/check-us1549-ui.mjs <url> practice` to fly a real final approach,
record the actual rescue output, and verify all voice parts, pause, language
switching, frozen results and natural transition into highlights. Without that
flag the same real flight checks the skip path. No standalone public review page
is generated.

`tests/history-opening.test.mjs` checks normal cover dialogue, source-state
isolation, the real two-second post-strike trajectory, skip/pause behavior,
bounded smoke and the synthetic impact/wind-down spectrum. Run
`PILOT_CDP_URL=... PILOT_QA_LANG=zh node ops/check-history-opening-ui.mjs <url>`
(or `en`) for real-menu browser evidence: recorded radio/SFX output, bird/smoke
capture, paused impact, automatic cockpit handover and the shortened opening.
The checker observes real scene/effect statistics and sends normal controls;
it does not assign aircraft motion, engine faults or outcomes. Software-GPU
runs suppress raster calls between captures while keeping simulation, contact,
scene updates and audio active. Captures restore rendering and invalidate the
viewport before sampling the actual frame.

### Aural fault lifecycle

`sim/alerts.js` maintains bounded active alert state and acknowledgement revisions
inside the physics step, including historical flight. Failed engines are distinct
from deliberately switched-off engines. A single-engine/system caution chimes once;
dual failure uses a short electronic cue at 5.7-second intervals. C or the dedicated
alert button acknowledges current cues without repairing faults or confirming an
unrelated checklist. New/escalating faults can chime again. Existing stall/terrain
voice warnings retain priority; speech ducks the electronic cue.

`audio/alerts.js` synthesizes a shared small mono buffer and allows one active cue.
It follows simulation/recorded time, stops for pause/mute/results, and releases its
source on disposal. This simplified alert scheme is not an aircraft ECAM trainer.
Regression coverage: `tests/alerts-replay.test.mjs`.

The historical NYC water supplement and its reproducible masks are documented in
[HISTORICAL-US1549](HISTORICAL-US1549.md#upper-hudson-water-coverage).
`isSeaLevelWater` selects marine water and explicitly marked source tidal faces;
JFK and US1549 share the NYC tidal supplement and water masks, with each scene
applying its own MSL offset. `loadMappedCity` maps each water mask through its own bounds instead
of assuming photograph and mask extents coincide. Check the upstream water
contact fixture and mask pixels before publishing water-source changes. Native
upstream flight QA uses `ops/check-upstream-hudson-ui.mjs`, which reads telemetry
and sends normal sidestick/key controls, never flight/result setters.

## Continuous-flight checks

`ops/check-airline.mjs <url> continuous lga-jfk exterior` uses native menus and
controls for an uninterrupted flight. The old `auto-cruise` browser mode has
been replaced by `continuous`. `ops/check-cruise-transition.mjs <url> manual`
checks the optional player-requested cinematic. See
[continuous flight](CONTINUOUS-FLIGHT.md) for state handoff, coverage and
simulation regressions.
