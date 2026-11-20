# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

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
the existing static HTTP service; preserve `/designs/`.


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
Expose speed/heading/height/stability requirements in the task UI. Preserve
`/designs/` and publish through the existing static HTTP service.


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
