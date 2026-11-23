import {initializeAirline,beforeAirlinePhysics,updateAirline,airlineInstruction,canSkipCruise,canAutoSkipCruise,arrivalPreview} from './missions/airline.js';
import {initializeDeparture,groundActive,groundFrozen,beforeGroundPhysics,afterGroundPhysics,groundInstruction} from './missions/ground.js';
import {arrivalNavigation,airlineNavigationActive} from './missions/airline-navigation.js';
import {initializeTaxiIn,beforeTaxiInPhysics,afterTaxiInPhysics,taxiInActive} from './missions/taxi-in.js';
import {updateRouteProtection} from './missions/route-protection.js';
import {observeEmergency} from './comms/emergency.js';
import {runwayOf} from './airports/registry.js';
import {createStallWarning,updateStallWarning} from './sim/stall-warning.js';
import {requiresLanding,startRecovery,updateRecovery} from './missions/recovery.js';
// Fixed fictional training scenario. Performance values and tolerances are
// game presets, not aircraft operating data or a complete A320 flight model.
import {clamp,RUNWAY,KT,FT,NM,RAD,moveToward} from './sim/constants.js';
import {createWeather,setWeather} from './sim/weather.js';
import {refreshAirData,setMotion,trimAlpha} from './sim/aerodynamics.js';
import {createEngines,stepEngines} from './sim/engines.js';
import {createControls,centerControls,updateStick,stepAttitude} from './sim/controls.js';
import {stepDynamics} from './sim/dynamics.js';
import {computeGuidance} from './sim/guidance.js';
import {createSystems,transferManualThrust,toggleAutoThrust,updateVisualReferences} from './sim/systems.js';
import {updateExpandedRoute,glideInfo} from './missions/expanded.js';
import {routeSpeed} from './missions/route.js';
import {createRadio,queueRadio,updateRadio} from './comms/radio.js';
import {getLevel} from './missions/catalog.js';
import {sweptContact,terrainRadioAltitude} from './terrain/heightfield.js';
import {sweptCityContact}from './terrain/city-obstacles.js';
import {createTerrainAwareness,updateTerrainAwareness} from './terrain/awareness.js';
import {createATC,updateATC,clearanceFor} from './comms/atc.js';
import {initializeLevel,beforeLevelPhysics,afterLevelPhysics,levelGoAround,levelInstruction,holdConfiguration,acknowledgeLevel} from './missions/runtime.js';
export {clamp,RUNWAY,KT,FT,NM,RAD};
export {acknowledgeLevel,toggleAutoThrust};
export {setMotion} from './sim/aerodynamics.js';
export {setWeather} from './sim/weather.js';
export {setEngineStatus} from './sim/engines.js';
export const FLAPS=['0','1','2','3','FULL'];
export const FLAP_LIMITS=[350,230,200,185,177];
export const PHASES={'runway-exit':'脱离跑道','taxi-in':'到港滑行',parking:'机位关车',parked:'机位停稳',gate:'停机位准备',leaving:'自动离位',taxi:'手动滑行',skip:'略过长滑行',holding:'跑道外等待',lineup:'进入与对正','takeoff-clearance':'等待起飞许可',intercept:'截获进近',configure:'减速与构型',final:'稳定末进近',flare:'拉平与接地',rollout:'着陆滑跑',goaround:'复飞爬升',ready:'起飞准备',climb:'离地爬升',departure:'一边 · 离场',crosswind:'二边 · 侧风边',downwind:'三边 · 下风边',base:'四边 · 基地边'};
const approachAltitude=z=>RUNWAY.ground+15.24+Math.tan(3*RAD)*z;
export const radioAltitude=s=>Math.max(0,(s.y-RUNWAY.ground)*FT);
export const minimumSelectableSpeed=s=>s.vapp-5+(s.landingConfig-s.flapPosition)*7.5;
export function targetSpeed(s){
  if(s.goAround)return s.speedMode==='selected'?s.selectedSpeed:185;
  if(airlineNavigationActive(s))return s.speedMode==='selected'?s.selectedSpeed:s.airline.navigation.kind==='arrival'?210:185;
  if(s.route?.active)return s.speedMode==='selected'?s.selectedSpeed:routeSpeed(s);
  if(s.mission?.kind==='dual-glide')return s.flapPosition>=.5?165:185;
  if(s.systems?.flapsJammed&&s.speedMode!=='selected')return s.vapp;
  if(s.mode==='takeoff')return s.speedMode==='selected'?s.selectedSpeed:185;
  return s.speedMode==='selected'?s.selectedSpeed:[215,180,160,s.landingConfig===3?s.vapp:150,s.vapp][s.flaps];
}
export const thrustDetent=s=>s.reverse?'REV':s.throttle<.025?'IDLE':Math.abs(s.throttle-.78)<.065?'CL':Math.abs(s.throttle-.90)<.035?'FLX':s.throttle>.975?'TOGA':'MAN';
export const aoaFor=trimAlpha;

export function createFlight(mode='landing',options={}){
  const level=getLevel(options.levelId);
  const airportId=level?.airportId||'training',runway=runwayOf(airportId);
  if(level){mode=level.mode;options={...options,scenario:level.scenario,landingConfig:options.landingConfig??level.landingConfig};}
  const landing=mode==='landing',scenario=options.scenario||'short',full=landing&&scenario==='full';
  const landingConfig=[1,2,3,4].includes(options.landingConfig)?options.landingConfig:4,vapp=[180,165,165,150,145][landingConfig];
  const s={mode,scenario,airportId,landingConfig,vapp,weight:options.weight??64,headwind:5,windDirection:runway.heading,
    systems:createSystems(),radio:createRadio({pilotVoice:options.pilotVoice,towerVoice:options.towerVoice}),atc:createATC(),terrain:createTerrainAwareness(),impact:null,stallWarning:createStallWarning(),cabin:{noseAt:null},weather:createWeather({...options.weather,referenceHeading:runway.heading,wind:{directionDeg:runway.heading,...options.weather?.wind}}),engines:createEngines(),controls:createControls(),velocity:{x:0,y:0,z:0},yawRate:0,clock:{accumulator:0},
    x:full?180:0,y:full?RUNWAY.ground+3000/FT:landing?approachAltitude(2100):RUNWAY.ground,z:full?18000:landing?2100:-130,
    speed:landing?(full?190:vapp)/KT:0,verticalSpeed:landing&&!full?-3.8:0,
    pitch:0,roll:0,yaw:full?-.012:0,pitchRate:0,rollRate:0,stickPitch:0,stickRoll:0,
    throttle:landing?.78:0,thrust:landing?(full?.36:.43):0,
    gear:!full,gearPosition:!full?1:0,
    flaps:full?1:landing?landingConfig:1,flapPosition:full?1:landing?landingConfig:1,
    autoThrust:landing,autoThrustActive:landing,autoPilot:false,flightDirector:true,
    apprArmed:landing&&!full,locCaptured:landing&&!full,gsCaptured:landing&&!full,gsCaptureEligible:landing&&!full,
    speedMode:'managed',selectedSpeed:full?190:vapp,selectedHeading:Math.round(runway.heading),selectedAltitude:3000,
    spoilersArmed:landing&&!full,spoilersDeployed:false,autoBrake:landing&&!full?'MED':'OFF',autoBrakeActive:false,reverse:false,
    brake:false,airborne:landing,landed:false,noseWheelDown:!landing,time:0,result:null,touchdown:null,landingAttempts:[],touchAndGo:null,
    phase:full?'intercept':landing?'final':'ready',maxAltitude:0,warning:'',message:'',messageUntil:0,
    locDeviation:0,glideDeviation:0,guidance:{pitch:0,roll:0},thrustMode:landing?'SPEED':'MAN',
    gates:landing&&!full?[{height:1000,passed:true,issues:[],preset:true},{height:500,passed:true,issues:[],preset:true}]:[],
    previousRA:full?3000:landing?radioAltitude({y:approachAltitude(2100)}):0,
    unstableSeconds:0,landingChecklistConfirmed:landing&&!full,callouts:[],calloutSequence:0,spokenHeights:[],
    goAround:false,goAroundHeading:0,goAroundStartAltitude:0,goAroundReason:'',positiveClimbCalled:false,
    checkpoint:null,checkpointLabel:full?'进近起点':landing?'短进近起点':'跑道起点',
  };
  if(level)initializeLevel(s,level);
  setWeather(s,{});
  setMotion(s);
  if(!landing){s.velocity={x:0,y:0,z:0};refreshAirData(s);}
  s.pitch=landing?aoaFor(s)+s.airData.gamma:0;
  refreshAirData(s);
  const trim=landing?clamp((s.airData.drag+s.weight*1000*9.80665*Math.sin(s.airData.gamma))/(240000*Math.pow(s.airData.density/1.225,.7)),0,1):0;
  s.engines=createEngines(trim);stepEngines(s,Math.max(targetSpeed(s),minimumSelectableSpeed(s))/KT,0);
  initializeDeparture(s);if(level)initializeAirline(s,level);refreshAirData(s);
  updateNavigation(s);s.atc.clearance=clearanceFor(s);s.terrain.clearanceFt=terrainRadioAltitude(s)*FT;saveCheckpoint(s,s.checkpointLabel);return s;
}
// The explicit cruise cut changes the local airport frame and installs the
// destination leg's published game entry preset. It is not continuous cruise
// integration. Failures, mass, practice state and departure evidence survive.
export function skipCruise(s,{automatic=false}={}){
 if(!canSkipCruise(s))return false;
 const old={levelId:s.levelId,mission:structuredClone(s.mission),airline:structuredClone(s.airline),engines:structuredClone(s.engines),systems:structuredClone(s.systems),time:s.time,language:s.radio.language,pilotVoice:s.radio.pilotVoice,towerVoice:s.radio.towerVoice,history:structuredClone(s.radio.history),autoThrust:s.autoThrust,ground:structuredClone(s.ground)};
 const skipped=old.airline.distanceKm/830*3600;
 const arrival=createFlight('landing',{levelId:`${old.airline.destination}-landing`,weight:s.weight,landingConfig:s.landingConfig,pilotVoice:old.pilotVoice,towerVoice:old.towerVoice});
 arrival.levelId=old.levelId;arrival.mission={...old.mission,stableSeconds:0};arrival.systems=old.systems;arrival.engines=old.engines;arrival.ground=null;arrival.time=old.time+skipped;arrival.autoThrust=old.autoThrust&&old.systems.autoThrustAvailable;
 arrival.airline={...old.airline,phase:'arrival-preview',cruiseSkipped:true,cruiseSkipMode:automatic?'automatic':'manual',skippedCruiseSeconds:skipped,departureEvidence:old.ground,departureRouteEvidence:structuredClone(old.airline.navigation),departureCut:{x:s.x,y:s.y,z:s.z,time:old.time},previewStarted:arrival.time,introSkipped:false,stableSeconds:0};
 arrival.airline.navigation=arrivalNavigation(old.airline.origin,old.airline.destination);
 const entry=arrival.airline.navigation.entry;
 Object.assign(arrival,{x:entry.x,z:entry.z,y:RUNWAY.ground+entry.altitude/FT,yaw:entry.yaw,selectedAltitude:entry.altitude,previousRA:entry.altitude,mode:'enroute'});
 arrival.arrival={...arrival.arrival,x:entry.x,z:entry.z,altitude:entry.altitude,heading:entry.yaw/RAD};setMotion(arrival);
 arrival.radio.language=old.language;arrival.radio.history=old.history;arrival.checkpointLabel='目的机场 · 进近前展示';
 refreshAirData(arrival);stepEngines(arrival,arrival.speed,0);queueRadio(arrival,'arrival-brief');saveCheckpoint(arrival,arrival.checkpointLabel);
 for(const key of Object.keys(s))delete s[key];Object.assign(s,arrival);return true;
}

export function adjustStick(s,pitchDelta=0,rollDelta=0){if(!s.result&&!groundFrozen(s)&&!arrivalPreview(s)){s.stickPitch=clamp(s.stickPitch+pitchDelta,-1,1);s.stickRoll=clamp(s.stickRoll+rollDelta,-1,1);}}
export const centerStick=centerControls;
function emit(s,text,spoken='',kind='info'){
  s.callouts.push({id:++s.calloutSequence,text,spoken,kind,time:s.time});if(s.callouts.length>8)s.callouts.shift();
}
function message(s,text){s.message=text;s.messageUntil=s.time+5;}
export function saveCheckpoint(s,label){
  s.checkpointLabel=label;const{checkpoint,...snapshot}=s;s.checkpoint=structuredClone(snapshot);
}
export function restoreCheckpoint(s){
  if(!s.checkpoint)return createFlight(s.mode,{scenario:s.scenario,landingConfig:s.landingConfig});
  const restored=structuredClone(s.checkpoint);restored.checkpoint=structuredClone(s.checkpoint);restored.result=null;if(restored.mission)restored.mission.practice=true;centerStick(restored);return restored;
}
export function stepFlaps(s,direction=1){
  if(groundActive(s)){message(s,s.ground.arrival?'落地后构型由机组自动处理':'滑行阶段已自动准备起飞构型');return false;}
  if(s.result||arrivalPreview(s))return false;if(s.systems.flapsJammed){message(s,'襟翼卡阻，保持实际构型并按新目标速度进近');return false;}if(holdConfiguration(s)){message(s,'切变中保持当前构型，脱离后再调整襟翼');return false;}const next=clamp(s.flaps+direction,0,4);
  if(next===s.flaps)return false;
  if(next>s.flaps&&s.speed*KT>FLAP_LIMITS[next]){message(s,`先减速至 ${FLAP_LIMITS[next]} kt 以下，再放 CONF ${FLAPS[next]}`);return false;}
  s.flaps=next;message(s,`襟翼选择 CONF ${FLAPS[next]} · 等待到位`);return true;
}
export function toggleGear(s){
  if(s.result||arrivalPreview(s))return false;
  if(holdConfiguration(s)){message(s,'切变中保持当前构型，脱离后再调整起落架');return false;}
  if(s.gear&&!s.airborne){message(s,'地面保持起落架放下');return false;}
  if(!s.gear&&s.speed*KT>250){message(s,'先减速至 250 kt 以下再放起落架');return false;}
  s.gear=!s.gear;message(s,s.gear?'起落架放下中 · 等待三绿灯':'起落架收起中');return true;
}
export function toggleApproach(s){
  if(s.result||arrivalPreview(s)||s.goAround||s.mode!=='landing')return;
  if(!s.systems.ils.localizer||!s.systems.ils.glideSlope){message(s,'ILS 信号失效，不能重新预位 APPR');return;}
  s.apprArmed=!s.apprArmed;s.gsCaptureEligible=s.apprArmed&&s.glideDeviation<=0;
  if(!s.apprArmed){s.locCaptured=false;s.gsCaptured=false;}
  message(s,s.apprArmed?'APPR 已预位 · 等待 LOC / G/S 截获':'进近引导已取消 · HDG / ALT');
}
export function toggleAP(s){
  if(s.result||arrivalPreview(s))return;
  if(!s.systems.apAvailable){message(s,'自动驾驶不可用，保持手飞');return;}
  if(!s.airborne){message(s,'离地后可接通自动驾驶');return;}
  if(!s.autoPilot&&holdConfiguration(s)){message(s,'切变中保持手飞并跟随 FD，脱离后可接通 AP1');return;}
  if(!s.autoPilot&&radioAltitude(s)<200&&!s.goAround){message(s,'200 英尺以下由你手动完成着陆');return;}
  s.autoPilot=!s.autoPilot;if(s.autoPilot)s.flightDirector=true;
  emit(s,s.autoPilot?'AP1 接通 · 跟随引导':'AP1 断开 · 手动操纵',s.autoPilot?'Autopilot on':'Autopilot off');
}
export function setDetent(s,detent){
  if(s.result||arrivalPreview(s))return;
  if(groundActive(s)&&detent!=='IDLE'){message(s,'等待起飞许可');return;}
  s.throttle={IDLE:0,CL:.78,FLX:.90,TOGA:1}[detent]??s.throttle;s.reverse=false;transferManualThrust(s,s.throttle,true);
  if(detent==='TOGA'&&s.mode==='landing'&&(s.airborne||s.landed))beginGoAround(s);
}
export function setLever(s,value){
  if(s.result||groundFrozen(s)||arrivalPreview(s))return;s.throttle=clamp(value,0,groundActive(s)?.18:1);s.reverse=false;transferManualThrust(s,s.throttle);
  if(s.throttle>.985&&s.mode==='landing'&&(s.airborne||s.landed)&&!s.goAround)beginGoAround(s);
}
export function cycleAutoBrake(s){if(!s.result)s.autoBrake=['OFF','LOW','MED'][(['OFF','LOW','MED'].indexOf(s.autoBrake)+1)%3];}
export function toggleReverse(s){
  if(s.result||arrivalPreview(s))return;
  if(!s.landed){message(s,'反推仅可接地后使用');return;}
  if(s.engines.every(e=>e.status!=='running')){message(s,'没有可用反推，使用轮刹车减速');return;}
  if(s.throttle>.025){message(s,'先将推力杆收到 IDLE，再选择反推');return;}
  s.reverse=!s.reverse;
}
export function beginGoAround(s,reason='主动复飞'){
  if(taxiInActive(s))return false;
  if(s.result||arrivalPreview(s)||s.goAround)return false;
  if(!s.airborne&&!s.landed){message(s,'尚未开始着陆，起飞时选择 TOGA 推力');return false;}
  if(s.engines.every(e=>e.status!=='running')){message(s,s.landed?'无可用推力，使用轮刹车停稳':'无可用推力，保持滑翔并管理落点');return false;}
  if(s.landed){
    s.touchAndGo={active:true,started:s.time,liftOffAt:null,coastalTurn:false};
    if(s.touchdown){s.landingAttempts.push({...s.touchdown,abortedAt:s.time});if(s.landingAttempts.length>8)s.landingAttempts.shift();}
    s.spoilersDeployed=false;s.autoBrakeActive=false;s.autoPilot=false;
  }
  s.goAround=true;s.phase='goaround';s.goAroundHeading=s.airData.groundTrack;s.goAroundStartAltitude=radioAltitude(s);s.goAroundReason=reason;
  s.throttle=1;transferManualThrust(s,s.throttle,true);s.reverse=false;s.apprArmed=false;s.locCaptured=false;s.gsCaptured=false;s.flightDirector=true;
  s.selectedAltitude=Math.max(3000,Math.ceil((radioAltitude(s)+600)/100)*100);s.positiveClimbCalled=false;
  levelGoAround(s);startRecovery(s);
  if(!(s.mission?.kind==='windshear'&&s.mission.triggered))queueRadio(s,'goaround',!s.mission?.fault);
  emit(s,s.landed?'TOUCH AND GO · TOGA · 松开刹车，加速后抬轮':'GO AROUND · TOGA · 跟随指引爬升','Go around','action');saveCheckpoint(s,s.landed?'触地复飞 · 加速抬轮':'复飞起点');return true;
}
export function landingChecks(s){
  const kt=s.speed*KT;
  return[
    {key:'speed',label:`速度 ${s.vapp} kt`,ok:kt>=s.vapp-5&&kt<=s.vapp+15},
    {key:'path',label:s.route?.inFinal?'航线 / 下滑路径':!s.systems.ils.localizer?'目视航迹 / 下滑路径':'航向道 / 下滑道',ok:(s.route?.inFinal&&s.scenario!=='full'||!s.systems.ils.localizer||s.apprArmed&&s.locCaptured&&s.gsCaptured)&&Math.abs(s.locDeviation)<.4&&Math.abs(s.glideDeviation)<.6},
    {key:'gear',label:'起落架三绿灯',ok:s.gearPosition>.98},
    {key:'flaps',label:`襟翼 CONF ${FLAPS[s.landingConfig]}`,ok:Math.abs(s.flapPosition-s.landingConfig)<.05},
    {key:'descent',label:'下降率 / 坡度',ok:s.verticalSpeed<-.2&&s.verticalSpeed>-5.1&&Math.abs(s.roll)<10*RAD},
  ];
}
export function confirmAction(s){if(s.mission?.triggered&&(s.mission.fault||s.mission.kind==='engine-out')&&!s.mission.acknowledged)return acknowledgeLevel(s);return confirmChecklist(s);}
export function confirmChecklist(s){
  const missing=[];
  if(s.gearPosition<.98)missing.push('起落架');
  if(Math.abs(s.flapPosition-s.landingConfig)>.05)missing.push('襟翼');
  if(!s.spoilersArmed)missing.push('扰流板预位');if(s.autoBrake==='OFF')missing.push('自动刹车');
  if(missing.length){message(s,`检查未完成：${missing.join('、')}`);return false;}
  s.landingChecklistConfirmed=true;emit(s,'着陆检查完成','Landing checklist complete');return true;
}
function updateNavigation(s){
  s.locDeviation=Math.atan2(s.x,Math.max(s.z+runwayOf(s).length,200))/(2.5*RAD);
  s.glideDeviation=Math.atan2(s.y-approachAltitude(s.z),Math.max(s.z+350,350))/(.7*RAD);
  computeGuidance(s,approachAltitude);
}
function fail(s,title,detail){s.result={success:false,title,detail};}
function scoreLanding(s){
  const td=s.touchdown;let score=100-td.descent*4-td.offset*.8;
  if(td.z< -1000)score-=15;if(!s.landingChecklistConfirmed)score-=10;
  if(s.gates.some(g=>!g.passed))score=Math.min(score,55);
  if(s.unstableSeconds>4)score=Math.min(score,60);
  return Math.round(clamp(score,25,100));
}
function updateApproach(s,dt){
  const ra=radioAltitude(s),nm=s.z/NM,monitor=s.mission?.kind!=='dual-glide';
  if(s.systems.ils.localizer&&s.apprArmed&&!s.locCaptured&&s.z>0&&Math.abs(s.locDeviation)<1&&Math.abs(Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw)))<35*RAD){s.locCaptured=true;emit(s,'LOC 截获 · 航向道已建立');}
  if(s.apprArmed&&s.glideDeviation<-.17)s.gsCaptureEligible=true;
  if(s.systems.ils.glideSlope&&s.locCaptured&&!s.gsCaptured&&s.gsCaptureEligible&&Math.abs(s.glideDeviation)<.17&&s.z>0){s.gsCaptured=true;emit(s,'G/S 截获 · 跟随下滑道');}
  const oldPhase=s.phase;
  s.phase=s.landed?'rollout':ra<50?'flare':ra<1000?'final':s.locCaptured?'configure':'intercept';
  if(oldPhase!==s.phase&&['configure','final','flare'].includes(s.phase))saveCheckpoint(s,PHASES[s.phase]);
  const checks=landingChecks(s),issues=checks.filter(c=>!c.ok).map(c=>c.label);
  for(const height of monitor?[1000,500]:[]){
    if(s.previousRA>height&&ra<=height&&!s.gates.some(g=>g.height===height)){
      s.gates.push({height,passed:issues.length===0,issues:[...issues],time:s.time});
      emit(s,`${height} 英尺 · ${issues.length?'不稳定，建议复飞':'稳定'}`,`${height===1000?'One thousand':'Five hundred'}, ${issues.length?'unstable':'stable'}`,issues.length?'warning':'info');
    }
  }
  if(monitor&&ra>=50&&ra<500&&issues.length&&!s.landed)s.unstableSeconds+=dt;
  for(const height of [200,100,50,40,30,20,10]){
    if(s.previousRA>height&&ra<=height&&!s.spokenHeights.includes(height)){
      s.spokenHeights.push(height);
      const words={200:'Two hundred',100:'One hundred',50:'Fifty',40:'Forty',30:'Thirty',20:'Twenty, retard',10:'Ten'};
      emit(s,height===20?'20 英尺 · RETARD · 收到 IDLE':height===30?'30 英尺 · 后拉侧杆开始拉平':`${height} 英尺`,words[height],height<=30?'action':'info');
    }
  }
  if(s.autoPilot&&ra<200){s.autoPilot=false;emit(s,'AP1 断开 · 接管侧杆完成着陆','Autopilot off','action');}
  s.previousRA=ra;
  if(s.landed){s.warning='';return;}
  const failedGate=s.gates.find(g=>!g.passed);
  s.warning=monitor&&ra>=50&&ra<500&&issues.length?'进近不稳定 · T 复飞':s.speed*KT<s.vapp-8?'速度偏低 · 检查推力':
    s.verticalSpeed< -6?'下降过快 · 轻按 ↓ 后拉抬头':ra<700&&s.gearPosition<.98?'起落架未到位 · G 放下':
    s.speed*KT>FLAP_LIMITS[Math.ceil(s.flapPosition)]&&s.flapPosition>.1?'襟翼速度超限 · 减速':'';
}

export function advanceFlight(s,input,dt,options){
  const RUNWAY=runwayOf(s);
  if(s.result||dt<=0)return;dt=clamp(dt,0,.05);s.time+=dt;
  refreshAirData(s);
  const groundCheckpoint=(state,label)=>{refreshAirData(state);saveCheckpoint(state,label);};
  if(beforeAirlinePhysics(s,{checkpoint:groundCheckpoint,dt})){updateRadio(s);return;}
  if(canAutoSkipCruise(s)){
    if(!options?.onCruiseSkip){skipCruise(s,{automatic:true});return;}
    if(options.onCruiseSkip(s,{automatic:true}))return 'cruise-transition';
  }
  if(beforeTaxiInPhysics(s,dt)){stepEngines(s,0,dt);refreshAirData(s);updateRadio(s);updateAirline(s,dt,{checkpoint:groundCheckpoint});return;}
  if(beforeGroundPhysics(s,dt,{checkpoint:groundCheckpoint})){stepEngines(s,0,dt);refreshAirData(s);updateNavigation(s);updateRadio(s);return;}
  if(!groundActive(s)&&!s.airline?.cruiseSkipped&&!s.radio.fired.takeoff&&!s.radio.fired.approach&&!s.radio.fired['circuit-takeoff'])queueRadio(s,s.airborne?'approach':s.route?'circuit-takeoff':'takeoff');
  beforeLevelPhysics(s,{emit,checkpoint:saveCheckpoint,dt});
  if(input.throttle)setLever(s,s.throttle+input.throttle*dt*.22);
  s.brake=Boolean(input.brake);updateStick(s,input,dt);
  if(!s.systems.flapsJammed)s.flapPosition=moveToward(s.flapPosition,s.flaps,dt*.22);
  s.gearPosition=moveToward(s.gearPosition,s.gear?1:0,dt*.15);
  updateNavigation(s);
  if(s.autoPilot&&(Math.abs(s.stickPitch)>.16||Math.abs(s.stickRoll)>.16||Math.abs(s.controls.rudder)>.16)){
    s.autoPilot=false;emit(s,'手动输入 · AP1 已断开','Autopilot off','action');
  }
  stepEngines(s,Math.max(targetSpeed(s),minimumSelectableSpeed(s))/KT,dt);
  const detent=thrustDetent(s);
  s.thrustMode=s.systems.thrustLocked?'THR LK':s.autoThrustActive?(s.throttle<.71?'SPEED LMT':'SPEED'):detent==='TOGA'?'MAN TOGA':detent==='FLX'?'MAN FLX':detent==='IDLE'?'IDLE':'MAN THR';
  const previous={x:s.x,y:s.y,z:s.z,pitch:s.pitch,roll:s.roll,yaw:s.yaw};
  if(groundActive(s)){s.stickPitch=0;s.pitch=s.roll=s.pitchRate=s.rollRate=0;s.spoilersArmed=false;s.autoBrake='OFF';}
  stepAttitude(s,dt);stepDynamics(s,dt);
  afterGroundPhysics(s,previous,dt,{checkpoint:groundCheckpoint});
  afterTaxiInPhysics(s,previous,dt,{checkpoint:groundCheckpoint});
  if(s.result||arrivalPreview(s))return;
  const terrainImpact=s.airborne?sweptContact(previous,s):null,buildingImpact=s.airborne?sweptCityContact(previous,s):null;
  const impact=buildingImpact&&(!terrainImpact||Math.hypot(buildingImpact.x-previous.x,buildingImpact.y-previous.y,buildingImpact.z-previous.z)<=Math.hypot(terrainImpact.x-previous.x,terrainImpact.y-previous.y,terrainImpact.z-previous.z))?buildingImpact:terrainImpact;
  if(impact){
    s.x=impact.x;s.y=impact.type==='building'?impact.y:Math.max(impact.y,impact.surface+RUNWAY.ground);s.z=impact.z;s.autoPilot=false;s.impact={...impact,time:s.time};
    fail(s,impact.type==='building'?'撞击建筑':impact.type==='water'?'撞击水面':'撞击地形',impact.type==='building'?'飞机已在建筑接触位置停止。注意前方障碍，保持安全高度并提前响应 TERRAIN / PULL UP。':s.airportId!=='training'?'飞机已在接触位置停止。提前响应 TERRAIN / PULL UP，按导航航线飞行；脱离地形前，避障优先于恢复许可高度。':'飞机已在接触位置停止。提前响应 TERRAIN / PULL UP，按海侧航线飞行；脱离地形前，避障优先于恢复许可高度。');return;
  }
  updateVisualReferences(s);
  updateExpandedRoute(s,{emit,checkpoint:saveCheckpoint});
  updateNavigation(s);
  if(s.mode==='takeoff'&&s.airborne&&!s.landed)s.phase='climb';
  s.maxAltitude=Math.max(s.maxAltitude,s.y-RUNWAY.ground);
  if(s.airborne&&s.y<=RUNWAY.ground&&Math.abs(s.x)<RUNWAY.width/2&&s.z<=5&&s.z>=-RUNWAY.length){
    const onRunway=Math.abs(s.x)<RUNWAY.width/2&&s.z<=5&&s.z>=-RUNWAY.length;
    s.y=RUNWAY.ground;s.touchdown={time:s.time,descent:Math.abs(s.verticalSpeed),offset:Math.abs(s.x),z:s.z,speed:s.speed,pitch:s.pitch,gearPosition:s.gearPosition,flapPosition:s.flapPosition,checklistConfirmed:s.landingChecklistConfirmed,visualReferences:s.systems.visualReferences};
    if(!onRunway)fail(s,'偏离跑道','按航向道修正方向，在跑道范围内接地；无法稳定时选择复飞。');
    else if((s.levelId&&Math.abs(Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw)))>20*RAD)||(s.levelId&&Math.abs(s.airData.beta)>15*RAD))fail(s,'接地方向偏差过大','拉平时小幅修正机头方向和侧滑，在跑道方向接地。');
    else if(s.gearPosition<.98)fail(s,'起落架未到位','提前放下起落架，确认三绿灯后再着陆。');
    else if(s.verticalSpeed< -6.5||Math.abs(s.roll)>.23)fail(s,'接地过重','在 30 英尺附近轻按 ↓ 后拉拉平，控制下降率和坡度。');
    else if(s.pitch>.23)fail(s,'抬头过大','拉平时使用小幅后拉，避免机尾擦地。');
    else{s.airborne=false;s.landed=true;s.phase='rollout';s.verticalSpeed=0;s.velocity.y=0;s.autoPilot=false;refreshAirData(s);queueRadio(s,'touchdown');emit(s,'主轮接地 · IDLE · 反推与刹车','Touchdown');}
  }
  if(!groundActive(s)&&!s.airborne&&s.airData.groundSpeed>3&&Math.abs(s.x)>RUNWAY.width/2)fail(s,'滑出跑道','小幅操纵方向保持中心线，使用刹车减速。');
  if(!groundActive(s)&&!s.airborne&&s.z< -RUNWAY.length&&s.airData.groundSpeed>8)fail(s,'冲出跑道','及时收至 IDLE，确认扰流板、自动刹车或反推工作。');
  if(s.landed&&!s.goAround&&!s.result&&!taxiInActive(s)){
    if(s.airline?.cruiseSkipped){if(initializeTaxiIn(s,scoreLanding(s)))groundCheckpoint(s,'着陆完成 · 手动脱离跑道');}
    else if(s.airData.groundSpeed<.6){s.velocity.x=s.velocity.z=0;refreshAirData(s);s.result={success:true,title:'平安落地',detail:s.gates.some(g=>!g.passed)?'已停稳。下次在稳定检查点前完成构型与速度调整。':'从进近、构型检查到接地停稳，你完成了整段飞行。',score:scoreLanding(s)};}
  }
  if(s.goAround&&!s.result){
    s.phase='goaround';s.warning='';
    if(s.verticalSpeed>.5&&!s.positiveClimbCalled){s.positiveClimbCalled=true;emit(s,'正爬升 · G 收起落架','Positive climb','action');}
    const targetRA=s.selectedAltitude-30;
    if(!requiresLanding(s)&&(!s.levelId||s.mission.kind==='landing')&&radioAltitude(s)>=targetRA&&s.verticalSpeed>-.5&&s.gearPosition<.02&&s.flapPosition<=1.05&&s.speed*KT>=150){
      s.result={success:true,title:'复飞成功',detail:'你选择了重新建立进近，完成爬升、收轮和构型调整。',score:s.gates.some(g=>!g.passed)?100:95};
    }
  }else if(s.mode==='landing'&&!s.result&&(!s.route?.active||s.route.inFinal))updateApproach(s,dt);
  else if(s.mode==='takeoff'&&s.airborne&&!s.result){
    s.warning=s.speed*KT<120?'速度偏低 · 增加推力':'';
    if(!s.levelId&&radioAltitude(s)>500)s.result={success:true,title:'起飞成功',detail:s.gearPosition>.02?'已稳定爬升。下次离地后收起起落架。':'客机已建立爬升，起落架已收起。',score:s.gearPosition>.02?85:100};
  }
  if(s.landed&&s.noseWheelDown&&s.cabin.noseAt===null)s.cabin.noseAt=s.time;
  updateRecovery(s,dt,{emit,checkpoint:saveCheckpoint});
  afterLevelPhysics(s,dt);updateAirline(s,dt,{checkpoint:saveCheckpoint});
  updateTerrainAwareness(s,dt,emit);updateATC(s,dt);updateRouteProtection(s,dt);
  updateRadio(s);
  updateStallWarning(s,dt,emit);
  observeEmergency(s,dt,queueRadio);
  if(s.stallWarning.active)s.warning='STALL · 失速警告 · 前推侧杆降低迎角';else if(s.warning.startsWith('STALL'))s.warning='';
}
export function getInstruction(s){
  if(s.result)return s.result.title;
  const groundHint=groundInstruction(s);if(groundHint)return groundHint;
  if(s.stallWarning?.active)return 'STALL · 失速警告 · 前推侧杆降低迎角';
  if(s.terrain?.level===2)return s.engines.every(e=>e.status!=='running')?'PULL UP · 前方地形，无动力转向可达低地':'PULL UP · 地形危险，T TOGA、↓ 后拉爬升并避开山体';
  if(s.terrain?.level===1)return 'TERRAIN AHEAD · 前方地形升高，检查航线与净空';
  if(s.stallWarning?.level===1)return '迎角接近上限 · 减小后拉，注意速度';
  if(s.routeProtection?.warning&&!s.routeProtection.suspended)return `航路偏离 ${(s.routeProtection.distance/1000).toFixed(1)} km · 按 ND 修正航迹`;
  if(s.atc?.deviation&&s.atc.seconds>=6)return '空管提醒 · '+s.atc.deviation.text;
  const airlineHint=airlineInstruction(s);if(airlineHint)return airlineHint;
  const missionHint=levelInstruction(s);if(missionHint)return missionHint;
  if(s.warning)return s.warning;
  if(s.messageUntil>s.time)return s.message;
  if(s.goAround){
    if(s.landed){if(s.brake)return '触地复飞 · 松开空格 / 刹车按钮，保持跑道方向';if(s.speed*KT<125)return '触地复飞 · TOGA 加速，保持中线，125 kt 后再抬轮';return s.pitch>.19?'保持约 12° 姿态，等待离地 · 正爬升后再收轮':'触地复飞 · ↓ 后拉抬轮，离地正爬升后 G 收轮';}
    if(s.verticalSpeed<1)return 'TOGA · 后拉侧杆，跟随 SRS 爬升指引';
    if(s.gear)return '正爬升 · G 收起落架';
    if(s.flaps>1)return 'Shift + F 逐档收襟翼，保持爬升';
    if(thrustDetent(s)==='TOGA'&&radioAltitude(s)>s.goAroundStartAltitude+300)return '选择 CL 档 · A/THR 控速，继续爬升';
    if(s.touchAndGo?.active&&s.touchAndGo.coastalTurn)return s.airportId!=='training'?`触地复飞 · 按 FD 左转，继续爬升至 ${s.selectedAltitude} ft`:`触地复飞 · 按 FD 左转海侧，继续爬升至 ${s.selectedAltitude} ft`;
    return `保持复飞航向，继续爬升至 ${s.selectedAltitude} ft`;
  }
  if(s.landed){if(s.throttle>.025)return '接地 · 推力杆收到 IDLE';if(!s.spoilersDeployed)return 'B 预位扰流板 · 空格刹车';if(!s.reverse&&s.speed*KT>70)return 'V 开启反推，保持跑道中心';return s.speed*KT<70&&s.reverse?'低于 70 kt · V 收反推，继续制动':'保持中线，刹车至完全停稳';}
  if(s.mode==='takeoff'){if(s.airborne)return s.gear?'正爬升 · G 收起落架':'松键回杆，保持爬升';return s.speed*KT<125?'推力杆 FLX / TOGA · 保持跑道中心':s.pitch>.19?'松键保持约 12° 姿态 · 等待离地':'达到起飞速度 · 按 ↓ 后拉至约 12°';}
  const ra=radioAltitude(s),nm=s.z/NM;
  if(ra<30)return s.throttle>.025?'轻按 ↓ 拉平 · 推力收到 IDLE':'保持拉平姿态，准备主轮接地';
  if(ra<200)return '手动操纵 · 跟随指引，30 英尺开始拉平';
  if(!s.apprArmed)return 'I / APPR 预位进近 · 按指引截获 ILS';
  if(!s.locCaptured)return '跟随横向指引，截获航向道';
  if(nm<8&&s.flaps<2)return 'F 放襟翼 CONF 2 · 自动推力按构型减速';
  if(nm<6&&!s.gear)return 'G 放下起落架 · 等待三绿灯';
  if(nm<5&&s.flaps<3)return 'F 放襟翼 CONF 3';
  if(nm<4&&s.flaps<s.landingConfig)return `F 放襟翼 CONF ${FLAPS[s.landingConfig]}`;
  if(nm<4&&!s.spoilersArmed)return 'B 预位地面扰流板';
  if(nm<4&&s.autoBrake==='OFF')return 'M 选择自动刹车 LOW / MED';
  if(nm<4&&!s.landingChecklistConfirmed)return '确认构型到位，完成着陆检查';
  return s.gsCaptured?'ILS 已建立 · 保持航迹与目标速度':'保持高度，从下方截获下滑道';
}

// Browser time is accumulated into fixed 100 Hz simulation ticks. The remainder
// is checkpointed along with physics, so replay does not depend on render FPS.
export function advanceSimulation(s,input,elapsed,options){
  if(s.result||!Number.isFinite(elapsed)||elapsed<=0)return;
  s.clock.accumulator+=Math.min(elapsed,.5);
  while(s.clock.accumulator>=.01-1e-10&&!s.result){s.clock.accumulator-=.01;if(advanceFlight(s,input,.01,options)==='cruise-transition'){s.clock.accumulator=0;return 'cruise-transition';}}
  if(s.result)s.clock.accumulator=0;
}
