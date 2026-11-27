import {aircraftDefinition} from '../aircraft/registry.js';
import {recoveryInstruction} from './recovery.js';
import {initializeArrival,preparedAtTouchdown} from './arrival.js';
import {queueRadio} from '../comms/radio.js';
import {initializeExpanded,beforeExpanded,afterExpanded,expandedChecks,expandedInstruction,isExpanded,onExpandedGoAround} from './expanded.js';
import {getLevel} from './catalog.js';
import {FT,KT,RAD,RUNWAY,clamp,wrap} from '../sim/constants.js';
import {setEngineStatus} from '../sim/engines.js';
import {runwayHeading} from '../airports/registry.js';

export function initializeLevel(s,level){
 s.levelId=level.id;
 s.mission={kind:level.kind,triggered:false,triggerTime:null,acknowledged:false,responseTime:null,clear:false,avoided:false,stableSeconds:0,practice:false,events:[],initialHeading:0,maxHeadingError:0,minSpeed:999,alert:null};
 if(level.startZ){
  s.z=level.startZ;s.y=aircraftDefinition(s).airframe.referenceHeight+15.24+Math.tan(3*RAD)*s.z;s.previousRA=(s.y-aircraftDefinition(s).airframe.referenceHeight)*FT;
  s.checkpointLabel='关卡起点';
 }
 initializeExpanded(s,level);initializeArrival(s,level);s.weather.ambientTurbulence=.2;
 if(level.kind==='windshear'){
  s.weather.disturbances=[{x:0,z:3900,radiusX:2000,radiusZ:1500,base:0,top:520,wind:{x:1,y:-5,z:-20}}];
 }
}
const height=s=>Math.max(0,(s.y-aircraftDefinition(s).airframe.referenceHeight)*FT);
const ranges=s=>{const o=aircraftDefinition(s).operations;return {takeoff:o.takeoffAssessmentKt??[125,230],engine:o.engineOutAssessmentKt??[145,230],go:o.goAroundAssessmentKt??[150,220]};};
const remainingThrust=s=>s.engines.slice(1).every(e=>e.status==='running'&&e.thrustN>(aircraftDefinition(s).operations.engineOutMinThrustN??50000));
const windStrength=s=>s.airData.disturbanceStrength||0;
function event(s,type,text,spoken,emit){if(type==='windshear')queueRadio(s,'wind',true);if(type==='clear')queueRadio(s,'clear');s.mission.events.push({type,time:s.time});emit(s,text,spoken,'warning');}
export const holdConfiguration=s=>s.mission?.kind==='windshear'&&s.mission.triggered&&!s.mission.clear&&!s.mission.avoided;
export function acknowledgeLevel(s){
 if(!s.mission?.triggered||(!s.mission.fault&&s.mission.kind!=='engine-out'))return false;
 if(!s.mission.acknowledged){s.mission.acknowledged=true;s.mission.alert=null;s.mission.events.push({type:'acknowledged',time:s.time});}
 return true;
}
export function levelGoAround(s){
 if(!s.mission)return;
 const m=s.mission;
 onExpandedGoAround(s);
 if(m.responseTime===null)m.responseTime=s.time;
 if(m.kind==='goaround'){if(!m.triggered){m.triggered=true;m.triggerTime=s.time;m.events.push({type:'goaround-command',time:s.time});}m.alert=null;}
 if(m.kind==='windshear'&&!m.triggered){m.avoided=true;m.clear=true;m.events.push({type:'early-avoidance',time:s.time});}
}
export function beforeLevelPhysics(s,{emit,checkpoint,dt=0}){
 beforeExpanded(s,{emit,checkpoint,dt});
 if(!s.mission||s.result)return;
 const m=s.mission,ra=height(s);
 if(m.kind==='goaround'&&!m.triggered&&(ra<=800||s.goAround)){
  m.triggered=true;m.triggerTime=s.time;m.alert='复飞指令 · T 选择 TOGA';event(s,'goaround-command','复飞指令 · 中止进近，选择 TOGA','Go around',emit);
 }
 if(m.kind==='engine-out'&&!m.triggered&&s.airborne&&ra>=180){
  m.triggered=true;m.triggerTime=s.time;m.initialHeading=0;m.minSpeed=s.speed*KT;s.autoPilot=false;
  setEngineStatus(s,0,'failed');m.alert='ENG 1 FAIL · 保持操纵，C 确认';
  event(s,'engine-failure','ENG 1 FAIL · 左发失效，保持操纵','Engine one failure',emit);checkpoint(s,'单发失效 · 稳定操纵');
 }
 if(m.kind==='windshear'&&!m.triggered&&windStrength(s)>.045){
  m.triggered=true;m.clear=false;m.avoided=false;m.triggerTime=s.time;m.alert='WINDSHEAR · T TOGA · 保持构型';
  event(s,'windshear','WINDSHEAR · TOGA，脱离前保持构型','Wind shear, wind shear, wind shear',emit);checkpoint(s,'风切变 · 脱离处置');
 }
 if(m.kind==='windshear'&&m.triggered&&!m.clear&&s.goAround&&windStrength(s)<.025){
  m.clear=true;m.alert=null;event(s,'clear','已脱离风切变 · 加速后再收轮、收襟翼','Clear of wind shear',emit);checkpoint(s,'脱离后 · 恢复爬升');
 }
}
export function levelChecks(s){
 const expanded=expandedChecks(s);if(expanded)return expanded;
 const m=s.mission,l=getLevel(s.levelId);if(!m||!l)return [];
 const r=ranges(s),ra=height(s),heading=Math.abs(wrap(s.yaw-m.initialHeading))/RAD;
 if(m.kind==='takeoff')return[{label:`空速保持 ${r.takeoff[0]}–${r.takeoff[1]} kt`,ok:s.speed*KT>=r.takeoff[0]&&s.speed*KT<=r.takeoff[1]},{label:'离地并保持正爬升',ok:s.airborne&&s.verticalSpeed>.5},{label:'起落架收起到位',ok:s.gearPosition<.02},{label:'高度达到 500 ft',ok:ra>=500},{label:`航向保持 ${Math.round(runwayHeading(s))}° ±15°`,ok:Math.abs(s.yaw)<15*RAD},{label:'保持稳定 3 秒',ok:m.stableSeconds>=3}];
 if(m.kind==='engine-out')return[{label:'识别 ENG 1 失效',ok:m.triggered},{label:'C 确认故障提示',ok:m.acknowledged},{label:'剩余发动机提供推力',ok:remainingThrust(s)},{label:'正爬升、起落架收起',ok:s.gearPosition<.02&&s.verticalSpeed>.5},{label:`1000 ft / ${r.engine[0]}–${r.engine[1]} kt / 航向 ±15°`,ok:ra>=1000&&s.speed*KT>=r.engine[0]&&s.speed*KT<=r.engine[1]&&heading<15},{label:'保持稳定 5 秒',ok:m.stableSeconds>=5}];
 if(m.kind==='windshear'&&s.mission.recovery?.stage==='return'&&s.route?.inFinal)return[{label:'已脱离 / 避让风切变',ok:m.clear||m.avoided},{label:'实际着陆构型与检查',ok:s.gearPosition>.98&&Math.abs(s.flapPosition-s.landingConfig)<.05&&s.landingChecklistConfirmed},{label:'着陆并制动至停稳',ok:s.landed&&s.airData.groundSpeed<.6}];
 if(m.kind==='windshear'&&s.mission.recovery?.stage==='return')return[{label:'已脱离 / 避让风切变',ok:m.clear||m.avoided},{label:'按 ND 海侧返场',ok:true},{label:'最终落地停稳',ok:false}];
 if(m.kind==='goaround'||m.kind==='windshear')return[
  {label:m.kind==='windshear'?'识别警告 / 提前避让':'接收复飞指令',ok:m.triggered||m.avoided},
  {label:'TOGA · 建立复飞',ok:s.goAround},
  ...(m.kind==='windshear'?[{label:'脱离切变后再清理构型',ok:m.clear}]:[]),
  {label:'起落架收起 / 襟翼 ≤1',ok:s.gearPosition<.02&&s.flapPosition<=1.05},
  {label:`${l.targetAltitude} ft 附近 / ${r.go[0]}–${r.go[1]} kt`,ok:ra>=l.targetAltitude-30&&s.speed*KT>=r.go[0]&&s.speed*KT<=r.go[1]},
  {label:`保持稳定 ${m.kind==='windshear'?5:3} 秒`,ok:m.stableSeconds>=(m.kind==='windshear'?5:3)},
 ];
 return [];
}
function finish(s,title,detail,score){s.result={success:true,title,detail,score:Math.round(clamp(score,25,100)),levelCleared:!s.mission.practice};}
export function afterLevelPhysics(s,dt){
 if(s.mission?.kind==='airline')return;
 if(isExpanded(s)){afterExpanded(s,dt);return;}
 if(!s.mission)return;
 const r=ranges(s),m=s.mission,l=getLevel(s.levelId),ra=height(s),heading=Math.abs(wrap(s.yaw-m.initialHeading))/RAD;
 if(m.kind==='engine-out'&&m.triggered){m.maxHeadingError=Math.max(m.maxHeadingError,heading);m.minSpeed=Math.min(m.minSpeed,s.speed*KT);}
 if(s.result){
  if(s.result.success){
   if(m.kind==='landing'&&s.landed){
    const gates=(!s.arrival||preparedAtTouchdown(s))&&(l.scenario!=='full'||(s.gates.length===2&&s.gates.every(g=>g.passed&&!g.preset)&&s.landingChecklistConfirmed));
    s.result.levelCleared=gates&&!m.practice;
    if(!gates){s.result.title='已停稳 · 稳定进近待完善';s.result.detail=l.scenario==='full'?'接地前需完成着陆构型、检查单并通过两个稳定检查点，可重试本关。':'接地前需完成实际着陆构型和检查单，可重试本关。';}
   }else if(m.kind==='windshear'&&s.landed){s.result.levelCleared=preparedAtTouchdown(s)&&(m.clear||m.avoided)&&m.recovery?.stage==='return'&&!m.practice;if(s.result.levelCleared){s.result.title='风切变返场着陆完成';s.result.detail='已脱离切变、连续返场并完成着陆停稳。';}}else{s.result.levelCleared=false;s.result.detail=m.kind==='landing'?'复飞是有效的安全选择。本关着陆目标尚未完成，可重新练习进近。':'本关目标是识别异常并脱离，请按关卡目标重试。';}
  }
  return;
 }
 if(m.kind==='landing')return;
 const stable=s.airborne&&s.verticalSpeed>-.5&&Math.abs(s.roll)<12*RAD&&!s.airData.stalled;
 let eligible=false,seconds=3;
 if(m.kind==='takeoff')eligible=(!s.ground||(s.ground.heldShort&&s.ground.lineupComplete&&s.ground.takeoffCleared))&&stable&&s.verticalSpeed>.5&&ra>=500&&s.gearPosition<.02&&Math.abs(s.yaw)<15*RAD&&s.speed*KT>=r.takeoff[0]&&s.speed*KT<=r.takeoff[1];
 if(m.kind==='engine-out'){seconds=5;eligible=stable&&m.triggered&&m.acknowledged&&ra>=1000&&s.gearPosition<.02&&s.flapPosition<=1.05&&s.speed*KT>=r.engine[0]&&s.speed*KT<=r.engine[1]&&heading<15&&s.verticalSpeed>.5&&s.engines[0].status==='failed'&&remainingThrust(s);}
 if(m.kind==='goaround'){seconds=3;eligible=stable&&s.goAround&&(m.triggered||m.avoided)&&(m.kind!=='windshear'||m.clear)&&ra>=l.targetAltitude-30&&s.gearPosition<.02&&s.flapPosition<=1.05&&s.speed*KT>=r.go[0]&&s.speed*KT<=r.go[1];}
 m.stableSeconds=eligible?m.stableSeconds+dt:0;
 if(m.stableSeconds+1e-6<seconds)return;
 if(m.kind==='takeoff')finish(s,'起飞关卡完成','已完成加速、抬轮、收轮与稳定爬升。',100);
 if(m.kind==='goaround')finish(s,'复飞关卡完成','已完成 TOGA、正爬升、构型清理与目标高度保持。',100);
 if(m.kind==='engine-out')finish(s,s.engines.length>2?'一发失效处置完成':'单发爬升完成','左发仍处于失效状态；你使用剩余动力保持了航向、空速与稳定爬升。',100-Math.max(0,m.maxHeadingError-3)-Math.max(0,r.engine[0]-m.minSpeed)*.5);

}
export function levelInstruction(s){
 const recovery=recoveryInstruction(s);if(recovery)return recovery;
 const expanded=expandedInstruction(s);if(expanded)return expanded;
 const m=s.mission;if(!m)return null;const r=ranges(s);
 if(m.kind==='engine-out'&&m.triggered){
  if(!m.acknowledged)return 'ENG 1 失效 · 先保持操纵，C 确认故障';
  if(s.speed*KT>r.engine[1])return `速度偏高 · S 收小剩余推力，减速至 ${r.engine[1]} kt 以下`;
  if(s.throttle<.9&&(height(s)<500||s.speed*KT<160||s.verticalSpeed<.5))return '剩余发动机需要推力 · T 选择 TOGA';
  if(s.gearPosition>.02)return '保持空速和方向 · 正爬升后 G 收轮';
  if(s.engines.length>2)return s.speed*KT<r.engine[0]?'空速偏低 · 减小爬升姿态，保持能量':'一发失效 · 使用其余三台发动机，跟随 FD 保持爬升';
  return s.speed*KT<r.engine[0]?'空速偏低 · 减小爬升姿态，保持能量':`单发爬升 · 保持航向，爬升至 1000 ft · 稳定 ${Math.min(5,m.stableSeconds).toFixed(0)}/5 s`;
 }
 if(m.kind==='windshear'&&!m.avoided){
  if(m.triggered&&!m.clear)return s.goAround?'TOGA · 跟随 FD，机翼平稳 · 脱离前保持构型':'WINDSHEAR · T 选择 TOGA，中止进近';
 }
 if(s.goAround&&s.speed*KT>r.go[1])return '速度偏高 · L 选择 CL，让 A/THR 减速';
 if(m.kind==='goaround'&&!s.goAround&&m.triggered)return '复飞指令 · T 选择 TOGA，中止进近';
 if(m.kind==='takeoff'&&s.speed*KT>r.takeoff[1])return '速度偏高 · S 收小推力，保持稳定爬升';
 if(m.kind==='takeoff'&&height(s)>=500&&s.gearPosition<.02)return '保持空速与航向 · 稳定爬升 3 秒';
 return null;
}
