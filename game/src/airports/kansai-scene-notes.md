# Kansai airport scenery

This is original game geometry based on the bundled OpenStreetMap outlines and node locations. The terminal is code-built; surrounding ground photography is supplied by the separate [Kansai city layer](data/KANSAI-CITY.md). No third-party airport model is included.

The terminal uses a silver-blue metallic airfoil roof, narrow rooflights and dark glazed facades. Source footprint positions determine the terminal shape. Roof cross-sections, facade division, heights without source tags and equipment dimensions are visual estimates. The long T1 wings remain low while the main hall has a higher flowing membrane; T2 receives a low, simpler roof. The source airport islands and coast remain geographic water/land polygons rather than a guessed airport rectangle. The elevated Sky Gate Bridge follows tagged source road bridge segments; deck thickness, pier spacing and barriers are game estimates and it is not part of the taxi route.

## Visual references

- [Kansai airport Terminal 1 anniversary presentation, hosted by Keio University](https://www.sdm.keio.ac.jp/docs/kansa-airport.pdf), first page: original exterior aerial/ground photographs and a structural section were inspected. They show the long silver flowing T1 roof, narrow white ribs, darker glazed frontage and the compact tower. No images from the document are redistributed.
- [Kansai International Airport facilities](https://www.kansai-airport.or.jp/en/map/guidance): airport facility identities.
- [Kansai Airports T1 renovation brochure](https://assets.kansai-airports.co.jp/decb6de6-t1renovation.pdf): official project context; the original reference photographs remain with their rightsholders.

The scene leaves all stands unoccupied. It introduces no alternate runway paint policy or per-frame update hook. Static meshes remain compatible with the existing material batching pass and the shared ground depth layers.

The tower is anchored to source building `way/405047733` (five-storey base), whose tower complex was visually verified in the [Geospatial Information Authority of Japan seamless aerial photograph](https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/18/229549/104336.jpg). The source does not tag a separate tower stem. The tall stem, octagonal glazed cab, cap and their dimensions are an exterior visual estimate over that actual base footprint, not a surveyed or separately mapped tower-height claim. Generic building rendering excludes this custom base. Passenger bridge equipment is inferred from mapped stand lead-ins where jet bridges are not independently mapped, with side offsets that leave the player's stand clear.

## Integration checks

The current source pack builds four terminal footprints, one tower complex, 26 bridge-equipment groups inferred from mapped stand lead-ins, and elevated source road bridge segments. The geometry has approximately 42,859 triangles in six shared mesh materials. All geometry attributes are finite, and all subdivided uploaded silver roof faces point upward. Source stand 33 remains unoccupied. `excludeFeatureIds` contains `way/405047733`, so the generic world renderer must suppress its duplicate building block.

The continuous-city pass adds glazed passenger bridge bodies with narrow
mullions, floor/roof caps and local cast/received sun shadows. Their centre paths
and stand offsets remain the original source-based or documented inferred ones.
The silver roof, tower base and elevated Sky Gate Bridge remain source-anchored.
The extra framing increases triangle count modestly while reusing existing
materials and the static batching pass; original pre-pass counts above are
retained as historical measurements.
