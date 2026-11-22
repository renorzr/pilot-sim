import layout from './fcu-layout.json' with {type:'json'};
import {siteUrl} from '../urls.js';
// Every rectangle is authored in the original background's pixel coordinates.
// The same data builds the SVG aperture and positions its actual controls.
export const FCU_LAYOUT=layout;
const union=layout.aperture;
const rect=(r,parent)=>({left:`${(r.x-(parent.x||0))/parent.width*100}%`,top:`${(r.y-(parent.y||0))/parent.height*100}%`,width:`${r.width/parent.width*100}%`,height:`${r.height/parent.height*100}%`});
export const FCU_STYLES={panel:rect(union,layout.artboard),targets:rect(layout.targets,union),modes:rect(layout.modes,union)};
export const FCU_FRAME_ASSET=siteUrl('assets/cockpit-frame-fcu.svg?v='+layout.revision);
