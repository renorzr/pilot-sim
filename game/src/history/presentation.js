import {clamp,FT,KT,RAD} from '../sim/constants.js';
import {refreshAirData,setMotion,trimAlpha} from '../sim/aerodynamics.js';
import {stepEngines} from '../sim/engines.js';
import {updateStick,stepAttitude} from '../sim/controls.js';
import {stepDynamics} from '../sim/dynamics.js';
import {updateRadio} from '../comms/radio.js';
import {queueHistorical} from './comms.js';
function visualCopy(s){const{checkpoint,...state}=s;return structuredClone(state);}
export function createHistoricalIntro(s){
 if(!s.historical||s.mission.practice)return null;
 const duration=12,v=visualCopy(s);v.presentationKind='intro';v.time=-duration;v.x-=v.velocity.x*duration;v.z-=v.velocity.z*duration;v.y-=v.velocity.y*duration;
 v.systems.autoThrustAvailable=true;v.autoThrust=true;v.autoPilot=false;v.throttle=.78;v.aerodynamics=null;
 for(const e of v.engines)Object.assign(e,{status:'running',health:1,irrecoverable:false,spool:.48,n1:60,damageCause:null});
 v.radio.active=null;v.radio.pending=[];v.radio.history=[];v.historical.crew.birdAt=null;
 setMotion(v,{speed:s.speed,verticalSpeed:s.verticalSpeed,yaw:s.yaw});v.pitch=trimAlpha(v)+v.airData.gamma;
 return{kind:'history-intro',active:true,elapsed:0,duration,visual:v,accumulator:0};
}
export function createHistoricalRescue(s){
 if(!s.historical||!s.result?.physicalSuccess||!s.water||s.water.fatal)return null;
 const v=visualCopy(s);v.presentationKind='rescue';
 queueHistorical(v,'rescue',{priority:40,ttl:30});queueHistorical(v,'closing',{priority:20,ttl:30});
 return{kind:'history-rescue',active:true,elapsed:0,duration:12,visual:v,baseTime:s.time};
}
export function advanceHistoricalPresentation(p,dt,playing=true){
 if(!p?.active||!p.kind?.startsWith('history-'))return false;
 if(!playing)return true;const step=Math.max(0,Math.min(p.duration-p.elapsed,.5,Number.isFinite(dt)?dt:0));p.elapsed=Math.min(p.duration,p.elapsed+step);
 const v=p.visual;
 if(p.kind==='history-intro'){
  p.accumulator+=step;
  while(p.accumulator>=.01){
   p.accumulator-=.01;v.time+=.01;refreshAirData(v);
   const pitch=trimAlpha(v)+Math.atan2(10,Math.max(30,v.airData.horizontal))+(10-v.verticalSpeed)*.006;
   updateStick(v,{pitch:clamp((pitch-v.pitch)*3.2-v.pitchRate*2,-1,1),steer:clamp(-v.roll*2-v.rollRate,-1,1)},.01);
   stepEngines(v,219/KT,.01);stepAttitude(v,.01);stepDynamics(v,.01);
  }
 }else{v.time=p.baseTime+p.elapsed;updateRadio(v);}
 if(p.elapsed>=p.duration-1e-9)p.active=false;return true;
}
export const historicalPresentationVisual=p=>p?.active&&p.kind?.startsWith('history-')?p.visual:null;
export function historicalCamera(s,{kind,elapsed,duration}){
 const u=clamp(elapsed/duration,0,1),ease=u*u*(3-2*u),intro=kind==='history-intro',angle=(intro?.9:.65)+ease*(intro?.7:.45),radius=intro?100:95;
 const yaw=-s.yaw+angle,position=[s.x+Math.sin(yaw)*radius,s.y+(intro?32:18)+Math.sin(u*Math.PI)*8,s.z+Math.cos(yaw)*radius];
 return{position,target:[s.x,s.y+(intro?1:2),s.z],fov:intro?42:45};
}
