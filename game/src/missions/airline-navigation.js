// Charted initial departures; terrain-checked synthetic arrival routing.
import {airportOf,runwayOf} from '../airports/registry.js';
import {terrainHeight} from '../terrain/heightfield.js';
import {FT,RAD,G,KT,clamp,wrap} from '../sim/constants.js';
import {initialDeparture} from './departure-procedures.js';

export function cityBearing(from,to){
 const a=airportOf(from).data.airport,b=airportOf(to).data.airport,p=a.latitude*RAD,q=b.latitude*RAD,d=(b.longitude-a.longitude)*RAD;
 return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))/RAD+360)%360;
}
const polar=(angle,r)=>({x:Math.sin(angle)*r,z:Math.cos(angle)*r});
export const CROSSING_TOLERANCE_FT=100;
function terrainFloor(id,a,b){
 let peak=0;const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/400));
 for(let i=0;i<=steps;i++)for(const side of [-900,0,900]){
  const t=i/steps,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
  peak=Math.max(peak,terrainHeight(a.x+dx*t+side*dz/len,a.z+dz*t-side*dx/len,id));
 }
 return Math.ceil((peak*FT+1500)/500)*500;
}
export function departureNavigation(origin,destination){
 const airport=airportOf(origin),cityCourse=cityBearing(origin,destination),procedure=initialDeparture(airport,cityCourse),elevationFt=airport.elevationM*FT;
 let start={x:0,z:0};
 const points=procedure.legs.map(leg=>{
  let position;
  if(leg.kind==='fix')position=airport.project(leg.longitude,leg.latitude);
  else{
   const track=(leg.headingTrue-airport.runway.heading)*RAD;
   // An altitude terminator has no published geographical position. This is
   // only its map preview; the observed aircraft position replaces it at capture.
   const distance=leg.kind==='altitude'?Math.max(airport.runway.length+300,1500+Math.max(0,leg.altitudeMSL-elevationFt)/FT/.073):leg.distance;
   position={x:start.x+Math.sin(track)*distance,z:start.z-Math.cos(track)*distance};
  }
  let segment=leg;
  if(leg.handoffDistance){
   const dx=position.x-start.x,dz=position.z-start.z,t=Math.min(1,leg.handoffDistance/Math.hypot(dx,dz));
   segment={kind:'handoff',name:`飞向 ${leg.id}`,turn:leg.turn,targetFix:leg,simulated:true};position={x:start.x+dx*t,z:start.z+dz*t};
  }
  const floor=terrainFloor(origin,start,position),ceiling=segment.maxMSL===undefined?Infinity:segment.maxMSL-elevationFt;
  if(floor>ceiling)throw new Error(`${airport.id}: departure terrain conflicts with ${leg.id||leg.kind}`);
  const alt=Math.min(ceiling,Math.max(procedure.clearanceMSL-elevationFt,floor,segment.minMSL===undefined?0:segment.minMSL-elevationFt));
  const point={...segment,...position,alt};start=point;return point;
 });
 const last=points.at(-1),previous=points.at(-2)||{x:0,z:0};
 return{kind:'departure',index:0,origin:{x:0,z:0},cityCourse,course:(airport.runway.heading+Math.atan2(last.x-previous.x,previous.z-last.z)/RAD+360)%360,
  procedure:{id:procedure.id,name:procedure.name,source:procedure.source},speedLimit:procedure.speedLimit,elevationFt,altitude:last.alt,
  complete:false,crossTrack:0,visited:[],captures:[],endPassed:false,points};
}

export const airlineLegStart=n=>n.index?n.points[n.index-1]:n.origin;
export const airportAltitude=s=>(s.y-runwayOf(s).ground)*FT+airportOf(s).elevationM*FT;
export function departureTurnLead(s,n=s.airline.navigation){
 const i=n.index,b=n.points[i];if(i===n.points.length-1||b.flyOver||b.kind==='altitude')return 0;
 const a=airlineLegStart(n),c=n.points[i+1],angle=Math.abs(wrap(Math.atan2(c.x-b.x,b.z-c.z)-Math.atan2(b.x-a.x,a.z-b.z)));
 const radius=Math.max(30,s.airData.groundSpeed)**2/(G*Math.tan(24*RAD));
 return Math.min(4000,Math.hypot(b.x-a.x,b.z-a.z)*.35,Math.hypot(c.x-b.x,c.z-b.z)*.35,radius*Math.tan(Math.min(angle,140*RAD)/2));
}

export function departureConstraintText(point){
 if(point.kind==='altitude')return `达到海拔 ${Math.round(point.altitudeMSL)} ft 后继续`;
 if(point.minMSL!==undefined&&point.maxMSL!==undefined)return `过点海拔 ${Math.round(point.minMSL)}–${Math.round(point.maxMSL)} ft`;
 if(point.minMSL!==undefined)return `过点不低于海拔 ${Math.round(point.minMSL)} ft`;
 if(point.maxMSL!==undefined)return `过点不高于海拔 ${Math.round(point.maxMSL)} ft`;
 return point.kind==='handoff'?'初始离场交接段':point.simulated?'管制引导段':'按航点飞行';
}

export function departureInstruction(s){
 const n=s.airline?.navigation;if(n?.kind!=='departure'||!n.procedure)return null;
 const b=n.points[n.index],heading=b.headingMag===undefined?'':`航向 ${Math.round(b.headingMag)}°M · `;
 return `${b.name} · ${heading}${departureConstraintText(b)}`;
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
 // Departure legs continue forward beyond their endpoint while constraints
 // are being met. Chasing a clamped, passed point would command a U-turn.
 const lookahead=n.procedure?clamp(s.airData.groundSpeed*14,800,1800):clamp(s.airData.groundSpeed*18,1400,2200),t=clamp(along+lookahead/len,0,n.kind==='departure'?Infinity:1),x=a.x+dx*t,z=a.z+dz*t;
 n.crossTrack=cross;
 // Anticipate a lower next-leg altitude only as fast as the remaining path permits.
 const altitude=n.kind==='arrival'?Math.max(b.alt,Math.min(a.alt??n.altitude,b.alt+Math.max(0,len*(1-along))*Math.tan(2.6*RAD)*FT)):b.alt;
 const headingMode=n.kind==='departure'&&['altitude','vector'].includes(b.kind);
 return {track:headingMode?wrap((b.headingTrue-runwayOf(s).heading)*RAD):Math.atan2(x-s.x,-(z-s.z)),altitude,along,cross,length:len,distance:Math.hypot(s.x-b.x,s.z-b.z),name:b.name,
  headingMode,turn:b.turn,turnEstablished:n.legEstablished,minMSL:b.minMSL,maxMSL:b.maxMSL,speedLimit:n.kind==='departure'?n.speedLimit:null};
}
function advanceDeparture(s,n,t,dt){
 if(n.endPassed||n.restrictionMissed)return null;
 if(n.legIndex!==n.index){n.legIndex=n.index;n.legCaptureSeconds=0;n.legEstablished=false;n.legPassed=false;n.previousAlong=null;}
 const a=airlineLegStart(n),b=n.points[n.index],last=n.index===n.points.length-1,heading=Math.atan2(b.x-a.x,a.z-b.z);
 const onLeg=t.along>=-.1&&Math.abs(t.cross)<1500&&Math.abs(wrap((t.headingMode?s.yaw:s.airData.groundTrack)-(t.headingMode?t.track:heading)))<35*RAD;
 n.legCaptureSeconds=onLeg?n.legCaptureSeconds+dt:0;if(n.legCaptureSeconds>=2)n.legEstablished=true;
 const ordered=n.visited.length===n.index&&n.visited.every((value,i)=>value===i),msl=airportAltitude(s);
 const crossed=n.previousAlong!==null&&n.previousAlong<1&&t.along>=1&&Math.abs(t.cross)<1500;
 const inLimits=(b.minMSL===undefined||msl>=b.minMSL-CROSSING_TOLERANCE_FT)&&(b.maxMSL===undefined||msl<=b.maxMSL+CROSSING_TOLERANCE_FT);
 const lead=departureTurnLead(s,n),flyBy=!last&&!b.flyOver&&lead>0&&t.distance<=lead&&t.along>=.65&&inLimits;
 if(b.kind==='altitude')n.legPassed=msl>=b.altitudeMSL&&-s.z>=runwayOf(s).length&&Math.abs(s.x)<1200;
 else if(ordered&&n.legEstablished&&(crossed||flyBy))n.legPassed=true;
 n.previousAlong=t.along;
 if(!ordered||!n.legEstablished||!n.legPassed)return null;
 // A real overflight below/above a restriction is observed, never repaired by
 // waiting past the fix, moving the plane, or retroactively claiming a pass.
 if(!inLimits){
  n.restrictionMissed={point:b.id||b.name,altitudeMSL:msl,minMSL:b.minMSL,maxMSL:b.maxMSL};
  s.result={success:false,levelCleared:false,title:'未满足离场过点限制',detail:`${b.id||b.name} · ${departureConstraintText(b)} · 实际海拔 ${Math.round(msl)} ft`};return null;
 }
 n.captures.push({index:n.index,id:b.id||b.kind,time:s.time,x:s.x,z:s.z,altitudeMSL:msl,speedKt:s.speed*KT,flyBy:!crossed&&b.kind!=='altitude'});
 if(b.kind==='altitude'){
  b.x=s.x;b.z=s.z;b.observed=true;
  // Re-anchor a following heading clearance to the observed termination.
  const next=n.points[n.index+1];if(next?.kind==='vector'){const r=(next.headingTrue-runwayOf(s).heading)*RAD;next.x=s.x+Math.sin(r)*next.distance;next.z=s.z-Math.cos(r)*next.distance;}
 }
 n.visited.push(n.index);
 if(last){n.endPassed=true;n.endPassedAt=s.time;return 'departure-end';}
 const next=n.points[n.index+1],nextHeading=next.headingTrue===undefined?Math.atan2(next.x-b.x,b.z-next.z):(next.headingTrue-runwayOf(s).heading)*RAD;
 const turn=Math.abs(wrap(nextHeading-(t.headingMode?t.track:heading)))>8*RAD;
 n.index++;return turn?'departure-turn':'departure-leg';
}
export function advanceAirlineNavigation(s,dt=.01){
 const t=airlineTarget(s);if(!t||!s.airborne)return null;
 const n=s.airline.navigation;
 if(n.kind==='departure')return advanceDeparture(s,n,t,dt);
 if(t.distance>Math.min(n.kind==='departure'?1300:900,t.length*.3)&&!(t.along>=.98&&Math.abs(t.cross)<1200))return null;
 if(n.kind==='arrival'&&n.index===n.points.length-1&&(Math.abs(wrap(s.airData.groundTrack))>30*RAD||Math.abs(s.x)>1200))return null;
 if(n.index<n.points.length-1){n.index++;return n.kind==='departure'?'departure-turn':'arrival-leg';}
 n.complete=true;return 'arrival-final';
}
