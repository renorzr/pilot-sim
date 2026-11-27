import test from'node:test';
import assert from'node:assert/strict';
import{PhraseAudioCache,phrasePCM,joinPhrasePCM}from'../src/comms/phrase-audio.js';
import{radioPhrasePlan,RADIO_PHRASES}from'../src/comms/phrases.js';
import{CommsPlayback}from'../src/comms/playback.js';
import{radioClipDuration}from'../src/comms/radio.js';
import{FlightRecording}from'../src/replay/flight-recording.js';
import{createFlight}from'../src/flight.js';

function fixture(samples){const pcm=new Int16Array(samples),buffer=joinPhrasePCM([new Uint8Array(pcm.buffer)],0);return{buffer,record:{file:'fixture.wav',frames:samples.length,bytes:buffer.byteLength,sha256:'a'.repeat(64)}};}
const tick=()=>new Promise(r=>setImmediate(r));
test('assembly preserves actual PCM, inserts only the requested silence and rejects truncated/wrong-format data',()=>{
 const a=fixture([400,-1200,3200]),b=fixture([-20,60]);
 const joined=joinPhrasePCM([phrasePCM(a.buffer,a.record),phrasePCM(b.buffer,b.record)],10);
 const samples=new Int16Array(joined,44);assert.equal(samples.length,245);assert.deepEqual([...samples.slice(0,3)],[400,-1200,3200]);assert(samples.slice(3,243).every(n=>n===0));assert.deepEqual([...samples.slice(243)],[-20,60]);
 assert.throws(()=>phrasePCM(a.buffer.slice(0,-2),a.record));const bad=a.buffer.slice(0);new DataView(bad).setUint32(24,48000,true);assert.throws(()=>phrasePCM(bad,a.record));
});
test('shared chunks download once, assembled sources survive while active and evicted/disposed URLs are released',async()=>{
 const f=fixture([1000,-1000,2000,-2000]),revoked=[];let downloads=0,urls=0;
 const cache=new PhraseAudioCache({phrases:{a:f.record,b:f.record},maxJoined:1,fetcher:async()=>{downloads++;return{ok:true,arrayBuffer:async()=>f.buffer};},makeURL:()=>`blob:test-${++urls}`,revokeURL:url=>revoked.push(url)});
 const p={key:'one',parts:['a','b'],gapMs:90},q={key:'two',parts:['b','a'],gapMs:90};
 const url=await cache.prepare(p);assert.equal(downloads,2);assert.equal(await cache.prepare(p),url);cache.protect(url);await cache.prepare(q);assert.equal(downloads,2);assert.equal(cache.ready(p),url);assert(!revoked.includes(url));cache.protect(null);cache.dispose();assert(revoked.includes(url));assert.equal(cache.stats().pcmBytes,0);
});
test('missing/corrupt fragments never produce incomplete audio, and disposal during download creates no orphan URL',async()=>{
 let release,made=0;const f=fixture([1,2,3]),cache=new PhraseAudioCache({phrases:{a:f.record},fetcher:()=>new Promise(r=>release=r),makeURL:()=>{made++;return'blob:late';},revokeURL(){}}),pending=cache.prepare({key:'late',parts:['a'],gapMs:0});
 cache.dispose();release({ok:true,arrayBuffer:async()=>f.buffer});assert.equal(await pending,null);assert.equal(made,0);
 const broken=new PhraseAudioCache({phrases:{a:f.record},fetcher:async()=>({ok:false}),makeURL:()=>{throw Error('Must not create audio');}});assert.equal(await broken.prepare({key:'bad',parts:['a'],gapMs:90}),null);assert.equal(broken.stats().failures,1);broken.dispose();
});
test('every approved speaker and both languages retain airport-independent phrase identities without touching emergencies/history',()=>{
 for(const language of['zh','en'])for(const actor of language==='zh'?['e','g','h','j','xiaoxiao']:[null]){
  const lga=radioPhrasePlan('lga-preparation-0',language,actor),jfk=radioPhrasePlan('jfk-preparation-0',language,actor);assert(lga&&jfk);assert(lga.budget>=lga.duration);assert.equal(radioClipDuration('lga-preparation-0',language,actor),lga.budget+.2);
  if(lga.parts.length&&jfk.parts.length){const shared=lga.parts.filter(p=>jfk.parts.includes(p));assert(shared.length>=1);for(const id of shared)assert.equal(RADIO_PHRASES[id].actor,lga.actor);}
  assert.equal(radioPhrasePlan('dual-0',language,actor),null);assert.equal(radioPhrasePlan('us1549-mayday-0',language,actor),null);
 }
 assert.equal(radioPhrasePlan('lga-preparation-0','zh','unknown'),null);
});
class Media{constructor(){this.paused=true;this.ended=false;this.currentTime=0;this.duration=5;this.readyState=4;this.src='';this.volume=.7;}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}get currentSrc(){return this.src;}load(){}}
test('assembled speech keeps one clock across view changes/pause; cold fallback does not swap mid-line; replay retains its actual source',async()=>{
 const old=globalThis.Audio;globalThis.Audio=Media;
 try{
  const p=new CommsPlayback();let ready=null;const protectedURLs=[];p.phrases={warm(){},ready:()=>ready,protect:url=>protectedURLs.push(url),stats:()=>({}),dispose(){}};
  p.effects={preset:'vhf',setDry(){},update(){},silence(){},level:()=>0,dispose(){}};
  const s={airportId:'lga',time:1,radio:{language:'zh',pilotVoice:'h',towerVoice:'e',pending:[],active:{id:1,clip:'lga-preparation-0',role:'pilot',started:1}}};
  p.update(s,true,false);await tick();const original=p.radio.src,firstPlan=radioPhrasePlan('lga-preparation-0','zh','h');assert(original.includes((firstPlan.fallback??firstPlan.source).file));assert.equal(s.radio.active.audioSource.kind,'whole');
  ready='blob:assembled';p.radio.currentTime=.8;p.update(s,true,false,1,{exterior:true});assert.equal(p.radio.src,original);assert.equal(p.radio.currentTime,.8);
  s.radio.active={id:2,clip:'lga-preparation-0',role:'pilot',started:2};s.time=2;p.update(s,true,false);assert.equal(p.radio.src,ready);assert.equal(s.radio.active.audioSource.kind,'phrases');await tick();p.radio.currentTime=.5;p.update(s,false,false);assert(p.radio.paused);p.update(s,true,false);assert.equal(p.radio.currentTime,.5);assert.equal(p.radio.src,ready);
  const plan=radioPhrasePlan('lga-preparation-0','zh','h');s.radio.active.audioSource={kind:'whole',language:'zh',actor:'h',...plan.source};s.replayAudio={segment:0,attempt:0,cycle:1};s.time=2.8;p.update(s,true,false,1,{replay:true});assert(p.radio.src.includes(plan.source.file));assert(Math.abs(p.radio.currentTime-.8)<1e-8);p.dispose();
 }finally{globalThis.Audio=old;}
});
test('in-memory recording captures a late audio selection while keeping clip/voice metadata',()=>{
 const s=createFlight(null,{levelId:'lga-takeoff',pilotVoice:'h',towerVoice:'e'}),recording=new FlightRecording();s.time=1;s.radio.active={id:1,clip:'lga-preparation-0',role:'pilot',started:1};recording.observe(s);s.time=1.1;s.radio.active.audioSource={kind:'whole',language:'zh',actor:'h',file:'assets/radio/example.mp3',sha256:'a'.repeat(64)};recording.observe(s);s.time=2;recording.observe(s);const sampled=recording.sample(0,1.5);assert.equal(sampled.radio.active.audioSource.file,'assets/radio/example.mp3');assert.equal(sampled.radio.pilotVoice,'h');
});
