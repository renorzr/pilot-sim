# In-memory mission recording and debrief

Flight recording lives only in the current `App` session. It is never written to
IndexedDB, localStorage, a file, or a server. Starting another mission replaces the
recording; refreshing or closing the page loses it. Opening level selection or
hiding the result card retains the current mission recording and playhead.

`src/replay/flight-recording.js` samples at 20 Hz from the existing 100 Hz physics
loop, including 2×/4× acceleration. Critical events add a sample at their exact
physics tick. Position and simulation time use Float64; attitude, velocities,
controls, engine/configuration, weather and input values use Float32 in chunks.
Discrete values are stepped and attitude interpolation takes the shortest angle.
Sparse dialogue/voice, clearance, callout, mission and result context accompanies
the numeric samples without affecting highlight selection.
Memory grows with actual recorded flight duration (roughly 30 MiB/hour, plus
segment allocation and event metadata); the full flight is not truncated to a
rolling highlights buffer. Paused time contributes no repeated flight samples.

Position/time skips and airport changes create separate segments. They do not
invent the unflown portion of a journey. Stage retries retain all raw segments and mark a new attempt. A separate replay
path keeps the valid prefix up to the restored checkpoint and replaces only its
discarded future. Thus an arrival-taxi retry retains the already completed
departure, approach and touchdown, while failed branches stay out of highlights. The result
state and assessment stay frozen while replay reads independent render states.
A future full-flight player can consume the same segments, but there is currently
no full-flight replay action or placeholder in the interface.

`src/replay/highlights.js` builds event windows around actual lift-off, turns,
abnormalities, go-arounds, final approach, touchdown and meaningful airborne
mission-end events. It combines these with whole-flight architectural and motion
windows, scores their camera options, then selects at most six chronological
clips. Coverage preserves distinct flight milestones and airports; camera quality,
subject/style variety and overlap suppression choose between competing views.
There is no pre-score six-window shortlist or two-scenery-clip quota. Parked clips,
grounded completion markers and redundant generic starts are excluded from the
finished selection; their raw data remains recorded. Very short flights use their
available source duration without inventing motion. Playback loops with brief fades.

`src/replay/replay-camera.js` exposes the scored camera library described below,
including runway-side, elevated observation and airborne tracking shots.
Camera constraints reuse the scene's terrain and
building checks. The original selected cockpit/exterior camera is unchanged.
The result card shifts the frame composition but does not change recorded motion.

The debrief hides instruments, flight controls, status panels and live warnings.
The card can be hidden/reopened; bottom controls support pointer and touch, with
Tab for the card, Space/P for playback, arrows for clips, Escape for level selection,
and R for a new attempt from the start. Existing stage retry remains in the card.
Opening level selection holds playback. Background tabs and portrait orientation
hold the playback clock. Engine/contact sound follows the recorded state; live
radio and safety speech are stopped rather than re-triggered on each replay loop.

Playback starts with a clip at the resident airport. Cuts reuse its ready base
scene immediately; high-resolution imagery and near building/road details continue
streaming without blocking playback. The next distinct airport prepares early in
the background. Replay swaps the two retained airport scenes instead of rebuilding
them on each loop; only missing base airport data can hold the fade. Hidden scenes
uninstall contact providers until deliberately reactivated. Live cruise transitions
keep their existing strict full-detail warming requirement. At most the existing
active airport plus one prepared airport are retained. Replay does not run flight
physics or submit new scores. Returning to gameplay restores its airport and uses
normal physics, input and assessment paths.

Regression coverage: `game/tests/replay.test.mjs`. Browser review:
`PILOT_CDP_URL=... node ops/check-mission-replay.mjs <url>`. The browser check flies
the normal takeoff lesson through the visible controls to a real result; it does
not assign aircraft poses or successful results. Screenshots/reports go in `qa/`.

## Scored camera library

`shot-library.js` registers baseline observers, animated wheel and bank-attached
tail closeups, and one architectural family shared by terminals and city landmarks:
side-on/full-aircraft framing (including a long-lens variant), partial-fuselage
shoulder framing, ground-level upward flybys, and optional shoulder/ground pairs.
The old `terminal-pair` and `landmark-pass` IDs remain read-only pose aliases for
exported manifests; they do not generate new candidates.

`shot-context.js` groups connected terminal wings, prefers principal terminal
footprints to small ancillary structures, and retains individual source facades
for foreground placement. LAX's 16 city targets use the exact geographic frames
of existing rendered landmark models; regenerate their compact directory with
`node ops/build-shot-anchors.mjs`. Other airports share the terminal target path;
known Jewel geometry and eligible source building foregrounds can also participate.

`landmark-discovery.js` scans every valid recorded span at approximately one-second
intervals using packed positions and optional pitch/bank/gear signals. Closest
points on intervening segments catch passages between samples. It never bridges
skipped cruise or discarded retry branches. Repeated visits and different portions
of a long passage remain eligible: metadata buckets retain closest/strongest
moments every four seconds for nearby low passes and eight seconds otherwise.
Bank peaks and actual gear movement also propose windows outside key-event times.
No global top-twelve or one-window-per-landmark cap precedes camera scoring.
Discovery yields between metadata batches, without per-tick full-state cloning,
model loading, rendering or LLM calls.

Ten trajectory samples per candidate check aircraft framing, visible architecture,
terrain, source footprint prisms, aircraft-shell occlusion, movement, light and
cost. Spatial ray corridors avoid scanning an entire city. Concave terminal
courtyards are refined beyond their bounding boxes. Architectural samples require
at least two real facade/footprint reference points in frame; being mounted near a
building grants no credit. Shoulder cameras score a selected fuselage region and
permit intentional cropping. Ground cameras stay about 2.2 metres above terrain,
require an upward viewing angle and a minimum apparent aircraft size, and keep an
architectural foreground visible. Pair cuts follow the recorded passage time,
with continuous aircraft motion and a fixed ground vantage.

Weights total 100: action 25, visibility 20, composition 20, setting 15, motion 10,
light 5, cost 5. Hard failures are rejected; scores of at least 65 compete within
four adjusted points of the best. Repetition penalties distinguish architectural
photographic styles while treating terminal/city identities uniformly. A
per-recording seed varies close choices between missions; plans stay fixed through
loops. Runtime camera corrections can pin a safe aircraft-follow fallback.

Every proposed window completes camera evaluation before final selection. Failed
candidates can stop early once enough sampled frames are invalid to make the
visibility threshold impossible. A window retains the best viable option per
photographic style; unselected windows do not contribute repetition penalties.
Only after these scores exist does the selector apply milestone coverage, visual
quality, subject/style diversity and overlap suppression. Discovery and scoring
stay bounded in small background tasks (target two milliseconds, at most 256
sample steps per task). Atomic metadata/context/pose work can exceed that target;
it is not a hard device-time guarantee.

The result card stays usable while planning; the resident canvas holds its last
frame rather than repeatedly rendering an unfinished replay. Restarting, retrying
or leaving the app cancels outstanding planning tasks. Final camera plans stay
pinned through loops, and playback starts at the resident airport when available.
Scoring uses math and existing geometry metadata, without extra renderers,
candidate videos, GPU readbacks, LLM calls or scenery fetches. Read-only selected
reports, all candidate-window reports, discovery counts and CPU/wall timings are
available through `window.__flightSim.replayDirector()`. Playback still uses the
selected camera and the existing two-world cache. Regression coverage includes
`game/tests/replay-selection.test.mjs`.

Wheel foci reproduce the actual animated main-gear and nose-gear transforms,
including steering and retraction. `wheel-close` isolates the outboard tyre of one
main gear, looking aft along the aircraft axis; `nose-wheel-close` looks forward
from behind the nose gear; `nose-wheel-front` views that same gear from ahead,
looking aft. Both attach their position, target and up vector to the
recorded pitch/roll. The main-tyre lens caps its horizontal coverage on wide
screens to keep the neighbouring tyre outside the frame. Closeups use
part-specific terrain clearance and near clipping. Tail shots also inherit the
rotated aircraft up vector. `tail-bank-front` adds an aft-looking closeup from
above the fuselage in front of the tail, alongside the original `tail-bank`
rear-quarter view. Terminal/building pairs cut on continuous recorded
time. Runtime camera rays reuse actual scene/city geometry and can pin a safe
fallback after a large obstruction correction.

`landmark-zenith` is a separate recipe from the unchanged `landmark-ground`.
It keeps the ground camera position and lens fixed beside a real roof edge.
Silhouette points from the authored aircraft bounds locate first entry into the
opening vertical frame; the selected recorded window starts one second earlier.
The opening rotates around its vertical sight line to align incoming flight
with the top of the frame. It holds on the roof/sky through entry, waits until
the aircraft reaches the middle, then smoothly starts panning and continues
tracking through the pass. Roof visibility is
required during the establishing view and may leave the frame during tracking.
Entry detection adapts the appearance time to the current screen aspect, with a bounded
cache, and seeks/loops compute the same pose without integrating camera history.
High, distant or obstructed passes are rejected. Live camera constraints must
preserve the ground position or fall back. No aircraft motion is assigned by the camera or director.
Returning to normal play restores the original camera up vector and near plane.

## Optional replay detail assets

Current gameplay and replay both use the existing authored low-detail model.
`registerReplayDetail(part, {bytes, load})` provides a future visual-only addon
path for `wheel` and `tail`. No high-detail assets or factories ship yet. A loader
receives an abort signal and returns `{group, bytes, update, dispose}` in the same
X-right/Y-up/nose-minus-Z local frame and scale as the base aircraft. Its update
must apply the same recorded gear/attitude state. Use self-hosted URLs through
`siteUrl`. The base's replaceable gear/fin groups retain their UVs and animation
owners. Base visuals stay visible during missing, failed, oversized or unfinished
loads. Only the currently selected replay part requests an addon; normal play
never requests one. The optional cache allows at most two parts and 64 MiB of
reported geometry/texture bytes, aborts stale requests, releases addons when
leaving replay, and cannot change physics, contact geometry or assessment.

Additional verification: `game/tests/shot-director.test.mjs` and
`ops/check-shot-director-scenes.mjs`. The latter renders explicitly isolated camera
fixtures and stores captures in `qa/`; it does not set live flight poses/results.

## Failure sound prelude

A failed result seals the real flight recording before a separate presentation
clock begins. Physical collision/ditch failures receive an original radio
montage over solid black behind the immediately operable result card; a safe
but unqualified/procedural failure uses only a short instructor line. Success
and the existing successful historical rescue keep their own behavior. Water,
land and airport/ground incidents use appropriate reports without inventing
fire, casualties or detailed geography.

The montage is continuous: controller calls, field reports, complete dispatch
orders, responding-unit acknowledgements and partially obscured fragments overlap.
Field, dispatch and responding units have three distinct full-length voices;
short background excerpts alone do not count as separate principal parts.
Noise and distant rescue
ambience fade under a normally paced final confirmation. The first incident
montage is about 17–20 seconds and always below twenty seconds, with shorter
variants retaining dispatch and response for repeated
failures of the same kind in the same mission. The key is chosen once per
result; toggling the card or looping a replay never replays the prelude.

Replay planning and scenery preparation run during black. Failed sessions
prefer the scored wide failure clip in the resident airport as their first
shot; their remaining highlights retain recorded chronology. The picture fades
in near the last confirmation, with replay engine/wind audio ducked until the
radio tail ends. A real scene readiness delay may extend black without looping
speech; result controls stay usable. Opaque black stops unnecessary scene draws
once the first replay scene is ready.

During the prelude: Space enters replay, P pauses/resumes the presentation, Tab
hides/shows the result, R retries and Esc returns to the mission menu. Retry,
stage retry, menu navigation, skip and unmount stop audio immediately. Hidden or
portrait pages pause the sequence. Muting retains the timeline; unmuting seeks
to its current point. Language changes restart only the current transmission
in the new language while retaining variant, controller identity mapping and
reveal progress. Speech uses the media clock so slow scene frames cannot speed
it up. The active transmission has matching subtitle priority, including dispatch
during overlapping reports. A blocked/unavailable stream has a bounded
visual/caption fallback.

The scripts, cue models and view component are in `game/src/failure/`; the
bounded one-element player is `game/src/audio/failure-audio.js`. Presentation
state, emergency voices and synthetic ambience never write to physics, result
assessment, the sealed recorder, normal records or historical qualification.
