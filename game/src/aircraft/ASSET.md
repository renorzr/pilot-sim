# Skyline 320 exterior asset

An original, code-authored airliner exterior for the game's external cameras.
It uses A320-with-Sharklet proportions, but is not manufacturer CAD and is not
an engineering or flight-training model. It has the original midnight-blue /
ocean-teal **YUNJI AIR** livery and no third-party airline logo.

## Files and rebuild

- `public/assets/aircraft/skyline-320.glb`: self-contained runtime GLB. No
  external textures, fonts, model service or network credentials are needed.
- `public/assets/aircraft/skyline-320-preview.png`: native Blender daylight
  rendering of the same original source geometry.
- `skyline-320-metadata.json` and `skyline-320-validation.json`: dimension,
  contact and geometry/joint verification results.
- `ops/build-aircraft.py`: full original geometry authoring script.
- `game/src/aircraft/visual.js`: loader, semantic material batching and visual
  actuator updates. It never assigns aircraft physics position, velocity,
  capability, failure, result or mission state.

Rebuild with Blender **4.0.2** and the system DejaVu Sans Bold font:

```sh
blender -b --python ops/build-aircraft.py
node ops/build-aircraft-check.mjs
```

For staged inspection before replacing the served asset, pass
`-- --output-dir /tmp/aircraft-review` to Blender, then pass the absolute GLB
path to `ops/build-aircraft-check.mjs`. Validation is saved beside that GLB.

The font is used to turn the original livery words into triangles at authoring
time; no font software is distributed in the runtime asset. All mesh geometry,
livery design and code in this bundle were authored for this repository. They
are distributed under its MIT License. No third-party aircraft model or
reference photograph is bundled.

## Proportions and coordinate frame

The reference proportions are length **37.57 m**, Sharklet span **35.80 m** and
tail height **11.76 m** above level ground. See the official
[Airbus A320ceo characteristics](https://www.aircraft.airbus.com/en/aircraft/a320-family/a320ceo).
Individual sections, hinges, cockpit glazing, nacelles, gear and structural
subdivisions are visual estimates, not manufacturer construction drawings.

The wing/body fairing wraps the lower pressure shell with a shallow, smoothly
tapered envelope. Its maximum width is 4.36 m and its bottom is Y = −1.17 m,
only 0.24 m below the pressure-shell belly. These are authored visual dimensions,
not Airbus specifications. The fairing uses body enamel; main-gear doors and
narrow bay seams follow the lower wing skin instead of hanging below it.
The fuselage belly also uses the same white enamel, with the navy/teal side
cheatlines retained above it.

The GLB is in metres with X to the aircraft's right, Y up and forward −Z. Its
longitudinal bounds are −16.5…21.07 m, lateral bounds −17.9…17.9 m, and its
vertical bounds with extended gear are −2.8…8.96 m. The root is the existing
game flight reference, not a claim about the aircraft's certified mass centre.
At a game reference height of 2.8 m, all extended tyre bottoms touch zero.

Contact anchors exported by `AIRCRAFT_CONTACTS` / `visual.anchors`:

- Main tyres: X = −2.85, −2.35, +2.35, +2.85; Y = −2.8; Z = +2.5.
- Nose tyres: X = ±0.24; Y = −2.8; Z = −12.3.
- Sharklet references: X = ±17.9; Y = 2.28; Z = 6.

During a ground rotation, the renderer needs to raise the *visual* root enough
to keep transformed main contacts on the shared terrain. This does not change
flight state. A native vertex check finds 0.0508 m minimum body/wing/nacelle
clearance at 12° nose-up after this main-contact correction, before any game
pavement elevation. Tyres are rounded; their exact tangent differs from the
resting bottom anchors by less than 0.02 m at that angle.

## Loader and animation contract

```js
const aircraft = await loadAircraftVisual({THREE, loadingManager});
scene.add(aircraft.group); // Add after world static batching.
aircraft.update(flightState, deltaSeconds);
// The caller sets group world position / pitch / yaw / roll.
aircraft.dispose();
```

`createAircraftVisual({THREE,scene})` accepts an already-parsed GLTF scene for
native Node geometry fixtures. Returned fields are `group`, `update`, `stats`,
`anchors` and `dispose`.

Named nodes retain separate hinges for main and nose gear, gear doors, nose
steering, wheels, flap pairs, leading-edge slats, six spoilers, two ailerons,
elevators, rudder, fans, reverser sleeves, beacons, strobes and landing lights.
Static pieces are merged by material *within* these semantic groups so moving
parts remain independent. The world's earlier static merge must not flatten
this hierarchy.

Batching also separates incompatible vertex attribute layouts and storage
formats. Authored UV channels, tangents and vertex colours survive merging;
parts without UVs remain separate from UV-mapped parts. The current GLB has
positions and normals only. This loader support does not generate a UV unwrap
or add texture artwork to that asset.

- Gear uses actual `gearPosition`, and flaps/slats use actual `flapPosition`.
- Manual surfaces read stick/rudder commands. AP surfaces use the existing
  actuator commands (`pitchCommand / .09`, `rollCommand / .36`).
- Spoilers use actual deployment, separate from arming.
- Fans use independent actual N1. The displayed angular rate is deliberately
  reduced for rendering; it is not a physical RPM simulation. Failed/off fans
  can windmill when actual air data supplies nonzero N1.
- Reverser sleeves require selected reverse, real ground landing state, IDLE,
  a running corresponding engine and actual negative thrust. A failed engine
  does not produce a working reverser or gain thrust from this asset.
- Flash timing uses simulation time. Fan/wheel motion requires advancing
  simulation time and positive delta; pause freezes them.
- No smoke or fire is fabricated for a generic failed engine.

## Validation and rendering budget

The frozen asset has **60,192 triangles**, **11 shared materials** and about
**58 gear-down mesh submissions** after semantic batching. All uploaded
positions/normals and node transforms are finite. There are no external image
payloads; the GLB is approximately 1.46 MB.

Native checks cover declared extents, all required joints, gear and flap
transit, AP surface signs, independent fan and reverse states, paused fan
motion, absence of writes to flight state, and 12° ground-rotation clearance.
The actual game render budget additionally depends on airport scenery,
shadows, camera frustum and hidden parts.
