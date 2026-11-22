import daxing from '../airports/data/daxing-arrival.json' with {type:'json'};
import xiaoshan from '../airports/data/xiaoshan-arrival.json' with {type:'json'};
import changi from '../airports/data/changi-arrival.json' with {type:'json'};
import kansai from '../airports/data/kansai-arrival.json' with {type:'json'};
import jfk from '../airports/data/jfk-arrival.json' with {type:'json'};
import lax from '../airports/data/lax-arrival.json' with {type:'json'};
import {runwayOf} from '../airports/registry.js';
import {KT,RAD,wrap} from '../sim/constants.js';
import {centerControls} from '../sim/controls.js';
import {queueRadio,clearRadioEvents,repeatRadio} from '../comms/radio.js';
import {preparedAtTouchdown} from './arrival.js';
export const ARRIVAL_TAXI={daxing,xiaoshan,changi,kansai,jfk,lax};
export const taxiInActive=s=>!!s.ground?.arrival&&!s.airborne;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function initializeTaxiIn(s,score){
 if(!s.airline?.cruiseSkipped||!s.landed||s.goAround||s.result||s.ground?.arrival||s.airData.groundSpeed*KT>18||s.throttle>.025)return false;
 const pack=ARRIVAL_TAXI[s.airportId],available=pack.exits.filter(e=>e.z<s.z-55);
 const forward=available.filter(e=>e.points.slice(1).find(p=>distance(p,e.points[0])>25)?.z<e.z+20);
 const exit=forward[0]||available[0]||pack.exits.filter(e=>e.z<s.z+30).at(-1);
 if(!exit)return false; // Missed every exit: ordinary runway-overrun rules remain.
 const points=[{x:s.x,z:s.z,name:'着陆滑跑'},...structuredClone(exit.points)];
 s.airline.landingEvidence={score,valid:preparedAtTouchdown(s)&&s.gates.length===2&&s.gates.every(g=>g.passed&&!g.preset),touchdown:structuredClone(s.touchdown),gates:structuredClone(s.gates)};
 s.ground={arrival:true,stage:'runway-exit',since:s.time,stand:pack.stand.ref,stop:structuredClone(pack.stand),exit:exit.ref,points,routeIndex:1,distance:0,steering:0,takeoffCleared:false,entryCleared:false,runwayVacated:false,skipped:false,skippedSeconds:0,offRouteSeconds:0,overspeedSeconds:0,lastReminder:-100,alignedSeconds:0};
 s.airline.phase='taxi-in';s.phase='runway-exit';s.autoPilot=s.autoThrust=false;s.reverse=false;s.spoilersArmed=s.spoilersDeployed=s.autoBrakeActive=false;s.autoBrake='OFF';
 if(!s.systems.flapsJammed)s.flaps=0;
 clearRadioEvents(s,'atc-');queueRadio(s,'runway-exit');return true;
}
const inLandingRunway=s=>{const r=runwayOf(s);return Math.abs(s.x)<r.width/2+25&&s.z<=5&&s.z>=-r.length;};
export function canSkipTaxiIn(s){return taxiInActive(s)&&s.ground.stage==='taxi-in'&&s.ground.runwayVacated&&!inLandingRunway(s)&&!s.result;}
function park(s){
 const g=s.ground;g.stage='parking';g.since=s.time;s.phase='parking';s.throttle=0;s.reverse=false;s.brake=true;s.velocity.x=s.velocity.z=0;centerControls(s);
 s.engines.forEach(e=>{if(e.status==='running')e.status='off';});
 clearRadioEvents(s,'arrival-taxi');clearRadioEvents(s,'ground-speed');queueRadio(s,'parked');
}
export function skipTaxiIn(s){
 if(!canSkipTaxiIn(s))return false;
 const g=s.ground;let remaining=distance(s,g.points[g.routeIndex]);for(let i=g.routeIndex;i<g.points.length-1;i++)remaining+=distance(g.points[i],g.points[i+1]);
 g.skipped=true;g.skippedSeconds=remaining/(12/KT);s.time+=g.skippedSeconds;
 // Explicit labelled user-requested cut; normal surface motion stays physical.
 Object.assign(s,{x:g.stop.x,z:g.stop.z,yaw:g.stop.yaw,pitch:0,roll:0});g.routeIndex=g.points.length-1;park(s);return true;
}
export function beforeTaxiInPhysics(s,dt){
 if(!taxiInActive(s)||s.ground.stage!=='parking')return false;
 s.brake=true;s.throttle=0;
 const r=s.radio,done=r.fired.parked&&r.active?.event!=='parked'&&!r.pending.some(l=>l.event==='parked');
 if(done&&s.time-s.ground.since>3){s.ground.stage='parked';s.result={success:true,title:'航班执飞完成',detail:'已停靠分配机位。',score:s.airline.landingEvidence.score};}
 return true;
}
export function afterTaxiInPhysics(s,previous,dt,{checkpoint}){
 if(!taxiInActive(s)||s.result||s.ground.stage==='parking'||s.ground.stage==='parked')return;
 const g=s.ground,ps=g.points,speed=s.airData.groundSpeed*KT;g.distance+=distance(s,previous);
 if(g.runwayVacated&&inLandingRunway(s)){repeatRadio(s,'ground-stop',{priority:2});s.result={success:false,title:'未经许可进入跑道',detail:'沿地面导航低速滑行；脱离跑道后可选择跳过剩余滑行。'};return;}
 while(g.routeIndex<ps.length-1&&distance(s,ps[g.routeIndex])<13)g.routeIndex++;
 if(!g.runwayVacated&&Math.abs(s.x)>runwayOf(s).width/2+40){g.runwayVacated=true;g.stage='taxi-in';g.since=s.time;s.phase='taxi-in';clearRadioEvents(s,'runway-exit');queueRadio(s,'arrival-taxi');checkpoint(s,'跑道已脱离 · 滑行至机位或跳过');}
 g.overspeedSeconds=speed>25?g.overspeedSeconds+dt:0;
 if(speed>18&&s.time-g.lastReminder>20){g.lastReminder=s.time;repeatRadio(s,'ground-speed',{priority:1});}
 const nearest=Math.min(...ps.slice(1).map((b,i)=>{const a=ps[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((s.x-a.x)*dx+(s.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(s.x-a.x-dx*t,s.z-a.z-dz*t);}));
 g.offRouteSeconds=nearest>42?g.offRouteSeconds+dt:0;
 if(g.offRouteSeconds>2||g.overspeedSeconds>4){s.result={success:false,title:g.offRouteSeconds>2?'偏离滑行道':'滑行速度过高',detail:'沿地面导航低速滑行；脱离跑道后可选择跳过剩余滑行。'};return;}
 const atStand=g.runwayVacated&&g.routeIndex===ps.length-1&&distance(s,g.stop)<8&&Math.abs(wrap(s.yaw-g.stop.yaw))<12*RAD&&speed<.8;
 g.alignedSeconds=atStand?g.alignedSeconds+dt:0;if(g.alignedSeconds>.7)park(s);
}
