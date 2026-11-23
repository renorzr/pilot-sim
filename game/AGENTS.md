# Game maintenance guide

Keep this file limited to durable working rules and user preferences. Product
behavior, tuning values and completed work belong in code, tests and the documents
linked below, rather than a chronological list of requests.

## Working and publishing

- Treat this as the formal game; do not label gameplay a prototype or demo.
- Run the application and relevant browser checks yourself when the environment
  supports them. Keep QA captures and logs in the ignored `qa/` directory.
- Use `https://flight.awsdev.renorzr.top` for user-facing review links. The existing
  Caddy route serves `public/` through the static service on port 18082. Loopback
  URLs are for internal checks. Preserve services already running for the user.
- Commit, push or deploy to GitHub when requested. A completed release's approval
  is not standing authorization for later releases. GitHub Pages remains the
  repository's public distribution target; keep its project-prefix support.
- For static updates, publish required assets before atomically replacing the
  entry HTML. Retain historical hashed bundles used by already-open sessions,
  except when the user explicitly retires a page and its dedicated assets.

## Where to find the details

All paths below are relative to this file.

- [README](../README.md) and [Chinese README](../README.zh-CN.md): product overview,
  controls and supported scenarios.
- [PHYSICS](../PHYSICS.md): state conventions, dynamics, mission assessment and
  model limitations. Use `src/sim/`, `src/missions/` and their tests for exact rules.
- [Development](../docs/DEVELOPMENT.md): architecture, setup, browser checks,
  radio generation and deployment. Commands are defined in [package.json](package.json).
- [Assets](../ASSETS.md), [third-party notices](../THIRD_PARTY_NOTICES.md),
  [airport data notes](src/airports/data/README.md) and individual airport/city
  notes: provenance, licensing, native resolution and rebuilding.
- [Aircraft notes](src/aircraft/ASSET.md) and [FCU layout](src/views/fcu-layout.json):
  authored model and shared cockpit layout geometry.
- Camera/presentation behavior: `src/views/`; radio cast, timing and effects:
  `src/comms/`; persistent scenery caches: `src/airports/`. Read the relevant
  implementation and regression tests before changing those behaviors.

## Lasting user preferences

- Play is landscape-only. Keep the selected photographic cockpit, original
  animated aircraft and established engine-sound character during unrelated work.
- Keep controls consistent across keyboard, pointer and touch. Spring-centred
  controls release input; they must not automatically level the physical aircraft.
- Maintain the established cockpit style: readable labels, translucent floating
  controls and functional instruments. Use shared layout geometry rather than
  independently adjusting artwork and live controls. Selected visual references
  govern visual implementation when the user supplies them.
- Prioritize believable scenery over exact architectural reproduction. Original
  programmatic models and plausible, stable estimates for missing height/colour
  data are acceptable; distinguish estimates from verified source attributes.
- Use self-hosted scenery and imagery. Do not introduce Esri or live external map
  services. Preserve source registration, airport geometry and attribution.
- Keep Chinese/English UI and recorded radio aligned. Radio delivery should be
  natural, restrained and brisk. Use the approved cast and VHF treatment documented
  in Assets and implemented in `src/comms/`, with separate clean safety callouts.

## Engineering guardrails

- Normal flight and ground motion must remain force-integrated. Guidance,
  cameras, visual motion and scripted radio cannot assign motion to satisfy an
  objective, repair failures or manufacture successful assessment evidence.
  Explicit labelled skips and presentation transitions have separate state rules.
- Keep physical state, selected controls and actual system capability distinct.
  Preserve failures, assessment history and speaker identities across the relevant
  retries/transitions; do not reset unrelated player records.
- Keep rendering, contact and terrain awareness consistent with their shared
  source geometry. Render LOD is not a substitute for collision/obstacle data.
  Airport data activation belongs to the accepted world, not a late async result.
- Optimize scenery with shared models, spatial LOD and versioned caches while
  retaining established coverage and prepared model reuse. Storage denial or
  interrupted loads must not prevent normal play or accept incomplete caches.
- Preserve authored aircraft UVs, animation joints and contact anchors when
  changing batching or geometry. Keep camera/aircraft presentation independent
  of simulation and assessment clocks.
- Keep runtime assets local and route their URLs through `src/urls.js` so root
  hosting and GitHub Pages subpaths both work. Preserve the hosting adapter's
  build outputs and tests when changing packaging.
- Never ship missing speech lines or silently substitute speakers. Publish audio,
  measured durations and content/version identities together. Credentials stay
  in backend process memory, outside source, browser code, arguments and media.
- A fresh checkout must test/build without historical QA files, local backups,
  credentials or live data downloads. Large runtime files are reconstructed from
  the checked-in parts via `ops/large-assets.mjs`; retain source/license notices.

## Verification

- Choose checks appropriate to the changed behavior. For broad simulation or
  release changes, run `npm --prefix game run test:flight`; for builds and hosting,
  use `npm --prefix game run build` and `npm --prefix game run test:sites`.
- Flight browser checks must use real keyboard/pointer controls, not debug setters
  that manufacture aircraft poses or completed results. Keep deterministic unit
  fixtures separate from end-to-end flight evidence.
- Check relevant languages and landscape sizes for UI work; audio changes also
  need actual playback checks, and scenery work needs contact/cache checks.
- After publishing, verify the public HTML and referenced resources, not just a
  development URL. Record the checks actually run; do not pin test counts here.

## Maintaining this guide

- Replace superseded guidance instead of appending competing versions.
- Add only lasting preferences or constraints that help future work. Keep task
  status, one-off permissions, bug histories and implementation thresholds out.
- Put detailed behavior in its owning module, regression tests or topic document,
  and link to it here when needed. Do not duplicate those specifications.
