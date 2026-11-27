import {G,SEA_LEVEL_DENSITY,clamp,smooth,massOf} from './constants.js';
import {aircraftDefinition} from '../aircraft/registry.js';

export const createEngines=(initial=0,source)=>{
 const d=aircraftDefinition(source),p=d.propulsion;
 return d.engines.map(({id,side,maxThrustN})=>({id,side,status:'running',health:1,lever:null,command:initial,spool:initial,n1:p.idleN1+initial*p.n1Range,thrustN:0,maxThrustN}));
};
export const engineCapacity=(s,e,d=aircraftDefinition(s))=>e.status==='running'&&!e.irrecoverable?d.engines[e.id??0].maxThrustN*clamp(e.health,0,1)*Math.pow(s.airData.density/SEA_LEVEL_DENSITY,d.propulsion.densityExponent):0;
export const availableThrust=(s,d=aircraftDefinition(s))=>s.engines.reduce((sum,e)=>sum+engineCapacity(s,e,d),0);
const nominal=d=>d.engines.reduce((sum,e)=>sum+e.maxThrustN,0);
// Group equal arms so the original twin's (left-right)*arm arithmetic is
// retained. This also supports centreline, rear-mounted and multi-engine layouts.
const moments=new WeakMap();
export function engineYawMoment(engines,layout){
 let groups=moments.get(layout);
 if(!groups){const map=new Map();for(const e of layout){const arm=Math.abs(e.yawArmM);if(!map.has(arm))map.set(arm,{arm,positive:[],negative:[]});map.get(arm)[e.yawArmM>=0?'positive':'negative'].push(e.id);}groups=[...map.values()];moments.set(layout,groups);}
 return groups.reduce((sum,g)=>sum+(g.positive.reduce((n,i)=>n+(engines[i]?.thrustN||0),0)-g.negative.reduce((n,i)=>n+(engines[i]?.thrustN||0),0))*g.arm,0);
}
export function commandableThrust(s){
 const d=aircraftDefinition(s),t=d.thrust;
 const authority=s.autoThrust&&s.systems.autoThrustAvailable&&s.throttle>t.idleThreshold&&s.throttle<=t.autoLeverMax?clamp(s.throttle/t.climbLever*t.autoCommandMax,0,t.autoCommandMax):s.throttle;
 return s.engines.reduce((sum,e)=>sum+engineCapacity(s,e,d)*clamp(e.lever??authority,0,1),0);
}
export function setEngineStatus(s,index,status){
 if(!['running','off','failed'].includes(status))throw new Error('Invalid engine status');
 const engine=s.engines[index];if(!engine)throw new Error('Invalid engine index');
 if(engine.irrecoverable&&status==='running')return false;
 engine.status=status;
 if(status!=='running'){engine.command=0;engine.thrustN=0;}
}
export function stepEngines(s,targetSpeed,dt,d=aircraftDefinition(s)){
 const p=d.propulsion,t=d.thrust,capacity=availableThrust(s,d),a=s.airData,totalCapacity=nominal(d);
 s.autoThrustActive=s.autoThrust&&s.systems.autoThrustAvailable&&s.throttle>t.idleThreshold&&s.throttle<=t.autoLeverMax&&s.airborne&&!s.landed&&capacity>0;
 const ceiling=clamp(s.throttle/t.climbLever*t.autoCommandMax,0,t.autoCommandMax);
 const pathForce=massOf(s,d)*G*Math.sin(a.gamma);
 const acceleration=clamp((targetSpeed-a.ias)*.24,-1.5,1.5);
 const demand=s.autoThrustActive?clamp((a.drag+pathForce+massOf(s,d)*acceleration)/Math.max(capacity,1),0,ceiling):s.throttle;
 const reverse=s.reverse&&s.landed&&s.throttle<t.idleThreshold;
 for(const e of s.engines){
  const running=e.status==='running',lever=e.lever??(s.systems.thrustLocked?s.systems.heldCommands[e.id]:demand),reversing=reverse&&d.engines[e.id].reverseAvailable!==false;
  e.command=running?clamp(reverse?(reversing?p.reverseCommand:0):lever,0,s.ground&&!s.ground.takeoffCleared?t.taxiLeverMax:1):0;
  e.spool+=(e.command-e.spool)*smooth(dt,running?p.runningTimeConstant:p.failedTimeConstant);
  e.maxThrustN=engineCapacity(s,e,d);
  e.thrustN=running?e.spool*e.maxThrustN*(reversing?p.reverseFactor:1):0;
  e.n1=running?p.idleN1+e.spool*p.n1Range:Math.max(e.spool*p.n1Range,Math.min(a.tas*p.windmillGain,p.windmillMaxN1));
 }
 s.totalThrustN=s.engines.reduce((sum,e)=>sum+e.thrustN,0);
 s.thrust=Math.max(0,s.totalThrustN/totalCapacity);
 s.propulsion={availableThrustN:capacity,asymmetricMoment:engineYawMoment(s.engines,d.engines),limited:s.autoThrust&&s.systems.autoThrustAvailable&&s.throttle>t.idleThreshold&&capacity<totalCapacity*p.limitedCapacityRatio};
}
