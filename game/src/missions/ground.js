import lgaDeparture from '../airports/data/lga-departure.json' with {type:'json'};
import kansaiDeparture from '../airports/data/kansai-departure.json' with {type:'json'};
import jfkDeparture from '../airports/data/jfk-departure.json' with {type:'json'};
import laxDeparture from '../airports/data/lax-departure.json' with {type:'json'};
import departure from '../airports/data/daxing-departure.json' with {type:'json'};
import xiaoshanDeparture from '../airports/data/xiaoshan-departure.json' with {type:'json'};
import changiDeparture from '../airports/data/changi-departure.json' with {type:'json'};
import {runwayOf} from '../airports/registry.js';
import {clamp,KT,RAD,moveToward,wrap} from '../sim/constants.js';
import {centerControls} from '../sim/controls.js';
import {queueRadio,repeatRadio,clearRadioEvents} from '../comms/radio.js';

export const DEPARTURE=departure;
const departures={lga:lgaDeparture,daxing:departure,xiaoshan:xiaoshanDeparture,changi:changiDeparture,kansai:kansaiDeparture,jfk:jfkDeparture,lax:laxDeparture};
export const departureOf=s=>departures[typeof s==='string'?s:s?.airportId];
export const groundActive=s=>!!s.ground&&!s.ground.takeoffCleared&&!s.airborne;
export const groundFrozen=s=>groundActive(s)&&['gate','leaving','skip','parking','parked'].includes(s.ground.stage);
export const airportIntro=s=>s.ground?.stage==='gate'&&!s.ground.introSkipped||s.airline?.phase==='arrival-preview'&&!s.airline.introSkipped;
const cleaned=points=>points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)>2);
const pointSets=Object.fromEntries(Object.entries(departures).map(([id,d])=>[id,{taxi:cleaned(d.taxiPoints),entry:cleaned(d.entryPoints)}]));
export const TAXI_POINTS=pointSets.daxing.taxi,ENTRY_POINTS=pointSets.daxing.entry;
export const taxiPoints=s=>pointSets[typeof s==='string'?s:s.airportId].taxi;
export const entryPoints=s=>pointSets[typeof s==='string'?s:s.airportId].entry;
const distance=(s,p)=>Math.hypot(s.x-p.x,s.z-p.z);
const lineDone=(s,event,role)=>s.radio.history.some(line=>line.event===event&&(!role||line.role===role));
const eventDone=(s,event)=>!!s.radio.fired[event]&&!s.radio.pending.some(l=>l.event===event)&&s.radio.active?.event!==event;
const stop=s=>{s.velocity={x:0,y:0,z:0};s.speed=0;s.verticalSpeed=0;s.yawRate=0;s.throttle=0;s.reverse=false;s.brake=true;centerControls(s);};
const transition=(s,stage)=>{s.ground.stage=stage;s.ground.since=s.time;s.phase=stage==='ready'?'ready':stage;};
export function initializeDeparture(s){
 if(!departureOf(s)||s.mode!=='takeoff')return;const departure=departureOf(s);
 Object.assign(s,{x:departure.stand.x,z:departure.stand.z,y:2.8,yaw:departure.stand.yaw,pitch:0,roll:0,flaps:1,flapPosition:0,gear:true,gearPosition:1,autoThrust:false,autoPilot:false});
 stop(s);s.engines.forEach(e=>{e.status='off';e.spool=e.command=e.thrustN=e.n1=0;});
 s.ground={stage:'gate',since:0,stand:departure.stand.ref,introSkipped:false,routeIndex:1,entryIndex:1,distance:0,manualEntryDistance:0,heldShort:false,entryCleared:false,lineupComplete:false,takeoffCleared:false,skipped:false,skippedSeconds:0,offRouteSeconds:0,overspeedSeconds:0,incursionSeconds:0,lastReminder:-100,lastHoldReminder:-100,alignedSeconds:0,steering:0};
 s.phase='gate';s.checkpointLabel=`${departure.stand.ref} 机位 · 自动离位准备`;queueRadio(s,'preparation');
}
export function skipAirportIntro(s){if(s.airline?.phase==='arrival-preview'){s.airline.introSkipped=true;centerControls(s);return true;}if(s.ground?.stage!=='gate')return false;s.ground.introSkipped=true;centerControls(s);return true;}
export function skipTaxi(s){
 const g=s.ground;if(!g||g.stage!=='taxi'||s.airborne||s.result)return false;
 g.remainingAtSkip=remainingTaxiDistance(s);g.skipped=true;transition(s,'skip');stop(s);clearRadioEvents(s,'taxi');return true;
}
export function beforeGroundPhysics(s,dt,{checkpoint}){
 if(!groundActive(s)||s.ground.arrival)return false;
 const g=s.ground,elapsed=s.time-g.since,departure=departureOf(s),TAXI_POINTS=taxiPoints(s),rw=runwayOf(s).id;
 if(g.stage==='gate'){
  stop(s);s.flapPosition=moveToward(s.flapPosition,1,dt*.22);
  if(lineDone(s,'preparation','tower'))s.engines.forEach(e=>{if(e.status==='off')e.status='running';});
  if(eventDone(s,'preparation')&&elapsed>=8)transition(s,'leaving');
  return true;
 }
 if(g.stage==='leaving'||g.stage==='skip'){
  stop(s);
  if(elapsed>=.9){
   const skipping=g.stage==='skip',p=skipping?departure.hold:departure.handoff;
   // Explicit, labelled ground-stage transition. Ordinary taxi and all flight
   // translation continue to be integrated from forces, never this shortcut.
   Object.assign(s,{x:p.x,z:p.z,y:2.8,yaw:p.yaw,pitch:0,roll:0});stop(s);
   if(skipping){const seconds=g.remainingAtSkip/(12/KT);g.skippedSeconds+=seconds;s.time+=seconds;g.routeIndex=TAXI_POINTS.length-1;g.heldShort=true;transition(s,'holding');queueRadio(s,'lineup');}
   else{transition(s,'taxi');queueRadio(s,'taxi');}
   checkpoint(s,skipping?`${rw} 外等待点 · 手动进入跑道`:'离位完成 · 手动滑行');
  }
  return true;
 }
 if(g.stage==='holding'&&lineDone(s,'lineup','tower')){g.entryCleared=true;transition(s,'lineup');checkpoint(s,`已获进入许可 · 手动对正 ${rw}`);}
 if(g.stage==='takeoff-clearance'&&lineDone(s,'takeoff','tower')){g.takeoffCleared=true;transition(s,'ready');checkpoint(s,`${rw} 对正 · 已获起飞许可`);}
 return false;
}
function projectToSegment(s,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),u=length?clamp(((s.x-a.x)*dx+(s.z-a.z)*dz)/(length*length),0,1):0;
 return{distance:Math.hypot(s.x-a.x-dx*u,s.z-a.z-dz*u),u,length};
}
export function groundRoute(s){return s.ground?.arrival?s.ground.points:s.ground?.stage==='lineup'||s.ground?.stage==='takeoff-clearance'?entryPoints(s):taxiPoints(s);}
export function groundTarget(s){
 const points=groundRoute(s),g=s.ground,index=points===entryPoints(s)?g.entryIndex:g.routeIndex,b=points[Math.min(index,points.length-1)],a=points[Math.max(0,index-1)],p=projectToSegment(s,a,b);
 const lookahead=clamp(s.airData.groundSpeed*3,8,22),u=clamp(p.u+lookahead/Math.max(p.length,1),0,1);
 return{x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,name:b.name,distance:distance(s,b),crossTrack:p.distance,index};
}
export function remainingTaxiDistance(s){
 const TAXI_POINTS=s.ground?.arrival?s.ground.points:taxiPoints(s),g=s.ground,index=Math.min(g.routeIndex,TAXI_POINTS.length-1);let remaining=distance(s,TAXI_POINTS[index]);
 for(let i=index;i<TAXI_POINTS.length-1;i++)remaining+=Math.hypot(TAXI_POINTS[i+1].x-TAXI_POINTS[i].x,TAXI_POINTS[i+1].z-TAXI_POINTS[i].z);
 return remaining;
}
function groundFail(s,title,detail){s.result={success:false,title,detail};s.throttle=0;s.autoPilot=false;centerControls(s);}
export function afterGroundPhysics(s,previous,dt,{checkpoint}){
 const g=s.ground;if(!g||s.result||g.arrival)return;const departure=departureOf(s),TAXI_POINTS=taxiPoints(s),ENTRY_POINTS=entryPoints(s),rw=runwayOf(s).id;
 if(s.airborne){if(g.takeoffCleared)g.stage='departure';return;}
 if(!groundActive(s)||groundFrozen(s))return;
 const moved=Math.hypot(s.x-previous.x,s.z-previous.z);g.distance+=moved;if(g.stage==='lineup')g.manualEntryDistance+=moved;
 const speed=s.airData.groundSpeed*KT;
 g.overspeedSeconds=speed>25?g.overspeedSeconds+dt:0;
 if(speed>18&&s.time-g.lastReminder>20){g.lastReminder=s.time;repeatRadio(s,'ground-speed',{priority:1});}
 if(g.overspeedSeconds>4){groundFail(s,'滑行速度过高','滑行保持约 10–15 kt，转弯与进入跑道时减速，空格刹车。');return;}
 const noseX=s.x+Math.sin(s.yaw)*15,side=Math.sign(departure.hold.x)||-1,protectedX=runwayOf(s).width/2+50,nearEntry=Math.abs(s.z-departure.hold.z)<300;
 if(!g.entryCleared&&side*noseX<protectedX+15&&side*noseX>=protectedX&&nearEntry&&speed>2&&s.time-g.lastHoldReminder>15){g.lastHoldReminder=s.time;repeatRadio(s,'ground-stop',{priority:2});}
 g.incursionSeconds=!g.entryCleared&&side*noseX<protectedX&&nearEntry?g.incursionSeconds+dt:0;
 if(g.incursionSeconds>.1){repeatRadio(s,'ground-stop',{priority:2});groundFail(s,'未经许可进入跑道',`在 ${rw} 外等待点停稳，听到进入跑道许可后再继续。`);return;}
 const points=groundRoute(s),entry=points===ENTRY_POINTS,indexKey=entry?'entryIndex':'routeIndex';
 if(['taxi','lineup'].includes(g.stage)){
  let i=Math.min(g[indexKey],points.length-1);
  while(i<points.length-1&&distance(s,points[i])<14){i++;g[indexKey]=i;}
  const nearest=Math.min(...points.slice(1).map((b,j)=>projectToSegment(s,points[j],b).distance));
  g.offRouteSeconds=nearest>34?g.offRouteSeconds+dt:0;
  if(g.offRouteSeconds>1.5){groundFail(s,'偏离滑行道','根据地面导航沿标示路线行驶；可重试本阶段，或跳至跑道外等待点。');return;}
 }
 if(g.stage==='taxi'&&g.routeIndex>=TAXI_POINTS.length-2&&distance(s,departure.hold)<17&&Math.abs(wrap(s.yaw-departure.hold.yaw))<25*RAD&&speed<1){
  g.heldShort=true;transition(s,'holding');queueRadio(s,'lineup');checkpoint(s,`${rw} 外等待点 · 等待进入许可`);
 }
 if(g.stage==='lineup'){
  const aligned=g.entryIndex===ENTRY_POINTS.length-1&&distance(s,departure.lineup)<24&&Math.abs(s.x)<6&&Math.abs(wrap(s.yaw))<5*RAD&&speed<1&&g.manualEntryDistance>Math.min(120,departure.entryDistanceM*.65);
  g.alignedSeconds=aligned?g.alignedSeconds+dt:0;
  if(g.alignedSeconds>=.7){g.lineupComplete=true;transition(s,'takeoff-clearance');queueRadio(s,'takeoff');checkpoint(s,`${rw} 已对正 · 等待起飞许可`);}
 }
}
export function groundInstruction(s){
 const g=s.ground;if(!g||s.airborne||g.takeoffCleared)return null;const departure=departureOf(s),rw=runwayOf(s).id;
 if(g.arrival){if(g.stage==='runway-exit')return `低速脱离跑道 · 出口 ${g.exit} · 按地面导航滑行`;if(g.stage==='taxi-in')return `滑行至 ${g.stand} 机位 · 可跳过剩余滑行`;return '机位停稳 · 机组自动关车';}
 if(g.stage==='gate')return `${departure.stand.ref} 机位 · 自动离位准备，收听地面通话`;
 if(g.stage==='leaving')return '自动离位已完成 · 即将接管滑行';
 if(g.stage==='skip')return `略过长距离滑行 · 转至 ${rw} 外等待点`;
 if(g.stage==='holding')return `${rw} 外等待 · 听到进入许可后再继续`;
 if(g.stage==='takeoff-clearance')return `${rw} 已对正 · 停稳等待起飞许可`;
 if(s.airData.groundSpeed*KT>18)return '滑行速度偏高 · S 收小推力，空格刹车';
 if(g.stage==='lineup')return distance(s,departure.lineup)<30?`对正 ${rw} 中心线 · 收至 IDLE，空格停稳`:`已获进入许可 · 低速转弯，手动对正 ${rw}`;
 if(distance(s,departure.hold)<55)return `前方 ${rw} 等待点 · 收小推力，在线外停稳`;
 return `沿 ${departure.routeReferences.slice(1,3).join(' / ')} 滑行 · 左右转向，W / S 调推力，空格刹车`;
}
