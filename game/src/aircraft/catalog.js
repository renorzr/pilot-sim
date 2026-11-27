import manifest from './livery-manifest.json' with {type:'json'};
import a380Paint from './a380-livery-manifest.json' with {type:'json'};
import {siteUrl} from '../urls.js';
import {aircraftDefinition,DEFAULT_DEFINITION} from './registry.js';
// Register each UV contract's independent paint catalog here. Geometry and
// physics definitions never assume another model uses the A320 atlas.
const paintCatalogs=Object.freeze({[manifest.uvLayout]:manifest,[a380Paint.uvLayout]:a380Paint});
const paintVersion=(layout,name,version)=>{const entry=paintCatalogs[layout]?.liveries[name];return entry?.versions?.[version]??(entry?.revision===version?entry:undefined);};

// Immutable resource identities are recorded with each flight segment. A new
// unwrap requires a new model/layout version, never repacking an existing atlas.
export const DEFAULT_AIRCRAFT=DEFAULT_DEFINITION.defaultAppearance;
export function resolveAircraft(spec=DEFAULT_AIRCRAFT){
 const definition=aircraftDefinition(spec),value={...definition.defaultAppearance,...spec},asset=definition.visual.assetVersions[String(value.assetVersion)];
 if(!asset||value.uvLayout!==asset.uvLayout||!paintVersion(value.uvLayout,value.livery,value.liveryVersion)||!definition.visual.variants[value.variant])throw new Error('Unsupported aircraft appearance: '+JSON.stringify(value));
 return value;
}
export const aircraftIdentity=spec=>{const a=resolveAircraft(spec);return[a.model,a.definitionVersion,a.assetVersion,a.variant,a.livery,a.liveryVersion,a.uvLayout].join(':');};
export function aircraftResources(spec,size=2048){
 const appearance=resolveAircraft(spec),paint=paintVersion(appearance.uvLayout,appearance.livery,appearance.liveryVersion).textures[String(size)];
 if(!paint)throw new Error('Unsupported aircraft texture size: '+size);
 const asset=aircraftDefinition(appearance).visual.assetVersions[String(appearance.assetVersion)];
 return{appearance,asset,model:siteUrl(asset.path),paint:{...paint,url:siteUrl(paint.path)+'?v='+paint.sha256.slice(0,16)},transcoder:siteUrl('assets/aircraft/basis/three-0.187.0/')};
}
export function aircraftTextureSize(renderer,{width=globalThis.innerWidth||0,height=globalThis.innerHeight||0,pixelRatio=globalThis.devicePixelRatio||1}={}){
 // Mobile/ordinary landscape views stay at 2K. High resolution desktop views
 // use 4K only when the renderer can accommodate it; never load both atlases.
 return renderer?.capabilities.maxTextureSize>=4096&&Math.min(width,height)>=900&&Math.max(width,height)*Math.min(pixelRatio,1.75)>=2500?4096:2048;
}
