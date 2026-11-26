import {historicalRadioScript as script,assignHistoricalCast} from './media.js';
import {eventWaterAt} from './event-world.js';
import {FT,KT} from '../sim/constants.js';
const live=s=>!s.water&&!s.result;
const manual=s=>live(s)&&s.historical.controlSource==='player';
const assessmentKeys=new Set(['lga','lga-low','lga-margin','lga-reachable','alternatives','teb-low']);
const waterOnly=new Set(['hudson','hudson-unable','config','gear','flaps','shore','river-established']);
const commandKeys=new Set(['left','hold','return','assess','river','teb','hold-option']);
export function historyLineValid(s,key){
 if(s.result&&!s.result.success)return false;
 if(['evacuate','rescue','closing'].includes(key))return !!s.water&&!s.water.fatal&&['evacuation','complete'].includes(s.water.phase);
 if(!live(s))return false;
 const h=s.historical,alt=s.y*FT;
 if(waterOnly.has(key)&&h.controlSource==='player'&&h.manualTarget!=='river')return false;
 if(key==='bird')return h.controlSource==='copilot';
 if(assessmentKeys.has(key))return h.controlSource==='copilot'&&alt>400;
 if(commandKeys.has(key))return h.controlSource==='copilot';
 if(key==='brace')return manual(s)&&alt>8;
 if(key==='gear')return manual(s)&&s.gearPosition>.1;
 if(key==='flaps')return manual(s)&&Math.abs(s.flapPosition-2)<.05&&s.gearPosition<.05;
 if(key==='config')return manual(s)&&s.flapPosition<1.8&&alt>150;
 if(key==='speed')return manual(s)&&s.stallWarning?.active;
 if(key==='shore')return manual(s)&&!eventWaterAt(s.x+s.velocity.x*5,s.z+s.velocity.z*5);
 if(key.startsWith('height-'))return manual(s)&&alt>=Number(key.slice(7))*.48;
 return true;
}
export function queueHistorical(s,key,{priority=40,ttl=20,repeat=false,lineIndices=null}={}){
 const r=s.radio,lines=script.zh[key],fired='us1549:'+key;if(!r||!lines||!historyLineValid(s,key)||!repeat&&r.fired[fired])return false;
 if(r.active?.historyEvent===key||r.pending.some(l=>l.historyEvent===key))return false;
 r.fired[fired]=true;
 if(priority>=80&&r.active?.historyEvent&&r.active.historyEvent!=='mayday'&&(r.active.priority||0)<priority){r.active=null;r.readyAt=s.time+.12;}
 r.pending.push(...lines.flatMap(([role,text,channel],i)=>lineIndices&&!lineIndices.includes(i)?[]:[{clip:`us1549-${key}-${i}`,event:'us1549-'+key,historyEvent:key,decisionVersion:s.historical.selected.length,role,text,channel,priority,expires:s.time+ttl,...(key==='mayday'?{emergency:'distress'}:{})}]));
 r.pending.sort((a,b)=>(b.priority||0)-(a.priority||0));return true;
}
export function initializeHistoricalComms(s,preferences={}){
 assignHistoricalCast(s.radio,preferences);s.radio.pending=[];s.radio.active=null;s.radio.fired={};s.radio.readyAt=0;
 s.historical.crew={power:'battery',relight:'not-started',cabinSignal:false,riverSeconds:0,previousHeight:s.y*FT,lastWater:null};
}
export function historicalDecisionSpeech(s,node,choice){
 if(['gear','retract','steep','land'].includes(choice))return;
 const key=node==='priority'?choice==='wait-restart'?'hold':choice:node==='lga'?choice==='return'?'return':'assess':node==='alternatives'?choice==='hold'?'hold-option':choice==='lga'?'return':choice:choice==='abandon'||choice==='reconsider'?'assess':'hold-option';
 queueHistorical(s,key,{priority:45,ttl:14});
 if(node==='lga'||choice==='lga'){
  const choices=s.historical.assessments.filter(a=>a.airport==='LGA'),margin=Math.max(...choices.map(a=>a.margin));
  queueHistorical(s,margin>120?'lga-reachable':margin> -100?'lga-margin':'lga-low',{priority:42,ttl:18});
 }
 if(node==='alternatives'&&choice==='teb'&&s.historical.assessments.some(a=>a.airport==='TEB'&&a.margin< -100))queueHistorical(s,'teb-low',{priority:44,ttl:16});
}
export function historicalHandoverSpeech(s,early,target='river'){
 const r=s.radio;r.pending=r.pending.filter(l=>!l.historyEvent||!assessmentKeys.has(l.historyEvent)&&!commandKeys.has(l.historyEvent));
 if(r.active?.historyEvent&&(assessmentKeys.has(r.active.historyEvent)||commandKeys.has(r.active.historyEvent))){r.active=null;r.readyAt=s.time+.1;}
 // The existing first-officer handover is valid for either destination. Never
 // play the captain's water-landing commitment during an airport handover.
 queueHistorical(s,early?'early':'commit',{priority:85,ttl:12,...(!early&&target!=='river'?{lineIndices:[1]}:{})});
 if(!early&&target==='river'){const unable=s.historical.assessments.filter(a=>a.airport==='LGA').every(a=>a.margin< -100);queueHistorical(s,unable?'hudson-unable':'hudson',{priority:65,ttl:25});}
}
export function updateHistoricalComms(s,dt){
 const h=s.historical,c=h.crew,r=s.radio;if(!c)return;
 const valid=line=>!line.historyEvent||historyLineValid(s,line.historyEvent)&&(!commandKeys.has(line.historyEvent)||line.decisionVersion===h.selected.length);
 r.pending=r.pending.filter(valid);
 if(r.active?.historyEvent&&!valid(r.active)){r.active=null;r.readyAt=s.time+.12;}
 if(s.result&&!s.result.success){r.pending=[];r.active=null;return;}
 if(h.alternate){r.pending=[];r.active=null;return;}
 if(s.water){
  if(!c.lastWater){r.pending=[];r.active=null;r.readyAt=s.time+.2;}
  c.lastWater=s.water.phase;
  if(s.water.phase==='evacuation')queueHistorical(s,'evacuate',{priority:90,ttl:30});
  return;
 }
 if(!h.finalPractice){
  if(c.birdAt===undefined)c.birdAt=s.time;
  queueHistorical(s,'bird',{priority:80,ttl:12});
  if(s.time>=.7)queueHistorical(s,'mayday',{priority:70,ttl:35});
  if(s.time>=3&&c.relight==='not-started'){c.power='apu-starting';c.relight='attempting';queueHistorical(s,'power',{priority:25,ttl:14});}
  if(s.time>=8&&c.power==='apu-starting')c.power='apu-available';
  if(s.time>=18&&c.relight==='attempting'){c.relight='no-thrust-recovered';queueHistorical(s,'restart',{priority:35,ttl:16});}
 }
 if(h.controlSource==='copilot'){
  if(!h.execution&&h.node==='lga')queueHistorical(s,'lga',{priority:48,ttl:18});
  if(h.node==='alternatives'&&s.y*FT>800&&h.assessments.some(a=>a.margin> -250))queueHistorical(s,'alternatives',{priority:38,ttl:16});
 }else{
  const alt=s.y*FT,eta=s.verticalSpeed<-.5?s.y/-s.verticalSpeed:Infinity;
  if(alt<1200){queueHistorical(s,'config',{priority:35,ttl:16});queueHistorical(s,'gear',{priority:72,ttl:8});queueHistorical(s,'flaps',{priority:50,ttl:10});}
  if(s.stallWarning?.active)queueHistorical(s,'speed',{priority:75,ttl:5});
  const wetAhead=eventWaterAt(s.x+s.velocity.x*5,s.z+s.velocity.z*5);
  c.riverSeconds=eventWaterAt(s.x,s.z)&&wetAhead&&Math.abs(s.roll)<.35?c.riverSeconds+dt:0;
  if(c.riverSeconds>3)queueHistorical(s,'river-established',{priority:30,ttl:10});
  if(!wetAhead&&alt<700)queueHistorical(s,'shore',{priority:76,ttl:6});
  if(eta<20&&alt<450&&!c.cabinSignal){c.cabinSignal=true;queueHistorical(s,'brace',{priority:82,ttl:8});}
  for(const height of [200,100,50,20,10])if(c.previousHeight>height&&alt<=height&&(wetAhead||eventWaterAt(s.x,s.z)))queueHistorical(s,'height-'+height,{priority:88,ttl:Math.max(1,height/30)});
 }
 c.previousHeight=s.y*FT;
}
