import test from'node:test';import assert from'node:assert/strict';import * as THREE from'three';
import{createFlight,advanceFlight}from'../src/flight.js';
import{createHistoricalIntro,advanceHistoricalPresentation,skipHistoricalPrelude}from'../src/history/presentation.js';
import{createHistoricalEffects}from'../src/history/effects.js';
import{historicalClip}from'../src/history/media.js';
import{FlightRecording}from'../src/replay/flight-recording.js';
import{birdStrikeWave,birdStrikeAge,BirdStrikeAudio}from'../src/audio/bird-strike.js';
const start=()=>createFlight(null,{levelId:'history-us1549'});
test('opening has healthy cover engines and same-actor normal dialogue before the bird strike',()=>{
 const s=start(),before=structuredClone(s),p=createHistoricalIntro(s);assert(p.visual.engines.every(e=>e.status==='running'));assert.equal(p.phase,'normal');
 for(let i=0;i<1199;i++)advanceHistoricalPresentation(p,.01,true,{flight:s});assert.deepEqual(s,before);assert.deepEqual(p.visual.radio.history.map(l=>l.clip),['us1549-opening-0','us1549-opening-1']);
 assert(Math.hypot(p.visual.x-s.x,p.visual.y-s.y,p.visual.z-s.z)<2);assert.equal(historicalClip('us1549-opening-1','zh','j').voice,'h');
});
test('the two seconds after the strike use real flight integration and record the same trajectory before cockpit handover',()=>{
 const s=start(),expected=structuredClone(s),p=createHistoricalIntro(s),r=new FlightRecording();for(let i=0;i<200;i++)advanceFlight(expected,{},.01);
 while(p.active)advanceHistoricalPresentation(p,.037,true,{flight:s,onStep:f=>r.observe(f)});
 assert(Math.abs(s.time-2)<1e-8);assert.equal(p.visual,s);assert.equal(p.phase,'bird-strike');assert(s.engines.every(e=>e.status==='failed'));
 for(const key of['x','y','z','pitch','roll','yaw','speed'])assert(Math.abs(s[key]-expected[key])<1e-8,key);assert(r.stats().frames>10);assert.equal(r.segments[0].start,0);
});
test('skipping normal cover keeps the full two-second impact window; pausing cannot consume it',()=>{
 const s=start(),p=createHistoricalIntro(s);assert(skipHistoricalPrelude(p));advanceHistoricalPresentation(p,.5,false,{flight:s});assert.equal(s.time,0);assert(!p.struck);
 advanceHistoricalPresentation(p,.5,true,{flight:s});assert(p.struck&&p.active);assert(Math.abs(s.time-.5)<1e-8);assert(!skipHistoricalPrelude(p));for(let i=0;i<3;i++)advanceHistoricalPresentation(p,.5,true,{flight:s});assert(!p.active);assert(Math.abs(s.time-2)<1e-8);
});
test('bird flock and bounded instanced smoke appear at ingestion, fade, and never change physical state',()=>{
 const s=start(),before=structuredClone(s),scene=new THREE.Scene(),fx=createHistoricalEffects(scene);fx.update(s,{kind:'history-intro',elapsed:10,strikeAt:12});assert(!fx.stats().birds&&!fx.stats().smoke.visible);
 fx.update(s,{kind:'history-intro',elapsed:11.6,strikeAt:12});assert(fx.stats().birds);assert(!fx.stats().smoke.visible);
 fx.update(s,{kind:'history-intro',elapsed:12.6,strikeAt:12});const peak=fx.stats().smoke;assert(peak.puffs>0&&peak.puffs<=80&&peak.opacity>0);fx.update({...s,time:25},null);assert(fx.stats().smoke.opacity<peak.opacity);assert.deepEqual(s,before);fx.dispose();assert.equal(scene.children.length,0);
});
test('original synthetic strikes have a strong dull onset followed by decelerating shafts and a quiet tail',()=>{
 const w=birdStrikeWave(),a=w.channels[0],rms=(start,end)=>Math.sqrt(a.subarray(start*w.rate,end*w.rate).reduce((sum,x)=>sum+x*x,0)/((end-start)*w.rate));
 assert.equal(w.channels.length,2);assert(a.every(Number.isFinite));assert(rms(.02,.35)>rms(3,4)*4);assert(rms(5,6)<rms(.6,1)*.1);assert(!a.every((v,i)=>v===w.channels[1][i]));
 const dominant=(start,end)=>{let best=0,power=0;for(let hz=25;hz<=500;hz+=5){let re=0,im=0;for(let i=Math.floor(start*w.rate);i<end*w.rate;i+=3){const t=i/w.rate,v=a[i]*Math.sin(Math.PI*(t-start)/(end-start))**2;re+=v*Math.cos(2*Math.PI*hz*t);im+=v*Math.sin(2*Math.PI*hz*t);}if(re*re+im*im>power){power=re*re+im*im;best=hz;}}return best;};assert(dominant(.6,1)>dominant(3,3.4)*2);
 const s=start(),before=structuredClone(s);assert.equal(birdStrikeAge(s),0);assert.deepEqual(s,before);s.historical.finalPractice=true;assert.equal(birdStrikeAge(s),null);
});
test('pause resumes the bird audio at the same flight time and cockpit cuts do not restart it',()=>{
 const sources=[],node=()=>({gain:{value:0},frequency:{value:0,setTargetAtTime(){}},connect(){},disconnect(){}}),context={currentTime:0,createGain:node,createBiquadFilter:node,createAnalyser:()=>({...node(),getFloatTimeDomainData(a){a.fill(0)}}),createBuffer:(n,len)=>{const arrays=Array.from({length:n},()=>new Float32Array(len));return{getChannelData:i=>arrays[i]};},createBufferSource:()=>{const s={...node(),start(when,offset){this.offset=offset;},stop(){this.onended?.();}};sources.push(s);return s;}};
 const audio=new BirdStrikeAudio(context,node()),s=start();s.time=.1;audio.update(s,true,{exterior:true});assert.equal(sources.length,1);assert.equal(sources[0].offset,.1);
 context.currentTime=1.9;s.time=2;audio.update(s,true,{exterior:false});assert.equal(sources.length,1);audio.pause();context.currentTime=10;audio.update(s,true,{exterior:false});assert.equal(sources.length,2);assert.equal(sources[1].offset,2);audio.update(s,false);assert(!audio.stats().active);audio.dispose();
});
