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
- `missions/` owns deterministic faults, continuous circuit/return geometry,
  actual touchdown preparation and whole-lesson completion.
- `terrain/` shares the rendered mesh with swept collision and terrain alerts.
- `comms/` separates event priority and timing from playback and radio effects.
- `i18n/` translates presentation text before JSX/canvas rendering. Simulation
  strings, failure state and stored achievement identities stay canonical.

See [PHYSICS.md](../PHYSICS.md) for equations, conventions and model boundaries.

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
`ops/generate-radio-cast.py`. Run it in a terminal with input echo disabled
and pass the Fish credential on stdin, never in an argument or environment
file. New Fish requests use the free tier; approved files and cached takes
are reused. It stages the complete manifest/audio under `qa/radio-cast/`.
Publish all content-addressed media before replacing the source manifest and
rebuilding. `ops/check-pilot-voices.mjs` verifies every speaker in both roles
and that the game and audition page share the same VHF preset source.
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
visual aircraft, and a separate recorded cruise-entry radio queue. It leaves the
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
Only the observer rolls. Existing recorded radio uses a separate, measured
presentation tempo so it ends before fade without slowing or accelerating the
aircraft or engine sound. Black loading waits and destination fade-in follow
the 9.5-second source shot and do not consume destination simulation time.

The two Chinese and two English `airline-cruise-entry-*.mp3` recordings use the
existing role profiles and radio DSP, measured durations and airline fingerprint.
Regenerate only these with `python ops/generate-journey-radio.py --event cruise-entry`.
`ops/check-cruise-transition.mjs` flies through real UI controls, records readonly
camera/flight samples and delays the destination request to verify black holding.
Its browser-side pilot uses DOM control events, never flight pose/state setters.
