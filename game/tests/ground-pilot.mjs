import {groundActive,groundFrozen,groundTarget,departureOf,skipTaxi} from '../src/missions/ground.js';
import {setLever,KT,clamp} from '../src/flight.js';
import {wrap} from '../src/sim/constants.js';
import {skipTaxiIn} from '../src/missions/taxi-in.js';
// Observes route geometry; all motion comes from the public lever/stick/brake.
export function groundPilot(s,{skip=false}={}){
 if(!groundActive(s))return null;
 const DEPARTURE=departureOf(s),stage=s.ground.stage;
 if(groundFrozen(s))return{};
 if(stage==='taxi'&&skip){skipTaxi(s);return{};}
 if(stage==='taxi-in'&&skip){skipTaxiIn(s);return{};}
 if(['holding','takeoff-clearance'].includes(stage)){setLever(s,0);return{brake:true};}
 const entry=stage==='lineup',end=s.ground.arrival?s.ground.stop:entry?DEPARTURE.lineup:DEPARTURE.hold,t=groundTarget(s),distance=Math.hypot(end.x-s.x,end.z-s.z),speed=s.airData.groundSpeed;
 const desired=distance<12?end.yaw:Math.atan2(t.x-s.x,-(t.z-s.z)),error=wrap(desired-s.yaw);
 const exitApproach=stage==='runway-exit'&&Math.abs(s.z-s.ground.points[1].z)>120&&s.ground.routeIndex===1;
 const stopOnStand=s.ground.arrival&&s.ground.routeIndex===s.ground.points.length-1&&distance<7&&Math.abs(wrap(end.yaw-s.yaw))<.18;
 const target=stopOnStand?0:Math.min((stage==='runway-exit'?(exitApproach?14:6):entry?6:s.ground.arrival?(distance<40?4:10):12)/KT,Math.sqrt(Math.max(0,distance-(s.ground.arrival?.4:4))*.65));
 const demand=(.25+speed*.006+clamp((target-speed)*.65,-1,1))*s.weight*1000/Math.max(s.propulsion.availableThrustN,1);
 setLever(s,clamp(demand,0,.18));
 const steer=clamp(error*1.9-s.yawRate*1.2,-.85,.85);
 return{stick:{pitch:0,roll:steer},brake:stopOnStand||distance<(s.ground.arrival?.8:8)||speed>target+.8};
}
