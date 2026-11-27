# Skyline 320 exterior and interchangeable paint

The original code-authored A320-proportioned airframe has one stable UV layout,
external paint atlases and selectable wingtip geometry. It is an authored game
model, not manufacturer CAD or an engineering/training model.

The [aircraft foundation](../../../docs/AIRCRAFT-FOUNDATION.md) describes shared
runtime adapters, model construction helpers and version compatibility. The
current definition is `definitions/a320.json`; `rig.js` executes its declarative
animation bindings. `ops/aircraft/a320.py` owns the model-specific template.
The independent [A380 exterior and systems](../../../docs/A380.md) use their own
definition, template and UV/paint contract through the same runtime.

## Runtime contract

- `public/assets/aircraft/skyline-320-uv1.glb`: texture-free geometry with named
  animation joints, UVs, sharklets and small wingtip fences. Only the selected
  wingtip meshes enter the static airframe batch. UVs and animation joints are
  preserved during batching.
- `game/src/aircraft/catalog.js`: model/layout/version validation, immutable
  appearance identity, local resource URLs and texture size selection.
- `game/src/aircraft/livery-manifest.json`: generated dimensions, SHA-256 and
  byte sizes, matching `public/assets/aircraft/liveries/manifest.json`.
- `public/assets/aircraft/liveries/<id>/v1/paint-{2048,4096}.ktx2`: one complete
  opaque colour atlas per size. Only the selected size/livery is loaded.
- `public/assets/aircraft/basis/three-0.187.0/`: pinned, self-hosted decoder.
- The older `skyline-320.glb` is retained for existing sessions and baseline
  comparisons. New flights use the UV1 asset.

`loadAircraftVisual({THREE, renderer, loadingManager, appearance})` loads the
model and atlas before exposing the visual. It detects GPU compression support,
sets sRGB colour sampling and anisotropic filtering, and owns the loaded
resources. Every atlas is disposed once, including failed/stale loads. Source
SVG/PNG files are authoring resources and are not requested during play.

The ordinary appearance is `a320 / sharklet / yunji`. The 1549 profile declares
`a320 / wingtip-fence / us-airways-n106us-2009`. The flight state and each replay
segment retain independent copies of model, geometry variant, livery, model
version, livery version and UV layout. Intro, retries, final practice and rescue
copy that same appearance. A world also honours the recorded state when replaying,
replacing a previous aircraft only after the new resources finish loading. Late
loads for a disposed/replaced world are released.

The returned visual has `group`, `update`, `stats`, `anchors`, `appearance`,
`detailParts` and `dispose`. Its update changes visual actuators only, never
physics position, velocity, capability, failures or mission assessment.

## Stable UV template and artwork

`ops/assets/aircraft/uv1.json` is the packing contract. Atlas rectangles use a
2048-square authoring space, with gutters between islands. A 4096 output scales
that exact layout; it does not unwrap or repack the model. The labelled
`public/assets/aircraft/liveries/a320-uv1-template.svg` is for painting new liveries.

- Fuselage left and right occupy separate half-circumference strips. The seam
  follows the crown/belly; titles and registration read correctly on both sides.
- Fin and rudder use the same aircraft-space projection, so a line continues
  over the hinge while each surface retains its animation.
- Engines and wingtips have separate left/right islands. Wing upper and lower
  surfaces have independent islands; flaps/slats/ailerons keep their source-space
  coordinates when deployed. Gear doors follow the fuselage paint.
- Glass, lamps, tyres, bare metal and mechanical parts retain separate materials.
- Airline titles, registration, cheatlines and tail motifs are painted into the
  atlas, rather than built from lettering/logo meshes. No runtime font is needed.

`ops/build-aircraft-liveries.py` authors the original YUNJI AIR appearance and a
period-inspired N106US paint reproduction. Historical colours and insignia are
redrawn approximations from the aircraft photograph on the
[FAA Flight 1549 page](https://www.faa.gov/lessonslearned/transportairplane/accidents/N160US).
No reference photograph or third-party aircraft texture is bundled. The small
wingtip fences replace the modern sharklets for that scenario. Engine geometry,
glazing and other detailed construction remain authored visual estimates.

To add an event on the same model, paint against UV1, add immutable/versioned
atlas resources and their manifest entries, and declare the appearance in the
event profile. Geometry differences require a structural variant; another
aircraft type requires its own geometry, UV contract and performance preset.
Never overwrite released atlas versions or repack UV1: introduce a new version
and retain the previous catalog entry/resources for recordings and open sessions.

## Rebuilding and verification

A normal checkout builds/tests using the checked-in assets, without Blender,
CairoSVG, downloads or historical QA files. Authoring requires Blender 4.0.2,
Python CairoSVG/Pillow (DejaVu Sans installed), and KTX-Software `toktx` 4.4.2:

```sh
python3 ops/build-aircraft-liveries.py --toktx /path/to/toktx
blender -b --python ops/build-aircraft.py -- --model a320 --output-dir /tmp/aircraft-review
node ops/build-aircraft-check.mjs /tmp/aircraft-review/skyline-320-uv1.glb
node --test game/tests/aircraft-visual.test.mjs game/tests/aircraft-livery.test.mjs
```

The Blender source generates geometry first, exports the texture-free GLB, then
binds the external PNG for its preview. `--preview-livery us-airways-n106us-2009`
selects historical paint/fences for the preview; `--skip-preview` omits rendering.
Review staged geometry before replacing the served version. The generated
metadata and validation JSON accompany that model. Binaries and fonts used only
for authoring are not distributed; the decoder's Apache-2.0 notice is retained.

## Coordinate frame, contacts and actuators

Metres, X right, Y up, nose -Z. Length is 37.57 m, sharklet span 35.80 m,
small-fence span about 34.10 m, tail height 11.76 m above level ground. The common
root has longitudinal bounds -16.5…21.07 m and gear-down Y bounds -2.8…8.96 m.
These are game geometry estimates, not a claim about a certified mass centre.

`contact-anchors.js` shares main/nose tyre and water-contact anchors. Wingtip
presentation anchors match the selected structural variant. Changing paint does
not modify contact, flight dynamics, damage or scoring. The pressure-shell belly
is Y=-0.93 m; the wrapping fairing reaches -1.17 m, 0.24 m below it. The existing
12-degree ground-rotation clearance and cockpit-eye checks still apply. Captain
eye is X=-0.55, Y=2.30, Z=-13.40 m, following the same physical attitude and visual
root correction as the exterior, including during flotation.

Named joints retain independent gear, doors, steering, wheels, flap pairs,
slats, spoilers, ailerons, elevators, rudder, fans, reversers and lights. Gear and
flaps use actual actuator positions. AP surfaces use actual control commands.
Fans use independent actual N1; failed engines cannot gain working thrust or
reverse from their visuals. Simulation time controls flashes and pause freezes
fan/wheel animation. Original engine sound and the cockpit artwork are unchanged.

## Rendering budget

The ordinary model has 59,560 triangles; the fence variant has 59,486, compared
with the original 60,192. Both have 10 materials. A matched browser geometry
fixture with all lamps visible measures 60 submissions, versus 61 for the old
asset. Shadow and scenery calls remain separate from that comparison.

Default paint is 2K. 4K is selected only for high resolution desktop-sized views
when the renderer supports it. In the checked Chromium/SwiftShader BC7 path the
2K mip chain occupies 5,592,432 bytes (5.33 MiB); 4K occupies 22,369,648 bytes
(21.33 MiB). GPU formats/fallbacks and device frame rates vary. PNG download size
is not a GPU-memory estimate. The 2K KTX2 downloads are approximately 31 KB for
YUNJI and 40 KB for N106US, plus the decoder on its first use. Repeated swaps and
release return the fixture's texture/geometry counts to baseline.
