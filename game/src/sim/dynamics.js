import {aircraftDefinition} from '../aircraft/registry.js';
import {G,RUNWAY,clamp,smooth,massOf} from './constants.js';
import {refreshAirData} from './aerodynamics.js';

export function stepDynamics(s,dt){
 const d=aircraftDefinition(s),a=refreshAirData(s),m=massOf(s),cp=Math.cos(s.pitch),sp=Math.sin(s.pitch);
 const heading={x:Math.sin(s.yaw),z:-Math.cos(s.yaw)},right={x:Math.cos(s.yaw),z:Math.sin(s.yaw)};
 const thrust=s.totalThrustN;
 const cg=Math.cos(a.gamma),sg=Math.sin(a.gamma),ct=Math.cos(a.track),st=Math.sin(a.track);
 const up={x:-sg*st,y:cg,z:sg*ct},airRight={x:ct,y:0,z:st};
 const airUnit={x:cg*st,y:sg,z:-cg*ct};
 const rudderGain=a.q*d.airframe.wingArea*(d.airframe.rudderMomentFactor??2.1);
 const engineMoment=s.propulsion.asymmetricMoment;
 const assist=s.controls.rudderAssist&&Math.abs(s.controls.rudder)<.02?clamp(-engineMoment/Math.max(rudderGain,1)-a.beta*2,-.8,.8):0;
 const rudder=clamp(s.controls.rudder+assist,-1,1);
 s.controls.rudderApplied=rudder;
 const lift=s.airborne||!s.spoilersDeployed?a.lift:a.lift*.12;
 const side=a.q*d.airframe.wingArea*(.8*a.beta-.04*rudder);
 const force={x:thrust*cp*heading.x-a.drag*airUnit.x,y:thrust*sp-a.drag*airUnit.y-m*G,z:thrust*cp*heading.z-a.drag*airUnit.z};
 for(const axis of ['x','y','z'])force[axis]+=lift*(up[axis]*Math.cos(s.roll)+airRight[axis]*Math.sin(s.roll))+side*airRight[axis];
 const turnRate=lift*Math.sin(s.roll)/(m*Math.max(a.horizontal,15));
 const yawAccel=(engineMoment+rudder*rudderGain)/d.airframe.yawInertia;
 if(s.airborne){
  s.yawRate+=((turnRate-s.yawRate)*2-a.beta*1.4+yawAccel)*dt;
  s.yaw+=s.yawRate*dt;
  for(const axis of ['x','y','z'])s.velocity[axis]+=force[axis]/m*dt;
 }else{
  const mu=s.weather.runwayFriction;
  const steer=clamp(s.stickRoll+s.controls.rudder,-1,1),ground=a.groundSpeed;
  const taxi=!!s.ground&&!s.ground.takeoffCleared;
  const desired=taxi?clamp(ground/12*Math.tan(steer*.65),-.35,.35):steer*.13*clamp(ground/35,0,1);
  if(taxi)s.ground.steering=steer;
  s.yawRate+=(desired-s.yawRate)*smooth(dt,.15)+yawAccel*dt;
  s.yaw+=s.yawRate*dt;
  s.spoilersDeployed=s.landed&&!s.goAround&&s.spoilersArmed&&(s.throttle<.025||s.reverse);
  s.autoBrakeActive=s.landed&&s.spoilersDeployed&&s.autoBrake!=='OFF'&&!s.brake;
  const brake=s.brake?6:s.autoBrakeActive?(s.autoBrake==='MED'?3:1.8):0;
  const normal=Math.max(.15*m*G,m*G-Math.max(0,lift));
  const resistance=Math.min((brake+.25+ground*.006)*m,mu*normal);
  if(ground>.01){force.x-=resistance*s.velocity.x/ground;force.z-=resistance*s.velocity.z/ground;}
  const sideways=s.velocity.x*right.x+s.velocity.z*right.z;
  const grip=clamp(-sideways*m*2,-mu*normal*.8,mu*normal*.8);
  force.x+=grip*right.x;force.z+=grip*right.z;
  s.velocity.x+=force.x/m*dt;s.velocity.z+=force.z/m*dt;s.velocity.y=0;
  // Wheel contact supplies the vertical reaction; brake/rolling friction cannot
  // pull a stopped aircraft backwards. Reverse is a stopping aid in this game.
  const forward=s.velocity.x*heading.x+s.velocity.z*heading.z;
  if((ground<.15&&thrust<resistance+16000)||(forward<0&&thrust<=resistance))s.velocity.x=s.velocity.z=0;
  if((!s.ground||s.ground.takeoffCleared)&&(!s.landed||s.goAround)&&s.pitch>.05&&force.y>m*G*.01){
   s.airborne=true;s.landed=false;s.noseWheelDown=false;s.y=d.airframe.referenceHeight+.04;s.velocity.y=.15;
   if(s.touchAndGo&&s.touchAndGo.liftOffAt===null){s.touchAndGo.liftOffAt=s.time;s.touchdown=null;s.cabin.noseAt=null;}
  }
 }
 s.x+=s.velocity.x*dt;s.y+=s.velocity.y*dt;s.z+=s.velocity.z*dt;
 s.forces={x:force.x,y:force.y,z:force.z,liftN:lift,dragN:a.drag,thrustN:thrust,weightN:m*G};
 refreshAirData(s);
}
