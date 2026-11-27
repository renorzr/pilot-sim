import {setDetent,toggleGear,toggleReverse,confirmAction,clamp,KT} from '../../src/flight.js';
import {pilotInput} from '../pilot.mjs';
// Deterministic control-path fixture. It never assigns aircraft motion/results.
export function a380PilotInput(s){
 if(s.mission.kind==='landing'){
  const input=pilotInput(s);
  if(s.landed&&!s.reverse&&s.throttle<.025)toggleReverse(s);
  return input;
 }
 if(s.throttle<.99)setDetent(s,'TOGA');
 if(s.mission.triggered&&!s.mission.acknowledged)confirmAction(s);
 if(!s.airborne)return{stick:{pitch:s.speed*KT>=150?clamp((.18-s.pitch)*10-s.pitchRate*3,0,.8):0,roll:0}};
 if(s.gear&&s.verticalSpeed>.5)toggleGear(s);
 const pitch=s.mission.triggered?s.guidance.pitch:.18;
 return{stick:{pitch:clamp((pitch-s.pitch)*10-s.pitchRate*3,-.7,.7),roll:clamp(-s.roll*8-s.rollRate*3,-.7,.7)}};
}
