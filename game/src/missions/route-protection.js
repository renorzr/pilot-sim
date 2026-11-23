// Broad game limits for sustained deviations, independent of map extents.
import {clamp} from '../sim/constants.js';
import {runwayOf} from '../airports/registry.js';
import {centerControls} from '../sim/controls.js';
import {repeatRadio} from '../comms/radio.js';

export const ROUTE_LIMITS=Object.freeze([
 Object.freeze({distance:4000,seconds:120}),
 Object.freeze({distance:8000,seconds:45}),
 Object.freeze({distance:12000,seconds:15}),
]);
export const createRouteProtection=()=>({legKey:null,legSince:0,distance:0,timers:[0,0,0],recovery:[0,0,0],remaining:null,limit:null,grace:false,suspended:false,warning:false,lastReminder:-100,warningSeconds:0,goAroundOrigin:null});

function segmentDistance(s,a,b,{ray=false}={}){
 const dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
 const t=length2?clamp(((s.x-a.x)*dx+(s.z-a.z)*dz)/length2,0,ray?Infinity:1):0;
 return Math.hypot(s.x-a.x-dx*t,s.z-a.z-dz*t);
}
function legDistance(s,r,allowPrevious){
 const b=r.points[r.index],a=r.index?r.points[r.index-1]:r.origin;
 let distance=segmentDistance(s,a,b);
 // A switch near a waypoint leaves a legitimate fly-by turn on the old leg.
 if(allowPrevious&&r.index>0){const before=r.index>1?r.points[r.index-2]:r.origin;distance=Math.min(distance,segmentDistance(s,before,a));}
 return distance;
}
export function routeProtectionDistance(s,p=s.routeProtection){
 if(!s.airline||!s.airborne||s.landed||s.airline.phase==='arrival-preview')return null;
 if(s.goAround){
  const key=`${s.airportId}:goaround:${s.mission?.goAroundCount||0}:${s.goAroundHeading}`;
  // The existing go-around clearance is the authorization; this monitor does
  // not issue a new route or alter the aircraft's controls.
  const origin=p?.goAroundOrigin?.key===key?p.goAroundOrigin:s;
  return{key,distance:segmentDistance(s,origin,{x:origin.x+Math.sin(s.goAroundHeading)*1000,z:origin.z-Math.cos(s.goAroundHeading)*1000},{ray:true})};
 }
 const r=s.route?.active?s.route:s.airline.navigation;
 const key=r?.active?`${s.airportId}:return:${s.mission?.goAroundCount||0}:${r.index}`:r&&!r.complete?`${s.airportId}:${r.kind}:${r.index}`:`${s.airportId}:final`;
 const turn=p?.legKey!==key||s.time-p.legSince<40;
 if(r&&(r.active||!r.complete))return{key,distance:legDistance(s,r,turn)};
 return{key,distance:segmentDistance(s,{x:0,z:22000},{x:0,z:-runwayOf(s).length})};
}
export function updateRouteProtection(s,dt){
 if(!s.airline||s.result||!Number.isFinite(dt)||dt<=0)return;
 const p=s.routeProtection??=createRouteProtection(),route=routeProtectionDistance(s,p);
 if(!route){p.distance=0;p.timers.fill(0);p.recovery.fill(0);p.remaining=p.limit=null;p.warning=false;p.warningSeconds=0;p.legKey=null;return;}
 if(p.legKey!==route.key){p.legKey=route.key;p.legSince=s.time;p.warningSeconds=0;
  if(s.goAround)p.goAroundOrigin={key:route.key,x:s.x,z:s.z};
 }
 p.distance=route.distance;p.grace=s.time-p.legSince<40;p.suspended=!!(s.terrain?.level||s.atc?.terrainFloorFt);
 p.remaining=p.limit=null;p.warning=false;
 if(p.suspended)return; // Necessary terrain avoidance takes priority.
 for(let i=0;i<ROUTE_LIMITS.length;i++){
  const limit=ROUTE_LIMITS[i];
  if(p.distance<limit.distance-500){p.recovery[i]+=dt;if(p.recovery[i]>=5-1e-7)p.timers[i]=0;}
  else{p.recovery[i]=0;if(!p.grace&&p.distance>limit.distance)p.timers[i]+=dt;}
  if(!p.grace&&p.distance>limit.distance){
   const remaining=Math.max(0,limit.seconds-p.timers[i]);
   if(p.remaining===null||remaining<p.remaining){p.remaining=remaining;p.limit=limit;}
   if(remaining<=1e-7){s.result={success:false,levelCleared:false,title:'持续偏离航路',detail:`偏离当前航路超过 ${limit.distance/1000} km，持续 ${limit.seconds} 秒。按导航修正航迹，或重试本阶段。`};s.autoPilot=false;centerControls(s);return;}
  }
 }
 if(!p.grace&&p.distance>2500){p.warningSeconds+=dt;p.warning=p.warningSeconds>=6;
  if(p.warning&&s.time-p.lastReminder>=25&&repeatRadio(s,'atc-route',{priority:1})){p.lastReminder=s.time;}
 }else p.warningSeconds=0;
}
