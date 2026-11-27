# Continuous airline flight

Airline Operations defaults to uninterrupted flight. Complete the existing
initial departure in order, retract the gear and flaps, then establish stable
flight at the displayed clearance. Guidance continues from the aircraft's actual
position. A player may instead choose **Skip remaining flight** when stable;
automatic cruise cuts have been removed.

Routes up to 180 km use a terminal-transfer profile, retaining their departure
clearance rather than requesting FL330. Longer routes request climb, continue
along a spherical great-circle route, and receive a descending target before
arrival. These are game planning profiles, not published route clearances.
Existing sourced initial departures and runway restrictions are retained.

## State and world handoff

`missions/continuous-route.js` observes actual horizontal displacement after
force integration; navigation cannot assign aircraft motion. The route retains
unwrapped geographic coordinates, including across the date line. Within 65 km
of the destination, once its background-prepared world is accepted and warmed,
the aircraft is expressed in the destination runway frame. Geographic position,
MSL, velocity, attitude, body rates, physical controls, weather, failures and the
simulation clock are retained. The exterior camera is transformed with it.
Arrival navigation starts at this observed position rather than a landing
preset. If scenery is not ready, flight continues with holding guidance.

The origin's departure/ground evidence remains attached to the flight. Continuous
and explicitly skipped arrivals both require actual approach gates, touchdown,
runway exit and parking assessment. An optional skip remains a labelled game
transition with the B camera and a remaining-distance time estimate; it preserves
mass, failures, cast and assessment evidence. Short-transfer dialogue uses the
shared route phrases and does not request a cruise flight level. Queued radio
lines retain their original speaker through a controller handoff.

## Coverage and limitations

All seven airports retain their authored DEM, local scenery and collision data.
LGA and JFK share New York source geography. Outside detailed terrain coverage,
continuous flight currently uses a self-hosted, coarse Natural Earth land/sea
texture on a sea-level surface, with matching contact height. This is a visual
and physical fallback, not worldwide detailed terrain, buildings, mountains or
real airway coverage. Fuel burn/range and real intermediate airspace clearances
are not simulated. In-flight replay data stays in memory; an optional geographic
channel retains the full journey without changing the packed trajectory format.

`tests/auto-cruise.test.mjs` exercises all 42 initial departures without an
automatic cut. `tests/continuous-flight.test.mjs` flies LGA→JFK, JFK→LGA and
PKX→HGH through the integrated force model to parking without an airborne skip;
it also checks manual skip, readiness, coordinate/camera/weather preservation,
recording and speaker handoff. Coordinate fixtures are separate from flown
mission evidence. Browser flight checks use actual keyboard/pointer controls.
