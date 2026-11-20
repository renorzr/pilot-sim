import {clamp,smooth,moveToward,RAD} from './constants.js';
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
export function stepAttitude(s,dt){
 // Simplified fly-by-wire rate servos retained for keyboard playability.
 // These change attitude only: all translation is integrated from forces.
 const authority=clamp((s.speed-20)/30,0,1);
 const pitch=s.autoPilot?clamp((s.guidance.pitch-s.pitch)*1.8,-.09,.09):s.stickPitch*.09;
 s.controls.pitchCommand=pitch;
 const desiredPitch=s.airborne||!s.landed||s.goAround?pitch*authority:0;
 s.pitchRate+=(desiredPitch-s.pitchRate)*smooth(dt,.14);
 if(s.landed&&!s.goAround){s.pitch=moveToward(s.pitch,0,dt*.035);s.pitchRate=0;s.noseWheelDown=s.pitch<.01;}
 else{s.pitch=clamp(s.pitch+s.pitchRate*dt,-.3,.40);if(!s.airborne)s.noseWheelDown=s.pitch<.01;}
 if(s.airborne){
  let command=s.autoPilot?clamp((s.guidance.roll-s.roll)*2,-.36,.36):s.stickRoll*.36;
  if(!s.autoPilot&&!s.stickRoll&&Math.abs(s.roll)>33*RAD)command=-Math.sign(s.roll)*.12;
  s.controls.rollCommand=command;s.rollRate+=(command*authority-s.rollRate)*smooth(dt,.12);
  s.roll=clamp(s.roll+s.rollRate*dt,-Math.PI/3,Math.PI/3);
 }else{s.rollRate=0;s.roll*=Math.exp(-dt*5);}
}
