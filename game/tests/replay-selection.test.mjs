import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight} from '../src/flight.js';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {createReplay,advanceReplay,replayFrame,changeReplayClip} from '../src/replay/highlights.js';
import {registerShotTemplate} from '../src/replay/shot-library.js';
import {createShotDirector} from '../src/replay/shot-director.js';
import {discoverLandmarkWindows} from '../src/replay/landmark-discovery.js';
const empty={heightAt:()=>0,landmarks:[],obstacles:[]};
function recording(seconds,fn=()=>{}){const r=new FlightRecording(),s=createFlight(null,{levelId:'takeoff'});Object.assign(s,{airborne:true,landed:false,gear:false,gearPosition:0,y:100});for(let i=0;i<=seconds*20;i++){s.time=i/20;s.x=s.time*80;s.z=0;fn(s);if(!i)r.startSegment(s);else r.write(s);}return r;}
const target=(id,x)=>({id,kind:'landmark',name:id,position:[x,20,200],baseY:0,height:40,width:40,depth:40,radius:30,importance:1,polygons:[[[x-20,180],[x+20,180],[x+20,220],[x-20,220]]]});
// Controlled plugin geometry isolates the selection policy from the artistic
// merit of any particular airport model or real camera recipe.
function pose(s,good){return{position:[s.x,s.y,s.z+100],target:[s.x,s.y,s.z],subject:[s.x,s.y,s.z],subjectRadius:(good?.23:.03)*100*Math.tan(43*Math.PI/360)*1.6,part:'aircraft',phase:'selection-fixture',fov:43,near:.7};}
test('all candidate windows get scored before the final six; a late high-score target survives and scenery has no pre-score two-clip cap',()=>{
 const r=recording(80),before=r.stats(),targets=Array.from({length:20},(_,i)=>target('target-'+i,i*250)),contextFor=()=>({...empty,landmarks:targets}),off=registerShotTemplate({id:'test-global-selection',family:'setting',interest:1,cost:0,candidates:c=>c.poi?[{landmark:c.poi}]:[],pose:(s,c)=>pose(s,c.landmark.id==='target-19')});
 try{
  const p=createReplay(r,{directorOptions:{contextFor,templateIds:['test-global-selection'],seed:42}});assert(p.planning);assert.equal(p.clips.length,0);advanceReplay(p,1);assert.equal(p.elapsed,0);assert.equal(replayFrame(p),null);
  let previous=0,batches=0;while(p.planning){p.director.step({budgetMs:100,maxSamples:17});const stats=p.director.stats();assert(stats.samplesEvaluated-previous<=17);previous=stats.samplesEvaluated;if(p.planning)assert.equal(p.clips.length,0);assert(++batches<5000);}
  const stats=p.director.stats();assert(stats.candidateCount>12);assert.equal(stats.plannedCandidates,stats.candidateCount);assert.equal(stats.candidateReports.length,stats.candidateCount);assert(stats.candidateReports.some(c=>c.index>12&&c.poiId==='target-19'&&!c.fallback));assert(p.clips.some(c=>c.poi?.id==='target-19'));assert.equal(p.clips.length,6);assert(p.clips.filter(c=>c.type==='landmark').length>2);assert.deepEqual(r.stats(),before);
  const saved=JSON.stringify(p.clips);for(let i=0;i<15;i++){changeReplayClip(p,1);p.director.step();p.director.ensure(p.index);}assert.equal(JSON.stringify(p.clips),saved);
 }finally{off();}
});
test('a second passage by the same landmark competes independently across the whole flight',()=>{
 const poi=target('revisit',0),r=recording(120,s=>{s.x=Math.abs(s.time-60)*100-3000;}),contextFor=()=>({...empty,landmarks:[poi]}),off=registerShotTemplate({id:'test-revisit-view',family:'setting',interest:1,cost:0,candidates:c=>c.poi?[{}]:[],pose:(s)=>({...pose(s,true),subjectRadius:s.time<80?1000:pose(s,true).subjectRadius})});
 try{const windows=discoverLandmarkWindows(r,{contextFor}).windows;assert(windows.some(c=>Math.abs(c.time-30)<2));assert(windows.some(c=>Math.abs(c.time-90)<2));const p=createReplay(r,{directorOptions:{contextFor,templateIds:['test-revisit-view']}});p.director.complete();assert(p.clips.some(c=>c.type==='landmark'&&c.time>=80));}finally{off();}
});
test('whole-flight motion scanning finds a bank peak after the original turn-event window',()=>{
 const r=recording(70,s=>{s.y=500;s.roll=s.time<20?0:s.time<45?.15+(s.time-20)*.02:s.time<55?.65-(s.time-45)*.065:0;});r.events=[{type:'turn',segment:0,attempt:1,time:20}];const p=createReplay(r,{directorOptions:{contextFor:()=>empty,templateIds:['tail-bank-front']}});p.director.complete();const c=p.clips.find(c=>c.type==='turn');assert(c);assert(c.time>30);assert.equal(c.camera.template,'tail-bank-front');
});
test('an incomplete immediate director pass never pins a camera before later variants are scored',()=>{
 const r=recording(8),c={type:'turn',segment:0,airportId:'training',start:0,end:8,time:4,duration:8,recordedDuration:8,shot:'air'},off=registerShotTemplate({id:'test-late-camera',family:'air',interest:1,cost:0,candidates:()=>Array.from({length:10},(_,i)=>({good:i===9})),pose:(s,c)=>pose(s,c.good)});
 try{const d=createShotDirector(r,[c],{contextFor:()=>empty,templateIds:['test-late-camera']});assert.equal(d.ensure(0),null);assert.equal(d.progress().plannedClips,0);assert.equal(c.camera,undefined);d.complete();assert.equal(c.camera.variant,9);assert.equal(d.stats().reports[0].candidates.length,10);}finally{off();}
});
test('background planning is cancellable and does not modify or advance the recorded flight',async()=>{
 const r=recording(12),before=r.stats(),p=createReplay(r,{background:true,directorOptions:{contextFor:()=>empty}});p.director.dispose();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(p.director.stats().samplesEvaluated,0);assert.equal(p.elapsed,0);assert.deepEqual(r.stats(),before);
 const q=createReplay(r,{background:true,directorOptions:{contextFor:()=>empty}});q.paused=true;const until=Date.now()+5000;while(q.planning&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,5));q.director.dispose();assert(!q.planning);assert(q.paused);assert.equal(q.elapsed,0);assert(q.clips.length>0);assert.deepEqual(r.stats(),before);
});
test('near and telephoto framings survive per-window scoring independently and can both reach the final cut',()=>{
 const r=recording(40),poi=target('style-target',1600),contextFor=()=>({...empty,landmarks:[poi]}),off=registerShotTemplate({id:'test-framing-variety',family:'setting',interest:1,cost:0,candidates:c=>c.poi?[{framing:'near',landmark:c.poi},{framing:'telephoto',landmark:c.poi}]:[],pose:s=>pose(s,true)});
 try{const p=createReplay(r,{directorOptions:{contextFor,templateIds:['test-framing-variety'],seed:10}});p.director.complete();assert.equal(p.clips.length,2);assert.deepEqual(new Set(p.clips.map(c=>c.camera.framing)),new Set(['near','telephoto']));const [a,b]=p.clips;assert(Math.min(a.end,b.end)-Math.max(a.start,b.start)<=.45*Math.min(a.end-a.start,b.end-b.start));}finally{off();}
});
