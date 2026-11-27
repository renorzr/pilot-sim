// Explicit source tidal polygons share the event's zero-MSL water datum.
// Inland reservoirs/lakes must not be flattened to sea level by this predicate.
export const isSeaLevelWater=feature=>feature.tags?.water==='sea'||feature.tidalSurface===true&&feature.surfaceMSL===0&&feature.tags?.natural==='water';
