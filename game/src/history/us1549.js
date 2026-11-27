import {resolveAircraft} from '../aircraft/catalog.js';
import {aircraftDefinition} from '../aircraft/registry.js';
import {US1549_PROFILE as P} from './us1549-profile.js';
import {eventProject,eventWaterAt,eventHudsonAt,eventHeading,eventGroundMSL,eventSurface,eventRunways,runwayAt,isHistorical,eventUnproject,eventWaterCurrent} from './event-world.js';
import {G,KT,FT,RAD,SEA_LEVEL_DENSITY,clamp,wrap,massOf,moveToward} from '../sim/constants.js';
import {refreshAirData,setMotion,trimAlpha,liftMaximum,configurationDrag} from '../sim/aerodynamics.js';
import {setWeather} from '../sim/weather.js';
import {stepEngines} from '../sim/engines.js';
import {centerControls,updateStick,stepAttitude} from '../sim/controls.js';
import {stepDynamics} from '../sim/dynamics.js';
import {beginWaterContact,sweptSurfaceContact,stepWaterDynamics,waterEntryQuality,probePosition} from '../sim/water-contact.js';
import {sweptCityContact,predictCityObstacles} from '../terrain/city-obstacles.js';
import {updateStallWarning} from '../sim/stall-warning.js';
import {updateRadio,clearRadioEvents} from '../comms/radio.js';
import {initializeHistoricalComms,updateHistoricalComms,historicalDecisionSpeech,historicalHandoverSpeech} from './comms.js';
import {selectedHistoricalRunway,runwayKey,runwayGeometry,runwayInterceptHeading} from './navigation.js';
import {historicalDecisionSeed,orderHistoricalOptions,historicalDecisionPoints} from './decisions.js';
import {aircraftContacts} from '../aircraft/contact-anchors.js';
export {isHistorical};
const event=(s,type,data={})=>s.mission.events.push({type,time:s.time,controlSource:s.historical.controlSource,...data});
export const historyHeight=s=>Math.max(0,s.y-P.water.levelMSL)*FT;
export function historyReferenceSpeed(s,{approach=false}={}){
 const cd=P.aerodynamics.cleanDrag+configurationDrag(s)+2*P.aerodynamics.failedEngineDrag;
 const max=liftMaximum(s.flapPosition,s.aerodynamics,aircraftDefinition(s)),stall=Math.sqrt(2*massOf(s)*G/(SEA_LEVEL_DENSITY*aircraftDefinition(s).airframe.wingArea*max))*KT;
 if(approach){const flare=!selectedHistoricalRunway(s)&&s.historical?.manualTarget!=='free'?clamp((250-historyHeight(s))/200,0,1):0;return stall*(1.18-.12*flare);}
 return Math.sqrt(2*massOf(s)*G/(SEA_LEVEL_DENSITY*aircraftDefinition(s).airframe.wingArea*Math.sqrt(cd/P.aerodynamics.inducedDrag)))*KT;
}
export function selectHistoricalTarget(s,target){
 const h=s.historical;if(!h||h.controlSource!=='player'||s.result||s.water||h.alternate)return false;
 const runway=eventRunways.find(r=>runwayKey(r)===target);if(!['river','free'].includes(target)&&!runway)return false;
 if(h.manualTarget===target)return false;h.manualTarget=target;h.strategy=target==='river'?'river':runway?'runway':'hold';h.heldHeading=s.yaw;
 event(s,'manual-navigation-target',{target,runway:runway?.id,airport:runway?.airport});return true;
}
export const historicalApproach=s=>s.historical.controlSource==='player'&&(selectedHistoricalRunway(s)?s.flapPosition>.01: s.historical.manualTarget!=='free'&&historyHeight(s)<800);
export function initializeHistorical(s,{mode='guided',practice=false,finalApproach=false,decisionSeed=historicalDecisionSeed(),...voices}={}){
 const p=eventProject(P.initial.longitude,P.initial.latitude);
 s.aircraft=resolveAircraft(P.aircraft);
 Object.assign(s,{airportId:'us1549',mode:'historical',scenario:'historical',weight:P.initial.massTonnes,gear:false,gearPosition:0,flaps:0,flapPosition:0,autoPilot:false,autoThrust:false,autoThrustActive:false,apprArmed:false,locCaptured:false,gsCaptured:false,flightDirector:mode==='guided',airborne:true,landed:false,throttle:0,reverse:false,spoilersArmed:false,spoilersDeployed:false,autoBrake:'OFF',autoBrakeActive:false,gates:[],spokenHeights:[],ground:null,airline:null,arrival:null,route:null,goAround:false,water:null,impact:null,result:null,phase:'crew-decision',x:p.x,z:p.z,y:eventGroundMSL(p.x,p.z)+P.initial.heightAGLFt/FT,verticalSpeed:P.initial.climbMps,pitch:0,roll:0,yaw:0,pitchRate:0,rollRate:0,yawRate:0,time:0});
 mode=mode==='challenge'?'challenge':'guided';
 s.historical={id:P.id,revision:P.revision,mode,earlyTakeover:practice,controlSource:practice?'player':'copilot',manualTarget:practice?'free':null,strategy:'hold',heldHeading:(P.initial.headingTrue-eventHeading)*RAD,node:practice?'manual':'priority',decisionSeed:decisionSeed>>>0,decisionExposure:{gearSeconds:0,steepSeconds:0,waitSeconds:0},selected:[],assessments:[],executionEvidence:[],skipped:[],manualSeconds:0,energyError:0,configurationSeconds:0,airborneSeconds:0,decisionAt:0,handedOverAt:practice?0:null,handedOverHeight:practice?historyHeight(s):null};
 s.flightDirector=mode==='guided';if(practice)s.phase='manual-glide';
 Object.assign(s.mission,{kind:'historical',triggered:true,triggerTime:0,practice,events:[],clear:false});
 s.aerodynamics={...P.aerodynamics};
 s.systems.autoThrustAvailable=false;s.systems.emergencyPower=true;
 s.systems.ils.localizer=s.systems.ils.glideSlope=false;
 const origin=eventHeading;setWeather(s,{...P.weather,referenceHeading:origin});
 for(const [i,e]of s.engines.entries())Object.assign(e,{status:'failed',health:0,irrecoverable:true,damageCause:'bird-ingestion',command:0,spool:i?.46:.34,n1:i?46:34,thrustN:0});
 setMotion(s,{speed:P.initial.iasKt/KT,verticalSpeed:P.initial.climbMps,yaw:(P.initial.headingTrue-origin)*RAD});
 s.pitch=trimAlpha(s)+s.airData.gamma;refreshAirData(s);stepEngines(s,historyReferenceSpeed(s)/KT,0);
 s.historical.heldHeading=s.yaw;s.selectedSpeed=Math.round(historyReferenceSpeed(s,{approach:historicalApproach(s)}));s.vapp=145;
 s.checkpointLabel='鸟击 · 双发失去推力';event(s,'bird-strike',{positionKind:'interpolated EWR radar',heightAGLFt:P.initial.heightAGLFt});
 if(finalApproach){
  const q=eventProject(-73.9750,40.8105);Object.assign(s,{x:q.x,z:q.z,y:300/FT,flaps:2,flapPosition:2,verticalSpeed:-3.5});
  setMotion(s,{speed:145/KT,verticalSpeed:-3.5,yaw:(210-origin)*RAD});s.pitch=trimAlpha(s)+s.airData.gamma;
  Object.assign(s.historical,{finalPractice:true,earlyTakeover:true,controlSource:'player',manualTarget:'river',node:'manual',strategy:'river',heldHeading:s.yaw,handedOverAt:0,handedOverHeight:300});s.mission.practice=true;s.phase='manual-glide';s.mission.events=[];event(s,'final-practice');
 }
 initializeHistoricalComms(s,voices);
 return s;
}
export function estimateCandidate(s,r){
 const dx=r.a.x-s.x,dz=r.a.z-s.z,distance=Math.hypot(dx,dz),bearing=Math.atan2(dx,-dz),angle=Math.abs(wrap(bearing-s.airData.groundTrack));
 // Model a 32-degree emergency intercept at best-glide speed. The straight
 // distance already contains the turn's chord; do not add the full arc twice.
 const speed=Math.max(40,historyReferenceSpeed(s)/KT/Math.sqrt(s.airData.density/SEA_LEVEL_DENSITY)),bank=32*RAD,radius=speed*speed/(G*Math.tan(bank));
 const turnDistance=radius*angle,chord=2*radius*Math.sin(angle/2),alignment=radius*Math.abs(wrap(r.heading-bearing))*.35;
 const ratio=1/(2*Math.sqrt((P.aerodynamics.cleanDrag+configurationDrag(s)+.022*s.gearPosition+2*P.aerodynamics.failedEngineDrag)*P.aerodynamics.inducedDrag));
 const windAlong=(s.airData.wind.x*dx+s.airData.wind.z*dz)/Math.max(distance,1),groundFactor=clamp((speed+windAlong)/speed,.5,1.4);
 const path=distance+Math.max(0,turnDistance-chord)+alignment+600,height=Math.max(0,s.y-r.elevationM),recoverable=Math.max(0,(s.airData.tas**2-speed**2)/(2*G))*.6;
 const requiredHeight=Math.max(0,path/(ratio*groundFactor)+turnDistance*.020+60-recoverable);
 const margin=height-requiredHeight;
 return{airport:r.airport,runway:r.id,time:s.time,distance,turnDistance,alignment,windAlong,requiredHeight,margin,status:margin>120?'estimated-reachable':margin> -100?'marginal':'estimated-unreachable'};
}
export const historicalCandidates=s=>eventRunways.map(r=>estimateCandidate(s,r));
const bestCandidate=(s,airport)=>historicalCandidates(s).filter(c=>c.airport===airport).sort((a,b)=>b.margin-a.margin)[0];
const recordAssessment=(s,airport)=>{const rows=historicalCandidates(s).filter(c=>c.airport===airport);s.historical.assessments.push(...rows);event(s,'candidate-assessed',{candidates:rows});return rows.sort((a,b)=>b.margin-a.margin)[0];};
function execution(s,type,{minSeconds=0,...extra}={}){s.historical.execution={type,x:s.x,z:s.z,started:s.time,minSeconds,...extra};}
export function historicalQuestion(s){
 const h=s.historical;if(!h||h.controlSource!=='copilot'||s.result||s.water)return null;
 if(h.execution)return{id:'executing',title:'副驾驶正在执行指令 · 飞行持续进行',options:[]};
 let q;
 const gear={id:'gear',text:'先放起落架，为紧急着陆做准备'},retract={id:'retract',text:'收起起落架，保留滑翔距离'};
 if(h.node==='priority')q={id:'priority',title:'双发失去推力 · 先确定处置策略',options:[{id:'left',text:'稳住滑翔，左转并评估着陆区域'},{id:'hold',text:'保持当前航向，争取重启和判断时间'},{id:'return',text:'保持空速，立即转向拉瓜迪亚'},...(!s.gear?[gear]:[retract]),...(h.crew?.relight!=='no-thrust-recovered'&&!h.selected.some(x=>x.option==='wait-restart')?[{id:'wait-restart',text:'再等一段重启结果，然后决定转向'}]:[])]};
 if(h.node==='lga')q={id:'lga',title:'空管提供拉瓜迪亚跑道 · 判断返场余量',options:[{id:'assess',text:'评估返场，继续比较其他区域'},...(bestCandidate(s,'LGA').margin> -250?[{id:'return',text:'尝试返场，报告转弯与对正余量'}]:[]),...(!s.gear?[gear]:[retract])]};
 if(h.node==='alternatives')q={id:'alternatives',title:'比较剩余机场与哈德逊河',options:[{id:'river',text:'把河面作为首要备选，转向河道方向'},...(bestCandidate(s,'TEB').margin> -500?[{id:'teb',text:'评估泰特伯勒并尝试转向'}]:[]),...(bestCandidate(s,'LGA').margin> -250?[{id:'lga',text:'重新评估拉瓜迪亚并尝试返场'}]:[]),{id:'hold',text:'暂不承诺，延续当前指令'}]};
 if(h.node==='lga-approach'||h.node==='teb-approach'){
  const r=eventRunways.find(r=>runwayKey(r)===h.copilotRunway),candidate=historicalCandidates(s).find(c=>c.airport===r?.airport&&c.runway===r?.id);
  q={id:h.node,runway:r?`${r.airport} ${r.id}`:null,title:candidate?.margin< -100?'返场余量不足 · 决定继续还是放弃':'正在尝试机场备降 · 决定下一步',options:[{id:'land',text:'接管飞机，尝试机场备降'},{id:'abandon',text:'放弃当前机场，重新比较其他区域'},{id:'continue',text:'让副驾驶继续转向，再观察余量'},...(!h.selected.some(x=>x.node===h.node&&x.option==='steep')?[{id:'steep',text:'加大坡度急转，尽快对正跑道'}]:[]),...(!s.gear?[gear]:[retract])]};
 }
 if(h.node==='commit')q={id:'commit',title:historyHeight(s)<1300?'高度有限 · 需要最终决定':'已转向河道 · 决定是否接管',options:[{id:'ditch',text:'确认水上迫降并接管'},{id:'continue',text:'暂不承诺，延续当前指令'},{id:'reconsider',text:'重新比较机场与河面'},...(!s.gear?[{id:'gear',text:'先放起落架，再准备水上迫降'}]:[retract])]};
 return q?{...q,options:orderHistoricalOptions(h.decisionSeed,q.id,q.options)}:null;
}
export function takeHistoricalControl(s,{early=false,target='river'}={}){
 const h=s.historical;if(!h||s.result||s.water||h.controlSource!=='copilot')return false;
 const airportNode=['lga-approach','teb-approach'].includes(h.node),runway=airportNode&&eventRunways.find(r=>runwayKey(r)===target&&runwayKey(r)===h.copilotRunway);
 if(!early&&(h.execution||!(target==='river'?h.node==='commit':runway)||!h.assessments.length||h.executionEvidence.length<2))return false;
 if(early){h.earlyTakeover=true;s.mission.practice=true;}
 h.controlSource='player';h.manualTarget=early?'free':target;h.node='manual';h.execution=null;h.handedOverAt=s.time;h.handedOverHeight=historyHeight(s);h.strategy=early?'hold':runway?'runway':'river';h.copilotRunway=null;s.autoPilot=false;s.phase='manual-glide';
 centerControls(s);s.guidance={pitch:s.pitch,roll:s.roll};
 clearRadioEvents(s,'history-decision');event(s,early?'early-takeover':runway?'runway-handover':'ditch-confirmed',{heightFt:historyHeight(s),strategy:h.strategy,target:h.manualTarget});
 historicalHandoverSpeech(s,early,h.manualTarget);
 return true;
}
export function chooseHistorical(s,id){
 const h=s.historical,q=historicalQuestion(s);if(!q||!q.options.some(o=>o.id===id))return false;
 const old=q.id,airport=old==='teb-approach'||id==='teb'?'TEB':'LGA';
 const candidate=(old.endsWith('-approach')&&historicalCandidates(s).find(c=>c.airport+'-'+c.runway===h.copilotRunway))||bestCandidate(s,airport);
 const selected={node:old,option:id,time:s.time,heightFt:historyHeight(s),margin:candidate.margin,options:q.options.map(o=>o.id)};
 if(id==='land'||id==='ditch'){
  const target=id==='land'?h.copilotRunway:'river';if(!takeHistoricalControl(s,{target}))return false;h.selected.push(selected);event(s,'crew-decision',selected);return true;
 }
 h.selected.push(selected);event(s,'crew-decision',selected);h.decisionAt=s.time;
 if(id==='gear'||id==='retract'){
  s.gear=id==='gear';h.lastDecision={text:id==='gear'?'起落架正在放出：阻力增加，剩余滑翔距离会缩短。':'起落架正在收起：此前损失的高度不会恢复。',time:s.time};
  execution(s,'configuration',{minSeconds:8});return true;
 }
 if(id==='wait-restart'){
  h.lastDecision={text:'等待重启结果期间继续直飞；飞机仍在消耗高度，着陆区域可能变得不可达。',time:s.time};execution(s,'wait-restart',{minSeconds:12,waiting:true});return true;
 }
 h.lastDecision=null;
 if(old==='priority'){
  if(id==='return')h.copilotRunway=candidate.airport+'-'+candidate.runway;
  h.strategy=id==='return'?'lga':id==='left'?'left':'hold';h.heldHeading=id==='left'?(285-eventHeading)*RAD:s.yaw;h.node='lga';execution(s,'initial-strategy');
 }else if(old==='lga'){
  const assessment=recordAssessment(s,'LGA');
  if(id==='return'){h.strategy='lga';h.copilotRunway=assessment.airport+'-'+assessment.runway;h.node='lga-approach';execution(s,'candidate-direction');}else h.node='alternatives';
 }else if(old==='alternatives'){
  if(id==='hold'){execution(s,'decision-wait',{minSeconds:8,waiting:true});historicalDecisionSpeech(s,old,id);return true;}
  const assessment=recordAssessment(s,id==='lga'?'LGA':'TEB');
  h.strategy=id==='river'?'river':id==='lga'?'lga':'teb';h.copilotRunway=id==='river'?null:assessment.airport+'-'+assessment.runway;h.node=id==='river'?'commit':id==='lga'?'lga-approach':'teb-approach';execution(s,'candidate-direction');
 }else if(old==='lga-approach'||old==='teb-approach'){
  if(id==='abandon'){h.node='alternatives';h.strategy='hold';h.heldHeading=s.yaw;h.copilotRunway=null;h.lastDecision={text:'已放弃当前机场；保留当前航向，重新评估剩余着陆区域。',time:s.time};}
  else if(id==='steep'){h.lastDecision={text:'副驾驶尝试更大坡度转弯：升力需求和能量消耗增加，注意失速余量。',time:s.time};execution(s,'steep-turn',{minSeconds:10,bankLimit:45});}
  else execution(s,'decision-wait',{minSeconds:8,waiting:true});
 }else if(old==='commit'){
  if(id==='reconsider'){h.node='alternatives';h.strategy='hold';h.heldHeading=s.yaw;}
  else{event(s,'commit-deferred',{heightFt:historyHeight(s)});execution(s,'decision-wait',{minSeconds:8,waiting:true});}
 }
 historicalDecisionSpeech(s,old,id);
 return true;
}
function directionTo(s,point){return Math.atan2(point.x-s.x,-(point.z-s.z));}
function riverTarget(s){
 const points=P.riverTargets.map(q=>eventProject(...q));
 // Once over source water, follow its downstream corridor; before that, use
 // the nearest explicitly selected entry point, never a hidden teleport.
 if(!eventWaterAt(s.x,s.z))return points.reduce((a,b)=>Math.hypot(b.x-s.x,b.z-s.z)<Math.hypot(a.x-s.x,a.z-s.z)?b:a);
 const here=eventUnprojectLocal(s);return points.find(p=>eventUnprojectLocal(p).latitude<here.latitude-.008)||points.at(-1);
}
// Avoid a second geographic convention: inverse belongs to the shared frame.
const eventUnprojectLocal=s=>eventUnproject(s.x,s.z);
export function historicalPilotInput(s,{approach=false}={}){
 const h=s.historical,a=s.airData,target=historyReferenceSpeed(s,{approach})/KT;
 let heading=h.heldHeading;
 const runway=selectedHistoricalRunway(s)||eventRunways.find(r=>runwayKey(r)===h.copilotRunway)||(h.strategy==='lga'||h.strategy==='teb'?historicalCandidates(s).filter(r=>r.airport===(h.strategy==='lga'?'LGA':'TEB')).sort((a,b)=>b.margin-a.margin).map(c=>eventRunways.find(r=>r.airport===c.airport&&r.id===c.runway))[0]:null);
 if(runway)heading=runwayInterceptHeading(s,runway);
 if(h.strategy==='river')heading=directionTo(s,riverTarget(s));
 const windCross=a.wind.x*Math.cos(heading)+a.wind.z*Math.sin(heading);heading-=Math.asin(clamp(windCross/Math.max(a.tas,30),-.3,.3));
 const limit=h.controlSource==='copilot'&&h.execution?.bankLimit|| (runway?32:24),bank=clamp(wrap(heading-s.yaw)*1.2,-limit*RAD,limit*RAD),gamma=-Math.atan2(a.drag,massOf(s)*G);
 let descent=gamma;
 if(runway){const g=runwayGeometry(s,runway);if(s.gearPosition>.1||s.flapPosition>.1){const path=runway.elevationM+3+Math.max(0,250-g.along)*Math.tan(3*RAD),sink=-a.groundSpeed*Math.tan(3*RAD)-clamp((s.y-path)*.04,-3,5);descent=Math.atan2(clamp(sink,-9,-.7),Math.max(30,a.horizontal));}}
 const pitch=clamp(trimAlpha(s,target)+descent+(a.ias-target)*.0045,-.16,.24);
 s.guidance={pitch,roll:bank,verticalSpeed:-a.drag*a.tas/(massOf(s)*G)};
 return{pitch:clamp((pitch-s.pitch)*3.2-s.pitchRate*2,-1,1),steer:clamp((bank-s.roll)*2.3-s.rollRate*.7,-1,1),throttle:0,rudder:0,brake:false};
}
function failHistory(s,title){s.result={success:false,levelCleared:false,physicalSuccess:false,title,detail:'飞行按实际能量与接触结果结束。可重试整关，或进入末进近练习。',score:0};event(s,'historical-failure',{reason:title});}
function historicalAwareness(s,emit){
 const a=s.terrain;a.clearanceFt=Math.max(0,s.y-eventSurface(s.x,s.z))*FT;
 if(s.time<a.nextCheck)return;a.nextCheck=s.time+.2;
 let impact=Infinity,peak=0;
 for(let t=1;t<=25;t++){
  const x=s.x+s.velocity.x*t,z=s.z+s.velocity.z*t;if(eventWaterAt(x,z))continue;
  const surface=eventGroundMSL(x,z);peak=Math.max(peak,surface);
  if(s.y+s.velocity.y*t<surface+18){impact=t;break;}
 }
 const obstacle=predictCityObstacles(s);if(obstacle)impact=Math.min(impact,obstacle.timeToImpact);
 const old=a.level;a.level=impact<=15?2:impact<=25?1:0;a.timeToImpact=Number.isFinite(impact)?impact:null;a.peakHeight=Math.max(peak,obstacle?.peakHeight||0);
 if(a.level&&(a.level>old||s.time-a.lastSpoken>8)){a.lastSpoken=s.time;emit(s,'前方地形或障碍物 · 无动力，及时避让',a.level===2?'Terrain, terrain, pull up':'Terrain ahead','warning');}
}
function alternateRollout(s,input,dt){
 const landing=s.historical.alternate,r=eventRunways.find(r=>r.airport===landing.airport&&r.id===landing.runway),m=massOf(s),a=refreshAirData(s),speed=a.groundSpeed;
 const resistance=Math.min(m*speed/dt,m*(input.brake?4.5:.28)+a.drag);
 s.velocity.x-=resistance/m*s.velocity.x/Math.max(speed,.001)*dt;s.velocity.z-=resistance/m*s.velocity.z/Math.max(speed,.001)*dt;
 const right={x:Math.cos(s.yaw),z:Math.sin(s.yaw)},side=s.velocity.x*right.x+s.velocity.z*right.z,grip=clamp(-side*2,-s.weather.runwayFriction*G,s.weather.runwayFriction*G);
 s.velocity.x+=grip*right.x*dt;s.velocity.z+=grip*right.z*dt;
 s.velocity.y=0;s.x+=s.velocity.x*dt;s.z+=s.velocity.z*dt;
 const noseSteer=clamp(s.stickRoll+s.controls.rudder,-1,1)*.08*clamp(speed/20,0,1);s.yawRate+=(noseSteer-s.yawRate)*Math.min(1,dt*5);s.yaw+=s.yawRate*dt;
 s.pitch=moveToward(s.pitch,0,dt*.035);s.roll=moveToward(s.roll,0,dt*.06);s.pitchRate=s.rollRate=0;
 // Wheel normal reactions constrain the grounded gear to the shared runway.
 const pose={x:0,y:0,z:0,pitch:s.pitch,roll:s.roll,yaw:s.yaw};s.y=r.elevationM+.02-Math.min(...aircraftContacts(s).main.map(p=>probePosition(pose,p).y));refreshAirData(s);
 const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,u=((s.x-r.a.x)*dx+(s.z-r.a.z)*dz)/(r.length*r.length),cross=((s.x-r.a.x)*dz-(s.z-r.a.z)*dx)/r.length;
 if(Math.abs(cross)>r.widthM/2||u<0||u>1){failHistory(s,'备降滑跑偏离跑道');return;}
 if(s.airData.groundSpeed<.5){s.result={success:true,physicalSuccess:true,levelCleared:false,title:`${r.airport} ${r.id} 安全备降 · 哈德逊河目标未完成`,detail:'已记录实际备降与停稳；本关的哈德逊河迫降目标未完成，不授予本关星级。',score:0};event(s,'alternate-landing-complete',landing);}
}
export function historicalScore(s){
 const h=s.historical,w=s.water,snap=w.firstImpact,decision=historicalDecisionPoints(h,h.handedOverHeight??historyHeight(s));
 const quality=waterEntryQuality(snap),energy=20*(.6*clamp(1-h.energyError/Math.max(1,h.manualSeconds)/22,0,1)+.4*quality.speed),config=15*clamp(1-snap.gearPosition,0,1)*clamp(1-Math.abs(snap.flapPosition-2)/3,0,1);
 const impact=35*quality.total*Math.sqrt(clamp(1-w.damage*1.1-w.flooding*.5,0,1));
 return{decision:Math.round(decision),energy:Math.round(energy),configuration:Math.round(config),survival:Math.round(impact)};
}
export function historicalRunwayContactIssue(s,hit){
 const r=eventRunways.find(r=>r.airport===hit.airport&&r.id===hit.runway);
 if(!r)return '未识别的备降跑道';
 if(s.gearPosition<=.95)return '备降起落架未到位';
 if(!hit.part.startsWith('main-'))return '备降主轮未首先接地';
 if(s.verticalSpeed<=-4.5)return '备降接地过重';
 if(Math.abs(s.roll)>=8*RAD)return '备降接地坡度过大';
 if(s.speed*KT>=200)return '备降接地速度过高';
 if(s.pitch<=-2*RAD||s.pitch>=13*RAD)return '备降拉平姿态不合适';
 if(Math.abs(wrap(s.airData.groundTrack-r.heading))>=15*RAD||Math.abs(wrap(s.yaw-r.heading))>=15*RAD)return '备降未对正跑道';
 return null;
}
export function advanceHistorical(s,rawInput,dt,{emit=()=>{}}={}){
 if(!isHistorical(s)||s.result||dt<=0)return;
 const h=s.historical;refreshAirData(s);
 if(h.mode==='challenge')s.flightDirector=false;
 if(h.controlSource==='copilot'){
  const exposure=h.decisionExposure??={gearSeconds:0,steepSeconds:0,waitSeconds:0},r=eventRunways.find(r=>runwayKey(r)===h.copilotRunway),g=r?runwayGeometry(s,r):null;
  const prematureGear=!g||g.distance>3500||Math.abs(g.cross)>600||Math.abs(g.headingError)>25*RAD;
  if(prematureGear)exposure.gearSeconds+=s.gearPosition*dt;
  if(h.execution?.bankLimit&&Math.abs(s.roll)>32*RAD)exposure.steepSeconds+=dt;
  if(h.execution?.waiting&&(h.crew?.relight==='no-thrust-recovered'||historyHeight(s)<1800))exposure.waitSeconds+=dt;
 }
 if(h.execution&&s.time-h.execution.started>=(h.execution.minSeconds||0)&&Math.hypot(s.x-h.execution.x,s.z-h.execution.z)>=400){const proof={...h.execution,completed:s.time,distance:Math.hypot(s.x-h.execution.x,s.z-h.execution.z),roll:s.roll,velocity:{...s.velocity}};h.executionEvidence.push(proof);event(s,'strategy-executed',proof);h.execution=null;}
 // Irrecoverable damage survives lever changes, A/THR requests and retries.
 for(const e of s.engines){e.irrecoverable=true;e.status='failed';e.health=0;}
 s.autoPilot=s.autoThrustActive=false;s.apprArmed=s.locCaptured=s.gsCaptured=false;s.goAround=false;
 const fd=!s.water?historicalPilotInput(s,{approach:historicalApproach(s)}):null;
 const input=h.controlSource==='copilot'?(s.water?{}:fd):rawInput;
 s.recordedInput=structuredClone(input);updateStick(s,input,dt);
 s.flapPosition=moveToward(s.flapPosition,s.flaps,dt*.22);s.gearPosition=moveToward(s.gearPosition,s.gear?1:0,dt*.15);
 stepEngines(s,historyReferenceSpeed(s)/KT,dt);
 if(h.alternate){alternateRollout(s,input,dt);updateHistoricalComms(s,dt);updateRadio(s);return s;}
 const previous={x:s.x,y:s.y,z:s.z,pitch:s.pitch,roll:s.roll,yaw:s.yaw,gearPosition:s.gearPosition,velocity:{...s.velocity}};
 const contactRunway=(x,z)=>runwayAt(x,z,s.airData.groundTrack);
 if(s.water){
  stepWaterDynamics(s,dt);
  const obstruction=sweptCityContact(previous,s);
  const shore=sweptSurfaceContact(previous,s,{surfaceAt:eventSurface,waterAt:eventWaterAt,runwayAt:contactRunway,level:P.water.levelMSL,ignoreWater:true});
  if(obstruction||shore&&shore.type!=='water')failHistory(s,obstruction?'水上滑行撞击障碍物':'水上滑行撞岸');
  else if(s.water.fatal)failHistory(s,s.water.fatal);
  else if(s.water.phase==='evacuation'&&s.water.evacuationSeconds>=5){
   s.water.phase='complete';s.phase='complete';const scores=historicalScore(s),qualified=eventHudsonAt(s.water.firstImpact.position.x,s.water.firstImpact.position.z)&&!s.mission.practice&&!h.earlyTakeover&&h.selected.some(x=>x.node==='priority')&&h.assessments.some(x=>x.airport==='LGA')&&h.handedOverAt!==null&&h.handedOverAt<s.water.firstImpact.time&&h.manualSeconds>=2;
   const damaged=s.water.damage>.3;
   s.result={success:true,physicalSuccess:true,levelCleared:qualified,waterOutcome:damaged?'damaged-survival':'controlled',title:qualified?(damaged?'哈德逊河迫降完成 · 有损生存':'哈德逊河迫降完成'):s.mission.practice?'水上迫降完成 · 练习':'水上幸存 · 本关目标待完成',detail:damaged?'飞机保持了撤离条件，但入水造成明显损伤。复盘空速、下降率和机翼姿态。':'飞机已完成水上减速，保持了可撤离的漂浮条件。救援撤离为简化呈现。',score:Object.values(scores).reduce((a,b)=>a+b,0),scores,mode:h.mode,historicalRevision:P.revision};event(s,'evacuation-complete');
  }
 }else{
  stepAttitude(s,dt);stepDynamics(s,dt);
  const surface=sweptSurfaceContact(previous,s,{surfaceAt:eventSurface,waterAt:eventWaterAt,runwayAt:contactRunway,level:P.water.levelMSL}),city=sweptCityContact(previous,s);
  const impact=city&&(!surface||city.fraction<=surface.fraction)?city:surface;
  if(impact){
   for(const k of ['x','y','z','pitch','roll','yaw'])s[k]=impact[k];
   for(const k of ['x','y','z'])s.velocity[k]=previous.velocity[k]+(s.velocity[k]-previous.velocity[k])*impact.fraction;
   impact.time=s.time-dt+impact.fraction*dt;s.impact={...impact};refreshAirData(s);
   if(impact.type==='water'){
    beginWaterContact(s,impact,{level:P.water.levelMSL,current:eventWaterCurrent});event(s,'water-contact',{firstImpact:s.water.firstImpact});if(s.water.fatal)failHistory(s,s.water.fatal);
   }else if(impact.type==='runway'){
    h.runwayContact={airport:impact.airport,runway:impact.runway,time:impact.time,ias:s.speed,sinkMps:Math.max(0,-s.verticalSpeed),pitch:s.pitch,roll:s.roll,position:{x:s.x,y:s.y,z:s.z}};event(s,'runway-contact',{contact:h.runwayContact});
    const issue=historicalRunwayContactIssue(s,impact);
    if(issue)failHistory(s,issue);
    else{h.alternate={airport:impact.airport,runway:impact.runway,time:s.time,touchdown:h.runwayContact};s.airborne=false;s.landed=true;s.phase='alternate-rollout';s.velocity.y=0;Object.assign(s.stallWarning,{active:false,level:0,ratio:0,clearSeconds:0,since:null});Object.assign(s.terrain,{level:0,timeToImpact:null});event(s,'alternative-runway-contact',h.alternate);}
   }else failHistory(s,impact.obstacleKind==='ship'?'撞击船只':impact.type==='building'?'撞击建筑或桥梁':'撞击地面');
  }
  if(h.controlSource==='player'){h.manualSeconds+=dt;h.energyError+=Math.max(0,Math.abs(s.speed*KT-historyReferenceSpeed(s,{approach:historicalApproach(s)}))-5)*dt;}
  h.airborneSeconds+=dt;updateStallWarning(s,dt,emit);
  if(!s.water&&!s.result)historicalAwareness(s,emit);
 }
 updateHistoricalComms(s,dt);updateRadio(s);return s;
}
export function historicalInstruction(s){
 if(s.historical.alternate)return '备降滑跑 · 空格制动，保持跑道内 · 不计哈德逊河通关';
 if(s.water)return s.water.phase==='evacuation'?'保持漂浮 · 机组组织撤离':'水面减速 · 保持机翼平稳，等待漂浮稳定';
 if(s.historical.controlSource==='copilot')return '副驾驶操纵 · 选择处置策略；高度与能量持续变化';
 const runway=selectedHistoricalRunway(s);
 if(s.stallWarning?.active)return 'STALL · 减小后拉，降低迎角';
 if(runway)return `手动返场 ${runway.airport} ${runway.id} · 保留滑翔余量，再放轮与襟翼 · 空格制动`;
 if(s.historical.manualTarget==='free')return '自由手飞 · 选择导航目标；空速稳定仍在消耗高度';
 if(s.gearPosition>.1)return '水上迫降保持收轮 · G 收起起落架';
 if(historyHeight(s)<150)return '轻柔拉平，机翼保持平稳 · 不要追求固定入水读数';
 return s.historical.mode==='challenge'?'手动迫降 · 管理空速、河道、构型与入水姿态':`无动力滑翔 · 参考 ${Math.round(historyReferenceSpeed(s,{approach:historicalApproach(s)}))} kt · 管理河道、构型与能量`;
}
