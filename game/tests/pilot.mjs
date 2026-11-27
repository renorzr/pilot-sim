import {canSkipCruise,arrivalPreview} from '../src/missions/airline.js';
import {skipCruise} from '../src/flight.js';
import {groundPilot} from './ground-pilot.mjs';
import {trimAlpha} from '../src/sim/aerodynamics.js';
// Test pilot: observes flight/visual geometry and uses the public control path.
// It does not assign aircraft position, velocity or a successful result.
import {advanceFlight,radioAltitude,clamp,toggleGear,stepFlaps,setDetent,setLever,toggleAP,toggleApproach,confirmAction,confirmChecklist,beginGoAround,targetSpeed,KT} from '../src/flight.js';
import {holdConfiguration} from '../src/missions/runtime.js';
export function pilotInput(s,{skip=true}={}){
 if(arrivalPreview(s))return{};if(skip&&canSkipCruise(s)){skipCruise(s);return{};}
 if(!skip&&s.airline&&s.airborne&&s.flaps>0&&s.mode!=='landing'&&radioAltitude(s)>500&&Math.abs(s.flapPosition-s.flaps)<.05)stepFlaps(s,-1);
 if(s.airline&&s.airborne&&s.mode==='takeoff'&&radioAltitude(s)>500&&s.throttle>.845)setDetent(s,'CL');
 const ground=groundPilot(s,{skip:true});if(ground)return ground;
 const kind=s.mission?.kind,ra=radioAltitude(s),route=s.route,preFinal=route?.active&&!route.inFinal;
 if(s.mission?.fault&&!s.mission.acknowledged)confirmAction(s);
 if(!s.airborne&&!s.landed){if(s.throttle<.9)setDetent(s,'TOGA');return {pitch:s.speed*KT>=125&&s.pitch<.20?1:0};}
 if(s.mode==='takeoff'&&!s.landed&&s.gear&&s.verticalSpeed>.5)toggleGear(s);
 if(kind==='takeoff'&&s.airborne)return{stick:{pitch:clamp((.22-s.pitch)*8-s.pitchRate*3,-.5,.5),roll:clamp(-s.roll*5,-.5,.5)}};
 if(s.landed&&s.goAround)return{stick:{pitch:clamp((.18-s.pitch)*10-s.pitchRate*3,-.6,.6),roll:clamp(-s.x*.03-s.velocity.x*.12-Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw))*.5,-.4,.4)},brake:false};
 if(preFinal){
  if(s.gear&&s.verticalSpeed>.5)toggleGear(s);
  if(ra>300&&s.throttle>.85)setDetent(s,'CL');
  if(route.index>=2&&s.flaps<2)stepFlaps(s,1);
  if(route.index>=3){if(!s.gear)toggleGear(s);if(s.flaps<s.landingConfig)stepFlaps(s,1);s.spoilersArmed=true;s.autoBrake='MED';if(s.gearPosition>.98&&Math.abs(s.flapPosition-s.landingConfig)<.05)confirmChecklist(s);}
 }

 if(kind==='flap-jam'&&s.mission.triggered&&!s.landingChecklistConfirmed)confirmChecklist(s);
 if((kind==='goaround'||kind==='windshear')&&s.mission.triggered&&!s.goAround&&s.mission.recovery?.stage!=='return')beginGoAround(s);
 if(kind==='low-visibility'&&s.mission.triggered&&!s.goAround&&s.mission.recovery?.stage!=='return')beginGoAround(s);
 if(s.goAround&&!holdConfiguration(s)){
  if(s.verticalSpeed>.5&&s.gear)toggleGear(s);
  if(s.flaps>1&&Math.abs(s.flapPosition-s.flaps)<.05&&s.speed*KT>150)stepFlaps(s,-1);
  if(ra>s.goAroundStartAltitude+300)setDetent(s,'CL');
 }
 if(s.mode==='landing'&&!s.goAround&&!preFinal){
  if(kind==='dual-glide'){
   if(s.mission.triggered)setDetent(s,'IDLE');
   if(s.z<3000&&!s.gear)toggleGear(s);if(s.z<2000&&s.flaps<1)stepFlaps(s,1);
  }else{
   if(s.scenario==='full'||s.arrival){
    if(!s.apprArmed&&s.systems.ils.localizer)toggleApproach(s);
    if(s.z<14800&&s.flaps<2)stepFlaps(s,1);if(s.z<11000&&!s.gear)toggleGear(s);
    if(s.z<9250&&s.flaps<3)stepFlaps(s,1);if(s.z<7400&&s.flaps<s.landingConfig)stepFlaps(s,1);
    if(s.z<7400){s.spoilersArmed=true;s.autoBrake='MED';if(s.gearPosition>.98&&Math.abs(s.flapPosition-s.landingConfig)<.05)confirmChecklist(s);}
   }
   if(ra<20)setDetent(s,'IDLE');
  }
 }
   if(kind==='athr-failure'&&s.mission.triggered&&ra>22){
    if(s.systems.thrustLocked)setLever(s,s.systems.heldCommands.reduce((a,b)=>a+b,0)/2);
    const desiredVS=s.goAround?clamp((2.8+s.selectedAltitude/3.28084-s.y)*.15,0,8):preFinal?clamp((2.8+s.route.targetAltitude/3.28084-s.y)*.15,-5,7):null;
    const force=s.airData.drag+s.weight*1000*9.80665*(desiredVS===null?Math.sin(s.airData.gamma):desiredVS/Math.max(s.airData.tas,20))+s.weight*1000*clamp((targetSpeed(s)/KT-s.speed)*.28,-1.5,1.5);
    setLever(s,clamp(force/Math.max(s.propulsion.availableThrustN,1),0,.65));
   }
 if(s.landed)return{brake:true,steer:clamp(-s.x*.03-s.velocity.x*.12-Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw))*.5,-.5,.5)};
 let pitch=s.guidance.pitch,roll=s.guidance.roll;
 if(kind==='athr-failure'&&s.mission.triggered&&(s.goAround||preFinal)){const vs=clamp((2.8+(s.goAround?s.selectedAltitude:s.route.targetAltitude)/3.28084-s.y)*.15,s.goAround?0:-5,s.goAround?8:7);pitch=trimAlpha(s)+Math.atan2(vs-s.airData.wind.y,Math.max(s.airData.horizontal,20))+(vs-s.verticalSpeed)*.009;}
 if(kind==='ils-loss'&&s.mission.triggered&&!s.goAround&&!preFinal){
  const path=2.8+15.24+Math.tan(3*Math.PI/180)*Math.max(s.z,0),vs=-(s.airData.groundSpeed)*Math.tan(3*Math.PI/180)+(path-s.y)*.16;
  pitch=(s.weight*1000*9.80665/(.5*1.225*s.speed*s.speed*122.6)-(.30+.175*s.flapPosition))/5.8+Math.atan2(vs,s.airData.horizontal)+(vs-s.verticalSpeed)*.009;
  roll=clamp((-Math.atan2(s.x,Math.max(s.z*.35,600))-s.yaw)*2,-.25,.25);
 }
 if(ra<(kind==='dual-glide'?80:30)&&!s.goAround&&s.mode==='landing')pitch=Math.max(pitch,.10);
 const rudder=kind==='crosswind'&&ra<50?clamp(-s.yaw*5-s.yawRate*3,-.65,.65):0;
 if(kind==='crosswind'&&ra<50)roll=clamp(-s.x*.006-s.velocity.x*.02,-.12,.12);
 return {stick:{pitch:clamp((pitch-s.pitch)*10-s.pitchRate*3,-.7,.7),roll:clamp((roll-s.roll)*8-s.rollRate*3,-.7,.7)},rudder};
}
export function flyLevel(s,max=1200){for(let i=0;i<max*50&&!s.result;i++)advanceFlight(s,pilotInput(s),.02);return s;}
