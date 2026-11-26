import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {createFlight} from '../src/flight.js';
import {buildHighlights} from '../src/replay/highlights.js';
import {discoverLandmarkWindows} from '../src/replay/landmark-discovery.js';
import {libraryShotPose,registerShotTemplate} from '../src/replay/shot-library.js';
import {createShotDirector} from '../src/replay/shot-director.js';
import {settingVisible} from '../src/replay/setting-shots.js';
import {airportShotContext} from '../src/replay/shot-context.js';
const poi={id:'T',name:'Test terminal',position:[0,30,0],width:100,depth:80,height:60,baseY:0,radius:65,importance:1,kind:'terminal',sourceIds:['T'],polygons:[[[-50,-40],[50,-40],[50,40],[-50,40]]]},env={heightAt:()=>0,landmarks:[poi],terminals:[poi],obstacles:[]};
function record(fn,seconds=8){const r=new FlightRecording(),s=createFlight(null,{levelId:'takeoff'});s.airborne=true;s.gear=false;s.gearPosition=0;for(let i=0;i<=seconds*20;i++){s.time=i/20;fn(s);if(!i)r.startSegment(s);else r.write(s);}return r;}
const clip=(r,template)=>({type:'landmark',poi,airportId:'training',segment:0,start:0,end:8,time:4,eventOffset:4,duration:8,recordedDuration:8,shot:'air',allowedTemplates:[template]});
test('whole-route discovery finds a quiet passage outside key-event windows',()=>{
 const target={...poi,position:[300,30,-3000]},r=record(s=>{s.x=0;s.y=120;s.z=5000-s.time*200;},80);r.events=[{type:'takeoff',time:0,segment:0,attempt:1},{type:'complete',time:80,segment:0,attempt:1}];const before=r.stats(),contextFor=()=>({...env,landmarks:[target]}),d=discoverLandmarkWindows(r,{contextFor});assert(d.windows.length>12);assert(d.windows.some(w=>Math.abs(w.time-40)<1));assert(d.stats.points<100);const selected=buildHighlights(r,{contextFor});assert(selected.some(c=>c.type==='landmark'&&c.camera.family==='setting'&&c.start>10&&c.end<70));assert.deepEqual(r.stats(),before);
});
test('discovery respects retry prefixes and never invents a flight through skipped cruise',()=>{
 const target={...poi,kind:'building',position:[0,30,0]},r=record(s=>{s.x=-10000+s.time*200;s.y=120;s.z=0;},80);r.spans[0].until=20;assert.equal(discoverLandmarkWindows(r,{contextFor:()=>({...env,landmarks:[target]})}).windows.length,0);const s=createFlight(null,{levelId:'takeoff'});Object.assign(s,{time:100000,x:10000,y:120,z:0,airborne:true});r.startSegment(s,'skip');for(let i=1;i<=80;i++){s.time+=.05;s.x+=5;r.write(s);}assert.equal(discoverLandmarkWindows(r,{contextFor:()=>({...env,landmarks:[target]})}).windows.length,0);assert.equal(r.segments[0].end,80);
});
test('position traversal stays in source time domains without reconstructing full flight state',()=>{
 const r=record(s=>{s.x=s.time*80;s.y=120;s.z=0;},12);r.sample=()=>{throw Error('full-state sample not allowed');};const positions=[...r.positionSamples(0,1,{start:3,end:7})];assert(positions.length>=4&&positions.length<=6);assert(positions.every(p=>p.time>=3&&p.time<=7));assert(positions.every(p=>Object.keys(p).length===4));
});
test('parked and grounded completion cannot re-enter highlights through a generic fallback',()=>{
 const r=new FlightRecording(),s=createFlight(null,{levelId:'takeoff'});s.landed=true;s.airborne=false;s.ground={stage:'parked'};r.observe(s);for(let i=1;i<=200;i++){s.time=i/20;r.observe(s);}s.result={success:true};r.observe(s);assert(r.events.some(e=>e.type==='complete'));assert.deepEqual(buildHighlights(r,{contextFor:()=>({...env,landmarks:[]})}),[]);
});
test('close side framing permits a partial fuselage while retaining the architectural subject',()=>{
 const r=record(s=>{s.x=650-(s.time-4)*60;s.y=120;s.z=200;s.yaw=Math.PI/2;}),c=clip(r,'landmark-shoulder'),d=createShotDirector(r,[c],{contextFor:()=>env});d.complete();assert(!d.stats().reports[0].fallback);for(const t of[0,4,8]){const s=r.sample(0,t),p=libraryShotPose(s,{...c.camera,anchor:r.sample(0,4),elapsed:t,duration:8},env);assert(p.allowCrop);assert.equal(p.part,'airframe');assert(Math.hypot(p.position[0]-s.x,p.position[1]-s.y,p.position[2]-s.z)<25);assert(settingVisible(p));}
});
test('ground flyby uses a fixed human-height camera and keeps a real building edge in frame',()=>{
 const r=record(s=>{s.x=120;s.y=120;s.z=200-(s.time-4)*60;s.yaw=0;}),c=clip(r,'landmark-ground'),d=createShotDirector(r,[c],{contextFor:()=>env});d.complete();assert(!d.stats().reports[0].fallback,JSON.stringify(d.stats().reports));let position;for(const t of[0,4,8]){const p=libraryShotPose(r.sample(0,t),{...c.camera,anchor:r.sample(0,4),elapsed:t,duration:8},env);assert.equal(p.position[1],2.2);if(position)assert.deepEqual(p.position,position);position=p.position;assert(settingVisible(p));assert(p.setting.points.length>=2);}
});
test('a camera beside a building earns no setting score when the building leaves the frame',()=>{
 const r=record(s=>{s.x=120;s.y=120;s.z=200-(s.time-4)*60;s.yaw=0;}),off=registerShotTemplate({id:'invisible-setting',family:'setting',interest:1,cost:0,candidates:()=>[{}],pose:s=>({position:[s.x,s.y,s.z+100],target:[s.x,s.y,s.z],subject:[s.x,s.y,s.z],subjectRadius:19,part:'aircraft',phase:'test',fov:45,mountedAt:'T',setting:{id:'T',sourceIds:['T'],points:[[0,20,100000],[10,30,100000]],focus:[0,30,100000],radius:10,minRadius:.02}})});try{const c=clip(r,'invisible-setting'),d=createShotDirector(r,[c],{contextFor:()=>env});d.complete();assert(d.stats().reports[0].fallback);assert(d.stats().reports[0].candidates[0].reasons['setting-not-visible']>0);}finally{off();}
});
test('the main Daxing terminal is the same kind of target as a modeled city landmark',()=>{
 const c=airportShotContext('daxing');assert(c.terminals.some(t=>t.sourceIds.includes('relation/12731810')));assert(!c.terminals.some(t=>t.sourceIds.includes('way/986126956')));assert(c.terminals.every(t=>c.landmarks.includes(t)));assert(c.terminals.every(t=>t.facades.length>0));
});
import {rayObstacle} from '../src/replay/shot-geometry.js';
test('terminal courtyards remain open during source-footprint occlusion checks',()=>{
 const box={min:[0,0,0],max:[100,30,100],polygons:[[[0,0],[100,0],[100,20],[20,20],[20,100],[0,100]]]};assert(!rayObstacle([60,10,60],[120,10,60],box));assert(rayObstacle([-10,10,10],[110,10,10],box));assert(!rayObstacle([-10,40,10],[110,40,10],box));
});
import * as THREE from 'three';
import {zenithVantage,zenithAircraftVisible} from '../src/replay/setting-shots.js';
import {projected,viewBasis,aircraftPoint} from '../src/replay/shot-geometry.js';
import {FlightCameraRig} from '../src/views/camera-rig.js';
import {createViewState} from '../src/views/view-state.js';
test('roof shot enters from the top and waits for the centre before panning smoothly without moving its ground position',()=>{
 const v=zenithVantage({x:80,z:0},poi,1,env.heightAt),r=record(s=>{s.x=v.position[0];s.y=poi.height+24;s.z=v.position[2]-(s.time-4)*55;s.yaw=0;}),c=clip(r,'landmark-zenith'),d=createShotDirector(r,[c],{contextFor:()=>env,seed:7});d.complete();assert(!d.stats().reports[0].fallback,JSON.stringify(d.stats().reports));assert(Math.abs(c.camera.entryTime-c.start-1)<1e-8);assert(c.start>0&&c.end<8);const expected=zenithVantage(r.sample(0,4),poi,c.camera.side,env.heightAt);assert(Math.hypot(...expected.position.map((v,i)=>v-c.camera.vantage.position[i]))<1e-7);let first,last;const camera=new THREE.PerspectiveCamera(36,1.6,.7,30000),rig=new FlightCameraRig(camera,{heightAt:()=>0}),entry=c.camera.entryTime,follow=c.camera.followTime;assert(follow>entry);
 for(const time of[c.start,entry-.01,entry,(entry+follow)/2,follow,follow+.001,follow+.16,follow+.32,c.end]){const s=r.sample(0,time),shot={...c.camera,anchor:r.sample(0,c.time),elapsed:time-c.start,duration:c.duration,index:0},p=libraryShotPose(s,shot,env);assert(p.fixedPosition);assert(!p.attitudeAttached);if(time<=follow){assert(p.fixed);assert(settingVisible(p));assert(viewBasis(p).forward.distanceTo(new THREE.Vector3(0,1,0))<1e-8);}else assert(p.tracking);if(first){assert.deepEqual(p.position,first.position);assert.equal(p.fov,first.fov);}else first=p;rig.update(s,createViewState('exterior'),0,{replay:shot});assert(!rig.stats().replayShot.fallback);assert(!rig.stats().replayShot.rollAttached);if(time===follow+.001)assert(viewBasis(p).forward.angleTo(new THREE.Vector3(0,1,0))<1e-6,'zero-speed start, no snap');if(time>=follow+.32){const q=projected(p.subject,p);assert(Math.abs(q.x)<1e-8&&Math.abs(q.y)<1e-8);}last=p;}
 assert.notDeepEqual(first.target,last.target);const atEntry=libraryShotPose(r.sample(0,entry),{...c.camera,elapsed:entry-c.start,duration:c.duration},env),nose=projected(aircraftPoint(r.sample(0,entry),[0,0,-16.5]),atEntry);assert(Math.abs(nose.x)<.05&&nose.y>.95&&nose.y<1.05,'nose enters through the top');const atCentre=libraryShotPose(r.sample(0,follow),{...c.camera,elapsed:follow-c.start,duration:c.duration},env),q=projected(atCentre.subject,atCentre);assert(Math.abs(q.x)<.14&&Math.abs(q.y)<1e-5,'tracking starts at the middle');
 const poses=[c.start,entry+.2,c.end].map(time=>libraryShotPose(r.sample(0,time),{...c.camera,elapsed:time-c.start,duration:c.duration},env));for(const [i,time]of[c.start,entry+.2,c.end].entries())assert.deepEqual(libraryShotPose(r.sample(0,time),{...c.camera,elapsed:time-c.start,duration:c.duration},env),poses[i],'seeking and looping reproduce the same pose');
});
test('zenith rejects high and displaced passes instead of calling an empty sky a flyby',()=>{
 for(const [x,y]of[[1000,84],[80,500]]){const r=record(s=>{s.x=x;s.y=y;s.z=-(s.time-4)*55;}),c=clip(r,'landmark-zenith'),d=createShotDirector(r,[c],{contextFor:()=>env});d.complete();assert(d.stats().reports[0].fallback);}
});

test('roof lead-in is empty until the detected silhouette entry and adapts tracking onset to screen aspect',()=>{
 const v=zenithVantage({x:80,z:0},poi,1,env.heightAt),r=record(s=>{s.x=v.position[0];s.y=84;s.z=-(s.time-4)*55;s.yaw=0;}),c=clip(r,'landmark-zenith'),d=createShotDirector(r,[c],{contextFor:()=>env});d.complete();assert(!d.stats().reports[0].fallback);const e=c.camera.entryTime;assert(!zenithAircraftVisible(r.sample(0,e-.01),c.camera.vantage));assert(zenithAircraftVisible(r.sample(0,e+.01),c.camera.vantage));for(const aspect of[1.6,1.9,2.4]){const p=libraryShotPose(r.sample(0,e),{...c.camera,elapsed:e-c.start,duration:c.duration},{...env,aspect});assert(!zenithAircraftVisible(r.sample(0,p.entryTime-.01),c.camera.vantage,aspect));assert(zenithAircraftVisible(r.sample(0,p.entryTime+.01),c.camera.vantage,aspect));}
});
