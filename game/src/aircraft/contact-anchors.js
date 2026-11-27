import {aircraftDefinition,DEFAULT_DEFINITION} from './registry.js';
// Compatibility alias for native fixtures; runtime callers resolve the active
// version/structural variant. Cache only immutable definition-owned geometry.
export const AIRCRAFT_CONTACTS=DEFAULT_DEFINITION.geometry.contacts;
const variants=new WeakMap();
export function aircraftContacts(source){
 const d=aircraftDefinition(source),spec=source?.aircraft??source??{},variant=spec.variant??d.visual.defaultVariant;
 let cache=variants.get(d);if(!cache){cache=new Map();variants.set(d,cache);}
 if(!cache.has(variant)){const v=d.visual.variants[variant];if(!v)throw new Error('Unknown aircraft structural variant '+variant);cache.set(variant,v.contacts?Object.freeze({...d.geometry.contacts,...v.contacts}):d.geometry.contacts);}
 return cache.get(variant);
}
