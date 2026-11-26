// ATC observes the flown aircraft. A readback never moves it or clears a
// deviation; only actual recovery does. All tolerances are game presets.
import {FT,KT,RUNWAY,wrap,RAD} from '../sim/constants.js';
import {repeatRadio,clearRadioEvents} from './radio.js';
import {runwayOf,runwayHeading} from '../airports/registry.js';
import {airlineTarget} from '../missions/airline-navigation.js';
export const createATC=()=>({clearance:null,phaseKey:null,issuedAt:0,deviation:null,seconds:0,lastSent:-100,recoveredSeconds:0,notified:false,terrainPriority:false,terrainFloorFt:0,terrainClearSeconds:0,violations:[],history:[]});
function nominalClearance(s){
 if(s.goAround){const coast=s.touchAndGo?.active&&s.touchAndGo.coastalTurn;return{key:coast?'goaround-coastal':'goaround',kind:'heading',turnGrace:coast?55:6,heading:(runwayHeading(s)+s.goAroundHeading/RAD+360)%360,altitude:s.selectedAltitude,climb:true,label:coast?(s.airportId!=='training'?'触地复飞 · 左侧爬升':'触地复飞 · 左转海侧爬升'):'复飞 · 跑道方向'};}
 const target=airlineTarget(s);
 if(target){const n=s.airline.navigation;return{key:`airline-${n.kind}-${n.index}`,kind:'airline-route',altitude:target.altitude,minMSL:target.minMSL,maxMSL:target.maxMSL,speedLimit:target.speedLimit,elevationFt:n.elevationFt||0,climb:n.kind==='departure',turnGrace:n.kind==='departure'&&n.index>0?75:40,label:`${target.name} · 按 ND 航路和高度飞行`};}
 if(s.route?.active){
  const r=s.route,leg=r.points[r.index];
  return{key:`route-${r.index}`,kind:r.inFinal?'approach':'route',altitude:r.inFinal?null:leg.alt,leg:r.index,climb:r.index===0,label:r.inFinal?'五边 · 对正跑道':`${leg.name} · ${s.airportId!=='training'?'左侧返场':'海侧航线'}`};
 }
 if(s.mission?.kind==='dual-glide')return{key:'glide',kind:'glide',altitude:null,label:'应急滑翔 · 优先避障与落点'};
 if(s.mode==='landing')return{key:'approach',kind:'approach',altitude:null,label:`进近 · 跑道 ${runwayOf(s).id}`};
 return{key:'departure',kind:'heading',heading:runwayHeading(s),altitude:s.airline&&!s.airline.cruiseSkipped?3000:s.mission?.kind==='takeoff'?500:s.selectedAltitude,climb:true,label:'离场 · 保持跑道方向'};
}
export function clearanceFor(s){const c=nominalClearance(s);return s.atc?.terrainFloorFt?{...c,altitude:Math.max(c.altitude||0,s.atc.terrainFloorFt),climb:true,label:'地形避让 · 临时安全高度'}:c;}
function deviationFor(s,c){
 const altitude=(s.y-RUNWAY.ground)*FT;
 if(c.kind==='airline-route'){
  const t=airlineTarget(s);if(t&&Math.abs(t.cross)>2500)return{type:'route',text:'偏离航班航路 · 根据 ND 修正航迹',clip:'atc-route'};
  // A visual speed instruction uses no mismatched or missing speech asset.
  if(c.speedLimit&&s.speed*KT>c.speedLimit+10)return{type:'speed',text:`超过离场限速 · 减速至 ${c.speedLimit} kt 以下`,clip:null};
 }else if(c.kind==='route'){
  if(c.leg===0){
   // Straight departure then a LEFT turn over the sea. Continuing straight
   // past the turn is a route deviation even if altitude is exactly 1500 ft.
   if(Math.abs(s.x)>650||s.z< -7300)return{type:'route',text:s.airportId!=='training'?'偏离返场航线 · 按 ND 左转回航线':'偏离海侧航线 · 按 ND 左转回航线',clip:'atc-route'};
  }else{
   const r=s.route,b=r.points[r.index],p=r.index?r.points[r.index-1]:r.origin,dx=b.x-p.x,dz=b.z-p.z,length=Math.hypot(dx,dz);
   const along=((s.x-p.x)*dx+(s.z-p.z)*dz)/(length*length),cross=((s.x-p.x)*dz-(s.z-p.z)*dx)/length;
   if(Math.abs(cross)>2000||along<-.35||along>1.35)return{type:'route',text:s.airportId!=='training'?'偏离返场航线 · 根据 ND 修正航迹':'偏离海侧航线 · 根据 ND 修正航迹',clip:'atc-route'};
  }
 }else if(c.kind==='approach'&&(Math.abs(s.x)>Math.max(150,Math.max(s.z,0)*.08)||Math.abs(wrap(s.airData.groundTrack))>35*RAD))return{type:'approach',text:'偏离进近航迹 · 对正跑道，无法稳定时复飞',clip:'atc-approach'};
 else if(c.kind==='heading'&&Math.abs(wrap(s.yaw-(c.heading-runwayHeading(s))*RAD))>25*RAD)return{type:'heading',text:`航向偏离许可 · 恢复 ${Math.round(c.heading)}°`,clip:'atc-heading'};
 if(c.altitude!==null){
  if(c.maxMSL!==undefined&&altitude+c.elevationFt>c.maxMSL+100)return{type:'high',text:`高于过点限制 · 不得高于海拔 ${Math.round(c.maxMSL)} ft`,clip:'atc-high'};
  if(altitude>c.altitude+220)return{type:'high',text:`高于许可高度 · 恢复 ${Math.round(c.altitude+(c.elevationFt||0))} ft`,clip:'atc-high'};
  // Do not call a normal climb a violation. Stall/terrain alerts have their
  // own priority; a sustained level-off/descent below clearance is monitored.
  if(altitude<c.altitude-220&&!(c.climb&&s.verticalSpeed>1))return{type:'low',text:`低于许可高度 · 爬升至 ${Math.round(c.altitude+(c.elevationFt||0))} ft`,clip:'atc-low'};
 }
 return null;
}
export function updateATC(s,dt){
 const a=s.atc;if(!a||s.result)return;
 if(s.engines.every(e=>e.status!=='running'))a.terrainFloorFt=0;
 if(s.terrain.level&&s.engines.some(e=>e.status==='running'))a.terrainFloorFt=Math.max(a.terrainFloorFt,s.terrain.escapeAltitudeFt);
 if(a.terrainFloorFt&&!s.terrain.level&&(s.terrain.peakHeight||0)<120&&(!s.route?.active||Math.abs(s.route.crossTrack)<650&&s.x<600)){a.terrainClearSeconds+=dt;if(a.terrainClearSeconds>=3){a.terrainFloorFt=0;a.terrainClearSeconds=0;repeatRadio(s,'atc-resume',{priority:1});}}else a.terrainClearSeconds=0;
 const clearance=clearanceFor(s);
 if(a.phaseKey!==clearance.key){a.phaseKey=clearance.key;a.clearance=clearance;a.issuedAt=s.time;a.seconds=0;a.deviation=null;a.recoveredSeconds=0;a.notified=false;clearRadioEvents(s,'atc-');a.history.push({time:s.time,...clearance});if(a.history.length>12)a.history.shift();}
 else a.clearance=clearance;
 if(!s.airborne||s.landed)return;
 if(s.terrain.level){
  a.terrainPriority=true;a.deviation={type:'terrain',text:s.engines.some(e=>e.status==='running')?'地形避让优先 · 先爬升 / 转向低地，脱离后再恢复许可':'地形避让优先 · 无动力转向可达低地，保持滑翔速度'};a.recoveredSeconds=0;
  if(s.time-a.lastSent>=25&&(!s.radio.active||s.radio.active.priority<2)){if(repeatRadio(s,'atc-terrain',{priority:1})){a.lastSent=s.time;a.notified=true;a.violations.push({type:'terrain',time:s.time});}}
  return;
 }
 a.terrainPriority=!!a.terrainFloorFt;
 if(s.time-a.issuedAt<(s.route?.inFinal?25:clearance.turnGrace??6))return;
 const deviation=deviationFor(s,clearance);
 if(deviation){
  a.recoveredSeconds=0;
  if(a.deviation?.type!==deviation.type)a.seconds=0;
  a.seconds+=dt;a.deviation=deviation;
  if(a.seconds>=6&&s.time-a.lastSent>=25){
   if(!deviation.clip||repeatRadio(s,deviation.clip,{priority:1})){a.lastSent=s.time;a.notified=!!deviation.clip;a.violations.push({type:deviation.type,time:s.time,altitude:(s.y-RUNWAY.ground)*FT});if(a.violations.length>30)a.violations.shift();}
  }
 }else{
  a.seconds=0;
  if(a.deviation){a.recoveredSeconds+=dt;if(a.recoveredSeconds>=4){clearRadioEvents(s,'atc-');if(a.notified)repeatRadio(s,'atc-recovered',{priority:1});a.deviation=null;a.recoveredSeconds=0;a.notified=false;}}
 }
}
