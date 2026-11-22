// Airport-relative game routes derived from the great-circle city pair.
// These are terrain-checked game procedures, not published SID/STAR charts.
import {airportOf,runwayOf} from '../airports/registry.js';
import {terrainHeight} from '../terrain/heightfield.js';
import {FT,RAD,clamp,wrap} from '../sim/constants.js';

export function cityBearing(from,to){
 const a=airportOf(from).data.airport,b=airportOf(to).data.airport,p=a.latitude*RAD,q=b.latitude*RAD,d=(b.longitude-a.longitude)*RAD;
 return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))/RAD+360)%360;
}
const polar=(angle,r)=>({x:Math.sin(angle)*r,z:Math.cos(angle)*r});
function terrainFloor(id,a,b){
 let peak=0;const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/400));
 for(let i=0;i<=steps;i++)for(const side of [-900,0,900]){
  const t=i/steps,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
  peak=Math.max(peak,terrainHeight(a.x+dx*t+side*dz/len,a.z+dz*t-side*dx/len,id));
 }
 return Math.ceil((peak*FT+1500)/500)*500;
}
export function departureNavigation(origin,destination){
 const course=cityBearing(origin,destination),track=wrap((course-runwayOf(origin).heading)*RAD),turn={x:0,z:-4500};
 const end={x:turn.x+Math.sin(track)*24000,z:turn.z-Math.cos(track)*24000};
 const altitude=Math.max(3000,terrainFloor(origin,{x:0,z:0},turn),terrainFloor(origin,turn,end));
 return {kind:'departure',index:0,origin:{x:0,z:0},course,altitude,safeTurnAltitude:1200,complete:false,crossTrack:0,
  points:[{...turn,alt:altitude,name:'跑道方向爬升'},{...end,alt:altitude,name:'转入目的地航路'}]};
}
export function arrivalNavigation(origin,destination){
 const radial=cityBearing(destination,origin),angle=wrap((180-(radial-runwayOf(destination).heading))*RAD),side=angle>=0?1:-1;
 const start={...polar(angle,28000)},points=[{...polar(angle,25500),name:'到港入口'}];
 const endAngle=side*Math.atan2(6500,24500),steps=Math.max(1,Math.ceil(Math.abs(angle-endAngle)/(35*RAD)));
 for(let i=1;i<=steps;i++)points.push({...polar(angle+(endAngle-angle)*i/steps,Math.hypot(6500,24500)),name:'到港转弯'});
 points.push({x:side*1500,z:22000,name:'最后进近截获'});
 points.push({x:0,z:18500,name:'对正最后进近'});
 // Work backwards: retain room to descend at a modest 3-degree game slope.
 let next={...points.at(-1),alt:3000};points.at(-1).alt=3000;
 for(let i=points.length-2;i>=0;i--){const p=points[i],required=Math.max(3000,terrainFloor(destination,p,next));p.alt=Math.max(required,next.alt);next=p;}
 const altitude=Math.max(points[0].alt,terrainFloor(destination,start,points[0]));
 // Keep terrain clearance until the next leg; later legs descend gradually.
 points.forEach((p,i)=>{if(i<points.length-1)p.alt=Math.max(p.alt,terrainFloor(destination,p,points[i+1]));});
 return{kind:'arrival',index:0,origin:start,course:(radial+180)%360,radial,altitude,complete:false,crossTrack:0,points,
  entry:{...start,yaw:wrap((radial+180-runwayOf(destination).heading)*RAD),altitude}};
}
export const airlineNavigationActive=s=>!!s.airline?.navigation&&!s.airline.navigation.complete&&!s.goAround&&!s.route?.active&&!s.landed;
export function airlineTarget(s){
 if(!airlineNavigationActive(s))return null;
 const n=s.airline.navigation,b=n.points[n.index],a=n.index?n.points[n.index-1]:n.origin,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
 const along=((s.x-a.x)*dx+(s.z-a.z)*dz)/(len*len),cross=((s.x-a.x)*dz-(s.z-a.z)*dx)/len;
 const lookahead=clamp(s.airData.groundSpeed*18,1400,2200),t=clamp(along+lookahead/len,0,1),x=a.x+dx*t,z=a.z+dz*t;
 n.crossTrack=cross;
 // Anticipate a lower next-leg altitude only as fast as the remaining path permits.
 const altitude=n.kind==='arrival'?Math.max(b.alt,Math.min(a.alt??n.altitude,b.alt+Math.max(0,len*(1-along))*Math.tan(2.6*RAD)*FT)):b.alt;
 return {track:Math.atan2(x-s.x,-(z-s.z)),altitude,along,cross,length:len,distance:Math.hypot(s.x-b.x,s.z-b.z),name:b.name};
}
export function advanceAirlineNavigation(s){
 const t=airlineTarget(s);if(!t||!s.airborne)return null;
 const n=s.airline.navigation;
 if(n.kind==='departure'&&n.index===0&&(s.y-runwayOf(s).ground)*FT<n.safeTurnAltitude)return null;
 if(n.kind==='departure'&&n.index===1)return null;
 if(t.distance>Math.min(n.kind==='departure'?1300:900,t.length*.3)&&!(t.along>=.98&&Math.abs(t.cross)<1200))return null;
 if(n.kind==='arrival'&&n.index===n.points.length-1&&(Math.abs(wrap(s.airData.groundTrack))>30*RAD||Math.abs(s.x)>1200))return null;
 if(n.index<n.points.length-1){n.index++;return n.kind==='departure'?'departure-turn':'arrival-leg';}
 n.complete=true;return 'arrival-final';
}
