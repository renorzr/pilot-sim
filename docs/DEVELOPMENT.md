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

Runtime images, Three.js textures, radio recordings and the gallery link use
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
`public/index.html` last. It preserves `public/designs/`. Serve `public/` through
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
