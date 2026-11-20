# Physics foundation

The browser game now uses a reduced-order, force-integrated aircraft model.
It remains an entertainment exercise, with synthetic coefficients and keyboard
fly-by-wire rate servos. It is not an A320 performance model or complete rigid-
body six-degree-of-freedom simulator. The ordered curriculum now drives deterministic engine-out and windshear
tasks through these modules. Random compound failures, engine restart
procedures and emergency electrical/hydraulic systems remain deferred.

## Update flow

```mermaid
flowchart LR
  Input[Keyboard / pointer] --> Controls[Stick and rudder servos]
  Weather[Wind field and density] --> Air[Air data and aerodynamics]
  State[Position and inertial velocity] --> Air
  Air --> Guidance[FD / AP / automatic thrust]
  Guidance --> Controls
  Guidance --> Engines[Independent left / right engines]
  Controls --> Dynamics[Forces and motion integration]
  Engines --> Dynamics
  Air --> Dynamics
  Dynamics --> State
  State --> Mission[Approach / landing / go-around rules]
  Mission --> View[Instruments / scenery / audio]
```

`flight.js` orchestrates the modules and retains task rules. All model modules
are independent of React, Three.js and browser APIs. The browser advances
`advanceSimulation` at 100 Hz using an accumulated remainder; rendering and
UI publication run separately. Mission triggers run before physical integration;
mission outcomes are checked after it. Their state is serialized in checkpoints. Each tick samples weather, updates controls,
computes guidance/engine output, changes attitude through rate servos,
integrates forces, refreshes air data and evaluates the mission.

| Module | Responsibility |
| --- | --- |
| `game/src/sim/constants.js` | Units, coordinates, mass, synthetic airframe parameters |
| `weather.js` | Wind vector, density, deterministic gust/shear fields, runway friction |
| `aerodynamics.js` | Relative air velocity, IAS/TAS/groundspeed, angle of attack, sideslip, lift/drag, trim estimate |
| `engines.js` | Independent engine status, spool delay, N1, thrust, available capacity and asymmetric moment |
| `controls.js` | Spring-centred stick/rudder input and simplified pitch/roll rate servos |
| `guidance.js` | FD targets, wind correction, power-limited climb demand |
| `dynamics.js` | Lift/drag/gravity/thrust forces, ground friction, yaw/rudder coupling and integration |

## Conventions and state

All integration uses SI units. Position: x is runway-right, y is up, z is the
approach side. At yaw 0 the aircraft flies toward negative z (runway heading
270 degrees). Positive yaw/roll turns right; positive pitch raises the nose.
Wind direction is the compass bearing the wind comes **from**. Wind vectors
and gust amplitude are metres/second; the configured steady wind is knots.
`weight` is tonnes and contributes to mass, trim, lift loading and acceleration.

- `velocity`: inertial world velocity in x/y/z. This is the translational
  state integrated by the model; attitude and targets never assign it in flight.
- `airData`: wind, density, relative velocity, true airspeed, IAS approximation,
  flight-path angle, air/ground track, groundspeed, angle of attack, sideslip,
  dynamic pressure, lift/drag coefficients and forces, load factor and energy.
- `speed`: derived IAS approximation in m/s, retained for controls/instruments.
  It uses TAS multiplied by the square root of density ratio (equivalent-speed
  approximation); compressibility, pitot errors and temperature are omitted.
- `verticalSpeed`: derived world vertical velocity. Wind affects relative
  airflow; an updraft does not instantaneously teleport vertical velocity.
- `engines[0/1]`: left/right status (`running`, `off`, `failed`), health,
  optional individual lever override, command, spool, illustrative N1 and
  signed thrust in newtons. `thrust` is a derived aggregate for compatibility.
- `controls`: rudder demand/trim/applied position, default assistance and
  pitch/roll rate commands. Q/E command rudder; assistance yields to manual
  pedal input. The help panel allows assistance to be disabled.
- `forces`: last integrated world-force components, lift, drag, thrust and weight.
- `clock.accumulator`: fractional tick remainder, included in phase snapshots.

Phase retry deep-copies this state and clears held stick/pedal demands.
Weather fields use analytic functions of position, simulation time and seed,
so retry uses the same weather without random render-frame dependence.

## Physical model and boundaries

The core uses `L = q S CL`, `D = q S CD`, `q = rho V² / 2` and `a = F / m`.
Lift is perpendicular to relative airflow and rotates with bank; drag opposes
relative velocity. Gravity acts downward and thrust follows body heading and
pitch. Forces, rather than an assigned descent rate, change velocity and
position. The polar includes configuration, induced drag, sideslip and an
extra drag term for non-running engines, with a smooth post-stall lift falloff.

Pitch/roll retain the approved keyboard-friendly rate response, neutral bank
hold and simplified bank protection. Yaw has an integrated rate, aerodynamic
restoring/damping terms, bank coordination, an asymmetric engine moment and
rudder moment. This is a coupled reduced-order model; full inertias, flexible
surfaces, flight-control laws, exact rudder authority and high-angle departure
physics are not represented.

Automatic thrust distributes demand over available engines within lever
limits. Failed/off engines produce no thrust and cannot be re-powered by
speed demand. FD/AP command attitude through the same controls; their climb
target is bounded by available power. The speed target is not a guarantee:
insufficient power or excessive pitch can still cause speed loss/stall.

Ground contact supplies a normal reaction. Gear/spoilers affect the model,
wheel braking is bounded by available friction, and reverse comes from the
running engines. Stopping is judged by **groundspeed**, so a stationary
plane in wind can legitimately show nonzero airspeed. Runway contact remains a flat surface. Shared triangle-heightfield collision
now detects terrain/water contact with swept body/wing/nose probes and freezes
the failed flight at impact. Detailed building/vegetation collision, survivable
ditching, tire slip curves and landing-gear suspension remain outside scope.
The 64 t VAPP/configuration limits remain fixed task presets; changing mass
in a model test does not perform a certified landing-speed calculation.

Normal-task weather is the existing 5 kt headwind. The windshear lesson
adds a smooth, localized elliptical wind disturbance with altitude fade; its
strength is sampled by both the physics and task controller. Gust/shear/
friction remain extensible; there is no general weather editor. The photographic cockpit frame and mounted instruments share a small visual
head-motion transform; the flight state remains separate from that transform.

## Extension APIs

`createFlight(mode, {scenario, landingConfig, weight, weather})` supplies initial
conditions. `setWeather(state, patch)` changes the air mass while preserving
inertial velocity. `setEngineStatus(state, index, status)` changes independent
engine availability; it does not implement an operational restart procedure.
`setMotion(state, {speed, verticalSpeed, yaw})` is an explicit initial-placement
helper for scenarios/tests, not a live flight controller.

For example, a headless model test can create a crosswind field or turn off
one engine. These functions are module APIs, not hidden keyboard cheats. The
`missions/catalog.js` curriculum and `missions/runtime.js` controller now use
them for initial presets, one-shot triggers, alerts, configuration hold,
escape detection, continuous stability, task-specific outcomes and scoring.
`missions/progress.js` validates optional local browser records separately
from physical/checkpoint state. Phase retries restore events and environment,
but are marked as practice so they do not write whole-level scores.

## Verification

`npm --prefix game run test:flight` runs the normal exercises and physics
invariants. Coverage includes complete full/short/CONF 3 approaches, go-around,
takeoff, control signs/return, independent engines, mirrored failure yaw,
rudder assistance, wind-vector identities, inertial continuity, mass effects,
post-stall lift, power-off energy loss, wet-friction stopping and reproducible
checkpoint/timestep behavior. Browser checks verify actual keys and live UI.

Equation references (these support the model form, not its synthetic coefficients):

- [NASA Glenn: lift equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/)
- [NASA Glenn: drag equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)
- [NASA Glenn: relative velocity](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/relative-velocity/)


## Expanded missions, system capabilities and circuit

`sim/systems.js` separates availability from the crew-selected modes. A/THR
failure holds the last engine commands until a lever match or deliberate
detent override. Failed availability survives normal ON selections. ILS loss
invalidates LOC/G/S and disconnects approach guidance; surviving HDG/ALT never
uses hidden runway geometry. Flap jam freezes actual actuator position.
The game CONF 2 task resets VAPP to 165 kt; no performance calculator exists.

`missions/route.js` projects the current continuous position onto five fixed
legs and uses a lookahead point. Leg completion requires proximity/progress;
the initial turn also requires 1100 ft. Guidance commands attitude via the
existing servos. No waypoint transition assigns position or velocity. The
route ends by following the runway extension rather than chasing the threshold
after crossing it. Single-engine return uses the same route without clearing
its failed engine. Real approach gates begin only on the final leg.

Dual-engine glide starts clean at 2800 ft / 10.5 km, 650 m left of the
runway and 10 degrees off runway heading. Both engines fail
after two seconds; automatic speed control, AP, reverse and powered go-around
remain unavailable. Simplified battery/control authority and a game glide FD
are retained. Sink demand derives from drag and energy, with a speed-error
pitch correction; lateral glide FD uses the runway/map bearing and wind
correction without ILS capture. Actual forces still determine motion. Flare begins near
80 ft for this synthetic high-drag scenario. The ND range estimate uses the
synthetic polar, current configuration, height and wind, not a certified glide
performance database. Detailed relight, RAT, electrical/hydraulic degradation
and flight-control law changes remain outside scope.

Weather presets now drive rain, fog/visibility and overcast in rendering as
well as vector wind/gusts and wet-runway friction in physics. The minimum is a fictional game threshold. Safe recovery is an intermediate
stage: the level stays active until the subsequent visual landing and stop.
Late decisions can recover and land, with a score deduction. Jammed-flap go-arounds allow the actual stuck setting
so task cleanup cannot demand an impossible actuator position.

Radio state is independent of aircraft control and never alters flight forces.
Its event queue uses simulation time, deduplication and checkpoint history;
media playback observes that queue, shared pause/mute and time scale. Recorded
height/safety clips duck dialogue. Self-hosted assets avoid runtime dependence
on remote synthesis or available operating-system voices.


## Terrain awareness and clearance monitoring

`terrain/heightfield.js` owns the render-grid dimensions and vertex heights.
`world.js` draws those exact vertices. Physics samples the same triangle
interpolation (not a separate smooth formula), including the coast. Swept
probes use <=8 m spacing plus a binary impact refinement, covering the fuselage,
nose and banked wing tips. Impact runs before route progress or landing success;
no later tick can move a result state. Tests compare the height query with
raycasts against an actual Three.js mesh.

The PFD RA now samples real ground/sea below the aircraft. The main altitude
tape and 1500 ft task/ATC clearances remain airport-reference game heights.
The 1500 ft circuit is explicitly sea-side with a left turn; normal and
single-engine complete flights keep over 1000 ft of terrain clearance once
above 1100 ft on the circuit, rather than assuming 1500 ft is safe everywhere.

The toy terrain predictor checks 30 seconds of current ground track, turn
rate and vertical motion, using a narrow forward fan. Caution precedes urgent
PULL UP (15-second contact / near-clearance envelope), with repeat cooldown
and clear hysteresis. Normal low, aligned, configured runway arrivals are
inhibited; elevated terrain is always checked, regardless of gear or APPR.
It is a game safety aid, not certified GPWS/EGPWS or a navigation database.

ATC stores a live clearance, phase grace, sustained-deviation timers,
notifications and recovery state. It monitors actual altitude, heading and
route geometry; choosing an FCU value or playing a readback never substitutes
for compliance. Reminders can repeat after 25 s and expire instead of playing
against a superseded clearance. Engine/emergency conversations keep priority.
The base leg explicitly clears 1250 ft, replacing the earlier 1500 ft circuit
height. A final-turn grace prevents normal base-to-final intercept warnings.

Terrain danger temporarily supersedes ordinary altitude compliance. Powered
FD/AP requests a terrain-safe altitude through the existing attitude servos
and power limit; the selected FCU value and manual inputs are untouched. A
temporary terrain floor is released only after safe terrain and route recovery.
No geometry or engine power is changed to make an escape succeed.

Radio DSP processes only the pilot/tower media source, with band-pass,
compression, gentle saturation, gated carrier noise and PTT clicks. Height
and safety cues retain a separate clean path; urgent GPWS/windshear cues
cannot be displaced by lower-priority height calls. Pause/mute/reset zero
the carrier. Browser QA checks decoded voice, output signal RMS, carrier gain,
PTT events and quiet pause/mute in addition to subtitles.


Active radio clips follow the media clock without repeated current-time seeks.
This preserves pause continuation on simple static hosts without HTTP Range
support. Event expiry removes stale lines; rate/pause controls handle ordinary
clock alignment. Carrier gating discards stale gain automation on pause/reopen.


## Correcting final-approach nuisance alerts

The original landing inhibit required |x| <90 m. A normally descending final
with 120–180 m of lateral error being corrected toward centerline therefore
predicted contact with the flat airport as a terrain conflict, including a
PULL UP at about 222 ft / 1 km. It could also introduce an unnecessary ATC
terrain floor and command a climb out of an otherwise recoverable approach.

The inhibit now tests a bounded arrival envelope narrowing toward the runway,
closing ground track, actual gear, plausible descent/bank and longitudinal
contact near/within the runway. Brief lateral corrections are not extrapolated
unchanged to touchdown; lateral landing accuracy remains the approach monitor's
responsibility. Expected low airport contact is excluded only in that envelope.
Raised terrain (>5 m) remains in the forward samples even for a valid arrival.
Undershoot, excessive descent, gear-up and missed approach still warn. Tests
include both sign lateral errors, a real-control full circuit with >90 m
correction, bank rollout, a synthetic ridge in the arrival path and unchanged
real hillside collision/alerts. This remains an illustrative game envelope.


## Unprepared arrival entries and cabin motion

`missions/arrival.js` centralizes all ten playable airborne start profiles.
They begin offset from the runway with an intercept heading, clean physical
actuators and no preset ILS capture, gate success or checklist confirmation.
Full ILS starts 22 km out / 3000 ft; shorter powered entries are 10.5–12 km /
1500 ft. Initial placement is followed by the normal air-data/trim/spool
initialization, rather than a controller moving the aircraft onto final.
Takeoff/circuit levels retain their continuous runway starts. Bare
`createFlight('landing')` configured presets remain internal model fixtures;
UI levels always supply `levelId` and pass through the clean initializer.

Touchdown records actual gear/flap positions and checklist state. Normal
landing and fault completion validate this record, so late switch changes
do not satisfy preparation. The emergency dual-glide lesson checks its
actual gear/CONF 1 instead of requiring the normal powered landing checklist.
Go-around instructions wait for approximately 800 ft; the jam trigger waits
for physical CONF 2 before freezing the actuator on attempted extension.

`sim/cabin-motion.js` samples deterministic, purely visual head motion from
simulation time, speed, wind, touchdown descent and nose-wheel contact.
A damped main-gear impact, smaller nose-wheel impact, ground rumble and
weather buffeting drive the same cockpit rig and Three.js camera. The
stable UI overlays remain outside the rig. Pausing freezes the pose; retry
reproduces it from saved time/contact/weather state. No visual transform
changes aircraft attitude, velocity, contact or sensor readings.

Weather also supplies small seeded pockets roughly once per 55-second
cycle, with a 2.5–3.7 second envelope and calm gaps. The wind field applies
the physical air-mass component (up to 0.2 m/s at normal strength); visual
level-flight response is limited to above 1000 ft, low bank and low vertical
speed. Existing stronger gust/shear fields remain actual aerodynamic inputs.
Standard / 0.35 reduced / off applies only to visual head motion, is saved
locally and initially honors prefers-reduced-motion. Changing the setting
does not remove weather forces or recreate the aircraft/audio simulation.


## Stall alerts and continuous missed approaches

`sim/stall-warning.js` observes the same configuration-dependent lift peak as
`aerodynamics.js`. It never changes lift, pitch or velocity. Warning thresholds
are 85%/95% critical AoA, with an active-warning clear threshold of 78% held
for 0.6 seconds. The red event repeats at three-second simulation intervals;
state and timers are checkpointed. Ground/landed/result states inhibit it.
The PFD and HUD stay visible alongside terrain warnings, and the clean stall
clip takes priority over ordinary height cues. Recovery removes a queued or
paused stale stall clip. Radio is ducked during safety speech.

`missions/recovery.js` handles all landing-required levels after TOGA. It
observes actual 3000 ft / 150–220 kt / gear / flap cleanup and three seconds
of stability (five for windshear), allowing the actual jammed setting. It then issues a coastal
return route from the current location; it never assigns position, velocity,
engine status or repairs system capabilities. The route uses sea-side points,
3000/2500/2200 ft descent stages and a base/final intercept. Full ILS uses a
longer 14 km base at 1500 ft for a genuine capture from below; normal returned
arrivals use 10 km / 1750 ft map guidance. Wrapped heading is required for LOC
capture after a whole circuit. An ILS-loss final disconnects AP/FD and remains
visual. New approach gates, height calls and checklist do not inherit success
from the aborted final. Physical touchdown configuration remains required.

Fog visibility/cloud base improve smoothly over 60 seconds after safe recovery;
the windshear field fades on the same schedule after escape. This deterministic
weather progression permits a later landing without resetting the aircraft.
The explicit go-around drill remains a climb/cleanup lesson; all other arrival,
circuit and fault missions continue until real landing and stopping. Only the
three prior go-around-clearing lesson revisions invalidate their old records.

Recovery legs keep their own live ATC altitudes; they do not reuse the original
1500/1250 ft circuit voice clearances. The initial return instruction and final
landing exchange remain automatic. This prevents radio/HUD altitude conflicts.


## Ground-contact go-around

TOGA can now enter the go-around procedure after a valid touchdown during
rollout. `landed` remains the wheel-contact state while `goAround` permits
manual pitch control and a new lift-off. Selecting TOGA retracts spoilers,
cancels reverse and releases automatic braking, without repairing failed
systems or assigning velocity, position or engine spool. Manual brakes remain
active while held. The normal force-based lift-off condition in dynamics
releases the wheels; only then does `landed` clear. Ground gear retraction
remains blocked. The previous contact is archived in `landingAttempts`, while
the current touchdown and nose contact are cleared on lift-off so only the
subsequent real landing can finish the mission. Retry preserves these states.
Touch-and-go is a game simplification and does not model detailed reverser
actuation, brake temperature or aircraft operational rejected-landing limits.

During a touch-and-go recovery, passing 1100 ft changes only the requested
ground track to a sea-side left turn while the real climb continues to 3000
ft. ATC amends the heading with turn grace. This protects the longer
single-engine climb without adding thrust or relocating the aircraft.


## Radio emergency severity

`comms/emergency.js` observes actual fixed-tick state and updates only radio
state. Fixed first declarations cover low takeoff engine loss, double failure
and flap jam; controllable manual-thrust or signal-loss procedures remain
ordinary fault reports. Transient escalation uses sustained low-height stall /
vertical energy loss or imminent terrain prediction, with hysteresis/timers.
A single failed engine can downgrade only after 20 s stable above 1200 ft;
transient distress cancellation needs 15 s safe recovery. These are synthetic
game thresholds, not aircraft operating limits or mandatory real-world fault
classifications. Snapshot/retry includes monitor and declaration state.

Queued declarations carry severity and 4/3 priority above 2 fault reports,
1 ATC reminders and 0 routine traffic. Pending high-priority declarations keep
their initial safety-call grace; lower traffic cannot reset that delay or
interrupt their acknowledgement. A higher-severity event may supersede lower
traffic. Resolved transient distress restores any underlying urgency. Radio
classification never supplies thrust, repairs systems, moves the aircraft or
substitutes for actual flight/ATC compliance. The MP3 builder uses the identical pilot voice/pitch for both the signal
and Mandarin body, joining exactly three spoken signal units; waveform QA
checks the actual encoded repetitions as well as the caption strings.

Signal cadence trims only boundary silence, retains internal word pauses,
and uses 1.10 atempo with 80 ms repeat gaps. This removes the old per-unit
1.2 s silent tail while preserving speaker/pitch and all three call groups.
Waveform QA measures the actual prefix completion time (<2.5 s).
