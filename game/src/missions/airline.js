import {airportOf,runwayOf} from '../airports/registry.js';
import {FT,KT,RAD,wrap} from '../sim/constants.js';
import {queueRadio,clearRadioEvents} from '../comms/radio.js';
import {preparedAtTouchdown} from './arrival.js';
import {departureNavigation,arrivalNavigation,airlineTarget,advanceAirlineNavigation,departureInstruction} from './airline-navigation.js';
import {routeProfile,startContinuousRoute,continuousArrivalDue,rebaseContinuousArrival} from './continuous-route.js';
export function routeDistance(origin,destination){
 const a=airportOf(origin).data.airport,b=airportOf(destination).data.airport,r=Math.PI/180,dlat=(b.latitude-a.latitude)*r,dlon=(b.longitude-a.longitude)*r;
 const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
export function initializeAirline(s,level){
 if(level.kind!=='airline')return;
 s.airline={origin:level.origin,destination:level.destination,phase:'departure',distanceKm:routeDistance(level.origin,level.destination),stableSeconds:0,departureEvidence:null,cruiseSkipped:false,previewStarted:null,introSkipped:false};
 s.airline.navigation=departureNavigation(level.origin,level.destination);
 s.airline.profile=routeProfile(level.origin,level.destination,s.airline.distanceKm,s.airline.navigation);
 s.selectedAltitude=s.airline.navigation.altitude;s.autoThrust=true;
}
export const arrivalPreview=s=>s.airline?.phase==='arrival-preview';
const radioDone=(s,event)=>s.radio.fired[event]&&!s.radio.pending.some(l=>l.event===event)&&s.radio.active?.event!==event;
export function cruiseConditions(s,{allowFaults=false}={}){
 const h=(s.y-runwayOf(s).ground)*FT,n=s.airline?.navigation,t=airlineTarget(s);
 if(n?.kind==='enroute')return !!s.airline.departureEvidence&&s.airborne&&!s.landed&&!s.result&&!s.goAround&&h>1500&&Math.abs(t.cross)<2500&&Math.abs(s.roll)<20*RAD&&s.speed*KT>=165&&s.speed*KT<=300&&s.gearPosition<.02&&s.flapPosition<=1.05&&!s.terrain.level&&!s.stallWarning.active&&(allowFaults||s.engines.every(e=>e.status==='running'&&e.health>.5));
 const last=n?.points.length-1,ordered=n?.visited?.length>=last&&n.visited.slice(0,last).every((value,i)=>value===i);
 const onRoute=n?.kind==='departure'&&n.index===last&&ordered&&Math.abs(wrap(s.airData.groundTrack-(n.course-runwayOf(s).heading)*RAD))<15*RAD&&Math.abs(t?.cross??Infinity)<1500;
 return !!s.airline&&!s.result&&!n?.restrictionMissed&&s.airborne&&!s.landed&&!s.goAround&&s.ground?.heldShort&&s.ground.lineupComplete&&s.ground.takeoffCleared&&onRoute&&h>=n.altitude-30&&h<=n.altitude+300&&Math.abs(s.verticalSpeed)<=1.5&&Math.abs(s.roll)<10*RAD&&s.speed*KT>=165&&s.speed*KT<=Math.min(225,n.speedLimit??225)&&s.gearPosition<.02&&s.flapPosition<=1.05&&!s.terrain.level&&!s.stallWarning.active&&(allowFaults||s.engines.every(e=>e.status==='running'&&e.health>.5));
}
export const canSkipCruise=s=>!!s.airline&&!s.airline.arrivalReached&&!s.airline.cruiseSkipped&&['cruise-ready','enroute','enroute-descent'].includes(s.airline.phase)&&s.airline.stableSeconds>=3&&cruiseConditions(s);
// Compatibility export: waypoint capture never elects a flight skip.
export const canAutoSkipCruise=()=>false;
export function beforeAirlinePhysics(s,{checkpoint,dt=.01,canEnterArrival=()=>true}){
 if(!s.airline)return false;
 if(!arrivalPreview(s)){
  const event=advanceAirlineNavigation(s,dt);
  if(event)s.selectedAltitude=s.airline.navigation.points[s.airline.navigation.index].alt;
  if(event==='departure-turn'){queueRadio(s,event);checkpoint(s,'离场转弯 · 继续按程序飞行');}
  if(event==='departure-leg')checkpoint(s,'离场航点已通过 · 继续按程序飞行');
  if(event==='departure-end')checkpoint(s,'离场末点已通过 · 继续飞往目的机场');
  const a=s.airline;
  if(a.navigation.kind==='departure'&&a.navigation.endPassed&&s.flapPosition<.02&&a.stableSeconds>=3&&cruiseConditions(s,{allowFaults:true})){
   startContinuousRoute(s,arrivalNavigation(a.origin,a.destination));
   if(!a.profile.short)queueRadio(s,'cruise-climb');
   checkpoint(s,a.profile.short?'离场完成 · 继续同城转场':'离场完成 · 按航路继续飞行');
  }
  if(a.navigation.kind==='enroute'){
   const target=airlineTarget(s);s.selectedAltitude=target.altitude;
   if(!a.profile.short&&target.altitude+airportOf(s).elevationM*FT<a.profile.cruiseMSL-200&&!a.descentStarted){a.descentStarted=true;a.phase='enroute-descent';queueRadio(s,'arrival-brief');checkpoint(s,'到港下降 · 继续按航路飞行');}
   if(continuousArrivalDue(s)){
    a.waitingForArrival=!canEnterArrival(a.destination);
    if(!a.waitingForArrival){const {entry}=rebaseContinuousArrival(s);a.navigation=arrivalNavigation(a.origin,a.destination,{entry});s.selectedAltitude=a.navigation.points[0].alt;s.previousRA=(s.y-runwayOf(s).ground)*FT;clearRadioEvents(s,'atc-');queueRadio(s,'destination-established');checkpoint(s,'目的机场 · 连续到港');}
   }
  }
  if(event==='arrival-final'){s.airline.phase='approach';s.mode='landing';s.selectedAltitude=3000;s.previousRA=(s.y-runwayOf(s).ground)*FT;queueRadio(s,event);queueRadio(s,'approach');checkpoint(s,'最后进近截获 · 完成构型检查');}
  return false;
 }
 if(s.time-s.airline.previewStarted>=8&&radioDone(s,'arrival-brief')){
  s.airline.phase='arrival';s.mode='enroute';s.selectedAltitude=s.airline.navigation.points[0].alt;queueRadio(s,'destination-established');checkpoint(s,'目的机场 · 按来向到港');
 }
 return true;
}
export function updateAirline(s,dt,{checkpoint}){
 const a=s.airline;if(!a)return;
 if(a.phase==='departure'&&s.airborne){a.phase='climb';queueRadio(s,'departure-climb');checkpoint(s,'航班离场 · 爬升至许可高度');}
 if(['climb','cruise-ready'].includes(a.phase)){
  a.stableSeconds=cruiseConditions(s,{allowFaults:true})?a.stableSeconds+dt:0;
  if(a.phase==='climb'&&a.stableSeconds>=3){a.phase='cruise-ready';queueRadio(s,'cruise-ready');checkpoint(s,'离场稳定 · 可继续飞行或跳过剩余航程');}
 }
 if(['enroute','enroute-descent'].includes(a.phase))a.stableSeconds=cruiseConditions(s)?a.stableSeconds+dt:0;
 if(s.result?.success){
  const valid=(a.arrivalReached||a.cruiseSkipped)&&a.departureEvidence?.heldShort&&a.departureEvidence?.lineupComplete&&a.departureEvidence?.takeoffCleared&&s.airportId===a.destination&&s.landed&&preparedAtTouchdown(s)&&s.gates.length===2&&s.gates.every(g=>g.passed&&!g.preset)&&a.landingEvidence?.valid&&s.ground?.arrival&&s.ground.stage==='parked';
  s.result.levelCleared=!!valid&&!s.mission.practice;
  if(valid){a.phase='complete';s.result.title='航班执飞完成';s.result.detail='已完成始发离场、航路转向、目的机场进近与着陆，并停靠分配机位。';}
  else{s.result.levelCleared=false;s.result.title='已停稳 · 航班目标待完成';s.result.detail='完成始发离场、目的机场两个稳定检查点和机位停靠后才能通关。';}
 }
}
export function airlineInstruction(s){
 const a=s.airline;if(!a)return null;
 if(arrivalPreview(s))return '目标机场展示 · 自动进近简报';
 if(a.phase==='arrival')return `${a.navigation.points[a.navigation.index].name} · 按 ND / FD 飞行，最后进近前保持未构型`;
 if(['climb','cruise-ready'].includes(a.phase)){
  if(a.navigation.endPassed)return '离场段已完成 · 保持稳定后继续飞往目的机场';
  if(s.gear)return '航班离场 · 正爬升后 G 收轮';
  if((s.y-runwayOf(s).ground)*FT>500&&s.throttle>.845)return '航班离场 · L 选择 CL，继续爬升至许可高度';
  if(a.phase==='cruise-ready'&&canSkipCruise(s))return a.profile.short?'离场已稳定 · 继续同城转场，也可跳过剩余航程':'离场已稳定 · 继续飞行，也可跳过剩余航程';
  return departureInstruction(s)||`航班离场 · ${a.navigation.index?'转入目的地航路':'保持跑道方向爬升'} · ${a.navigation.altitude} ft`;
 }
 if(['enroute','enroute-descent'].includes(a.phase))return a.waitingForArrival?'保持航路 · 等待进近引导':a.phase==='enroute-descent'?'到港下降 · 按 ND / FD 飞行，也可跳过剩余航程':a.profile.short?'同城转场 · 按许可高度继续飞往目的机场':'航路飞行 · 按 ND / FD 飞行，也可跳过剩余航程';
 return null;
}
