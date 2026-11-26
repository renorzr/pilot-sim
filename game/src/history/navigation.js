import {eventRunways} from './event-world.js';
import {clamp,wrap} from '../sim/constants.js';
export const runwayKey=r=>r.airport+'-'+r.id;
export const selectedHistoricalRunway=s=>eventRunways.find(r=>runwayKey(r)===s.historical?.manualTarget)||null;
export function runwayGeometry(s,r){
 const forward={x:Math.sin(r.heading),z:-Math.cos(r.heading)},right={x:Math.cos(r.heading),z:Math.sin(r.heading)},dx=s.x-r.a.x,dz=s.z-r.a.z;
 return{along:dx*forward.x+dz*forward.z,cross:dx*right.x+dz*right.z,distance:Math.hypot(dx,dz),headingError:wrap(s.airData.groundTrack-r.heading),forward,right};
}
export function runwayInterceptHeading(s,r){
 const g=runwayGeometry(s,r);
 if(g.along> -300&&Math.abs(g.cross)>r.widthM*2){const back=2200;return Math.atan2(r.a.x-g.forward.x*back-s.x,-(r.a.z-g.forward.z*back-s.z));}
 // Intercept the extended centreline, then progressively align with its axis.
 return r.heading+Math.atan2(-g.cross,clamp(-g.along*.45,450,1800));
}
