import {getLevel} from './catalog.js';
import {FT,KT,RUNWAY,RAD} from '../sim/constants.js';
import {createRecoveryRoute,routeTarget} from './route.js';
import {queueRadio,clearRadioEvents} from '../comms/radio.js';
export const requiresLanding=s=>!!getLevel(s.levelId)?.requiresLanding;
export function startRecovery(s){
 if(!requiresLanding(s))return;
 const m=s.mission;m.goAroundCount=(m.goAroundCount||0)+1;
 m.recovery={stage:'climb',started:s.time,stableSeconds:0,attempt:m.goAroundCount};
 if(s.route)s.route.active=false;
 s.landingChecklistConfirmed=false;
}
export function updateRecovery(s,dt,{emit,checkpoint}){
 const m=s.mission,r=m?.recovery;if(!r||!requiresLanding(s)||s.result)return;
 if(r.stage==='return'){
  if(r.weatherStarted!==undefined){const f=Math.min(1,(s.time-r.weatherStarted)/60);
   if(m.kind==='low-visibility'){const a=r.weatherInitial;s.weather.visibility=a.visibility+(Math.max(12000,a.visibility)-a.visibility)*f;s.weather.cloudBase=a.cloudBase+(Math.max(1500,a.cloudBase)-a.cloudBase)*f;s.weather.overcast=a.overcast+(Math.min(.65,a.overcast)-a.overcast)*f;}
   if(m.kind==='windshear')(s.weather.disturbances||[]).forEach((field,i)=>{field.strength=(r.weatherInitial.disturbances[i].strength??1)*(1-f);});
  }
  return;
 }
 if(s.touchAndGo?.active&&s.airborne&&!s.touchAndGo.coastalTurn&&(s.y-RUNWAY.ground)*FT>=1100){s.touchAndGo.coastalTurn=true;s.goAroundHeading=-Math.PI/2;emit(s,'触地复飞 · 1100 ft 已通过，按 FD 左转海侧继续爬升','','action');}
 const maxFlaps=s.systems.flapsJammed?s.systems.jammedPosition:1;
 const stable=s.goAround&&s.airborne&&!s.terrain.level&&(m.kind!=='windshear'||m.clear||m.avoided)&&(s.y-RUNWAY.ground)*FT>=2970&&s.gearPosition<.02&&s.flapPosition<=maxFlaps+.05&&s.speed*KT>=150&&s.speed*KT<=220&&s.verticalSpeed>-.5&&Math.abs(s.roll)<12*RAD&&!s.airData.stalled;
 r.stableSeconds=stable?r.stableSeconds+dt:0;s.mission.stableSeconds=r.stableSeconds;
 if(r.stableSeconds<(m.kind==='windshear'?5:3))return;
 if(s.touchAndGo)s.touchAndGo.active=false;
 r.stage='return';r.recoveredAt=s.time;r.weatherStarted=s.time;r.weatherInitial={visibility:s.weather.visibility,cloudBase:s.weather.cloudBase,overcast:s.weather.overcast,disturbances:structuredClone(s.weather.disturbances)};m.alert=null;
 s.goAround=false;s.mode='enroute';s.phase='departure';s.route=createRecoveryRoute(s);
 s.selectedAltitude=3000;s.apprArmed=s.locCaptured=s.gsCaptured=s.gsCaptureEligible=false;
 s.landingChecklistConfirmed=false;s.gates=[];s.unstableSeconds=0;s.spokenHeights=[];s.previousRA=(s.y-RUNWAY.ground)*FT;
 routeTarget(s);clearRadioEvents(s,'atc-');queueRadio(s,'reapproach');
 emit(s,'复飞稳定 · 本关尚未完成，按 ND 海侧返场并着陆停稳','','info');checkpoint(s,'复飞后 · 海侧返场');
}
export function recoveryInstruction(s){
 if(s.mission?.fault&&!s.mission.acknowledged)return null;
 if(s.mission?.recovery?.stage!=='return'||!s.route?.active||s.route.inFinal)return null;
 if(s.route.index>=2&&s.flaps<2&&!s.systems.flapsJammed)return '返场三边 · F 放至 CONF 2，按航线减速';
 if(s.route.index>=3&&(!s.gear||s.flaps<s.landingConfig))return '返场四边 · G 放轮，F 完成着陆构型，B / M / C 检查';
 return `${s.route.points[s.route.index].name} · ${Math.round(s.route.targetAltitude)} ft · 复飞后仍需落地停稳`;
}
