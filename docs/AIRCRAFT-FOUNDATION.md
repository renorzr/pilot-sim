# Aircraft foundation

The shipped A320 and [A380](A380.md) use the shared aircraft runtime. Adding
another model requires its own calibrated definition, authored
geometry and verified systems; the foundation does not make an A320 preset an
accurate C919, 737 or widebody.

## Definition and adapters

`game/src/aircraft/definitions/` owns each model's synthetic performance
coefficients, engine layout, actuator rates, flap/speed tables, capabilities,
cockpit selection, contact geometry, visual bindings and authoring parameters.
`registry.js` validates and freezes definitions. Runtime consumers resolve the
definition from `state.aircraft`; they do not mutate a global selected aircraft.

The shared force integrator, atmosphere, failure state, input centring,
recording, loading and resource disposal remain common code. Engine integration,
audio voices, fan/reverse bindings and extra replay engine channels support a
declared engine count. A non-playable four-engine fixture exercises those paths;
the separate A380 tests also fly its actual registered profile and exercises.

`adapter-ids.js` declares the installed control, thrust and cockpit adapters.
`sim/controls.js`, `aircraft/systems.js` and `aircraft/cockpits.jsx` implement their
respective dispatch. The current `rate-servo-v1` and `detent-autothrust-v1` preserve
the game's existing response; they are not manufacturer flight-control laws.
The `a320-v1` cockpit adapter retains the existing instruments, photographic
frame and controls. The simplified `a380-v1` adapter shares that layout with
four-engine gauges. A different cockpit/system architecture needs an adapter,
not a manufacturer-name branch scattered through the simulation.

`aircraft/rig.js` compiles model node bindings once and applies actual actuator,
engine and control state. It never writes physical motion or mission evidence.
Contact, camera eye, closeup focus, silhouette, smoke and shadow geometry are
resolved from the same definition. Variants can override contact anchors.

## Shared modelling tools

`ops/aircraft_geometry.py` supplies common Blender material, mesh, loft, tube
and coordinate helpers. `ops/build-aircraft.py` dispatches a registered trusted
template; `ops/aircraft/a320.py` owns A320 construction. The definition supplies
the A320 fuselage/wing stations and UV contract.

This shares construction tools and conventions rather than stretching one mesh
into every aircraft. New airframes can reuse helpers while owning their shape,
dimensions, joints, UV layout and contact anchors. GLB roots use metres, X right,
Y up, nose -Z. Released model/UV/paint versions remain immutable.

```sh
blender -b --python ops/build-aircraft.py -- --model a320 \
  --output-dir /tmp/aircraft-review --skip-preview
node ops/build-aircraft-check.mjs /tmp/aircraft-review/skyline-320-uv1.glb
node ops/check-aircraft-liveries.mjs
```

The foundation migration reproduces the existing A320 GLB byte for byte. Runtime
still loads one selected geometry/paint combination, with unchanged texture
resolution rules; registering data does not load every aircraft model.

## Identity, missions and replay compatibility

`aircraft` stores `model`, `definitionVersion`, `assetVersion`, `variant`,
`livery`, `liveryVersion` and `uvLayout`. New flights, checkpoints, retries,
historical presentation and replay retain that identity. Appearance or engine
count changes create a recording segment boundary. Twin-engine recordings keep
their existing packed columns; additional engines use optional sampled channels.

Missing identities in old checkpoints/recordings resolve to original A320
definition version 1, even if the future menu default changes. An explicitly
unknown model/version fails validation. Keep released definitions and resources
available when adding revisions; never silently reinterpret a recorded flight
using new performance coefficients.

Existing lessons explicitly declare A320 compatibility because speeds, faults,
assessment and dialogue were calibrated for it. US1549 retains its event-specific
flight/water tuning and historical appearance. Selecting another definition
alone must not make those missions claim compatibility. A380 uses its own presets within the unified Flight Training collection. The `AIRFRAME`, `FLAPS`
and contact constants retained for older tooling are default-A320 compatibility
exports; new runtime code should resolve the active definition.

## Adding an aircraft

1. Author a definition with a new ID and version, register it in `registry.js`,
   and supply measured/calibrated game parameters and geometry. Extend validation
   when introducing a new field or adapter.
2. Reuse an installed system/cockpit adapter only when its behavior applies;
   otherwise implement and register the required adapters and UI translations.
3. Add a trusted model template, versioned GLB, its UV-specific paint catalog,
   and animation bindings. Validate all declared nodes and geometry anchors.
4. Calibrate compatible missions, faults, guidance, sounds and cameras. Add model
   selection only once the aircraft and missions are ready for play.
5. Verify force integration, engine failures/reverse, contacts, actuator timing,
   audio playback, checkpoints, legacy recordings and real browser controls.

`game/tests/aircraft-foundation.test.mjs` includes six deterministic trajectory
comparisons against a fixture captured before migration, plus definition,
four-engine, adapter/rig and replay identity checks. Do not regenerate
`tests/fixtures/a320-before-foundation.json` just to accommodate a regression.
