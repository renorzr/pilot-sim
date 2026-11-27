// Deterministic control fixtures, separate from browser flight evidence. The
// reference values were captured before the aircraft-definition refactor.
import {createFlight,advanceFlight,toggleGear,beginGoAround,setEngineStatus,KT} from '../../src/flight.js';
const sample=s=>({time:s.time,x:s.x,y:s.y,z:s.z,speed:s.speed,verticalSpeed:s.verticalSpeed,pitch:s.pitch,roll:s.roll,yaw:s.yaw,pitchRate:s.pitchRate,rollRate:s.rollRate,yawRate:s.yawRate,gearPosition:s.gearPosition,flapPosition:s.flapPosition,velocity:{...s.velocity},lift:s.airData.lift,drag:s.airData.drag,alpha:s.airData.alpha,thrust:s.totalThrustN,engines:s.engines.map(e=>({status:e.status,spool:e.spool,n1:e.n1,thrustN:e.thrustN})),airborne:s.airborne,landed:s.landed,result:s.result?.title??null,water:s.water?{phase:s.water.phase,damage:s.water.damage,flooding:s.water.flooding,waterSpeed:s.water.waterSpeed}:null});
export function captureAircraftBaseline(){
 const output={};
 for(const name of ['takeoff','approach','single-engine','go-around','history','history-final']){
  const history=name.startsWith('history'),s=createFlight(name==='takeoff'?'takeoff':'landing',{...(history?{levelId:'history-us1549',historical:{decisionSeed:123,finalApproach:name==='history-final'}}:{}),scenario:name==='single-engine'?'full':'short',pilotVoice:'h',towerVoice:'g',weather:{seed:23}});
  if(name==='approach')s.autoPilot=true;
  if(name==='single-engine')setEngineStatus(s,0,'failed');
  if(name==='go-around'){beginGoAround(s);s.autoPilot=true;}
  const snapshots=[sample(s)],steps=history?6000:name==='takeoff'?9000:4000;
  for(let i=0;i<steps;i++){
   const t=i*.01;let input={};
   if(name==='takeoff'){input={throttle:s.throttle<.9?1:0,pitch:s.speed*KT>125&&s.pitch<.20?.6:0};if(s.airborne&&s.gear)toggleGear(s);}
   if(name==='single-engine')input={pitch:t>4&&t<8?.15:0,rudder:t>2&&t<5?.1:0};
   if(name==='go-around'&&s.airborne&&s.verticalSpeed>1&&s.gear)toggleGear(s);
   if(name==='history-final')input={stick:{pitch:Math.max(-1,Math.min(1,(.15-s.pitch)*2)),roll:Math.max(-1,Math.min(1,-s.roll*2))}};
   advanceFlight(s,input,.01);
   if((i+1)%1000===0)snapshots.push(sample(s));
   if(s.result)break;
  }
  snapshots.push(sample(s));output[name]=snapshots;
 }
 return output;
}
