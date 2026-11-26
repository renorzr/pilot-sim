import {canSkipCruise} from '../missions/airline.js';
import {skipCruise} from '../flight.js';
import {createRadio,queueRadio,updateRadio} from '../comms/radio.js';
import {CRUISE_CAMERA_TIMING,sampleCruiseCamera} from './cruise-camera-track.js';

export const CRUISE_TRANSITION=Object.freeze({follow:CRUISE_CAMERA_TIMING.hold,fadeStart:CRUISE_CAMERA_TIMING.fadeStart,duration:CRUISE_CAMERA_TIMING.duration,fadeIn:.8});
let sequence=0;
// Presentation time is separate from simulation time. The visible aircraft
// continues along its measured inertial velocity; the assessed flight stays
// frozen at the qualified cut until the source scene is completely black.
export function createCruiseTransition(flight,{automatic=false}={}){
 if(!canSkipCruise(flight))return null;
 const source={...flight},radio=createRadio({pilotVoice:flight.radio.pilotVoice,towerVoice:flight.radio.towerVoice,towerVoices:flight.radio.towerVoices,airportId:flight.airportId});radio.language=flight.radio.language;
 queueRadio({...source,radio},'cruise-climb');
 // Speech keeps its normal tempo independently of the camera. If necessary,
 // finish the exchange under black before replacing the source airport.
 radio.presentationRate=1;
 updateRadio({...source,radio});
 return{id:++sequence,active:true,automatic,phase:'follow',elapsed:0,phaseElapsed:0,opacity:0,source,radio,committed:false};
}
export function cruiseVisualFlight(p){
 if(!p||p.committed)return null;
 const s=p.source,v=s.velocity;
 return{...s,time:s.time+p.elapsed,x:s.x+v.x*p.elapsed,y:s.y+v.y*p.elapsed,z:s.z+v.z*p.elapsed,radio:p.radio};
}
export function advanceCruiseTransition(p,dt,{ready=false,visible=true,media=null}={}){
 if(!p?.active||!visible)return null;
 const step=Math.max(0,Math.min(.5,Number.isFinite(dt)?dt:0));p.elapsed+=step;p.phaseElapsed+=step;
 if(!p.committed){
  // Small queue steps preserve measured radio gaps even at a low render FPS.
  const start=p.elapsed-step;
  for(let t=start;t<p.elapsed;){
   t=Math.min(p.elapsed,t+1/60);const time=p.source.time+t,active=p.radio.active;
   // In the browser, media completion also covers buffering and decoder delay.
   // Headless callers and muted/unsupported audio retain measured clip timing.
   if(active&&media&&!media.bypass){
    const ended=media.clip===active.clip&&media.started===active.started&&media.ended;
    active.until=ended?Math.min(active.until,time):Math.max(active.until,time+1/60);
   }
   updateRadio({time,radio:p.radio});
  }
 }
 if(p.phase==='follow'&&p.elapsed>=CRUISE_TRANSITION.follow){p.phase='depart';p.phaseElapsed=0;}
 if(p.phase==='depart'&&p.elapsed>=CRUISE_TRANSITION.fadeStart){p.phase='fadeout';p.phaseElapsed=0;}
 if(p.phase==='fadeout'){
  p.opacity=sampleCruiseCamera(p.elapsed).opacity;
  if(p.opacity===1){p.phase='black';p.phaseElapsed=0;return 'commit';}
 }else if(p.phase==='black'&&p.committed&&ready){p.phase='fadein';p.phaseElapsed=0;}
 else if(p.phase==='fadein'){
  p.opacity=Math.max(0,1-p.phaseElapsed/CRUISE_TRANSITION.fadeIn);
  if(p.opacity===0){p.phase='done';p.active=false;return 'done';}
 }
 return null;
}
export function commitCruiseTransition(p,flight){
 if(!p?.active||p.phase!=='black'||p.opacity!==1||p.committed||!canSkipCruise(flight))return false;
 if(p.radio.active||p.radio.pending.length||p.source.time+p.elapsed<p.radio.readyAt)return false;
 flight.radio.history.push(...p.radio.history);flight.radio.history=flight.radio.history.slice(-12);flight.radio.fired['cruise-climb']=true;
 if(!skipCruise(flight,{automatic:p.automatic}))return false;
 p.committed=true;return true;
}
