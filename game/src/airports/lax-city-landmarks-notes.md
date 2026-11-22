# Los Angeles city landmark geometry

`lax-city-landmarks.js` contains original recognition meshes for the formal
game's LAX city scenery. It does not include any commercial aircraft/airport
model, downloaded architectural mesh, venue logo, brand texture or reference
photograph. The original mesh-generating code is covered by the repository's
MIT License. Geographic data retain their separately documented OSM/ODbL
provenance in the city source pack.

## Sources and level of detail

The input city pack supplies source IDs, geographic footprints, anchors and
height metadata. The renderer uses the minimum-area oriented rectangle of each
source footprint to align a landmark in the airport's true-heading local frame.
Generic skyline shafts follow the source building polygon. Exact wall bays,
structural sections, colours, curved roof sections and mechanical subdivisions
are visual estimates, not surveyed construction drawings.

- **SoFi Stadium:** the broad, sweeping canopy, visible lower concourse, roof
  grid and white supports follow the architectural form shown by
  [HKS, the project's architect](https://www.hksinc.com/what-we-do/projects/sofi-stadium/).
  HKS describes an ETFE roof with fritting, a sunken bowl and three covered
  venues. The game uses an opaque, softly tinted roof material to suggest
  translucent/fritted ETFE without the overdraw and sorting cost of multiple
  transparent roof/bowl layers. Panel seams are one low-contrast line mesh.
  This is a recognisable exterior, not an interior seat-by-seat stadium model.
  The visible bowl/field is a compact symbolic estimate; the shared physical
  terrain is not excavated to reproduce the real below-grade interior.
- **Kia Forum:** the restored red exterior and white colonnade follow the
  [restoration coating supplier's project report](https://tnemec.com/projects/forum-renovation/).
  That report documents the Forum Red finish and 72 precast columns. The game
  reproduces the circular mass, red wall/perimeter, white entablature and 72
  inexpensive column boxes. The genuine NAIP 2022 aerial crop in the city data
  workflow shows a very light grey/white roof; the main roof surface follows
  that aerial reference rather than misapplying the facade's Forum Red to the
  whole roof. The source building's reported height is used; the roof cap is
  included inside that height.
- **Downtown skyline:** actual source positions and tagged heights control the
  collection. Wilshire Grand's asymmetric sail and spire follow the
  [building's official description](https://wilshiregrandcenter.com/).
  Its architectural top is included in its input height, rather than adding
  another spire above that value. U.S. Bank Tower has a faceted shaft and
  progressively stepped crown. Other towers retain their source footprint,
  height and a small simplified roof cap. Their skyline grouping is neither
  enlarged nor moved nearer the flight path for visibility.

No historical entrance pylon ring is added. LAWA's
[15 January 2026 removal announcement](https://www.lawa.org/news-releases/2026/lax-bids-farewell-to-iconic-pylons-to-make-way-for-major-roadway-improvements)
places that old installation outside the current city snapshot's assumptions.
Santa Monica Pier, Hollywood Sign and Griffith Observatory are not part of this
first landmark asset module.

## API and collision contract

```js
const options = {project, heightAt, landmarks};
const envelopes = landmarkEnvelopes(options); // No THREE / DOM dependency.
const {group, colliders, stats} = buildLaxCityLandmarks({
  THREE, group: cityGroup, ...options,
});
```

`landmarks` contains optional `sofi`, `forum` records and a `downtown` array.
Records carry `id`, `name`, `geometry: [[longitude, latitude], ...]`,
`longitude`, `latitude`, and normalized `heightM`. `widthM`/`depthM` are optional
fallback dimensions for source point records. Missing architectural heights or
dimensions receive bounded visual estimates; the source pack distinguishes
those from tagged heights.

The pure `landmarkLayout` and `landmarkEnvelopes` exports use exactly the same
orientation, shared ground samples and architectural heights as the meshes.
Each envelope is a conservative axis-aligned bounding box:

```js
{id, name, cx, cz, width, depth, baseY, height, topY, yaw: 0}
```

`baseY` includes the lowest sampled foundation ground; `topY` is centre grade
plus the record's architectural height. Therefore `height` is the envelope's
total height and can be slightly greater than `heightM` on sloping ground.
For a curved canopy or a stepped crown, the box includes some empty space:
this is deliberately a reduced-order building envelope, not triangle contact.
It does not include arbitrary adjacent streets, plazas or residential blocks.
SoFi's roof-seam vertices are capped at the roof top so they never extend above
the shared collision envelope. Rendering never writes flight state or DEM.

## Rendering and native verification

The current source set has two stadiums and fourteen downtown towers, using
16,031 triangles and eleven shared materials including canopy seam lines,
before the world's material batching. Tower windows repeat at an estimated
3.6m floor spacing with original procedural glazing; selected floor belts,
street podiums, crowns and the Aon charcoal facade add variation. Roof shapes
and floor articulation remain original visual estimates within the existing
envelopes. There are no per-seat objects, large transparent interior layers
or external texture/font requests.

Native checks construct meshes with the actual airport projection/shared
terrain, verify finite uploaded attributes, verify source/top-height alignment,
and confirm every transformed landmark vertex lies within its corresponding
pure collision envelope. The city owner performs final in-game screenshots,
frustum/draw-call checks and physical-flight validation after integration.
