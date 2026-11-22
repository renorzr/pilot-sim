# LAX original scene geometry

`buildLaxScenery` builds static source-footprint terminals and passenger bridges,
a white crossed-arch Theme Building with blue central shaft/glazed saucer, and
the neighbouring FAA control tower. No reference photograph is distributed and
no static aircraft occupies 86B.

The user prioritises believable architectural realism over exact construction
drawings. `lax-terminal-details.js` adds original curtain-wall glazing,
recessed window bands, opaque metal cladding, projecting structural piers,
gate canopies, standing-seam metal roofs, rooftop HVAC/fans/ducts and skylights.
Five small deterministic DataTextures provide facade, panel and roof patterns
and material roughness; their raw pixels total448KiB before mipmaps. They use
metre-scaled UVs and require no external images or model downloads.
Selected low support buildings near86B also use their source outlines and
the same material/detail family, replacing generic bounding boxes in the
normal exterior camera's foreground.

The117 source bridge plans now have window bands, a roof/floor, structural
frames, lifting columns, wheel carriages, docking bellows and selected service
stairs. These are original visual estimates, not animated docking equipment.
Roof equipment remains clear of courtyard holes. Exact architectural details
and materials are approximate; terminal source plans and terrain stay intact.

## Primary visual references

- [LAWA Central Terminal Area project](https://www.lawa.org/transforminglax/projects/central-terminal-area-cta-arrivals):
  the official Theme Building visual was inspected. It shows white intersecting
  parabolic arches, a low blue shaft, a dark glazed suspended saucer and pale
  terminal framing. The project rendering is a colour/form reference, not proof
  that its landscaping/people-mover works are already complete.
- [LAWA November2025 noise-map update](https://www.lawa.org/sites/lawa/files/2025-11/LAX%20NEM%20Update_0.pdf),
  page 21: the daylight Theme Building/FAA tower photograph was inspected for
  white arches, blue central accent and the adjacent glazed tower cab.
- [LAWA West Gates project](https://www.lawa.org/transforminglax/projects/west-gates-at-tom-bradley-international-terminal):
  the official exterior photograph was inspected for silver-grey ocean-wave
  roofs, pale metal panels and muted blue-green glazing. The project explicitly
  distinguishes the low West Gates ramp tower from the central FAA tower.

## Geometry and limitations

Twenty-four source terminal-tagged footprints include connectors, cargo and
private terminal structures; this is not a claim of 24 separately operating
passenger terminals. Actual footprint holes remain open. TBIT and West Gates
receive subdivided, gently varying roof sections; detailed wave spacing,
cladding, facade mullions and canopy structure are original visual estimates.
Other source buildings use the shared generic geometry. Terminal 5/construction
source presence is scenery, not a current passenger-operation claim.

The Theme Building is anchored to`way/37891817`; its arches peak around the
source 41 m height. Tower`way/534332717` supplies the central FAA tower position
and source 85.8 m height. Main tower, base `way/413226266` and Theme Building are
returned through `excludeFeatureIds` to prevent generic boxes obscuring them.
Jet bridges follow 117 real source plans in this source snapshot.

The detailed complex merges into15 material batches; mapped UVs and shadow
flags survive shared batching. Native checks cover finite geometry, open
courtyards and texture coordinates. Aprons use`GROUND_LAYERS.apron`; no runway
paint or pavement elevations are changed. The asset has no animation hook.

LAX uses a fixed2048² sun-shadow map around the terminal district, with ground
and apron receiving building/bridge shadows. Thin roof sheets and layered
facades cast shadows but do not receive their own shadows, avoiding acne from
the district-scale shadow map. Lower ambient light and stronger environmental
reflection apply to LAX only and continue to follow actual simulated overcast.
This is not a time-of-day or global illumination system.

Geography retains ODbL/source terms independently of MIT code. See
[data provenance](data/LAX.md). Stand/taxi/clearances and flight physics are
explicit game simplifications.

Road/taxiway strips and their centreline paint are geometrically clipped out
of source runway/shoulder footprints by the shared airport builder. Shoulder
rings leave the runway interiors open. This avoids overlapping thin pavements
competing for depth in aerial views without changing the DEM, contact heights
or source navigation routes. The same fix applies to all six source airports.
