# JFK exterior scene

The scene is original MIT game geometry built on the separately licensed OSM airport plans. No photographs are bundled. It retains source terminal outlines rather than replacing the terminal complex with generic rectangular blocks. Terminal 4 has shallow repeating silver roof bays and dark blue-green glazing; the other source concourses use pale silver roofs. Source passenger bridges are modelled as low-cost static geometry. No static aircraft obstruct the departure stand.

Primary visual references inspected:

- [JFK Airport: Terminal 4](https://www.jfkairport.com/explore-jfk/terminals/terminal-4), including its [official exterior photograph](https://s7d9.scene7.com/is/image/panynjaviation/T4-exterior-new?wid=1200): pale metallic barrel roofs, blue-green curtain walls and the concrete air-traffic-control tower with offset box-like cabins.
- [TWA Hotel official gallery](https://www.twahotel.com/photos), including [Property1.jpg](https://www.twahotel.com/sites/default/files/2019-07/Property1.jpg): Saarinen's upturned white shell roof and dark glazing. The TWA model is an original exterior interpretation, not a reproduction of structural drawings or interiors.
- [Port Authority airport statistics and general information, 2024](https://www.panynj.gov/content/dam/airports/statistics/statistics-general-info/annual-atr/ATR_2024.pdf), identifying the 321-foot control tower and preservation of the historic TWA Flight Center.

Facade subdivisions, roof sections, roof bays, landmark shell dimensions and passenger-bridge equipment are simplified visual estimates. Heights use source tags when present, with documented defaults otherwise. Source features named “New Terminal” or explicitly tagged construction/proposed are excluded from the detailed operating-terminal model. Source inclusion is not a statement of current terminal availability. Only the selected runway is operational in the game.

All geometry is static and normalizes position/normal/UV/index attributes for the owner's existing material-batching pass. Roof triangles are explicitly wound upward. Source apron surfaces use the shared ground-layer offsets, and the builder returns `excludeFeatureIds` for custom landmarks so the generic world does not place a second box over them.


The regional integration adds original source-clipped rooflights, modest HVAC
services, glazed bridge sections, framing and cast/received local shadows.
These construction details are estimates. The T4/TWA/tower/bridge plans and
stand 9 clearance remain source-based. Regional geometry, NAIP resolution,
dates and model retention are documented in [city notes](data/JFK-CITY.md).
