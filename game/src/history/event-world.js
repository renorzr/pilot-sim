import {US1549_PROFILE as P} from './us1549-profile.js';
import {airportOf,seaAt} from '../airports/registry.js';
import {terrainHeight} from '../terrain/heightfield.js';
// All event physics stays in one NYC frame throughout the flight. The frame is
// shared with the existing source buildings, but the event has its own airport
// identity, runway rules, MSL datum and contact classification.
export const eventAirportId='us1549';
export const eventHeading=airportOf('jfk').runway.heading;
const currentAngle=eventHeading*(Math.PI/180);
export const eventWaterCurrent=Object.freeze({x:P.water.current.east*Math.cos(currentAngle)-P.water.current.north*Math.sin(currentAngle),z:-(P.water.current.east*Math.sin(currentAngle)+P.water.current.north*Math.cos(currentAngle))});
export const isHistorical=s=>s?.historical?.id===P.id;
export const eventProject=(lon,lat)=>airportOf('jfk').project(lon,lat);
export const eventUnproject=(x,z)=>airportOf('jfk').unproject(x,z);
export const eventWaterAt=(x,z)=>seaAt('jfk',x,z);
export function eventHudsonAt(x,z){
 if(!eventWaterAt(x,z))return false;
 const p=eventUnproject(x,z),knots=[[-73.932,40.907],...P.riverTargets,[-74.026,40.733]];
 // Region qualification is separate from contact. Other source water remains
 // physical water and can be survived, but is not a Hudson mission completion.
 for(let i=1;i<knots.length;i++){
  const a=knots[i-1],b=knots[i];if(p.latitude>Math.max(a[1],b[1])||p.latitude<Math.min(a[1],b[1]))continue;
  const u=(p.latitude-a[1])/(b[1]-a[1]),lon=a[0]+(b[0]-a[0])*u;
  if(Math.abs(p.longitude-lon)<.013)return true;
 }
 return false;
}
export const eventGroundMSL=(x,z)=>terrainHeight(x,z,eventAirportId);
export const eventSurface=(x,z)=>eventWaterAt(x,z)?P.water.levelMSL:eventGroundMSL(x,z);
export const eventRunwayStrips=P.runways.map(r=>{
 const [a,b]=r.ends.map(q=>eventProject(...q)),length=Math.hypot(b.x-a.x,b.z-a.z);
 return{...r,a,b,length,heading:Math.atan2(b.x-a.x,-(b.z-a.z))};
});
export const eventRunways=eventRunwayStrips.flatMap(r=>[r,{...r,id:r.opposite,opposite:r.id,a:r.b,b:r.a,heading:Math.atan2(r.a.x-r.b.x,-(r.a.z-r.b.z))}]);
export function runwayAt(x,z,heading=null){
 let best=null,error=Infinity;
 for(const r of eventRunways){const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,u=((x-r.a.x)*dx+(z-r.a.z)*dz)/(r.length*r.length),cross=((x-r.a.x)*dz-(z-r.a.z)*dx)/r.length;
  if(u<0||u>1||Math.abs(cross)>r.widthM/2)continue;
  const e=heading===null?0:Math.abs(Math.atan2(Math.sin(heading-r.heading),Math.cos(heading-r.heading)));if(e<error){best=r;error=e;}
 }return best;
}
