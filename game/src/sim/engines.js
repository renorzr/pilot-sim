import {AIRFRAME,G,clamp,smooth,massOf} from './constants.js';

export const createEngines=(initial=0)=>['left','right'].map((side,id)=>({id,side,status:'running',health:1,lever:null,command:initial,spool:initial,n1:25+initial*73,thrustN:0,maxThrustN:AIRFRAME.engineThrust}));
export const engineCapacity=(s,e)=>e.status==='running'?AIRFRAME.engineThrust*clamp(e.health,0,1)*Math.pow(s.airData.density/AIRFRAME.seaDensity,.7):0;
export const availableThrust=s=>s.engines.reduce((sum,e)=>sum+engineCapacity(s,e),0);
export function commandableThrust(s){
 const authority=s.autoThrust&&s.systems.autoThrustAvailable&&s.throttle>.025&&s.throttle<=.845?clamp(s.throttle/.78*.92,0,.92):s.throttle;
 return s.engines.reduce((sum,e)=>sum+engineCapacity(s,e)*clamp(e.lever??authority,0,1),0);
}
export function setEngineStatus(s,index,status){
 if(!['running','off','failed'].includes(status))throw new Error('Invalid engine status');
 const engine=s.engines[index];if(!engine)throw new Error('Invalid engine index');
 engine.status=status;
 // Operational restart procedures and a general manual fault editor are deferred.
 if(status!=='running'){engine.command=0;engine.thrustN=0;}
}
export function stepEngines(s,targetSpeed,dt){
 const capacity=availableThrust(s),a=s.airData;
 s.autoThrustActive=s.autoThrust&&s.systems.autoThrustAvailable&&s.throttle>.025&&s.throttle<=.845&&s.airborne&&!s.landed&&capacity>0;
 const ceiling=clamp(s.throttle/.78*.92,0,.92);
 const pathForce=massOf(s)*G*Math.sin(a.gamma);
 const acceleration=clamp((targetSpeed-a.ias)*.24,-1.5,1.5);
 const demand=s.autoThrustActive?clamp((a.drag+pathForce+massOf(s)*acceleration)/Math.max(capacity,1),0,ceiling):s.throttle;
 const reverse=s.reverse&&s.landed&&s.throttle<.025;
 for(const e of s.engines){
  const running=e.status==='running',lever=e.lever??(s.systems.thrustLocked?s.systems.heldCommands[e.id]:demand);
  e.command=running?clamp(reverse?.5:lever,0,s.ground&&!s.ground.takeoffCleared?.18:1):0;
  e.spool+=(e.command-e.spool)*smooth(dt,running?1.8:1.2);
  e.maxThrustN=engineCapacity(s,e);
  e.thrustN=running?e.spool*e.maxThrustN*(reverse?-.65:1):0;
  e.n1=running?25+e.spool*73:Math.max(e.spool*73,Math.min(a.tas*.12,12));
 }
 s.totalThrustN=s.engines.reduce((sum,e)=>sum+e.thrustN,0);
 s.thrust=Math.max(0,s.totalThrustN/(2*AIRFRAME.engineThrust));
 s.propulsion={availableThrustN:capacity,asymmetricMoment:(s.engines[0].thrustN-s.engines[1].thrustN)*AIRFRAME.engineArm,limited:s.autoThrust&&s.systems.autoThrustAvailable&&s.throttle>.025&&capacity<2*AIRFRAME.engineThrust*.65};
}
