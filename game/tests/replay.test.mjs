import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FlightRecording,RECORDING_HZ} from '../src/replay/flight-recording.js';
import {buildHighlights,createReplay,replayFrame,replayStatus,advanceReplay,changeReplayClip} from '../src/replay/highlights.js';
import {replayCameraPose} from '../src/replay/replay-camera.js';
import {FlightCameraRig} from '../src/views/camera-rig.js';
import {createViewState} from '../src/views/view-state.js';
import {createFlight,advanceSimulation} from '../src/flight.js';
import {advanceAtRate} from '../src/sim/time-acceleration.js';
const fixture=()=>createFlight(null,{levelId:'takeoff'});
function track(seconds=35){const r=new FlightRecording(),s=fixture();r.observe(s);for(let i=1;i<=seconds*100;i++){s.time=i/100;s.z=-s.time*70;s.airborne=s.time>=10;s.y=s.airborne?3+(s.time-10)*8:2.8;s.roll=s.time>22?.2:0;r.observe(s);}return{r,s};}
test('all accelerated physics ticks feed a fixed-rate recording without changing flight results',()=>{
 const a=fixture(),b=structuredClone(a),r=new FlightRecording();r.observe(a);
 for(let i=0;i<40;i++){advanceAtRate(a,{},.1,4,{onStep:(s,input)=>r.observe(s,input)});advanceAtRate(b,{},.1,4);}
 assert.deepEqual(a,b);assert.equal(r.stats().segments.length,1);assert.equal(r.stats().frames,1+Math.round(a.time*RECORDING_HZ));assert.equal(r.sample(0,a.time).time,a.time);
 const before=r.stats().frames;advanceSimulation(a,{},0,{onStep:s=>r.observe(s)});assert.equal(r.stats().frames,before);
});
test('sample interpolation preserves double-precision positions, shortest angular paths, and stepped configuration',()=>{
 const s=fixture(),r=new FlightRecording();s.x=23456.123456789;s.yaw=Math.PI-.01;r.observe(s);s.time=.05;s.x+=.2;s.yaw=-Math.PI+.01;s.gear=false;s.gearPosition=.8;s.engines[0].status='failed';r.observe(s);
 const q=r.sample(0,.025);assert(Math.abs(q.x-(s.x-.1))<1e-9);assert(Math.abs(Math.abs(q.yaw)-Math.PI)<1e-6);assert(q.gear);assert(Math.abs(q.gearPosition-.9)<1e-6);assert.equal(q.engines[0].status,'running');assert.equal(r.sample(0,.05).engines[0].status,'failed');assert.equal(r.sample(0,.05).gear,false);q.weather.visibility=1;assert.notEqual(r.sample(0,.025).weather.visibility,1);
});
test('critical events keep their exact tick and full recording is retained after settlement',()=>{
 const{r,s}=track();s.time+=.01;s.result={success:true,score:98};r.observe(s);const original=structuredClone(s),stats=r.stats();assert(stats.sealed);assert(stats.events.some(e=>e.type==='takeoff'&&e.time===10));assert(stats.frames>=701);
 const replay=createReplay(r);replay.director.complete();replay.loading=false;for(let i=0;i<400;i++){replay.loading=false;advanceReplay(replay,.5);}assert(replay.cycles>0);assert.equal(r.stats().frames,stats.frames);assert.deepEqual(s,original);r.observe({...s,time:1000});assert.equal(r.stats().frames,stats.frames);
});
test('skip, airport changes and retries form separate interpolation domains and attempts',()=>{
 const{r,s}=track(12);const firstCount=r.stats().frames;s.x+=10000;r.observe(s);assert.equal(r.segments.length,2);s.airportId='lax';s.time+=600;r.observe(s);assert.equal(r.segments.length,3);assert.equal(r.sample(0,9999).x,0);assert.equal(r.sample(2,-9999).x,s.x);
 s.time=5;s.result=null;r.retry(s);for(let i=0;i<100;i++){s.time+=.01;r.observe(s);}s.result={success:false};r.observe(s);assert.equal(r.stats().attempts,2);assert(r.stats().frames>firstCount);assert(buildHighlights(r).every(c=>r.segments[c.segment].attempt===2));assert.equal(r.segments[3].reason,'retry');
});
test('highlights include touchdown and failure, suppress overlap and never bridge source gaps',()=>{
 const{r,s}=track(65);s.time=65.01;s.landed=true;s.airborne=false;r.observe(s);s.time=65.02;s.result={success:false};r.observe(s);
 const clips=buildHighlights(r);assert(clips.length>=2&&clips.length<=6);assert(clips.some(c=>c.type==='failure'));for(const c of clips){const seg=r.segments[c.segment];assert(c.start>=seg.start&&c.end<=seg.end);assert(c.duration>0&&c.duration<=9.01);}
 // In a successful landing, touchdown wins over the generic completion event.
 const {r:land,s:p}=track(20);p.time=20.01;p.landed=true;p.airborne=false;land.observe(p);for(let i=0;i<500;i++){p.time+=.01;land.observe(p);}p.result={success:true};land.observe(p);assert(buildHighlights(land).some(c=>c.type==='touchdown'));
});
test('pause, menu/visibility hold, loading and clip controls preserve recorded motion',()=>{
 const{r}=track(),p=createReplay(r);p.director.complete();advanceReplay(p,.5);assert.equal(p.elapsed,0);p.loading=false;advanceReplay(p,.5,{visible:false});assert.equal(p.elapsed,0);p.paused=true;advanceReplay(p,.5);assert.equal(p.elapsed,0);assert.equal(replayFrame(p).opacity,0);p.paused=false;advanceReplay(p,.5);assert.equal(p.elapsed,.5);const i=p.index;changeReplayClip(p,-1);assert.equal(p.index,(i-1+p.clips.length)%p.clips.length);assert(p.loading);assert.equal(p.elapsed,0);assert.equal(replayStatus(p).count,p.clips.length);
});
test('failure settlement starts with the scored final incident view while normal replay keeps its ordering',()=>{
 const{r,s}=track();s.time+=.01;s.result={success:false};r.observe(s);const before=r.stats();
 const failure=createReplay(r,{airportId:s.airportId,preferFailure:true});failure.director.complete();assert.equal(failure.clips[failure.index].type,'failure');assert.equal(failure.startIndex,failure.index);assert.equal(failure.elapsed,0);assert(['air-follow','airport-observer','runway-side'].includes(failure.clips[failure.index].camera.template));
 const normal=createReplay(r,{airportId:s.airportId});normal.director.complete();assert.equal(normal.index,0);assert.deepEqual(r.stats(),before);
});
test('ground cameras are fixed, air shots track, and terrain constraints cannot mutate recorded aircraft',()=>{
 const{r}=track(),s=r.sample(0,13),a=r.sample(0,10),t={kind:'ground',anchor:a,elapsed:1,duration:8,index:0};
 const pose=replayCameraPose(s,t),later={...s,z:s.z-300};assert.deepEqual(pose.position,replayCameraPose(later,{...t,elapsed:5}).position);assert.notDeepEqual(pose.target,replayCameraPose(later,t).target);
 const air=replayCameraPose({...s,y:600},{...t,kind:'air'});assert(Math.hypot(air.position[0]-s.x,air.position[2]-s.z)<145);
 const before=structuredClone(s),view=createViewState('cockpit'),selected={...view},cam=new THREE.PerspectiveCamera(36,1.6,.7,30000),rig=new FlightCameraRig(cam,{heightAt:()=>45});rig.update(s,view,.1,{replay:{...t,panel:true}});assert.equal(rig.stats().mode,'replay-ground');assert(cam.position.y>=47.5);assert.deepEqual(s,before);assert.deepEqual(view,selected);assert(cam.view.enabled);rig.update(s,view,.1,{replay:{...t,panel:false}});assert.equal(cam.view?.enabled,false);
});
test('one full hour retains every sample in compact memory without browser persistence',()=>{
 const s=fixture(),r=new FlightRecording();r.observe(s);for(let i=1;i<=3600*RECORDING_HZ;i++){s.time=i/RECORDING_HZ;s.z=-s.time*90;r.observe(s);}const stats=r.stats();assert.equal(stats.frames,72001);assert.equal(stats.duration,3600);assert(stats.bytes<40*1024*1024,stats.bytes+' bytes');assert.equal(r.sample(0,3599.975).time,3599.975);assert.equal(r.segments.length,1);
});
test('an almost immediate failure holds a recorded frame visibly instead of looping black',()=>{
 const r=new FlightRecording(),s=fixture();r.observe(s);s.time=.01;s.result={success:false};r.observe(s);const p=createReplay(r);p.director.complete();assert.equal(p.clips.length,1);p.loading=false;advanceReplay(p,.5);assert.equal(replayFrame(p).state.time,.01);assert.equal(replayFrame(p).opacity,0);assert(p.clips[0].duration>=3);assert.equal(r.stats().frames,2);
});
test('sparse dialogue, clearance, callout and result context remains separate from clip planning',()=>{
 const r=new FlightRecording(),s=fixture();r.observe(s);s.time=.05;s.radio.active={id:1,clip:'takeoff-0',started:.05,until:3};s.calloutSequence=1;s.callouts=[{id:1,time:.05,text:'ONE HUNDRED'}];s.atc.issuedAt=.05;r.observe(s);s.time=.1;s.result={success:false,title:'test'};r.observe(s);
 assert(r.timeline.some(e=>e.type==='radio'&&e.data.pilotVoice===s.radio.pilotVoice));assert(r.timeline.some(e=>e.type==='callouts'));assert(r.timeline.some(e=>e.type==='clearance'));assert(r.timeline.some(e=>e.type==='result'&&e.data.title==='test'));assert.equal(r.sample(0,.05).radio.active,null);assert(buildHighlights(r).every(c=>c.type!=='radio'));s.radio.active.clip='changed';assert.equal(r.timeline.find(e=>e.type==='radio').data.line.clip,'takeoff-0');
});

// Replay scenery must not inherit the strict all-detail gate used for live
// destination handoffs. These fixtures deliberately never finish detail work.
import {createAirportWorldManager} from '../src/views/airport-world-manager.js';
import {prepareReplayScenery} from '../src/replay/replay-scenery.js';
function sceneryFixture(){
 const records=[],installed=new Set();let details=0;
 const document={createElement(){return{ownerDocument:document,style:{},children:[],setAttribute(){},appendChild(n){n.parent=this;this.children.push(n);},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}};}};
 const host=document.createElement(),worlds=createAirportWorldManager({host,createWorld(node,ready,error,id,progress,{activate}){
  const r={id,ready,error,updates:0,disposed:0,deactivated:0};records.push(r);if(activate)installed.add(id);
  return{update(){r.updates++;},activate(){installed.add(id);},deactivate(){installed.delete(id);r.deactivated++;},settled(){details++;return new Promise(()=>{});},dispose(){installed.delete(id);r.disposed++;}};
 }});return{worlds,records,installed,host,detailWaits:()=>details};
}
function twoAirportRecording(){const{r,s}=track(35);s.airportId='lax';s.time+=600;s.x+=5000;r.observe(s);for(let i=0;i<1000;i++){s.time+=.01;s.z-=.7;r.observe(s);}s.result={success:true};r.observe(s);return r;}
test('ready airport clips cut immediately even when optional city work never settles',()=>{
 const f=sceneryFixture(),{r}=track(),p=createReplay(r);p.director.complete();f.worlds.useAirport('training');f.records[0].ready();
 for(let i=0;i<12;i++){prepareReplayScenery(f.worlds,p,false);assert(!p.loading);advanceReplay(p,.2);changeReplayClip(p,1);}
 assert.equal(f.detailWaits(),0);assert.equal(f.records.length,1);assert.equal(f.records[0].disposed,0);f.worlds.dispose();
});
test('replay starts in the resident airport, prepares the other early and swaps two retained worlds across loops',()=>{
 const f=sceneryFixture(),r=twoAirportRecording(),p=createReplay(r,{airportId:'lax'});p.director.complete();assert.equal(p.clips[p.index].airportId,'lax');f.worlds.useAirport('lax');f.records[0].ready();prepareReplayScenery(f.worlds,p,false);
 assert(!p.loading);assert.equal(f.records.length,2);assert.equal(f.worlds.prepared().id,'training');assert.deepEqual([...f.installed],['lax']);f.records[1].ready();prepareReplayScenery(f.worlds,p,false);
 for(let i=0;i<18;i++){changeReplayClip(p,1);prepareReplayScenery(f.worlds,p,false);assert(!p.loading);assert.equal(f.records.length,2);assert.equal(f.host.children.length,2);assert.deepEqual([...f.installed],[p.clips[p.index].airportId]);}
 assert(f.records.every(r=>!r.disposed));assert.equal(f.detailWaits(),0);assert(f.records.some(r=>r.deactivated));f.worlds.retainDestination(null);assert.equal(f.host.children.length,1);f.worlds.dispose();assert.equal(f.host.children.length,0);assert.equal(f.installed.size,0);
});
test('base data still gates a newly encountered airport, while live destination warming remains strict',()=>{
 const f=sceneryFixture(),p=createReplay(twoAirportRecording());p.director.complete();f.worlds.useAirport('training');prepareReplayScenery(f.worlds,p,false);assert(p.loading);f.records[0].ready();prepareReplayScenery(f.worlds,p,false);assert(!p.loading);
 changeReplayClip(p,1);while(p.clips[p.index].airportId==='training')changeReplayClip(p,1);prepareReplayScenery(f.worlds,p,false);assert(p.loading);f.records[1].ready();prepareReplayScenery(f.worlds,p,false);assert(!p.loading);assert.equal(f.detailWaits(),0);f.worlds.dispose();
 const live=sceneryFixture();live.worlds.useAirport('training');live.records[0].ready();live.worlds.prefetch('lax');live.records[1].ready();live.worlds.warmPrepared({airportId:'lax'},{});live.worlds.useAirport('lax');assert(!live.worlds.ready());assert.equal(live.detailWaits(),1);live.worlds.dispose();
});

import {restoreCheckpoint} from '../src/flight.js';
import {pilotInput} from './pilot.mjs';
import {groundPilot} from './ground-pilot.mjs';
function recordedAirline({taxiRetries=0}={}){
 let s=createFlight(null,{levelId:'jfk-pkx'});const r=new FlightRecording();r.observe(s);let retries=0,enteredTaxi=null;
 for(let i=0;i<200000&&!s.result;i++){
  if(s.ground?.stage==='taxi-in'){
   enteredTaxi??=s.time;
   if(retries<taxiRetries&&s.time-enteredTaxi>=2){s=restoreCheckpoint(s);r.retry(s);retries++;enteredTaxi=s.time;}
  }
  const manualTaxi=s.ground?.stage==='taxi-in'&&(retries<taxiRetries||taxiRetries&&s.time-enteredTaxi<2);
  const input=manualTaxi?groundPilot(s,{skip:false}):pilotInput(s);r.observe(s,input);
  advanceSimulation(s,input,.02,{onStep:(state,input)=>r.observe(state,input)});
 }
 assert(s.result?.success,JSON.stringify(s.result));assert.equal(retries,taxiRetries);return{r,s};
}
for(const taxiRetries of [0,1,2])test(`JFK to Daxing retains all flight milestones after ${taxiRetries} arrival-taxi retries`,()=>{
 const{r,s}=recordedAirline({taxiRetries}),clips=buildHighlights(r),types=clips.map(c=>c.type);
 for(const type of ['takeoff','final','touchdown'])assert(types.includes(type),type+': '+types);
 assert(!types.includes('parked'));assert(clips.length>=4&&clips.length<=6);assert(clips.some(c=>c.type==='turn'&&c.airportId==='jfk'));assert(r.events.some(c=>c.type==='turn'&&r.segments[c.segment].airportId==='daxing'));
 assert.equal(r.attempt,taxiRetries+1);if(taxiRetries){assert(clips.some(c=>c.type==='takeoff'&&c.attempt===1));assert(clips.some(c=>c.type==='touchdown'&&c.attempt===1));assert(r.events.some(c=>c.type==='parked'&&c.attempt===r.attempt));assert(s.mission.practice);}
 const before=structuredClone(s);const p=createReplay(r,{airportId:'daxing'});p.director.complete();p.loading=false;advanceReplay(p,.5);assert(replayFrame(p));assert.deepEqual(s,before);
 for(const c of clips){const seg=r.replaySegments().find(s=>s.id===c.segment);assert(seg&&c.start>=seg.start&&c.end<=seg.end);}
});
test('checkpoint lineage removes the discarded future while retaining full raw attempts and earlier successes',()=>{
 const{r,s}=track(35);s.result={success:false};r.observe(s);const rawFrames=r.stats().frames,checkpoint=r.sample(0,20);r.retry(checkpoint);r.observe(checkpoint);
 for(let i=1;i<=500;i++){checkpoint.time=20+i/100;checkpoint.z-=.7;checkpoint.roll=.3;r.observe(checkpoint);}checkpoint.result={success:true};r.observe(checkpoint);
 const path=r.replaySegments(),clips=buildHighlights(r);assert.equal(path[0].end,20);assert.equal(r.segments[0].end,35);assert(r.stats().frames>rawFrames);assert(r.events.some(e=>e.type==='failure'));
 assert(clips.some(c=>c.type==='takeoff'&&c.attempt===1));assert(!clips.some(c=>c.type==='failure'));assert(!clips.some(c=>c.type==='turn'&&c.attempt===1));assert(clips.every(c=>c.segment!==0||c.end<=20));
 const checkpoint2=r.sample(0,12);r.retry(checkpoint2);assert.equal(r.replaySegments()[0].end,12);assert(!r.replaySegments().some(s=>s.attempt===2));assert(r.segments.some(s=>s.attempt===2));
});
