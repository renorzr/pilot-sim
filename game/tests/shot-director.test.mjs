import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAircraftVisual} from '../src/aircraft/visual.js';
import {createFlight,advanceSimulation} from '../src/flight.js';
import {pilotInput} from './pilot.mjs';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {createReplay,replayFrame,buildHighlights} from '../src/replay/highlights.js';
import {createShotDirector,SHOT_WEIGHTS} from '../src/replay/shot-director.js';
import {airportShotContext} from '../src/replay/shot-context.js';
import {shotTemplates,registerShotTemplate,libraryShotPose} from '../src/replay/shot-library.js';
import {aircraftFocus,aircraftVector,aircraftSelfBlocked,projected} from '../src/replay/shot-geometry.js';
import {FlightCameraRig} from '../src/views/camera-rig.js';
import {createViewState} from '../src/views/view-state.js';
import {createReplayDetailLayer,registerReplayDetail} from '../src/replay/replay-details.js';
const env={heightAt:()=>0,obstacles:[],terminals:[],landmarks:[]};
function fixture(type='turn',fn=null){const r=new FlightRecording(),s=createFlight(null,{levelId:'takeoff'});s.airborne=true;s.y=500;s.gear=false;s.gearPosition=0;fn?.(s);r.observe(s);for(let i=1;i<=800;i++){s.time=i/100;s.z=-s.time*80;s.roll=type==='turn'?.12+s.time*.035:0;fn?.(s);r.observe(s);}const clip={id:0,type,airportId:'training',segment:0,start:0,end:8,time:4,duration:8,recordedDuration:8,shot:'air'};return{r,s,clip};}
const plan=(r,clips,context=env,seed=7)=>{const d=createShotDirector(r,clips,{contextFor:()=>context,seed});d.complete();return d;};
test('shot registry offers all four requested families and supports explicit extension',()=>{
 const ids=shotTemplates().map(t=>t.id);for(const id of['wheel-close','nose-wheel-close','nose-wheel-front','landmark-zenith','tail-bank','tail-bank-front','landmark-side','landmark-shoulder','landmark-ground','landmark-pair'])assert(ids.includes(id));const off=registerShotTemplate({id:'test-shot',family:'test',interest:.5,cost:.1,candidates:()=>[],pose:()=>null});assert(shotTemplates().some(t=>t.id==='test-shot'));off();assert(!shotTemplates().some(t=>t.id==='test-shot'));assert.throws(()=>registerShotTemplate({id:'bad'}));assert.equal(Object.values(SHOT_WEIGHTS).reduce((a,b)=>a+b),100);
});
test('wheel focus follows the actual authored animated wheel joints',async()=>{
 const bytes=await readFile(new URL('../../public/assets/aircraft/skyline-320.glb',import.meta.url)),gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject)),visual=createAircraftVisual({THREE,scene:gltf.scene}),s=createFlight(null,{levelId:'takeoff'});
 try{for(const gear of[1,.7,.4]){s.gearPosition=gear;s.pitch=.17;s.roll=.35;s.yaw=.6;s.x=20;s.y=300;s.z=-400;visual.update(s,0);visual.group.rotation.set(s.pitch,-s.yaw,-s.roll,'YXZ');visual.group.position.set(s.x,s.y,s.z);visual.group.updateMatrixWorld(true);for(const side of[-1,1]){const node=visual.group.getObjectByName('MainWheels_'+(side<0?'L':'R')),v=node.getWorldPosition(new THREE.Vector3());assert(v.distanceTo(new THREE.Vector3(...aircraftFocus('wheel',s,side)))<1e-5);}}assert(visual.detailParts('tail').length>=5);assert(visual.detailParts('tail').every(n=>n.parent));}finally{visual.dispose();}
});
test('banked tail camera inherits the aircraft up vector and leaves the saved gameplay view untouched',()=>{
 const {s}=fixture(),before=structuredClone(s),view=createViewState('cockpit'),selected={...view},cam=new THREE.PerspectiveCamera(36,1.6,.7,30000),rig=new FlightCameraRig(cam,{heightAt:()=>0});
 rig.update(s,view,.1,{replay:{template:'tail-bank',kind:'tail',side:1,anchor:s,index:0,elapsed:3,duration:8}});assert.equal(rig.stats().replayShot.part,'tail');assert(rig.stats().replayShot.rollAttached);assert(new THREE.Vector3(...aircraftVector(s,[0,1,0])).distanceTo(cam.up)<1e-8);assert(cam.near<.7);assert.deepEqual(s,before);assert.deepEqual(view,selected);rig.update(s,view,.1);assert.deepEqual(cam.up.toArray(),[0,1,0]);assert.equal(cam.near,.7);
});
test('terminal pair uses continuous recorded time and a fixed terminal-side reverse camera',()=>{
 const {r,clip}=fixture('final'),terminal={id:'T',position:[80,10,-2500],width:300,depth:100,baseY:0,height:20},shot={template:'landmark-pair',kind:'terminal',terminal,side:1,anchor:r.sample(0,4),duration:8};
 const a=libraryShotPose(r.sample(0,2),{...shot,elapsed:2},env),b=libraryShotPose(r.sample(0,5),{...shot,elapsed:5},env),c=libraryShotPose(r.sample(0,7),{...shot,elapsed:7},env);assert.equal(a.phase,'setting-shoulder');assert(a.position.every(Number.isFinite));assert.equal(b.phase,'setting-ground');assert.deepEqual(b.position,c.position);assert.notDeepEqual(b.target,c.target);assert.equal(b.position[1],2.2);assert(b.setting.points.length>=2);const d=plan(r,[clip],{...env,landmarks:[terminal],terminals:[terminal]});assert(d.stats().reports[0].candidates.some(c=>c.template==='landmark-pair'));
});
test('landmark candidates exist only for actual nearby modeled landmarks and use a bounded long lens',()=>{
 const {r,clip}=fixture('turn',s=>{s.x=650-s.time*60;s.y=120;s.z=200;s.yaw=Math.PI/2;s.roll=0;}),landmark={id:'tower',position:[0,30,0],width:100,depth:80,radius:65,height:60,baseY:0,kind:'landmark',importance:1},d=plan(r,[clip],{...env,landmarks:[landmark]});const reports=d.stats().reports[0].candidates.filter(c=>c.template.startsWith('landmark-'));assert(reports.some(c=>!c.rejected&&c.score>=65));const pose=libraryShotPose(r.sample(0,4),{template:'landmark-side',framing:'telephoto',kind:'setting',landmark,side:1,anchor:r.sample(0,4),elapsed:4,duration:8},env);assert(pose.fov>=2&&pose.fov<38);assert(pose.setting);const empty=plan(r,[{...clip}],env);assert(!empty.stats().reports[0].candidates.some(c=>c.template.startsWith('landmark-')));
});
test('geometric scores reject buried/occluded shots, expose component scores and keep a safe fallback',()=>{
 const{r,clip}=fixture(),bad={...env,heightAt:()=>2000},d=plan(r,[clip],bad);assert(d.stats().reports[0].fallback);assert(d.stats().reports[0].candidates.every(c=>c.rejected));const {clip:ok}=fixture(),good=plan(r,[ok]);for(const c of good.stats().reports[0].candidates){if(!c.rejected){assert(c.score>=0&&c.score<=100);assert(c.parts.composition>=0&&c.parts.composition<=1);}}
 const s=r.sample(0,3);assert(aircraftSelfBlocked(s,[s.x,s.y,s.z],[s.x,s.y,s.z+10],'tail'));
});
test('seeded selection is fixed through loops and changes among nearby high scoring candidates',()=>{
 const {r,clip}=fixture(),a=plan(r,[{...clip}],env,42),b=plan(r,[{...clip}],env,42);assert.deepEqual(a.stats().reports,b.stats().reports);const choices=new Set();for(let seed=0;seed<12;seed++){const c={...clip};plan(r,[c],env,seed);choices.add(c.camera.template+':'+c.camera.side);}assert(choices.size>1);const pinned={...clip},d=plan(r,[pinned]);const original=JSON.stringify(pinned.camera);for(let i=0;i<20;i++){d.ensure(0);d.step();}assert.equal(JSON.stringify(pinned.camera),original);
});
test('planner batches work without requests, rendering or mutating flight history',()=>{
 const{r,clip}=fixture(),before=r.stats(),d=createShotDirector(r,[clip],{contextFor:()=>env});d.step({budgetMs:100,maxSamples:2});assert.equal(d.stats().samplesEvaluated,2);assert.equal(d.stats().plannedClips,0);d.complete();assert.deepEqual(r.stats(),before);assert(d.stats().samplesEvaluated<=200);
});
test('all real airports expose terminal anchors; city landmarks refer to existing LAX models',()=>{for(const id of['lax','jfk','daxing','kansai','changi','xiaoshan']){const c=airportShotContext(id);assert(c.terminals.length>0,id);assert(c.terminals.every(t=>t.position.every(Number.isFinite)));}assert(airportShotContext('lax').landmarks.length>=3);});
test('a normal force-integrated takeoff offers scored wheel closeups and preserves physical result',()=>{
 const s=createFlight(null,{levelId:'takeoff'}),r=new FlightRecording();r.observe(s);for(let i=0;i<10000&&!s.result;i++){const input=pilotInput(s);r.observe(s,input);advanceSimulation(s,input,.02,{onStep:(state,input)=>r.observe(state,input)});}assert(s.result?.success);const before=structuredClone(s),p=createReplay(r,{directorOptions:{seed:3,contextFor:()=>env}});p.director.complete();const report=p.director.stats().reports.find(x=>x.index===0);assert(report.candidates.some(c=>c.template==='wheel-close'&&!c.rejected));assert(report.candidates.some(c=>c.template==='nose-wheel-close'&&!c.rejected));assert(report.score>=65);replayFrame(p);assert.deepEqual(s,before);
});
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('optional detail assets are replay-only, bounded and restore base geometry on exit',async()=>{
 const group=new THREE.Group(),wheel=new THREE.Group(),tail=new THREE.Group();group.add(wheel,tail);let loads=0,disposed=0;const fake=part=>({bytes:20,async load(){loads++;return{bytes:20,group:new THREE.Group(),update(){},dispose(){disposed++;}};}}),off1=registerReplayDetail('wheel',fake('wheel')),off2=registerReplayDetail('tail',fake('tail')),layer=createReplayDetailLayer({group,detailParts:p=>[p==='wheel'?wheel:tail]},{maxBytes:25});
 try{layer.beforeBase();layer.update(null,{},0);assert.equal(loads,0);layer.update('wheel',{},0);assert(wheel.visible);await flush();layer.beforeBase();layer.update('wheel',{},0);assert(!wheel.visible);assert.equal(layer.stats().bytes,20);layer.beforeBase();layer.update('tail',{},0);await flush();layer.beforeBase();layer.update('tail',{},0);assert(wheel.visible);assert(!tail.visible);assert.equal(layer.stats().bytes,20);assert(disposed>=1);layer.beforeBase();layer.update(null,{},0);assert(tail.visible);assert.equal(layer.stats().bytes,0);}finally{layer.dispose();off1();off2();}
});
test('late optional detail loads are discarded after leaving replay',async()=>{
 let resolve,disposed=0;const off=registerReplayDetail('wheel',{bytes:20,load:()=>new Promise(r=>resolve=r)}),layer=createReplayDetailLayer({group:new THREE.Group(),detailParts:()=>[]});try{layer.update('wheel',{},0);await flush();layer.update(null,{},0);resolve({bytes:20,group:new THREE.Group(),update(){},dispose(){disposed++;}});await flush();assert.equal(layer.stats().bytes,0);assert.equal(disposed,1);}finally{off();layer.dispose();}
});
test('cutting to a wide shot aborts and discards unfinished detail',async()=>{
 let resolve,signal,disposed=0;const off=registerReplayDetail('wheel',{bytes:20,load:({signal:s})=>{signal=s;return new Promise(r=>resolve=r);}}),layer=createReplayDetailLayer({group:new THREE.Group(),detailParts:()=>[]});try{layer.update('wheel',{},0);await flush();layer.beforeBase();layer.update('aircraft',{},0);assert(signal.aborted);assert.equal(layer.stats().pending,null);resolve({bytes:20,group:new THREE.Group(),update(){},dispose(){disposed++;}});await flush();assert.equal(disposed,1);assert.equal(layer.stats().bytes,0);}finally{off();layer.dispose();}
});
import {createShotOcclusionIndex} from '../src/replay/shot-occlusion.js';
test('long-lens occlusion visits the ray corridor without sweeping the whole city',()=>{
 const on={min:[4900,0,4900],max:[5100,80,5100]},off={min:[4900,0,-5100],max:[5100,80,-4900]},query=createShotOcclusionIndex([on,off]);assert([...query([0,20,0],[10000,20,10000])].includes(on));assert(![...query([0,20,0],[10000,20,10000])].includes(off));assert([...query([10000,20,10000],[0,20,0])].includes(on));assert([...query([5000,20,5000],[5000,30,5000])].includes(on));
});

test('both wheel cameras inherit pitch and roll while viewing in opposite longitudinal directions',()=>{
 const {s}=fixture('takeoff',s=>{s.gearPosition=1;s.pitch=.24;s.roll=.47;s.yaw=.8;}),up=new THREE.Vector3(...aircraftVector(s,[0,1,0]));
 for(const nose of[false,true])for(const side of[-1,1]){const shot={template:nose?'nose-wheel-close':'wheel-close',side,anchor:s,elapsed:1,duration:8},p=libraryShotPose(s,shot,env),axis=new THREE.Vector3(...p.target).sub(new THREE.Vector3(...p.position)).normalize(),expected=new THREE.Vector3(...aircraftVector(s,[0,0,nose?-1:1]));assert(axis.dot(expected)>.999);assert(new THREE.Vector3(...p.up).distanceTo(up)<1e-8);assert(!aircraftSelfBlocked(s,p.position,p.subject,p.part));if(!nose){const inner=aircraftFocus('wheel',s,side).map((v,i)=>v-aircraftVector(s,[side*.25,0,0])[i]),q=projected(inner,p);assert(Math.abs(q.x)>1.15,'paired tyre must be outside the frame');}
 const cam=new THREE.PerspectiveCamera(36,1.6,.7,30000),rig=new FlightCameraRig(cam,{heightAt:()=>0});rig.update(s,createViewState('exterior'),0,{replay:shot});assert(!rig.stats().replayShot.fallback);assert(rig.stats().replayShot.rollAttached);assert(cam.up.distanceTo(up)<1e-8);}
});
test('individual main-tyre and nose-wheel foci match the GLB through gear retraction and steering',async()=>{
 const bytes=await readFile(new URL('../../public/assets/aircraft/skyline-320.glb',import.meta.url)),gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject)),visual=createAircraftVisual({THREE,scene:gltf.scene}),s=createFlight(null,{levelId:'takeoff'});
 try{for(const gear of[1,.7,.4]){Object.assign(s,{gearPosition:gear,pitch:.17,roll:.35,yaw:.6,x:20,y:300,z:-400});s.ground={steering:.4};visual.update(s,0);visual.group.rotation.set(s.pitch,-s.yaw,-s.roll,'YXZ');visual.group.position.set(s.x,s.y,s.z);visual.group.updateMatrixWorld(true);for(const side of[-1,1]){const node=visual.group.getObjectByName('MainWheels_'+(side<0?'L':'R')),v=node.localToWorld(new THREE.Vector3(side*.25,0,0));assert(v.distanceTo(new THREE.Vector3(...aircraftFocus('main-tyre',s,side)))<1e-5);}const nose=visual.group.getObjectByName('NoseWheels').getWorldPosition(new THREE.Vector3());assert(nose.distanceTo(new THREE.Vector3(...aircraftFocus('nose-wheel',s)))<1e-5);}}finally{visual.dispose();}
});

test('leading nose-wheel shot looks aft at the front gear and inherits the aircraft attitude',()=>{
 const {s}=fixture('takeoff',s=>{s.gearPosition=1;s.pitch=.2;s.roll=.36;}),p=libraryShotPose(s,{template:'nose-wheel-front',side:1,elapsed:1},env),direction=new THREE.Vector3(...p.target).sub(new THREE.Vector3(...p.position)).normalize();assert.equal(p.phase,'nose-wheel-front');assert(direction.dot(new THREE.Vector3(...aircraftVector(s,[0,0,1])))>.999);assert(new THREE.Vector3(...p.up).distanceTo(new THREE.Vector3(...aircraftVector(s,[0,1,0])))<1e-8);assert.deepEqual(p.subject,aircraftFocus('nose-wheel',s));assert(!aircraftSelfBlocked(s,p.position,p.subject,p.part));
});

test('leading tail variant views the same tail aftwards and inherits pitch/roll without changing the original',()=>{
 const {r,s,clip}=fixture(),original=libraryShotPose(s,{template:'tail-bank',side:1},env),before=structuredClone(s),p=libraryShotPose(s,{template:'tail-bank-front',side:1},env),axis=new THREE.Vector3(...p.target).sub(new THREE.Vector3(...p.position)).normalize(),inverse=new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch,-s.yaw,-s.roll,'YXZ')).invert(),local=axis.clone().applyQuaternion(inverse);assert(local.z>.95);assert(Math.abs(local.x)>.2&&Math.abs(local.x)<.3);assert.deepEqual(p.subject,original.subject);assert.deepEqual(p.up,original.up);assert.equal(p.phase,'tail-front');assert(!aircraftSelfBlocked(s,p.position,p.subject,p.part));const cam=new THREE.PerspectiveCamera(36,1.6,.7,30000),rig=new FlightCameraRig(cam,{heightAt:()=>0});rig.update(s,createViewState('exterior'),0,{replay:{template:'tail-bank-front',kind:'tail',side:1,anchor:s,index:1,elapsed:3,duration:8}});assert(!rig.stats().replayShot.fallback);assert(rig.stats().replayShot.rollAttached);assert.deepEqual(s,before);assert.deepEqual(libraryShotPose(s,{template:'tail-bank',side:1},env),original);const c={...clip,allowedTemplates:['tail-bank-front']},d=plan(r,[c]);assert(!d.stats().reports[0].fallback);assert.equal(c.camera.template,'tail-bank-front');
});
