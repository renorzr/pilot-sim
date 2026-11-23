import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,restoreCheckpoint,advanceFlight,skipCruise,beginGoAround} from '../src/flight.js';
import {createRadio,queueRadio,updateRadio,setRadioLanguage,clipUrl,radioClipDuration} from '../src/comms/radio.js';
import {RADIO_VOICE_IDS,RADIO_VOICES,choosePilotVoice,chooseRadioVoices,radioVoiceFor} from '../src/comms/pilot-voices.js';
import {createCruiseTransition,advanceCruiseTransition,commitCruiseTransition} from '../src/views/cruise-transition.js';
import {canSkipCruise} from '../src/missions/airline.js';
import {pilotInput} from './pilot.mjs';
import {CommsPlayback} from '../src/comms/playback.js';
import english from '../src/comms/durations.en.json' with {type:'json'};

const identities=r=>({pilotVoice:r.pilotVoice,towerVoice:r.towerVoice});
const pairs=RADIO_VOICE_IDS.flatMap(pilotVoice=>RADIO_VOICE_IDS.filter(id=>id!==pilotVoice).map(towerVoice=>({pilotVoice,towerVoice})));

test('new flights uniformly select different speakers from the five approved voices',()=>{
 assert.deepEqual(RADIO_VOICE_IDS,['e','g','h','j','xiaoxiao']);
 const seen=new Set();
 for(let i=0;i<5;i++)for(let j=0;j<4;j++){
  let n=0;const random=()=>[(i+.5)/5,(j+.5)/4][n++];
  const chosen=chooseRadioVoices({},random);assert.notEqual(chosen.pilotVoice,chosen.towerVoice);seen.add(JSON.stringify(chosen));
 }
 assert.equal(seen.size,20);
 for(let i=0;i<5;i++)assert.equal(choosePilotVoice((i+.5)/5),RADIO_VOICE_IDS[i]);
 for(let i=0;i<30;i++){
  const r=createFlight(null,{levelId:'takeoff'}).radio;assert(RADIO_VOICE_IDS.includes(r.pilotVoice));assert(RADIO_VOICE_IDS.includes(r.towerVoice));assert.notEqual(r.pilotVoice,r.towerVoice);
 }
 for(const id of RADIO_VOICE_IDS){
  const r=createRadio({pilotVoice:id,towerVoice:id});assert.equal(r.pilotVoice,id);assert.notEqual(r.towerVoice,id);
  assert.equal(createRadio({towerVoice:id}).towerVoice,id);
 }
 const invalid=createRadio({pilotVoice:'f',towerVoice:'i'});assert(RADIO_VOICE_IDS.includes(invalid.pilotVoice));assert(RADIO_VOICE_IDS.includes(invalid.towerVoice));
});

test('every ordered pair uses the selected pilot AND controller durations, URLs and identities across languages',()=>{
 for(const pair of pairs){
  const s={time:0,radio:createRadio(pair)};queueRadio(s,'dual');s.time=3;updateRadio(s);
  for(const [index,role] of [[0,'pilot'],[1,'tower']]){
   if(index){s.time=s.radio.active.until;updateRadio(s);s.time+=.6;updateRadio(s);}
   assert.equal(s.radio.active.role,role);
   const actor=radioVoiceFor(s.radio,role),id='dual-'+index,item=RADIO_VOICES[actor].clips[id];assert.equal(item.role,role);
   assert(Math.abs(s.radio.active.until-(s.time+item.duration+.2))<1e-8);
   assert(clipUrl(id,'zh',actor).includes('/pilots/'+actor+'/'+item.file));assert(clipUrl(id,'zh',actor).includes(item.sha256.slice(0,16)));
   setRadioLanguage(s,'en');assert.deepEqual(identities(s.radio),pair);assert(Math.abs(s.radio.active.until-(s.time+english[id]+.2))<1e-8);
   setRadioLanguage(s,'zh');assert(Math.abs(s.radio.active.until-(s.time+item.duration+.2))<1e-8);assert.deepEqual(identities(s.radio),pair);
  }
 }
});

test('English pilot/controller and clean safety callouts retain their original recording URLs',()=>{
 for(const voice of RADIO_VOICE_IDS)for(const id of ['takeoff-0','takeoff-1','dual-0'])assert.equal(clipUrl(id,'en',voice),clipUrl(id,'en'));
 for(const voice of RADIO_VOICE_IDS)assert.equal(clipUrl('call-h50','zh',voice),clipUrl('call-h50','en'));
});

test('all20 pairs survive phase retry and an actual go-around without speaker changes',()=>{
 for(const pair of pairs){
  const s=createFlight(null,{levelId:'short-landing',...pair});assert.deepEqual(identities(restoreCheckpoint(s).radio),pair);
  assert(beginGoAround(s));assert.deepEqual(identities(s.radio),pair);
 }
});

for(const [i,pilotVoice] of RADIO_VOICE_IDS.entries())test(pilotVoice+': physical departure, cruise dialogue and destination preserve both speakers',()=>{
 const pair={pilotVoice,towerVoice:RADIO_VOICE_IDS[(i+1)%5]},s=createFlight(null,{levelId:'kix-pkx',...pair});
 for(let i=0;i<75000&&!s.result&&!canSkipCruise(s);i++)advanceFlight(s,pilotInput(s),.02);
 assert(canSkipCruise(s));const copy=structuredClone(s);assert(skipCruise(copy));assert.deepEqual(identities(copy.radio),pair);assert.deepEqual(identities(copy.checkpoint.radio),pair);
 const p=createCruiseTransition(s);assert.deepEqual(identities(p.radio),pair);
 for(let i=0;i<2000&&p.phase!=='black';i++)advanceCruiseTransition(p,.1);
 assert.equal(p.phase,'black');assert(commitCruiseTransition(p,s));assert.deepEqual(identities(s.radio),pair);assert.deepEqual(identities(s.checkpoint.radio),pair);
});

test('all20 pair timings finish cruise dialogue before the existing camera fade and preserve the cast on arrival',()=>{
 const source=createFlight(null,{levelId:'kix-pkx'});
 for(let i=0;i<75000&&!source.result&&!canSkipCruise(source);i++)advanceFlight(source,pilotInput(source),.02);
 assert(canSkipCruise(source));
 for(const pair of pairs){
  const s=structuredClone(source);Object.assign(s.radio,pair);const p=createCruiseTransition(s);
  const speech=p.radio.pending.reduce((total,line)=>total+radioClipDuration(line.clip,'zh',radioVoiceFor(p.radio,line.role)),0)+(p.radio.active?radioClipDuration(p.radio.active.clip,'zh',radioVoiceFor(p.radio,p.radio.active.role))+.55:0);
  assert(p.radio.presentationRate>=1&&speech>0);
  while(p.phase!=='black'){advanceCruiseTransition(p,.5);if(p.phase==='fadeout')assert.equal(p.radio.history.length,2);}
  assert(commitCruiseTransition(p,s));assert.deepEqual(identities(s.radio),pair);
 }
});

class Media{constructor(){this.paused=true;this.ended=false;this.currentTime=0;this.duration=5;this.readyState=4;this.src='';}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}get currentSrc(){return this.src;}}
test('playback resolves both roles, invalidates changed speakers and keeps English and time-acceleration behavior',()=>{
 const previous=globalThis.Audio;globalThis.Audio=Media;
 try{
  const p=new CommsPlayback(),s={time:3,radio:{language:'zh',pilotVoice:'j',towerVoice:'e',active:{id:1,clip:'dual-0',role:'pilot',started:3}}};p.update(s,true,false);assert(p.radio.src.includes('/pilots/j/'));
  s.radio.pilotVoice='xiaoxiao';p.update(s,true,false);assert(p.radio.src.includes('/pilots/xiaoxiao/'));
  s.radio.active={id:2,clip:'takeoff-0',role:'tower',started:3};p.update(s,true,false);assert(p.radio.src.includes('/pilots/e/'));
  s.radio.towerVoice='h';p.update(s,true,false);assert(p.radio.src.includes('/pilots/h/'));assert.equal(p.stats().towerVoice,'h');
  s.radio.language='en';s.radio.active={id:3,clip:'dual-0',role:'pilot',started:3};p.update(s,true,false);assert(p.radio.src.includes('/en/dual-0.mp3'));
  s.radio.presentationRate=1.4;p.update(s,true,false);assert.equal(p.radio.playbackRate,1.4);assert.equal(p.callout.playbackRate,1);
  delete s.radio.presentationRate;p.update(s,true,false,2);assert.equal(p.radio.playbackRate,2);assert.equal(p.callout.playbackRate,2);p.dispose();
 }finally{globalThis.Audio=previous;}
});

test('VHF carrier follows asynchronous media readiness and ending without waiting for another render frame',()=>{
 class EventMedia extends Media{
  constructor(){super();this.listeners=new Map();this.readyState=0;}
  addEventListener(event,fn){this.listeners.set(event,fn);}
  removeEventListener(event){this.listeners.delete(event);}
  fire(event){this.listeners.get(event)?.();}
 }
 const previous=globalThis.Audio;globalThis.Audio=EventMedia;
 try{
  const p=new CommsPlayback(),updates=[];p.effects={update:(...args)=>updates.push(args),silence(){},dispose(){}};
  const s={time:1,radio:{language:'zh',pilotVoice:'j',towerVoice:'e',active:{id:1,clip:'dual-0',role:'pilot',started:1}}};
  p.update(s,true,false);assert.equal(updates.at(-1)[0],false);
  p.radio.readyState=4;p.radio.fire('playing');assert.equal(updates.at(-1)[0],true);assert.equal(updates.at(-1)[2],1);
  p.radio.ended=true;p.radio.fire('ended');assert.equal(updates.at(-1)[0],false);
  p.radio.ended=false;p.update(s,false,false);p.radio.fire('canplay');assert.equal(updates.at(-1)[0],false);
  p.dispose();assert.equal(p.radio.listeners.size,0);
 }finally{globalThis.Audio=previous;}
});
