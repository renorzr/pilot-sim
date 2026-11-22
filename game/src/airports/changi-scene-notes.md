# Changi exterior asset

`changi-scene.js` exports `buildChangiScenery({THREE, group, project, terrainHeight, features, materials})`. It is an original, static THREE exterior model for the formal flight game. It needs no image texture, external model, runtime fetch, animation loop, or additional package. The caller supplies the airport frame and terrain height, so the scene does not impose a second runway origin.

## Source plan and locations

Plan geometry comes from the source features in `data/changi.json`; see `data/CHANGI.md` for acquisition, data versions and licenses. The scene projects those coordinates with the caller's `project()` function. Source outlines and any courtyard holes are triangulated together. Decorative rooflights are clipped against those outlines and holes.

| Element | Source feature | Treatment |
| --- | --- | --- |
| Terminal 1 | `way/26561741` | Source perimeter; 30 m source height informs eaves |
| Terminal 2 | `way/173010412` | Source perimeter; 30 m source height informs eaves |
| Terminal 3 | `way/173010413` | Source perimeter; horizontal roof, aperture groups |
| Terminal 4 | `way/409015814` | Source perimeter; estimated eave/roof section |
| VIP complex | `way/680650600` | Source perimeter and source height |
| Jewel dome | `way/744520551` | Main building outline and 37 m source height; estimated toroidal section |
| Changi Control Tower | `way/173010406` | Source location and 78 m source height; estimated shaft, circular cabins, rings and radome |
| Aprons / passenger bridges | Source aeroway features within 6.5 km of WSSS | Actual polygon/line locations; bridge width/elevation estimated |

`way/744653030` duplicates the Terminal 1 roof and is not extruded again. `way/547383951` describes Jewel's basement, not its glass dome. Terminal 5 construction features `way/683354842` and `way/683354843` are not presented as opened terminals. Nearby Senai/Seletar terminals, residential buildings named Jewel, and the east/military control towers do not receive this asset's Changi landmark treatment.

The airport's active A16 stand (`way/1302460669`, gate node `node/1838456044`) remains unoccupied. The asset places **no static aircraft** anywhere. Passenger bridges follow mapped source lines; they do not invent an aircraft on the active stand.

The world renderer should suppress generic building boxes for the custom terminal/tower/Jewel features above, the duplicate T1 roof, and Jewel basement. The other airport scenery can continue using the ordinary map layers.

## Primary visual references

Reference pages and photographs were inspected on 21 November 2026. They inform the original mesh's silhouette and colours; no photograph, logo or architectural model is bundled or used as a texture.

- [Changi Airport Group: Jewel event venues brochure](https://www.changiairport.com/content/dam/jca-project/venue-hire/2023/JEWEL-Event-Venues-Final-Jun-2024.pdf), PDF pages 1–2: triangular silver/blue-grey glass dome, planted centre, warm light-grey tower shaft, dark glazed circular cabins, pale flared rings and radome. Both the indoor cover and exterior tower/Jewel photograph were inspected.
- [Jewel's official story](https://www.jewelchangiairport.com/en/our-story.html): confirms the glass-and-steel dome, integration of gardens, and connection with Terminals 1, 2 and 3.
- [CPG: Changi Airport Terminal 3](https://cpgcorp.com.sg/project/changi-airport-terminal-3-singapore/): describes its expansive horizontal rectilinear roof and baffles/skylight apertures. The project's [official photograph](https://cpgcorp.com.sg/wp-content/uploads/2024/09/g03_changi-airport-t3.jpg) was inspected for the pale steel/glass palette. Rooflights in the game are a simplified arrangement, not copied construction drawings.
- [CAAS: Air traffic management facilities](https://www.caas.gov.sg/industry/airspace-management-and-aerial-activities/air-traffic-services/air-traffic-management-facilities/): distinguishes the iconic Changi Control Tower from the Terminal 4 ramp tower. Its approximately 81 m **AMSL** description is a different vertical datum from the OSM 78 m building-height tag; the game uses the latter above its local terrain.

## Deliberate simplifications

All facade mullion spacing, passenger-bridge equipment, canopy detail, rooflight layouts, terminal roof sections, Jewel lattice spacing, garden trees and the tower's subdivision dimensions are visual estimates. Jewel's perimeter is recovered from source-outline ray intersections; its annular glass roof is an original interpretation of the photo, peaking at approximately the source 37 m height. The central opening/garden is an exterior recognition cue. It does not reproduce Jewel's indoor mall, shops, structural engineering or a simulated Rain Vortex.

Terminals use shallow horizontal silver-grey roofs with dark glass and rectangular light apertures. They do not reuse Daxing's radial copper shell or Hangzhou's white undulating terminal design. Jewel uses opaque metallic tinted glazing in three shared shades, avoiding transparency-sorting problems on modest GPUs.

## Geometry and rendering checks

At initial integration with the November 2026 source pack:

- 5 source terminal footprints; 6,802 terminal roof triangles; 275 clipped rooflight groups.
- 1 Jewel landmark with 2,688 glass-roof triangles; 1 iconic control tower; 87 mapped passenger bridges.
- Approximately 49,789 total triangles in 11 mesh-material batches after the shared world batching pass. The unbatched model has 2,465 small meshes; they are static and compatible with shared batching.
- Every uploaded numeric geometry attribute is finite. Every terminal and Jewel roof triangle has a positive upward normal in the uploaded Float32 geometry; degenerate source slivers are dropped.
- Geometry successfully merges by material after world transforms using THREE's `mergeGeometries`.
- A separate synthetic courtyard check retained the exact 38,400 m² polygon-minus-hole area and placed zero roof triangles inside the courtyard.
- Source aprons use `GROUND_LAYERS.apron` and `surfaceDepth()`. `orderGroundPaint()` is called before handoff; the scene introduces no competing runway/taxiway paint or altered ground-depth policy.

Source IDs and counts can change when map data are refreshed. The asset code is MIT-licensed with the repository. OSM-derived source plans retain their ODbL attribution and source-download obligations. The official reference photographs remain with their original rightsholders and are not distributed with the game.


## Continuous city integration

The city pass retains the terminal/Jewel/tower source plan and adds original
glazed bridge sections with narrow mullions, floor/roof trims and support piers
on the same source paths. Raised geometry now casts/receives local sun shadows;
apron remains a receiving surface. All construction detail remains estimated.
The regional OSM/Sentinel-2 city layer, masks, height/colour inference and model
retention are documented in [city source notes](data/CHANGI-CITY.md).
