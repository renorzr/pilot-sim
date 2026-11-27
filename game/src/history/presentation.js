import {clamp,FT,KT,RAD} from '../sim/constants.js';
import {refreshAirData,setMotion,trimAlpha} from '../sim/aerodynamics.js';
import {stepEngines} from '../sim/engines.js';
import {updateStick,stepAttitude} from '../sim/controls.js';
import {stepDynamics} from '../sim/dynamics.js';
import {createRescueMedia,advanceRescueMedia} from './rescue-media.js';
import {advanceFlight} from '../flight.js';
import {updateRadio} from '../comms/radio.js';
import {queueHistoricalOpening,historicalOpeningSeconds} from './media.js';
function visualCopy(s){const{checkpoint,...state}=s;return structuredClone(state);}
export const HISTORICAL_STRIKE_HOLD_SECONDS=2;
function normalStep(v){
 v.time+=.01;refreshAirData(v);
 const pitch=trimAlpha(v)+Math.atan2(10,Math.max(30,v.airData.horizontal))+(10-v.verticalSpeed)*.006;
 updateStick(v,{pitch:clamp((pitch-v.pitch)*3.2-v.pitchRate*2,-1,1),steer:clamp(-v.roll*2-v.rollRate,-1,1)},.01);
 stepEngines(v,219/KT,.01);stepAttitude(v,.01);stepDynamics(v,.01);updateRadio(v);
}
export function createHistoricalIntro(s){
 if(!s.historical||s.mission.practice)return null;
 const strikeAt=historicalOpeningSeconds(s),duration=strikeAt+HISTORICAL_STRIKE_HOLD_SECONDS,v=visualCopy(s);v.presentationKind='intro';v.time=-strikeAt;v.x-=v.velocity.x*strikeAt;v.z-=v.velocity.z*strikeAt;v.y-=v.velocity.y*strikeAt;
 v.systems.autoThrustAvailable=true;v.autoThrust=true;v.autoPilot=false;v.throttle=.78;v.aerodynamics=null;
 for(const e of v.engines)Object.assign(e,{status:'running',health:1,irrecoverable:false,spool:.48,n1:60,damageCause:null});
 v.radio.active=null;v.radio.pending=[];v.radio.history=[];v.historical.crew.birdAt=null;
 setMotion(v,{speed:s.speed,verticalSpeed:s.verticalSpeed,yaw:s.yaw});v.pitch=trimAlpha(v)+v.airData.gamma;
 // Align only the private preview's integrated track with the source-backed
 // bird location. Never move the actual aircraft to fit a presentation.
 const probe=visualCopy(v);for(let i=0;i<Math.round(strikeAt*100);i++)normalStep(probe);
 v.x+=s.x-probe.x;v.y+=s.y-probe.y;v.z+=s.z-probe.z;
 queueHistoricalOpening(v);
 return{kind:'history-intro',active:true,elapsed:0,duration,strikeAt,phase:'normal',struck:false,visual:v,strikeFlight:visualCopy(s),accumulator:0,strikeAccumulator:0};
}
export function skipHistoricalPrelude(p){if(p?.active&&p.kind==='history-intro'&&!p.struck){p.elapsed=p.strikeAt;p.skipNormal=true;return true;}return false;}
export function createHistoricalRescue(s){
 if(!s.historical||!s.result?.physicalSuccess||!s.water||s.water.fatal)return null;
 const v=visualCopy(s);v.presentationKind='rescue';
 const media=createRescueMedia(s);if(!media)return null;
 v.radio.active=null;v.radio.pending=[];
 return{...media,kind:'history-rescue',active:true,visual:v,baseTime:s.time};
}
export function advanceHistoricalPresentation(p,dt,playing=true,{media,flight,onStep}={}){
 if(!p?.active||!p.kind?.startsWith('history-'))return false;
 if(!playing)return true;const step=Math.max(0,Math.min(p.duration-p.elapsed,.5,Number.isFinite(dt)?dt:0));
 const previous=p.elapsed;if(p.kind==='history-rescue')advanceRescueMedia(p,step,media);else p.elapsed=Math.min(p.duration,p.elapsed+step);
 if(p.kind==='history-intro'){
  const normal=Math.max(0,Math.min(p.elapsed,p.strikeAt)-Math.min(previous,p.strikeAt));p.accumulator+=normal;
  while(p.accumulator>=.01-1e-9){p.accumulator-=.01;normalStep(p.visual);}
  if(p.elapsed>=p.strikeAt){
   if(!p.struck){p.struck=true;p.phase='bird-strike';p.visual=flight||p.strikeFlight;p.strikeFlight=null;onStep?.(p.visual);}
   p.strikeAccumulator+=Math.max(0,p.elapsed-Math.max(previous,p.strikeAt));
   while(p.strikeAccumulator>=.01-1e-9){p.strikeAccumulator-=.01;advanceFlight(p.visual,{},.01);onStep?.(p.visual);}
  }
 }else p.visual.time=p.baseTime+p.elapsed;
 if(p.elapsed>=p.duration-1e-9)p.active=false;return true;
}
export const historicalPresentationVisual=p=>p?.active&&p.kind?.startsWith('history-')?p.visual:null;
export function historicalCamera(s,{kind,elapsed,duration}){
 const u=clamp(elapsed/duration,0,1),ease=u*u*(3-2*u),intro=kind==='history-intro',angle=(intro?.9:.65)+ease*(intro?.7:.45),radius=intro?100:95;
 const yaw=-s.yaw+angle,position=[s.x+Math.sin(yaw)*radius,s.y+(intro?32:18)+Math.sin(u*Math.PI)*8,s.z+Math.cos(yaw)*radius];
 return{position,target:[s.x,s.y+(intro?1:2),s.z],fov:intro?42:45};
}
