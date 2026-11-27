import {aircraftDefinition} from '../aircraft/registry.js';
import {AIRCRAFT_ADAPTERS} from '../aircraft/adapter-ids.js';
import {clamp,smooth,moveToward} from './constants.js';
export const createControls=()=>({rudder:0,rudderApplied:0,rudderTrim:0,rudderAssist:true,pitchCommand:0,rollCommand:0});
export function centerControls(s){s.stickPitch=0;s.stickRoll=0;s.controls.rudder=0;s.controls.rudderApplied=0;}
export function updateStick(s,input,dt){
 if(input.stick){s.stickPitch+=(clamp(input.stick.pitch,-1,1)-s.stickPitch)*smooth(dt,.035);s.stickRoll+=(clamp(input.stick.roll,-1,1)-s.stickRoll)*smooth(dt,.035);}
 else{
  const limit=input.precision?.4:1,rate=input.precision?.5:1.1;
  for(const[axis,command]of[['stickPitch',input.pitch||0],['stickRoll',input.steer||0]]){
   if(command)s[axis]=moveToward(s[axis],Math.sign(command)*limit,rate*dt);
   else{s[axis]*=Math.exp(-dt/.045);if(Math.abs(s[axis])<.005)s[axis]=0;}
  }
 }
 s.controls.rudder+=(clamp((input.rudder||0)+s.controls.rudderTrim,-1,1)-s.controls.rudder)*smooth(dt,.1);
 if(Math.abs(s.controls.rudder)<.001)s.controls.rudder=0;
}
function rateServo(s,dt,c){
 // Simplified fly-by-wire rate servos retained for keyboard playability.
 // These change attitude only: all translation is integrated from forces.
 const authority=clamp((s.speed-c.authorityMinSpeed)/c.authoritySpeedRange,0,1);
 const pitch=s.autoPilot?clamp((s.guidance.pitch-s.pitch)*c.apPitchGain,-c.pitchCommandRate,c.pitchCommandRate):s.stickPitch*c.pitchCommandRate;
 s.controls.pitchCommand=pitch;
 const desiredPitch=s.airborne||!s.landed||s.goAround?pitch*authority:0;
 s.pitchRate+=(desiredPitch-s.pitchRate)*smooth(dt,c.pitchTimeConstant);
 if(s.landed&&!s.goAround){s.pitch=moveToward(s.pitch,0,dt*.035);s.pitchRate=0;s.noseWheelDown=s.pitch<.01;}
 else{s.pitch=clamp(s.pitch+s.pitchRate*dt,c.pitchMin,c.pitchMax);if(!s.airborne)s.noseWheelDown=s.pitch<.01;}
 if(s.airborne){
  let command=s.autoPilot?clamp((s.guidance.roll-s.roll)*c.apRollGain,-c.rollCommandRate,c.rollCommandRate):s.stickRoll*c.rollCommandRate;
  if(!s.autoPilot&&!s.stickRoll&&Math.abs(s.roll)>c.bankReturnThreshold)command=-Math.sign(s.roll)*c.bankReturnRate;
  s.controls.rollCommand=command;s.rollRate+=(command*authority-s.rollRate)*smooth(dt,c.rollTimeConstant);
  s.roll=clamp(s.roll+s.rollRate*dt,-c.rollMax,c.rollMax);
 }else{s.rollRate=0;s.roll*=Math.exp(-dt*5);}
}

const controlLaws=Object.freeze({[AIRCRAFT_ADAPTERS.controls.rateServo]:rateServo});
export function stepAttitude(s,dt,d=aircraftDefinition(s)){const c=d.controls;return controlLaws[c.law](s,dt,c);}
