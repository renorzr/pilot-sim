import {AIRPORT_RADIO,RADIO_PACKS} from './radio-packs.js';
import voiceVersion from './voice-version.json' with {type:'json'};
import {emergencyLevels,emergencyPriority,createEmergencyMonitor} from './emergency.js';
import script from './script.json' with {type:'json'};
import durations from './durations.json' with {type:'json'};
import englishDurations from './durations.en.json' with {type:'json'};
import englishScript from './script.en.json' with {type:'json'};
import englishVersion from './voice-version.en.json' with {type:'json'};
import {siteUrl} from '../urls.js';
const dialogue=(s,key)=>{
 if(s.airline&&RADIO_PACKS.airline.zh[key])return{lines:RADIO_PACKS.airline.zh[key],prefix:'airline-'};
 const pack=AIRPORT_RADIO[s.airportId];if(pack?.zh[key])return{lines:pack.zh[key],prefix:s.airportId+'-'};
 if(s.ground&&RADIO_PACKS.ground.zh[key])return{lines:RADIO_PACKS.ground.zh[key],prefix:'ground-'};
 return{lines:script[key],prefix:''};
};
const clipPack=id=>RADIO_PACKS[id.split('-')[0]];
export const createRadio=()=>({language:'zh',fired:{},pending:[],active:null,readyAt:0,sequence:0,history:[],emergency:null,monitor:createEmergencyMonitor()});
const clipDuration=(id,language)=>(clipPack(id)?.durations[language]?.[id]||(language==='en'?englishDurations:durations)[id]||5)+.2;
export function setRadioLanguage(s,language){
 const r=s.radio;if(!r||!['en','zh'].includes(language)||r.language===language)return;
 r.language=language;
 if(r.active){r.active.started=s.time;r.active.until=s.time+clipDuration(r.active.clip,language);}
}
function enqueue(s,key,priority=0,ttl=60){
 const r=s.radio;if(!r||!dialogue(s,key).lines)return false;
 if(r.active?.event===key||r.pending.some(line=>line.event===key))return false;
 if(priority&&priority>=Math.max(r.active?.priority||0,...r.pending.map(line=>line.priority||0))){
  r.pending=r.pending.filter(line=>(line.priority||0)>priority);r.active=null;r.readyAt=s.time+(priority>=3?2.6:priority===2?1.5:.35);
 }
 const custom=dialogue(s,key);
 const lines=custom.lines.map(([role,text],i)=>({clip:`${custom.prefix}${key}-${i}`,event:key,role,text,priority,emergency:emergencyLevels[key]||null,expires:s.time+ttl}));
 r.pending.push(...lines);r.pending.sort((a,b)=>(b.priority||0)-(a.priority||0));return true;
}
export function queueRadio(s,key,priority=false){
 const r=s.radio;if(!r||r.fired[key]||!dialogue(s,key).lines)return false;
 const severity=emergencyLevels[key];
 if(key==='engine-stable'&&r.emergency?.event!=='engine')return false;
 if(severity==='distress'&&r.emergency?.level==='distress'&&key.startsWith('distress-'))return false;
 if(severity==='urgency'&&r.emergency?.level==='distress'&&key!=='engine-stable')return false;
 if(key==='distress-cancel'&&!['distress-wind','distress-terrain','distress-stall'].includes(r.emergency?.event))return false;
 r.fired[key]=true;
 const rank=key==='distress-cancel'?4:Math.max(emergencyPriority(key),priority?2:0);
 const added=enqueue(s,key,rank,120);
 if(added&&severity==='distress')delete r.fired['distress-cancel'];
 if(added&&severity){const previous=severity==='distress'&&r.emergency?.level==='urgency'?structuredClone(r.emergency):null;r.emergency={level:severity,event:key,declaredAt:s.time,previous};}
 if(added&&key==='distress-cancel'){delete r.fired[r.emergency.event];r.emergency=r.emergency?.previous||null;}
 return added;
}
export const repeatRadio=(s,key,{priority=1,ttl=25}={})=>enqueue(s,key,priority,ttl);
export function clearRadioEvents(s,prefix){
 const r=s.radio;if(!r)return;r.pending=r.pending.filter(line=>!line.event?.startsWith(prefix));
 if(r.active?.event?.startsWith(prefix)){r.active=null;r.readyAt=s.time+.35;}
}
export function updateRadio(s){
 const r=s.radio;if(!r)return;
 if(r.active&&s.time>=r.active.until){r.history.push(r.active);if(r.history.length>12)r.history.shift();r.active=null;r.readyAt=s.time+.55;}
 r.pending=r.pending.filter(line=>!line.expires||line.expires>s.time);
 if(!r.active&&r.pending.length&&s.time>=r.readyAt){const line=r.pending.shift();r.active={...line,id:++r.sequence,started:s.time,until:s.time+clipDuration(line.clip,r.language)};}
}
export function calloutClip(text=''){
 const fixed={'Autopilot on':'ap-on','Autopilot off':'ap-off','Go around':'go-around','Positive climb':'positive','Wind shear, wind shear, wind shear':'wind-shear','Engine one failure':'engine-one','All engines failure':'all-engines','Minimum':'minimum','Landing checklist complete':'checklist','Terrain ahead':'terrain','Terrain, terrain, pull up':'pull-up','Stall, stall':'stall'};
 if(fixed[text])return 'call-'+fixed[text];
 const height=[['One thousand','h1000'],['Five hundred','h500'],['Two hundred','h200'],['One hundred','h100'],['Fifty','h50'],['Forty','h40'],['Thirty','h30'],['Twenty','h20'],['Ten','h10']].find(([start])=>text.startsWith(start));
 return height?'call-'+height[1]:null;
}
// Script changes must also invalidate previously cached voice files.
let speechVersion=0;for(const char of JSON.stringify(script)+JSON.stringify(durations))speechVersion=(Math.imul(speechVersion,31)+char.charCodeAt(0))>>>0;
let englishSpeechVersion=0;for(const char of JSON.stringify(englishScript)+JSON.stringify(englishDurations))englishSpeechVersion=(Math.imul(englishSpeechVersion,31)+char.charCodeAt(0))>>>0;
export const clipUrl=(id,language='zh')=>{
 const english=language==='en'&&!id.startsWith('call-'),version=clipPack(id)?.version||(english?englishSpeechVersion.toString(36)+'-'+englishVersion.fingerprint:speechVersion.toString(36)+'-'+voiceVersion.fingerprint);
 return siteUrl(`assets/radio/${english?'en/':''}${id}.mp3?v=${version}`);
};
