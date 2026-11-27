import {aircraftDefinition} from '../aircraft/registry.js';
import {recoveryInstruction} from './recovery.js';
import {FT,KT,RAD,RUNWAY,clamp,wrap} from '../sim/constants.js';
import {setMotion} from '../sim/aerodynamics.js';
import {setEngineStatus} from '../sim/engines.js';
import {failAutoThrust,loseILS,jamFlaps} from '../sim/systems.js';
import {createRoute,advanceRoute} from './route.js';
import {queueRadio} from '../comms/radio.js';
import {preparedAtTouchdown} from './arrival.js';
import {getLevel} from './catalog.js';
export const expandedKinds=['circuit','engine-return','crosswind','low-visibility','athr-failure','ils-loss','flap-jam','dual-glide'];
export const isExpanded=s=>expandedKinds.includes(s.mission?.kind);
const ra=s=>Math.max(0,(s.y-aircraftDefinition(s).airframe.referenceHeight)*FT);
const goAroundAltitude=s=>getLevel(s.levelId)?.targetAltitude||3000;
export function initializeExpanded(s,l){
 Object.assign(s.mission,{fault:null,manualSeconds:0,manualTakenOver:false,decisionHeight:null,lateDecision:false,landedHeading:null});
 if(l.initialFlaps!==undefined)s.flaps=s.flapPosition=l.initialFlaps;
 if(l.initialSpeed)s.speed=l.initialSpeed/KT;
 if(l.startAltitude){s.y=aircraftDefinition(s).airframe.referenceHeight+l.startAltitude/FT;s.previousRA=l.startAltitude;}
 if(l.kind==='circuit'||l.kind==='engine-return'){
  s.route=createRoute();s.autoThrust=true;s.selectedAltitude=1500;s.landingChecklistConfirmed=false;s.gates=[];
 }
 if(l.kind==='crosswind'){
  Object.assign(s.weather,{wind:{speedKt:8,directionDeg:180,vertical:0},gust:{amplitude:1,period:11,seed:27},runwayFriction:.4,rain:.55,overcast:.7,visibility:18000});
  s.yaw=-Math.asin((8/KT)/s.speed);
 }
 if(l.kind==='low-visibility')Object.assign(s.weather,{visibility:550,cloudBase:110,rain:.7,overcast:.95,gust:{amplitude:.7,period:9,seed:41}});
 if(l.kind==='flap-jam')s.landingChecklistConfirmed=false;
 if(l.kind==='dual-glide'){
  s.apprArmed=s.locCaptured=s.gsCaptured=false;s.autoThrust=false;s.flightDirector=true;s.gates=[];s.landingChecklistConfirmed=false;s.selectedSpeed=185;
 }
}
function fault(s,type,text,spoken,hooks){
 const m=s.mission;m.triggered=true;m.triggerTime=s.time;m.fault={type,active:true};m.alert=text;m.events.push({type,time:s.time});
 hooks.emit(s,text,spoken,'warning');queueRadio(s,{engine:'engine',athr:'athr',ils:'ils',flaps:'flaps',dual:'dual'}[type],true);hooks.checkpoint(s,text);
}
export function beforeExpanded(s,h){
 const m=s.mission;if(!isExpanded(s)||s.result)return;
 if(m.kind==='engine-return'&&!m.triggered&&s.airborne&&ra(s)>=180){
  setEngineStatus(s,0,'failed');s.autoPilot=false;m.initialHeading=0;m.minSpeed=s.speed*KT;
  fault(s,'engine','ENG 1 FAIL · 保持操纵，C 确认后返场','Engine one failure',h);
 }
 if(m.kind==='athr-failure'&&!m.triggered&&ra(s)<=1000){failAutoThrust(s);fault(s,'athr','A/THR FAIL · C 确认，匹配推力杆后手动控速','',h);}
 if(m.kind==='ils-loss'&&!m.triggered&&ra(s)<=1000){loseILS(s);fault(s,'ils','ILS LOST · 接管手飞，C 确认后目视或复飞','Autopilot off',h);}
 if(m.kind==='flap-jam'&&!m.triggered&&s.flaps>2&&s.flapPosition>=2){
  s.flapPosition=2;jamFlaps(s);s.landingConfig=2;s.vapp=165;fault(s,'flaps','FLAPS JAM · 实际 CONF 2，目标 165 kt','',h);
 }
 if(m.kind==='dual-glide'&&!m.triggered&&s.time>=2){
  setEngineStatus(s,0,'failed');setEngineStatus(s,1,'failed');s.systems.autoThrustAvailable=false;s.systems.apAvailable=false;s.systems.emergencyPower=true;s.autoPilot=s.autoThrust=false;s.flightDirector=true;
  fault(s,'dual','ALL ENG FAIL · C 确认，保持滑翔速度','All engines failure',h);
 }
 if(m.kind==='low-visibility'&&!m.triggered&&ra(s)<=200){
  m.triggered=true;m.triggerTime=s.time;m.decisionHeight=ra(s);m.alert='MINIMUM · 未建立目视参考，T 复飞';m.events.push({type:'minimum',time:s.time});
  h.emit(s,m.alert,'Minimum','warning');queueRadio(s,'minimum',true);h.checkpoint(s,'最低高度 · 复飞决断');
 }
 if(m.kind==='low-visibility'&&!s.goAround&&!m.recovery&&ra(s)<100)m.lateDecision=true;
 if(m.kind==='athr-failure'&&m.triggered){
  m.manualSeconds=!s.systems.thrustLocked&&!s.autoThrustActive&&Math.abs(s.speed*KT-s.vapp)<=10&&s.airborne?m.manualSeconds+h.dt:0;
  m.manualBest=Math.max(m.manualBest||0,m.manualSeconds);
 }
 if(m.kind==='engine-return'&&m.triggered){m.maxHeadingError=Math.max(m.maxHeadingError,Math.abs(s.airData.beta)/RAD);m.minSpeed=Math.min(m.minSpeed,s.speed*KT);}
}
export function updateExpandedRoute(s,h){if(s.route?.active)advanceRoute(s,{...h,radio:queueRadio});}
export function onExpandedGoAround(s){
 if(!isExpanded(s))return;
 if(s.mission.kind==='low-visibility'&&!s.mission.recovery){s.mission.avoided=!s.mission.triggered;s.mission.decisionHeight=ra(s);s.mission.alert=null;}
 if(s.route)s.route.active=false;
}
export function glideInfo(s){
 const height=ra(s)/FT,q=s.airData.q,weight=s.weight*1000*9.80665;
 const cl=weight/Math.max(q*aircraftDefinition(s).airframe.wingArea,1),cd=.022+.008*s.flapPosition+.022*s.gearPosition+.043*cl*cl+.016;
 const ratio=cl/Math.max(cd,.01),range=Math.max(0,height-15)*ratio*Math.max(.5,s.airData.groundSpeed/Math.max(s.airData.tas,1));
 return{range,margin:range-Math.max(s.z,0),ratio};
}
function outcome(s,title,detail,score=95){s.result={success:true,title,detail,score:Math.round(clamp(score,25,100)),levelCleared:!s.mission.practice};}
function landingScore(s){const t=s.touchdown;return clamp(100-t.descent*4-t.offset*.6-(t.z< -1300?10:0),25,100);}
export function afterExpanded(s,dt){
 if(!isExpanded(s))return;
 const m=s.mission;
 if(s.result){
  if(!s.result.success)return;
  if(s.landed){
   let passed=preparedAtTouchdown(s),reason='接地前需要完成对正、实际着陆构型和检查单。';
   if(s.route){passed=passed&&s.route.inFinal&&s.route.visited.length===4&&s.landingChecklistConfirmed;reason='需要按顺序完成返场航线与着陆检查。';}
   if(m.fault){passed=passed&&m.triggered&&m.acknowledged;if(!m.acknowledged)reason='请识别并确认本关故障后完成任务。';}
   if(m.kind==='athr-failure'){passed=passed&&m.manualTakenOver&&(m.manualBest||0)>=10;reason='本关需要匹配推力杆，并手动控速至少 10 秒。';}
   if(m.kind==='flap-jam'){passed=passed&&s.landingChecklistConfirmed&&Math.abs(s.flapPosition-2)<.05;reason='需要按实际 CONF 2 完成着陆检查。';}
   if(m.kind==='low-visibility'){passed=passed&&m.recovery?.stage==='return'&&s.touchdown?.visualReferences;reason='需要复飞返场，在恢复目视条件后着陆停稳。';}
   if(m.kind==='dual-glide'){passed=passed&&s.engines.every(e=>e.status==='failed'&&e.thrustN===0);reason='本关要求双发持续失效下完成无动力着陆。';}
   s.result.levelCleared=passed&&!m.practice;
   if(!passed){s.result.title='已停稳 · 关卡目标待完成';s.result.detail=reason;}
   else{ s.result.title={circuit:'完整五边完成','engine-return':'单发返场着陆完成',crosswind:'侧风湿跑道完成','low-visibility':'雨雾返场着陆完成','athr-failure':'手动推力着陆完成','ils-loss':'失去 ILS 后着陆完成','flap-jam':'襟翼卡阻处置完成','dual-glide':'无动力着陆完成'}[m.kind]||'着陆完成';s.result.score=Math.round(landingScore(s)-(m.kind==='low-visibility'&&m.lateDecision?10:0));s.result.detail='从识别情景、管理航迹与能量到接地停稳，本关目标已完成。';}
  }else s.result.levelCleared=false;
  return;
 }

}
export function expandedChecks(s){
 const m=s.mission;if(!isExpanded(s))return null;
 if(s.goAround){const maxFlaps=s.systems.flapsJammed?s.systems.jammedPosition:1;return[{label:'识别情景并选择复飞',ok:s.goAround&&!m.lateDecision},{label:'正爬升 / 足够推力',ok:s.verticalSpeed>0},{label:'起落架收起',ok:s.gearPosition<.02},{label:s.systems.flapsJammed?'保持卡阻的实际 CONF 2':'襟翼收至 1 或以下',ok:s.flapPosition<=maxFlaps+.05},{label:`${goAroundAltitude(s)} ft 附近，150–220 kt`,ok:ra(s)>=goAroundAltitude(s)-30&&s.speed*KT>=150&&s.speed*KT<=220}];}
 if(s.route?.active&&!s.route.inFinal)return[{label:'已离地并收轮',ok:s.airborne&&s.gearPosition<.02},{label:`当前：${s.route.points[s.route.index].name}`,ok:true},{label:`航段进度 ${s.route.visited.length} / 4`,ok:s.route.visited.length===4},{label:'按 ND 航线返场，不跳段',ok:Math.abs(s.route.crossTrack)<1500},...(m.kind==='engine-return'?[{label:'确认左发失效，使用剩余动力',ok:m.triggered&&m.acknowledged}]:[])];
 if(m.kind==='low-visibility'&&!m.recovery)return[{label:'识别最低高度 / 引导失效',ok:m.triggered||m.avoided},{label:'及时选择复飞',ok:s.goAround&&!m.lateDecision},{label:'起落架收起 / 襟翼 ≤1',ok:s.gearPosition<.02&&s.flapPosition<=1.05},{label:'3000 ft 附近，150–220 kt',ok:ra(s)>=2970&&s.speed*KT>=150&&s.speed*KT<=220},{label:'稳定 3 秒',ok:m.stableSeconds>=3}];
 if(m.kind==='dual-glide')return[{label:'确认双发失效',ok:m.triggered&&m.acknowledged},{label:'保持 165–200 kt，避免失速',ok:s.speed*KT>=165&&s.speed*KT<=200&&!s.airData.stalled},{label:'跑道预计可达（仅估算）',ok:glideInfo(s).margin>=-200},{label:'起落架放下、CONF 1',ok:s.gearPosition>.98&&Math.abs(s.flapPosition-1)<.05},{label:'在跑道接地并制动停稳',ok:s.landed&&s.airData.groundSpeed<.6}];
 return[...(m.fault?[{label:'识别并确认故障',ok:m.triggered&&m.acknowledged}]:[]),...(m.kind==='athr-failure'?[{label:'匹配推力杆，解除 THR LK',ok:m.manualTakenOver},{label:'手动控速保持 10 秒',ok:(m.manualBest||0)>=10}]:[]),{label:`目标速度 ${s.vapp} kt`,ok:Math.abs(s.speed*KT-s.vapp)<10},{label:'起落架三绿灯 / 实际着陆构型',ok:s.gearPosition>.98&&Math.abs(s.flapPosition-s.landingConfig)<.05},{label:'着陆检查完成',ok:s.landingChecklistConfirmed},{label:'保持跑道方向和下降率',ok:Math.abs(s.locDeviation)<.5&&s.verticalSpeed>-5.5}];
}
export function expandedInstruction(s){
 const m=s.mission;if(!isExpanded(s))return null;
 const recovery=recoveryInstruction(s);if(recovery)return recovery;
 if(m.fault&&!m.acknowledged)return `${m.alert||'故障已触发'} · C 确认`;
 if(s.goAround)return m.kind==='athr-failure'?'自动推力不可用 · 手动管理复飞速度，按 FD 爬升':s.systems.flapsJammed?'保持实际 CONF 2 · 足够推力爬升，不能继续收襟翼':null;
 if(m.kind==='dual-glide'){
  if(!m.triggered)return '监控发动机 · 准备无动力飞行';
  if(ra(s)<80)return '无动力末进近 · 提前柔和拉平，控制下降率';
  if(s.z>3000)return `滑翔目标 185 kt · 预计可达 ${(glideInfo(s).range/1000).toFixed(1)} km`;
  if(s.gearPosition<.98)return '接近跑道 · G 放轮，监控剩余能量';
  if(s.flapPosition<.95)return '约 2 km · F 放至 CONF 1，目标 165 kt';
  return null;
 }
 if(m.kind==='athr-failure'&&m.triggered){
  if(s.systems.thrustLocked)return `THR LK · W / S 将推力杆匹配至约 ${Math.round(s.systems.heldCommands.reduce((a,b)=>a+b,0)/Math.max(1,s.systems.heldCommands.length)*100)}%`;
  if(s.speed*KT>s.vapp+7)return '手动推力 · S 小幅减推力，保持目标速度';
  if(s.speed*KT<s.vapp-5)return '手动推力 · W 小幅加推力，保持目标速度';
 }
 if(m.kind==='ils-loss'&&m.triggered&&!s.goAround)return 'ILS 已丢失 · 目视手飞对正；无法稳定时 T 复飞';
 if(m.kind==='flap-jam'&&!m.triggered&&s.apprArmed&&s.locCaptured)return 'F 逐级放襟翼 · 监控实际位置；G 放轮，B / M 预位';
 if(m.kind==='flap-jam'&&m.triggered&&!s.landingChecklistConfirmed)return '按实际 CONF 2 / 165 kt 进近 · 放轮后 C 完成检查';
 if(m.kind==='low-visibility'&&!s.goAround&&!m.recovery&&m.triggered)return 'MINIMUM · 未建立目视参考，T 复飞';
 if(s.route?.active&&!s.route.inFinal){
  if(!s.airborne)return null;
  if(s.gear)return '正爬升后 G 收轮 · 按 ND 航线飞行';
  if(s.throttle>.85&&ra(s)>300)return 'L 选择 CL，A/THR 控速 · A 可辅助航线';
  if(s.route.index>=2&&s.flaps<2)return '进入三边 · F 放至 CONF 2，按航线减速';
  if(s.route.index>=3&&(!s.gear||s.flaps<s.landingConfig))return '四边准备着陆 · G 放轮，F 放至着陆构型';
  return `${s.route.points[s.route.index].name} · 目标 ${Math.round(s.route.targetAltitude)} ft · 按 ND 转弯`;
 }
 return null;
}
