# Game Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable game-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local game can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Flight control preference

The user approved replacing persistent keyboard deflections with a spring-
centred virtual sidestick. Held arrows smoothly increase deflection; release
returns the stick to neutral in about 0.2 seconds. Aircraft attitude must not
spring-level with the stick: ordinary airborne bank persists after release,
turning continues while banked, and opposite input rolls the aircraft level.
Pitch response likewise remains separate from physical stick position.
Show both percentages plus a 2D draggable stick-position indicator. Shift
enables fine control. Mouse/touch drag releases to centre. Pausing, opening
menus or losing focus clears input and centres the stick, preserving aircraft
attitude. Retry/new mode resets the exercise. This supersedes the earlier
preference for retaining stick deflection after release.

Pitch direction follows the physical aircraft convention: pushing forward
(ArrowUp, dragging toward the top, or the up touch button) lowers the nose;
pulling back (ArrowDown, dragging toward the bottom, or the down touch button)
raises it. Internal positive pitch input means nose-up. The 2D stick marker
must move toward the bottom for positive/aft input. Takeoff/flare/recovery
prompts must say ArrowDown for nose-up. Keep keys, pointer, touch and guidance
consistent; do not invert the physical flight model to correct input signs.

## A320-inspired approach scope

The approved exercise includes full/short approaches, optional CONF 3/FULL,
PFD/ND/ECAM, FCU targets, AP1/FD/A/THR/APPR, configuration transit and speed
limits, ILS capture from below, 1000/500 ft game stabilization gates, height
callouts, manual flare/IDLE, armed spoilers/autobrake/reverse, TOGA go-around,
and phase retry. Default full approach is manual with FD and A/THR; AP1 is an
optional aid that disconnects below 200 ft for manual landing. Never quietly
turn FD-only guidance into automatic flight. Keep lever position separate
from actual thrust and preserve thrust spool delay. A/THR below CL remains
active with reduced authority; IDLE disconnects its speed control.

Use fixed fictional-task presets and clearly document their scope. The explicit go-around drill requires reaching the selected altitude and
cleaning up gear/flaps. Landing-required lessons continue through a missed
approach and must eventually land and stop. Flare deviations below 50 ft
must not be counted as unstable approach by the pre-flare criteria. A retry
restores the phase snapshot with neutral input and preserved prior gate history.
Verify with `npm run test:flight` and browser input checks. Publish through
the existing static HTTP service.


## Physics foundation

Use the reduced-order force-integrated model in `src/sim/`. Keep independent
engine status/spool/thrust, inertial velocity, relative air data, wind fields,
actuators and guidance separate. FD/AP may command attitude through the same
servos as manual control; never assign aircraft velocity, position or climb
rate to satisfy guidance. Preserve mass effects, engine availability and
lever limits. Failed/off engines must not regain thrust from automatic speed
control. Use groundspeed for stopping and IAS approximation for instrument /
configuration targets. Q/E supplies spring-centred rudder input; assistance
is enabled by default, yields to manual input and can be disabled in help.
Manual rudder also disconnects AP. Snapshots include engine/weather/velocity
and tick remainder, with neutral held inputs on restore. Keep seeded weather
independent of render FPS. The browser runs 100 Hz physics ticks.

The curriculum now uses extension APIs for deterministic single-engine
failure and windshear tasks. Random compound failures remain deferred. Use synthetic coefficients and document reduced-
order limitations in `PHYSICS.md`; don't claim certified A320 performance or
full six-degree-of-freedom/control-law fidelity. Existing normal exercises,
key direction, stick return and selected realistic cockpit remain regression
requirements. Verify physics invariants as well as complete flights.


## Ordered flight curriculum

The user approved arranging scenarios as levels from easy to difficult.
Keep this order: normal takeoff, turn-onto-final landing, full ILS approach,
go-around drill, full five-leg circuit, crosswind/wet landing, rain/fog
minimum decision, A/THR failure, ILS signal loss, flap jam, single-engine
return, approach windshear, dual-engine unpowered landing. Every level
is directly selectable; recommend the first unfinished one. Keep the existing
cockpit/controls and use its panel style for selection, briefing and results.

Each level needs real physical initial conditions/events, visible objectives,
its own completion criteria, next-level navigation and optional local best
scores/stars. Phase retry restores event/engine/weather state and is clearly
marked practice; only whole-level completion writes a record. Failed storage
must not block play. Safe go-around in a landing lesson is acknowledged but
does not satisfy that lesson's landing objective. Early windshear avoidance
is valid. During an active encounter, hold gear/flaps until clear, keep an
already-engaged recovery AP available, and reject new engagement; never
replace the actual wind field with camera shake or automatically fly FD-only.
Single-engine acknowledgement C confirms the alert, never repairs the engine.
Expose speed/heading/height/stability requirements in the task UI. Publish through the existing static HTTP service.


## Expanded curriculum and automatic communications

The user approved adding A/THR failure, ILS signal loss and flap jam, merging
single-engine takeoff and landing into one continuous scored return, and
automatic pilot/ground dialogue without player radio actions. Preserve the
continuous circuit geometry and failed-engine state through final stopping.
Old climb-only engine results must not count as merged-level completion;
retain unchanged normal-level scores. Every one of the 13 levels is selectable.

Keep selected modes separate from system capabilities. Ordinary switches
cannot repair failed A/THR, invalid ILS or jammed flaps. Display actual flap
position and revise task speed/checklist. ILS loss removes invalid guidance;
manual visual landing is required to clear the level; a go-around continues
into a return without restoring the failed ILS.
Low visibility requires a timely go-around, continuous return after weather
improves, and final visual landing/stopping. Dual failure has no AP,
thrust, reverse or powered go-around; simplify emergency power but retain real
energy loss, explicit glide cues and approximate range indication.

Automatic dialogue uses recorded Chinese pilot/tower voices, event-based
one-shot queues, captions and shared master mute. Pause must stop playback
and the event clock. Safety calls duck dialogue, priority emergencies replace
stale conversations. Use self-hosted clips so no installed voice/external TTS
is required during play. Preserve real keyboard/pointer controls in browser
QA; never use a debug setter to manufacture completed flights.


## Shared terrain, reactive ATC and radio quality

The user reported unsafe 1500 ft instructions near hills, terrain tunnelling,
missing terrain alerts, no ATC response to deviations and overly clean radio.
Render and collision must share the same triangle heightfield. Check swept
fuselage/wing/nose contact before mission progress; contact ends/freeze flight
rather than allowing passage through a mountain. The PFD RA is terrain-relative;
ATC/task altitudes remain airport-reference/barometric game heights.

1500 ft is the sea-side circuit clearance, not a minimum safe height everywhere.
State the runway-heading climb and left turn to the coastal circuit. Validate
normal and single-engine route clearance against the actual terrain, including
turn overshoot. A terrain conflict takes precedence over restoring the old
altitude: ATC can amend a temporary terrain floor and FD/AP attitude guidance
observes it within real available power. This must never move a manual aircraft,
create thrust or repair failures. Unpowered flight prioritizes reachable low
terrain and energy. Keep configured runway approaches free of nuisance alerts;
elevated terrain must never be inhibited by gear/APPR/mission mode.

ATC observes actual altitude/route/heading, uses phase/climb/turn grace and
sustained-deviation tolerances, repeats ignored reminders with a cooldown and
acknowledges recovery only after actual compliance. A scripted readback does
not satisfy compliance. Emergency calls outrank routine ATC corrections; stale
corrections expire or clear on recovery/new clearance. Show the live clearance
and deviations. Radio transmission DSP uses band limiting, distortion,
compression, gated carrier static and PTT clicks, separate from clean priority
safety calls. Mute/pause/reset must stop the carrier. Verify the audio signal
and the full warn-to-impact path using real browser inputs, without debug
position/result setters.


## Radio delivery preference

The user wants both ATC and pilot voices more serious and faster. Use a
restrained professional Mandarin delivery, with distinct pitch/cadence profiles
for the two roles, rather than lively/cheerful dialogue voices. The user subsequently rejected the news-like delivery. Use XiaoxiaoNeural
for tower (+24%, -12 Hz) and YunxiNeural for pilot (+26%, -18 Hz), with short
transmission phrase groups and restrained delivery. Do not return to the
Yunyang news voice or theatrical announcements.
Retain the radio transmission effects, subtitles and accurate clip durations.
Include voice/rate/pitch in generation cache identity so profile changes really
regenerate speech and invalidate client audio caches. Stage regenerated assets
before publishing; preserve the separate standard height/safety speech.


## Final-approach terrain nuisance alerts

The user reported terrain warnings in level 5's final. Do not equate a modest
lateral correction with a mountain hazard. The expected-landing exemption must
use a bounded runway-arrival corridor, closing track, real gear position,
vertical profile and projected longitudinal contact; it must allow normal
bank/lineup corrections rather than requiring |x| <90 m or extrapolating a
small temporary drift all the way to touchdown. Approach stability/centerline
advice remains separate. Raised terrain is always sampled even inside that
arrival corridor; undershoot, excessive descent, gear-up, go-around or flight
outside the arrival envelope remain monitored. Verify a complete circuit with
actual lateral-control inputs beyond 90 m plus real hazard counterexamples;
do not hide this with a lesson-specific warning-disable switch.


## Arrival preparation and cockpit bumps

The user requires airborne landing levels to start off the runway centerline
and without a completed landing configuration. All ten airborne entries must
start gear up / actual flaps 0, with AP/APPR/captures off, spoilers unarmed,
autobrake off, no checklist confirmation and no fabricated gate successes.
Keep enough distance and energy for a playable intercept/configuration;
short entry is 10.5 km / 1500 ft / 195 kt, full ILS 22 km / 3000 ft / 210 kt.
Briefings must explain initial conditions and I/F/G/B/M/C preparation. AP1
remains optional and FD-only remains manual. Takeoff and continuous circuit
levels retain their genuine departure and return. Preserve existing scores.
Validate actual configuration/checklist at touchdown, not after stopping.
The dual-glide emergency retains its explicit late gear/CONF 1 procedure.

Add restrained cockpit response for main-gear touchdown, nose-wheel lowering,
ground rumble, bad-weather buffeting and occasional gentle level-flight air
pockets. Keep photographic trim and mounted panels/instruments together;
HUD/task/help overlays stay steady. Visual motion never changes physical
attitude/contact or supplies fake windshear. Physical weather is independently
sampled at fixed ticks. Use deterministic simulation time/seed, freeze on pause
and reproduce on retry. Provide persistent standard/reduced/off in help,
honoring prefers-reduced-motion on first visit. Browser verification must
use real inputs for side intercept, preparation, manual flare and stopping.


## Stall warnings and landing after missed approaches

The user explicitly requires clear stall warnings and rejects completing a
landing-required level merely by going around. Keep the standalone takeoff
and standalone go-around drill goals; all other 11 levels require actual
runway touchdown and stopping. A missed approach must continue in the same
flight: establish the 3000 ft recovery, clean up (or retain jammed flaps),
follow the ND sea-side return and reconfigure/check for landing. Never reset
position, energy, failed engines, A/THR/ILS capability or flap jam. Weather
lessons gradually improve after safe escape so final landing is possible.
Reset approach gates and height calls for the new approach, without resetting
fault acknowledgements or earlier mission history. ILS capture must use wrapped
heading after a full circuit. Invalidate only old go-around-only achievements
(low-visibility, ILS-loss, windshear revision 2); retain other best scores.

Stall warning derives from actual flap-dependent critical AoA: amber HIGH AOA
at 85%, red/voice STALL at 95% (ahead of lift loss), with 0.6 s clear hysteresis
below 78%. Ground flight is inhibited; real airborne low-height events are not.
Red PFD and stable HUD warnings accompany a clean repeating STALL voice every
3 simulation seconds. Pause/mute stops it, recovery clears it promptly, radio
is ducked, lower priority height cues cannot interrupt, and checkpoints retain
warning state. Do not manufacture forces/energy as part of alert presentation.


## Motion viewport coverage

The user reported exposed light/white edges during cabin bumps. Keep the
entire moving cockpit (frame, mounted instruments and controls) overscanned
and clipped by the fixed stage, with a centered transform origin. The current
3.5% overscan covers the maximum touchdown/rotation envelope at small screen
sizes; a 2 px outside-view raster overlap prevents fractional-pixel seams.
Preserve alignment and HUD position, full motion strength and pointer input.
Check all sign combinations of maximum translation/roll, plus standard,
reduced and off, on desktop and small viewports before publishing.


## Touch-and-go / rejected landing

The user reported that TOGA stopped responding after wheel contact. Allow
T, the TOGA detent, the full forward thrust lever and the procedure button to
start a touch-and-go while a landing rollout is still active. Retract deployed
spoilers, cancel reverse and disengage autobrake, retaining arming selections.
Manual wheel brakes remain player-controlled; prompt release of Space / the
brake button. Restore pitch authority for ground rotation. Keep landed true
and gear locked down until actual aerodynamic forces cause lift-off; never
move the aircraft into the air or reset velocity/engine spool. At lift-off,
clear the old touchdown/nose-wheel marker and retain the aborted contact in
landingAttempts. Checkpoints preserve the ground-roll recovery state.

Failed engines/systems remain failed and double-engine loss cannot provide
powered takeoff. A completed/stopped result cannot be resumed with TOGA.
After touch-and-go, above 1100 ft FD requests a left turn sea-side while
continuing the 3000 ft climb; live ATC heading and turn grace must agree.
This prevents a slow single-engine climb from continuing into the hills.
The same landing-required mission continues through the coastal return to a new real landing/stop, without premature scoring.


## Distress and urgency radio phraseology

The user requires three spoken repetitions for the initial declaration:
MAYDAY, MAYDAY, MAYDAY; or PAN PAN, PAN PAN, PAN PAN (three complete groups,
six PAN words). Captions and actual MP3 speech must agree. A single PAN or a
single MAYDAY is not sufficient in these scripted first calls. Keep later
reports and acknowledgements concise rather than tripling every exchange.
Use the situation/severity definitions in FAA AIM 6-3 and SERA.14095; the
scenario mapping is a game assessment, not a universal aircraft-fault rule.

Current takeoff engine loss at 180 ft and double failure declare distress.
CONF 2 flap jam declares urgency. A single-engine aircraft stable above
1200 ft for 20 seconds with no stall/terrain alert explicitly cancels distress
and continues PAN PAN priority return; the failed engine stays failed.
Ordinary A/THR/ILS failures and controllable weather go-arounds are normal
reports. Actual sustained low-altitude energy loss/stall or imminent terrain
can escalate independently; critical cockpit alerts always remain audible.
Only resolved transient hazards may cancel after sustained safe recovery;
never announce that a failed engine or jammed flap has repaired itself.

Radio order is distress > urgency > fault report > ATC reminder > routine.
Reminders cannot preempt a declaration or its tower acknowledgement, even
while that declaration is waiting behind an initial safety-call grace.
Emergency pilot declarations suppress ordinary height/comfort speech but
retain AP disconnect and critical STALL/GPWS/windshear cues. Preserve pause,
mute, radio effects, checkpoint timers and flight controls. Neither radio
classification nor a scripted readback changes actual aircraft dynamics.

The user rejected the English signal switching to a different speaker. Use
the same pilot voice/pitch for MAYDAY/PAN PAN and the Mandarin report (currently YunxiNeural +26% / -18 Hz). Never splice the Guy warning
voice into a pilot transmission. Signal word units may be assembled three
times for count verification, but must retain the same pilot identity. Fingerprint the signal voice/layout as well as the body. Stage changes,
verify the three actual waveform units, update durations and publish atomically
with --radio-stage; preserve the unchanged clean cockpit warning clips.

A voice-only change can keep identical MP3 durations. The generated
voice-version.json fingerprint (all synthesis identities) must also enter the
clip URL cache key; script+duration alone is insufficient. Stage/publish must
check the matching version file so a refresh actually loads the new voice.


The user wants MAYDAY/PAN PAN brisk and urgent. Remove the TTS unit's leading
and trailing padding before repeating it: old units carried about 1.2 s of
tail silence each. Use short 80 ms gaps and a 120 ms transition to the report;
apply a modest 1.10 atempo to the call units, preserving pitch/speaker. Keep
all three complete calls intelligible, targeting under 2.5 s for the signal
sequence. Do not speed up unrelated tower/dialogue or cockpit alert clips.
Fingerprint the trim/tempo/gap settings and regenerate durations/cache version.

## Aircraft sound effects

The user requires touchdown and reverse sounds, a perceptible difference after
single-engine failure, and no engine sound after double failure. Keep wind,
ground roll and the two engine voices separate. Engine rumble/fan follows each
engine's real status/spool/N1 with left/right placement; failed/off voices fade
out promptly even if the thrust lever is advanced. Wind and safety alerts
remain during unpowered flight. Reverse roar requires actual negative thrust,
ground contact and a working engine. Main/nose contacts sound once per real
contact and scale with touchdown descent; support subsequent touch-and-go
contacts without replaying old contacts on retry. Pause/mute/reset must silence
effects and consume muted events. Duck aircraft sound under radio/critical
calls. These synthesized effects do not alter physics or recorded radio clips.

The user ultimately requested restoring the normal running sound from BEFORE
touchdown/reverse effects were added, superseding the later harmonic/whine
rebalance. Use that original two-second smoothed-noise buffer, low-pass cutoff,
thrust-driven gain and two quiet N1-driven sine voices from the backup
qa/backups/before-flight-sound-effects.tgz. Do not substitute the first effects
mix or the later harmonic mix for that baseline. Retain contact/reverse effects,
radio ducking and immediate pause/mute. Fade the original shared engine bed
with the running-engine count (zero after double failure); add independent
airflow as that bed disappears so unpowered flight keeps wind and warnings.

The user wants reverse to use the SAME original engine sound at increased
volume, rather than a separate reverse-noise timbre. Boost the original bed
only with real ground reverse thrust, smoothly following actual spool; remove
the separate bandpass reverse source. Retain the original normal engine level
and spectrum. Main/nose touchdown effects are doubled in amplitude, retaining
the transient limiter and descent-based scaling.

## Bilingual interface and radio

The user requires a global Chinese / English switch INCLUDING recorded radio.
Persist pilot-sim.language and support switching during flight without resetting
physics, lesson progress, controls, faults or scores. Translate at presentation
boundaries (JSX text/accessibility attributes and canvas text), keeping canonical
simulation strings unchanged. Cover lessons, briefing, help, checklist, warnings,
ATC, captions and results. The switch remains available in menu/help/flight.
English radio uses matching script.en.json captions and 62 self-hosted English
pilot/tower clips under assets/radio/en; retain existing Chinese recordings and
clean English safety/height calls unchanged. English pilot Guy +24%/-10 Hz and
tower Aria +22%/-6 Hz retain distinct roles; distress signals use the same pilot
voice as the report, three brisk complete units. Queue timing follows the chosen
language's measured durations; switching replays the active line with enough
remaining time, retaining emergency priority and one-shot history. Stage audio,
metadata and fingerprints together; verify language persistence, untranslated
text, active-radio switching, pause/mute and responsive English layouts.

## Open-source distribution

The user requests publishing under renorzr with the MIT License. Keep the root
README concise, with a Chinese companion and deeper technical details in docs/.
Commit runtime media and required regression fixtures; exclude dependencies,
builds, credentials, local QA outputs and backup archives. A fresh clone must
install, test and build without the original machine's qa/ folder. Preserve
third-party notices and describe generated image/speech provenance accurately.

## Public game hosting

The user requests GitHub-hosted gameplay rather than their test domain. The
public game is https://renorzr.github.io/pilot-sim/. Use the GitHub Pages
workflow for public releases and keep README/package/game helper links on that
URL. Root hosting remains available for local development. All runtime asset,
texture, audio and gallery URLs must respect Vite's BASE_URL through urls.js.
Do not reintroduce the user's testing hostname in public documentation or
defaults. Deployment reads the project prefix from configure-pages metadata.

## Three stages and Daxing airport

The user approved three stages: 飞行训练 / Flight Training (the existing 13
lessons), 航线执飞 / Airline Operations (real airport/city-pair flying), and
历史重现 / Historical Scenarios (Coming Soon; no playable history yet).
The first second-stage deliverable is a clear-day Beijing Daxing airport
scene: one operational runway, recognizable terminal, local geography,
takeoff and an unconfigured, off-axis approach. Do not claim city-to-city
flights are implemented by these two airport exercises.

For this game the user explicitly requests LOCAL testing only. Do not
commit, push or deploy to GitHub without a subsequent instruction. Serve the
reviewed build through the existing local static HTTP service.

Airport identity belongs to flight state and snapshots; never mutate shared
training constants to switch airports. Daxing's playable runway is 17L using
OurAirports threshold endpoints, not OSM centerline endpoints. Display true
heading and airport-relative altitude explicitly as game simplifications.
The synthetic three-degree approach and local missed-approach return are game
procedures, not a current certified ILS/SID/STAR or live airspace database.
Reuse actual terrain triangles for rendering, collision and GPWS. Preserve
OSM/terrain attribution and a downloadable source database; map data retain
their own licenses independently of MIT game code. Keep original training
records, the 13-lesson order, Chinese/English and recorded radio intact.

The user's Daxing colour references are these two specific images, which
supersede the earlier muted/grey-copper interpretation:
https://p1.img.cctvpic.com/cportal/img/2019/9/16/1568613858629_341_1000x1174.jpg
https://img3.chinadaily.com.cn/images/201909/25/5d8afdfba31099ab43d18ba3.jpeg
Match their orange-copper roof, golden sunlit reflections, red-brown shaded
areas, neutral grey-white framing and dark blue-grey glazing. Keep visible
metallic light/shade variation; avoid a uniform pale yellow or grey-brown roof.
Verify under the game's sun/sky lighting and refresh the downloadable overview.

## Real stand departure and optional taxi skip

The user approved starting at a real parking stand and skipping a long ground
route just like cruise. The current Daxing takeoff starts at OSM stand 107.
Automatic crew preparation handles push/start and takeoff configuration; omit
the tug and detailed pushback controls. Show an airport aerial introduction,
with independent skip and pause, without moving the physical aircraft for the
camera. Handoff to the apron-side beginning of the real stand lead-in is an
explicit labelled stage transition, not a simulated tug manoeuvre.

Taxi via the curated 107 / Y7 / G / E13 / G9 route from bundled OSM geometry.
Use force-integrated low-speed motion and nosewheel steering (left/right),
manual W/S thrust and Space brakes. Show steering deflection, groundspeed,
route and runway permissions. Keep a heading-up, near-range ground ND as well
as the route overview. Keep spring return. The optional skip stops
outside 17L with zero speed/lever and neutral controls; it never grants runway
entry or takeoff clearance and must retain engine/system failures. Manual
runway entry, lineup and stopping remain mandatory. Entry permission and
subsequent takeoff clearance are separate; only then allow full takeoff thrust.
The holding marker and lineup target are game positions, not published charts.
Fail sustained taxi overspeed, off-route driving and unauthorized runway entry.

Retain the existing training lessons and Daxing landing entry. Invalidate only
old runway-start Daxing takeoff records with mission revision 2. Ship matching
Chinese/English ground radio with measured durations and normal radio DSP.
Test both the complete taxi and optional skip through real controls and actual
flight forces. Keep the existing local-only testing decision; no GitHub publish.

## Stable ground markings

The user reported ground lines appearing/disappearing during taxi. Keep apron,
taxiway, runway and paint elevations in the shared ground-layers module. All
paint must sit above the highest intersecting pavement, including G9's crossing
onto 17L. Base pavements use constant depth units with no slope bias; reserve a
small decal slope bias for paint. Draw paint after opaque scenery, retain depth
testing against real occluders, and disable paint depth writes so overlapping
markings cannot mask one another. Static batching must preserve renderOrder.
Verify with the moving-camera GPU fixtures in ops/check-markings.mjs, including
small cockpit height/pitch changes and an opaque occlusion counterexample.

## Xiaoshan and city-to-city flights

The user selected Hangzhou Xiaoshan as airport two and authorized continuing
feature development. Stage two now includes both directions between Beijing
Daxing and Hangzhou Xiaoshan. Use the offline world map to select departure and
destination; keep the twelve airport-only practices in a separate practice tab.
Keep the original 13 training lessons/records and Historical Scenarios Coming
Soon. This remains local-only work; do not commit, push or deploy to GitHub.

Airport frames, runway parameters, DEM grids, scene selection, taxi routes,
stand/runway labels and recorded dialogue must follow live airportId. Never
change the shared training RUNWAY. Xiaoshan's active runway is source 07, using
its actual threshold endpoints and true heading; 06 is scenery. Start at source
stand 251 with the source Z11 / B / B3 / A / A1 taxi route. Silver-white, gently
curved terminal roofs and dark rooflights follow the source T4 footprint; never
reuse Daxing's copper radial terminal. Geographic and modelling estimates are
labelled in the airport's pack/asset notes and retain source licenses.

A city flight must complete origin ground permissions and manual takeoff,
then level near 3000 ft with gear up, flaps at 1 or less, speed165–225 kt,
heading within15 degrees and stable for3 seconds. Only then unlock an explicit
cruise-cut button. Cruise/most descent is deliberately omitted, not physically
integrated across China. The cut installs the destination's documented clean,
off-axis 3000 ft/210 kt approach preset, preserving mass, engine health/spool,
failed capabilities, language, practice state and departure evidence. Engine
failure inhibits the normal cruise cut. Never allow a rejected cut to move the
plane. Airport aerial cameras are independent of physical pose. Destination
preview holds physical motion and controls while automatic briefing plays;
pause freezes its clock/audio and skipping the view does not configure landing.

Origin climb alone and a destination go-around never finish a city flight.
Require two genuine destination stability gates, actual configured touchdown
and stopping. Retry stays in the correct airport frame and remains practice.
Preserve the unlocked audio context/media effects across world reconstruction;
loading pauses physics, clears held inputs and preserves the user's mute state.
Verify both directions via physical controls, plus an actual browser flight
through the world/audio switch and manual final. Retain stable ground markings.

## Formal game and Changi

The user regards this as the formal game. Do not call current gameplay a prototype/demo/小样. Retain accurate descriptions of simplified physics and procedures. Local testing only; no GitHub publication without a new request. Changi uses WSSS/SIN Runway 02L, stand A16, independent offline source data/DEM and coastline polygons with holes. Preserve existing airport and training progress. The original three airports remain connected by their original six directional city flights, within the expanded global network. Ground holding points can be on either side of the runway; never assume negative local x.

## Six-airport global network

The user requested Osaka Kansai (RJBB/KIX), New York Kennedy (KJFK/JFK) and Los Angeles (KLAX/LAX). They join Daxing, Xiaoshan and Changi in the formal game, with twelve airport practices and thirty directed city flights. Preserve the original six city IDs/order and all original scores/revisions. Each airport requires a real source stand/connected taxi route, its own DEM and actual coast geometry, distinctive source-based scene and measured bilingual recorded dialogue. Marine masks apply to every coastal airport, not just Changi. Aircraft identity and failure state must survive inter-airport cuts. The world map must unwrap longitude and clip land rings across the date line; draw great-circle routes, including polar arcs, with readable, non-overlapping airport labels. Keep local-only publication.

Sea masks index shoreline edges by horizontal bands and reject holes by bounds; preserve strict point-in-polygon classifications and source island holes when optimizing. New source coast generators classify closed faces by source-length-weighted offshore/onshore samples, not one incidental sample. Verify actual sea mesh triangles as well as mask values at airport, mainland and open-water probes. Current regression: 286 flight/map/geometry/model/camera/city checks plus 4 hosting checks.

## Exterior aircraft views

The user approved cockpit/exterior views, a complete original A320-proportioned exterior with moving systems, external controls/instruments, mouse/touch camera gestures and camera collision avoidance. Keys1/2 select cockpit/exterior; V stays reverse and C stays confirmation. Flight commands remain in aircraft coordinates, spring-centred, irrespective of camera heading. View changes only release held controls/captures; preserve aircraft pose, inertia, failures, automation and mission progress. Paused exterior views allow camera movement with frozen flight and model animation. Reuse the existing cockpit image/panels in cockpit mode; external mode hides that rig and exposes IAS/ALT/RA/V/S/heading, engine/configuration status, stick, thrust/configuration controls and optional real PFD/ND/FCU.

Aircraft visual joints follow actual gearPosition/flapPosition/spoilers/servo/engine states. No smoke or fire for ordinary engine failure. Use anchors and visual ground placement to seat main wheels during rotation without modifying flight physics. Camera rays use the same terrain plus static building geometry, keep outside the airframe, and reset smoothing on retry/teleport/airport changes. Exterior sound uses distance/pan gain on the original restored engine bed; cockpit sound timbre and critical radio/callouts remain intact. All assets are self-hosted/base-prefix-aware. Keep local testing only.

External thrust controls need a real slider travel area even on compact English layouts; use explicit rows for the label, lever output, track and detent buttons. Do not let the flex track collapse behind the thumb. Browser flight checks must resize and settle layout, then scroll the briefing start control into view before clicking.

Exterior camera smoothing follows aircraft translation immediately and smooths only the relative observer offset; high speed or slow rendering must not push the aircraft out of frame. Enforce at least42 m observer separation during fast orbit turns as well as the45 m zoom bound. Airport browser checks wait for the new model load before inspecting its state.

The user explicitly requires LANDSCAPE ONLY, superseding the attempted portrait exterior layout. In portrait orientation, show a bilingual rotate-device/widen-window guard and block gameplay input. Entering portrait pauses flight/audio and releases held inputs without changing pose, failures or progress. Returning to landscape remains paused until the player resumes. Do not add a playable portrait layout.

The user merged chase and orbit into ONE exterior view. Use only cockpit(1) and exterior(2), with no separate third view. Exterior starts directly behind/slightly above the aircraft (azimuth0, elevation.23, distance85), allows mouse/touch orbit and zoom, keeps the chosen relative angle while following heading/position, and double-click returns to the tail. Migrate saved chase/orbit preferences to exterior. Preserve landscape-only play and all physics/input invariants.

## LAX city scenery, first pass

The user approved the assessed first LAX city pass: regional urban ground/OSM building blocks, Dockweiler coast, SoFi Stadium/Kia Forum and a light Downtown LA skyline. Santa Monica Pier, Hollywood Sign/Griffith and other cities remain later work. Use real source coordinates/scale and original recognition meshes. Genuine USDA NAIP2022 imagery is a dated base, with current source-derived OSM geometry; disclose dates and public-domain/ODbL provenance, retain downloadable source/derivatives and self-host all runtime textures. City assets load only for LAX; preserve the six airport datasets, route/mission IDs/revisions, taxi routes and procedures. No old entrance pylons (LAWA began their removal in2026). Ground imagery must use georeferenced UVs on the same DEM triangles, not a second floating terrain plane. Airport pavement/paint and authoritative sea remain above terrain. Urban instance boxes and landmark envelopes feed visible geometry, camera avoidance, swept contact and separate obstacle prediction; never put roof heights into the DEM or suppress real hazards on final. Source-derived heights and visual estimates must be labelled, building contact freezes at the actual wall/roof contact without teleporting upward. Keep the two camera views, landscape-only guard, cockpit/audio/flight physics and local-only publication.

## Aircraft belly shape

The user approved repairing the existing original aircraft rather than replacing
it with a static third-party model. Keep a subtle wing/body fairing blended
into the pressure shell and wing roots; avoid a broad, low suspended slab.
Gear doors and bay seams must sit on the lower wing skin. Preserve animated
systems, tyre anchors and ground-rotation clearance. Verify underside and side
views with gear both up and down; publish through the local HTTP service only.
The user wants the entire fuselage belly white, matching the fairing and gear
doors. Keep the side navy/teal cheatlines; do not restore the former grey belly.

## Overlay presentation

The user wants more transparent floating windows and buttons, with opaque
labels and readable states. Exterior expanded instruments belong at bottom
left, replacing the compact flight-data panel while open. Bound instrument
and task heights so they cannot overlap on landscape screens. Remove the
horizontal pitch/roll deflection bars in both views; keep the draggable 2D
stick and adjacent labelled percentages, spring return and thrust slider.
In the cockpit, stack Roll below Pitch beside the 2D stick. Retain the small
rounded indicator painted into the cockpit background; keep the readouts away
from it so it cannot be mistaken for a Roll control.
The user approved integrating cockpit SPD/HDG/ALT and autoflight controls into
an opaque physical-looking FCU on the glareshield: recessed illuminated
windows, tactile selectors and status-lit keys. The cockpit virtual sidestick
stays independent and translucent, with Roll below Pitch. Leave the painted
indicator visible between the FCU and stick widget. Preserve actual mode,
target and failure logic, compact exterior instruments and local-only hosting.
The user rejected the raised rectangular FCU plate and decorative knobs as
unconvincing. This supersedes the knob styling above: author an empty inset
aperture into the cockpit background like the lower instrument bays, then put
live targets, explicit +/- keys and flap-switch-style mode buttons inside it.
Keep the original frame, windshield alpha, lower bays and amber indicator
registered. The virtual stick remains separate. No nonfunctional rotary dials.

## Aircraft texture preparation

The user requested fixing UV preservation before further visual upgrades.
Aircraft batching must retain authored UV channels, tangents and vertex
colours, separating incompatible attribute layouts/formats instead of dropping
data. Keep the original aircraft, moving-system hierarchy and contact anchors.
UV unwrapping and texture artwork remain separate asset-authoring work.

## LAX imagery loading

The user explicitly changed their mind about Esri: use self-hosted NAIP imagery
only, with no Esri integration, credentials or runtime external map service.
Improve regional coverage and camera-prioritised detail loading while retaining
the same DEM, coastline, building contacts, procedures and original aircraft.

## Original terminal realism

The user chose original modelling instead of buying terminal models, and
prioritises believable visual realism over exact architectural reproduction.
Keep the source airport layout and workable stand/taxi geometry, but use
plausible original facade articulation, glazing, roof construction, equipment
and jet-bridge detail. Document estimated details; do not turn reference photos
or commercial models into distributed assets. Verify close ground views as
well as aerial views, preserve flight/terrain behaviour and publish locally.

## City building realism

The user considers the current terminal sufficient and requested improving the
remaining city buildings. Improve original residential, commercial, industrial
and skyline architecture with metre-scaled facades and varied roof forms;
retain the established terminal. Keep the existing source positions, heights
and separate conservative collision envelopes. Do not manufacture additional
source coverage or imply an exhaustive city model. All materials remain local.

## Airport surface overlap

The user reported road/taxiway flicker over runways in the aerial introduction.
Keep lower road/taxi strips and their paint clipped outside the source runway
plus shoulder footprints. Shoulders are rings with open runway interiors;
never restore stacked full shoulder/runway rectangles or solve this by
raising roads, disabling depth tests or changing physical ground heights.
Verify aerial and grazing views, source taxi connectivity and runway markings.

## Continuous city coverage

The user finds sparse detailed 3D buildings over mostly flat aerial imagery
visually inconsistent. They prefer continuous building massing with heights
and colours matched to the map imagery. Prioritise contiguous source-footprint
coverage and coherent roof colours over further isolated facade detail. The user has now authorised implementing this continuous city coverage. Distinguish source height fields from verified survey
heights, and imagery roof colours from estimated facade colours.

The user explicitly prioritises believable appearance over exact accuracy.
Missing building heights and facade colours may be estimated and varied
randomly within plausible bounds. Use coherent building-type/neighbourhood
rules and stable per-building seeds, keeping generated geometry, collision
and obstacle heights consistent. This supersedes treating missing attributes
as a reason to omit a building or require exact surveyed replacements.

## FCU fit and virtual stick position

Keep the FCU readout aperture inside the original centre mounting plate,
clear of the sloped left edge. The SVG and live target banks share source
coordinates in views/fcu-layout.json. Target keys must fit the black interior,
not merely their outer section. Mount AP1/FD/A/THR/APPR as separate physical
keys beside the aperture, with green indicators reflecting their actual modes.
The cockpit virtual stick belongs in the lower-left gutter, more transparent,
with its 2D pad, Pitch and Roll arranged vertically. Keep it off the PFD.
The user subsequently removed the decorative rounded amber lamp. Replace it
with adjacent original panel texture and extend the aperture rightwards within
the flat mounting plate, giving both target and illuminated mode keys enough
space inside the recess. This supersedes preserving the painted lamp or
placing mode keys outside the aperture.
Check the measured black interior in ops/assets/cockpit-fcu-recess.json, not
only the outer bezel. ops/check-fcu-fit.mjs compares real component bounds
against source-art rectangles at five landscape sizes in both languages and
checks the four mode buttons and indicators. Keep source/revision coordinates
shared so an older cached frame cannot accompany new control positions.

## Button interaction and retired gallery

The user wants each FCU +/- pair stacked to the right of its number, plus
above minus, in both cockpit and exterior controls. All buttons, including
semantic map buttons, must skip Tab focus and must not retain pointer or
programmatic focus; preserve actual click and pointer-capture actions.
The Design Concepts link and the entire public/designs gallery are removed
at the user's explicit request. Do not preserve or recreate that gallery;
QA screenshots belong in the internal qa directory, outside published assets.

## Hold-to-fast-forward game control

The user kept the fast-forward control in its ORIGINAL FOOTER position,
superseding the initial top-right request. Show a double-triangle icon: hold
for 2x, drag upwards for 4x, release for the icon and normal time. Replace the
old footer speed toggle in place. Pointer acceleration works during any
active game phase, including ground/low approach; the legacy high-altitude X
shortcut stays compatible and must not inhibit a held pointer. Cancel held
acceleration on pointer loss/cancel, pause, hidden/blur, reset/retry, loading,
airport change or result. Keep buttons non-focusing. Run every original 100 Hz
physics tick at 4x by splitting long batches; never jump aircraft pose or skip
contact/event calculations. Recorded communications use the actual time scale.


LAX uses the dense source-footprint binary pack in spatial chunks;
keep full collision data resident and build near/far render geometry by camera.
Never fall back to sparse cell sampling for ordinary city appearance. Use the
same decoded source heights and courtyard polygons for render/contact/camera
and obstacle prediction. Dataset activation belongs to the accepted world,
so an obsolete asynchronous load cannot overwrite the current collision index.
Buildings and roof/facade inference are original programmatic estimates;
roof imagery is shared with the bounded self-hosted NAIP stream.


## Persistent city models and advance preparation

The user explicitly requested advance building loading and retaining models
when they leave the camera view. This supersedes the former12-tile/24MiB
hidden model eviction policy. Prepare all middle/district city chunks before LAX is
ready, then prepare near detail within3.2km in every direction, ahead of the
2.2km display threshold. Cache all prepared LOD variants for the accepted world;
rotations and revisits reuse the same mesh/geometry/attribute arrays without
asynchronous reconstruction. Frustum exit only stops drawing. Release model
arrays on world/airport disposal. Distant unused GPU buffers may be reclaimed
under pressure while retaining model arrays for immediate synchronous upload.
Never trade this retention preference for visible repeated building pop-in.

## Shared residential templates and regional city coverage

The user approved expanding continuous LAX city coverage and sharing repeated
house models to reduce memory and rendering overhead. Use original shared
flat/hip/gable templates with compact per-instance positions, oriented dimensions,
source heights and stable roof/facade colours. Batch by spatial chunk and style;
do not allocate a matrix or duplicate vertex arrays for every home. Preserve
source outlines/courtyards for complex nearby buildings and original landmarks.
Middle-distance ordinary buildings use shared boxes; very distant low buildings
use source-derived district proxies, keeping towers individual. Do not replace
real parks/ocean with random buildings or return to sparse cell selection.
Extract source footprints across the whole 60 km terrain rather than a narrow
approach strip. All middle/far chunks prepare before flight; nearby detail warms
in every direction. All three prepared variants retain model identity until
world disposal. Contact/camera/obstacle data remain independent of render LOD;
visual templates are estimates, never verified architectural reconstructions.
Preserve the terminal, aircraft, DEM, taxi/runway surfaces and flight behaviour.

## Xiaoshan continuous city scenery

The user approved the LAX result and requested the same scene improvement for
Xiaoshan. Reuse shared templates, spatial LOD, advance preparation and persistent
model caches, with local apartment/industrial/village proportions and colours.
Use attributed self-hosted East Asian building footprints, OSM context and
Copernicus Sentinel-2 imagery; NAIP is US-only and must not be presented as China
imagery. Clearly state native image resolution and dataset dates. Preserve the
original silver/white T4 terminal, stand251, runway07, taxi route, DEM and scores.
City contact/camera/obstacle data must be keyed by airport and activate only for
the accepted world. Keep rivers/parks/airport surfaces clear; no Esri/runtime
external requests. Retain local-only publishing and both languages.

## Airport presentation in either selected view

The user requires airport showcases before takeoff/landing in exterior view as
well as cockpit view. Existing gate departure and airline arrival previews must
be view-independent. Standalone real-airport landing practice also gets a short
10-second, skippable airport showcase before physics starts. Its UI-only clock
must not move/configure the aircraft, advance flight time, missions or scores.
Pause freezes the showcase; skip ends only the presentation. Keep the selected
cockpit/exterior mode and exterior orbit/zoom settings, returning directly to
that view afterwards. Hide flight/orbit controls during the showcase, retain
pause/skip, and leave phase retries and training lessons unchanged.


## Changi continuous city scenery

The user requested Changi after approving LAX/Xiaoshan. Extend the same
continuous city coverage, shared templates, advance preparation and retained
model caches to Singapore. Use the pinned OSM source footprints and height/level
tags; infer missing values with coherent HDB/apartment, landed-house and logistics
priors. Use attributed self-hosted Sentinel-2 RGB with explicit native resolution
and dated cloud/shadow screening; preserve coast/island holes and clear parks.
Keep the original Changi terminals, Jewel and tower recognisable, stand A16,
02L runway, taxi route, shared DEM, scores, physics, radio and both languages.
No Esri or runtime external map service. Publish locally only.

## Xiaoshan buildings / imagery agreement

The user reported that Xiaoshan's surrounding buildings disagree with the ground
image. Validate registration with independent planar footprint/RGB overlays;
do not apply an unmeasured scene-wide shift. Keep source coordinates/heights
for retained buildings, sample roof colours within the actual footprint at
native image resolution, and preserve blue/red roof panels. Conservatively
exclude only estimated EAB outlines with strong vegetation evidence in both
footprint and neighbourhood; leave OSM outlines intact and label this screening
as a visual estimate rather than verified demolition. Keep continuous coverage,
shared/retained models, full contact consistency and existing airport gameplay.
Publish a versioned pack atomically so older cached previews remain usable.


## JFK continuous city scenery

The user requested JFK after the LAX/Xiaoshan/Changi improvements. Apply the
same continuous source-footprint coverage, shared residential templates,
advance preparation and retained model identities. Use attributed self-hosted
NAIP imagery and the pinned New York/New Jersey OSM sources, with coherent
Queens/Brooklyn housing, brick facades, warehouses and source high-rise heights.
State native versus working/rendered image resolution and acquisition dates.
Retain blue/red roof pixels and source courtyard/river/island geometry.
Preserve JFK stand 9, 22R, taxi permissions, shared DEM, T4/TWA/tower, aircraft,
missions, scores and bilingual radio. No Esri runtime service, credentials or
GitHub deployment; publish only to the existing local preview.

## Airport loading feedback

Show a progress bar when preparing airport data, both on the initial briefing
and while switching airports during a flight. Report actual download bytes,
indexing stages and prepared model counts. Keep progress monotonic within a
world, reset it on airport changes and reach 100% only at accepted-world readiness.
Do not simulate progress with a timer or continue stale-world updates. Keep
loading/error states and start gating consistent in both languages.

## Directional airline routing and destination parking

The user approved implementing complete stage-two flights with origin-relative
arrival, outbound course before cruise and optional arrival taxi. Use independent
great-circle departure and terminal bearings; runway directions stay airport
specific. ND, FD/AP, ATC and cruise qualification share the same game legs.
Climb on runway heading before safe-altitude departure turns; sample shared DEM
clearance and retain enough arrival distance for turns, clean preparation and
ILS interception. Airport procedures are game simplifications, not published
SID/STAR. Never advance normal flight by assigning pose/velocity.

Save landing evidence before after-landing cleanup and continue to manual
runway exit. Six source-derived exit/taxi routes connect to actual stands.
After vacating, the player may taxi manually or explicitly skip remaining
taxi to parked position; preserve failures, language, assessed landing and
practice state. Automatic radio/crew work handles after-landing configuration
and shutdown without extra system controls. Landing lessons and emergency
completion rules stay unchanged. City flights end on stand after actual
landing/clear-runway evidence; go-around and airborne skip never complete them.
Keep local-only testing/publication. Verify all30 city pairs and physical
manual taxi at all six airports as well as real browser inputs.

## Persistent processed airport data

The user approved IndexedDB persistence of processed data to avoid repeated
download, source decoding/indexing and model generation across visits. Store
derived source arrays/contact indices in bounded chunks and finished model
arrays by spatial chunk/LOD, retaining shared templates. Version caches by
source hash, architecture, processing and render schema. Publish source metadata
only after complete chunk commits; reject corrupt/incomplete records and rebuild.
Cache used compressed imagery independently of GPU residency. Storage denial,
quota exhaustion and cancellation must not prevent normal online play or change
physics, scores or city coverage. Show local read/save phases in both languages,
and verify warm loads in a new page with HTTP cache disabled and large asset
requests blocked. Keep local-only publication.

## Commit and push the accumulated work

The user explicitly authorized committing and pushing all current changes.
This supersedes earlier local-only restrictions for this publication. Include
source, runtime media, data attribution and regression fixtures; keep generated
bundles, machine caches, credentials and QA outputs excluded. Large runtime
databases use checked-in 32 MiB parts outside public/ and are restored and
hash-verified before tests/build, keeping a fresh checkout self-contained and
the existing runtime URLs intact.
