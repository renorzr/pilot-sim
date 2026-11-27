import {waterEntryTargets} from '../sim/water-contact.js';
import {KT,FT,RAD,wrap} from '../sim/constants.js';
import {eventWaterCurrent,eventWaterAt} from './event-world.js';
import {historyReferenceSpeed,historicalApproach} from './us1549.js';

// Presentation only. No controls, state changes, extra assessment or score.
export function ditchingGuide(s){
 const h=s.historical;if(!h||s.result||h.alternate)return null;const T=waterEntryTargets(s);
 const impact=s.water?.firstImpact,height=Math.max(0,(s.y-(s.water?.level||0))*FT);
 if(!impact&&(h.controlSource!=='player'||!(h.manualTarget==='river'||h.manualTarget==='free'&&height<800&&eventWaterAt(s.x,s.z))))return null;
 const phase=impact?'contact':height<=100?'entry':height<=800?'approach':'glide',active=phase==='entry'||phase==='contact';
 const current=s.water?.current||eventWaterCurrent,velocity=impact?.velocity||s.velocity;
 const beta=impact?.waterBeta??impact?.beta??wrap(s.yaw-Math.atan2(velocity.x-current.x,-(velocity.z-current.z)));
 const mass=Math.sqrt((impact?.massTonnes||s.weight||T.referenceMass)/T.referenceMass);
 const ias=(impact?.ias??s.airData?.ias??s.speed)*KT,water=(impact?.waterSpeed??Math.hypot(velocity.x-current.x,velocity.z-current.z))*KT;
 const sink=impact?.sinkMps??-s.verticalSpeed,pitch=(impact?.pitch??s.pitch)/RAD,roll=(impact?.roll??s.roll)/RAD,slip=beta/RAD;
 const gear=impact?.gearPosition??s.gearPosition,flap=impact?.flapPosition??s.flapPosition;
 function metric(id,label,value,min,max,target,{enabled=active,secondary=null}={}){
  const direction=value<min?'low':value>max?'high':null;
  return{id,label,value:value.toFixed(1),target,secondary,state:enabled?(direction?'caution':'good'):'neutral',status:enabled?(direction==='low'?'偏低':direction==='high'?'偏高':'范围内'):'入水时',symbol:enabled?(direction==='low'?'↓':direction==='high'?'↑':'✓'):'·'};
 }
 const rows=[
  metric('ias','空速 kt',ias,T.iasMinKt*mass,T.iasMaxKt*mass,`${Math.round(T.iasMinKt*mass)}–${Math.round(T.iasMaxKt*mass)}`),
  metric('water-speed','水相对 kt',water,0,T.waterMaxKt,`≤${T.waterMaxKt}`),
  metric('sink','下降 m/s',sink,0,T.sinkMaxMps,`0–${T.sinkMaxMps}`,{secondary:`≤${Math.round(T.sinkMaxMps*FT*60)} ft/min`}),
  metric('pitch','俯仰 °',pitch,T.pitchMinDeg,T.pitchMaxDeg,`${T.pitchMinDeg}–${T.pitchMaxDeg}`),
  metric('roll','坡度 °',roll,-T.rollMaxDeg,T.rollMaxDeg,`±${T.rollMaxDeg}`),
  metric('slip','水面侧滑 °',slip,-T.slipMaxDeg,T.slipMaxDeg,`±${T.slipMaxDeg}`),
  {id:'gear',label:'起落架',value:gear<.05?'UP':gear>.95?'DOWN':'TRANSIT',target:'UP',state:gear<.05?'good':'caution',status:gear<.05?'已收起':'需收轮',symbol:gear<.05?'✓':'!'},
  {id:'flaps',label:'襟翼',value:flap.toFixed(1),target:`CONF ${T.flap}`,state:Math.abs(flap-T.flap)<.05?'good':phase==='glide'?'neutral':'caution',status:Math.abs(flap-T.flap)<.05?'已到位':phase==='glide'?'按能量准备':'未到位',symbol:Math.abs(flap-T.flap)<.05?'✓':phase==='glide'?'·':'!'},
 ];
 // Airborne stall warning has priority even while entry targets are deferred.
 if(!impact&&s.stallWarning?.active)Object.assign(rows[0],{state:'danger',status:'失速警告',symbol:'!'});
 const context=phase==='contact'?'首次入水':phase==='entry'?'拉平入水':`${phase==='glide'?'滑翔参考':'进近参考'} ${Math.round(historyReferenceSpeed(s,{approach:historicalApproach(s)}))} kt`;
 const note=phase==='contact'?'已锁定入水读数，等待减速与漂浮稳定':phase==='entry'?'轻柔拉平，勿猛拉追数值':'以下为入水目标，滑翔时先保空速';
 return{phase,context,note,rows};
}
