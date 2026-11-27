import {aircraftDefinition} from '../aircraft/registry.js';
import layout from './fcu-layout.json' with {type:'json'};
import {siteUrl} from '../urls.js';
// Every rectangle is authored in the original background's pixel coordinates.
// The same data builds the SVG aperture and positions its actual controls.
export const FCU_LAYOUT=layout;
const union=layout.aperture;
const rect=(r,parent)=>({left:`${(r.x-(parent.x||0))/parent.width*100}%`,top:`${(r.y-(parent.y||0))/parent.height*100}%`,width:`${r.width/parent.width*100}%`,height:`${r.height/parent.height*100}%`});
export const FCU_STYLES={panel:rect(union,layout.artboard),targets:rect(layout.targets,union),modes:rect(layout.modes,union)};
export const FCU_FRAME_ASSET=siteUrl(aircraftDefinition().cockpit.framePath+'?v='+layout.revision);

const cockpitLayouts=Object.freeze({'a320-fcu-v1':Object.freeze({layout:FCU_LAYOUT,styles:FCU_STYLES})}),frames=new WeakMap();
export function cockpitLayoutFor(source){const definition=aircraftDefinition(source);if(frames.has(definition))return frames.get(definition);const id=definition.cockpit.fcuLayout,value=cockpitLayouts[id];if(!value)throw new Error('Unsupported cockpit layout '+id);const frame=Object.freeze({...value,frameAsset:siteUrl(definition.cockpit.framePath+'?v='+value.layout.revision)});frames.set(definition,frame);return frame;}
export const cockpitFrameAsset=source=>cockpitLayoutFor(source).frameAsset;
