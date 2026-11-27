import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {aircraftDefinition} from '../src/aircraft/registry.js';
import {aircraftResources,resolveAircraft} from '../src/aircraft/catalog.js';
import {createAircraftVisual} from '../src/aircraft/visual.js';
import {rigNodeNames} from '../src/aircraft/rig.js';
import {createFlight,advanceFlight,radioAltitude,setEngineStatus,restoreCheckpoint} from '../src/flight.js';
import {stepEngines} from '../src/sim/engines.js';
import {updateFlightAlerts} from '../src/sim/alerts.js';
import {soundTargets} from '../src/audio/soundscape.js';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {AIRCRAFT_MISSIONS,LEVELS,TRAINING_MISSIONS,nextLevel} from '../src/missions/catalog.js';
import {normalizeProgress,recommendedLevel,recordResult} from '../src/missions/progress.js';
import {t} from '../src/i18n/index.js';
import {a380PilotInput} from './helpers/a380-pilot.mjs';
const definition=aircraftDefinition('a380');

test('A380 has its own dimensions, mass, UV contract, engine layout and slower response',()=>{
 const a320=aircraftDefinition('a320');assert.equal(definition.engines.length,4);assert.equal(definition.airframe.wingArea,845);assert.equal(definition.operations.defaultMassTonnes,450);
 assert.deepEqual(definition.authoring.dimensionsM,{length:72.7,span:79.8,tailHeightAboveGround:24.1});assert.deepEqual(definition.engines.filter(e=>e.reverseAvailable).map(e=>e.id),[1,2]);
 assert(definition.controls.pitchCommandRate<a320.controls.pitchCommandRate);assert(definition.controls.rollCommandRate<a320.controls.rollCommandRate);assert(definition.propulsion.runningTimeConstant>a320.propulsion.runningTimeConstant);
 const resources=aircraftResources({model:'a380'});assert(resources.model.includes('skyline-380'));assert(resources.paint.url.includes('yunji-a380'));assert.throws(()=>resolveAircraft({model:'a380',uvLayout:'a320-uv1'}));assert.throws(()=>createFlight(null,{levelId:'history-us1549',aircraft:{model:'a380'}}));
});

test('only inboard A380 engines reverse, independently of failures, fan state and audio',()=>{
 const s=createFlight(null,{levelId:'a380-landing'});s.landed=true;s.airborne=false;s.throttle=0;s.reverse=true;s.autoThrust=false;
 s.engines.forEach(e=>e.spool=.5);stepEngines(s,0,.02);assert(s.engines[0].thrustN>=0);assert(s.engines[3].thrustN>=0);assert(s.engines[1].thrustN<0);assert(s.engines[2].thrustN<0);
 let sound=soundTargets(s);assert.equal(sound.engines.length,4);assert.equal(sound.engines[0].reverse,0);assert(sound.engines[1].reverse>0);
 setEngineStatus(s,1,'failed');stepEngines(s,0,.02);assert.equal(s.engines[1].thrustN,0);assert(s.engines[2].thrustN<0);assert.equal(soundTargets(s).engines[1].reverse,0);
 setEngineStatus(s,0,'failed');let alerts=updateFlightAlerts(s);assert(!alerts.items.some(a=>a.label==='ALL ENG FAIL'));assert.equal(alerts.items.filter(a=>a.label.startsWith('ENG ')).length,2);
 setEngineStatus(s,2,'failed');setEngineStatus(s,3,'failed');alerts=updateFlightAlerts(s);assert(alerts.items.some(a=>a.label==='ALL ENG FAIL'));
});

test('authored double-deck GLB has 22 wheels, exact overall bounds, external UV paint and all declared joints',async()=>{
 const bytes=await readFile(new URL('../../public/assets/aircraft/skyline-380-uv1.glb',import.meta.url)),data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 assert(!gltf.images?.length);const root=gltf.nodes.find(n=>n.name==='Skyline380');assert.equal(root.extras.decks,2);assert.equal(root.extras.wheelCount,22);assert.equal(gltf.nodes.filter(n=>/^Wheel_\d+$/.test(n.name)).length,22);
 const names=new Set(gltf.nodes.map(n=>n.name));for(const name of rigNodeNames(definition))assert(names.has(name)||names.has(name.replaceAll(' ','_')),name);
 const scene=(await new GLTFLoader().parseAsync(data,'')).scene,bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
 assert(Math.abs(size.x-79.8)<.001);assert(Math.abs(size.z-72.7)<.001);assert(Math.abs(size.y-24.1)<.001);
 const visual=createAircraftVisual({THREE,scene,appearance:{model:'a380'}}),s=createFlight(null,{levelId:'a380-takeoff'});visual.update(s,0);const stats=visual.stats();assert(stats.triangles<70000);assert(stats.materials<=10);assert(stats.draws<130);
 const points=definition.geometry.contacts;assert.equal(points.main.length,20);assert.equal(points.nose.length,2);assert(points.main.every(p=>p.y===-6));
 s.gear=false;s.gearPosition=0;s.time=.1;visual.update(s,.1);for(const name of ['MainGear_L','MainGear_R','BodyGear_L','BodyGear_R','NoseGear'])assert.equal(scene.getObjectByName(name).visible,false);visual.dispose();
});

test('unified training preserves model-specific records and recommends A380 after the original lessons',()=>{
 assert.equal(LEVELS.length,13);assert.equal(TRAINING_MISSIONS.length,16);assert.equal(AIRCRAFT_MISSIONS.length,3);assert.equal(new Set(TRAINING_MISSIONS.map(l=>l.id)).size,16);assert(TRAINING_MISSIONS.every((l,i)=>l.order===i+1&&(l.stage??'training')==='training'));assert.equal(nextLevel('dual-glide').id,'a380-takeoff');assert.equal(nextLevel('a380-takeoff').id,'a380-landing');assert.equal(nextLevel('a380-engine-out'),null);
 for(const l of AIRCRAFT_MISSIONS)for(const text of [l.title,l.category,l.duration,l.goal,l.focus,l.description,l.keys,...l.objectives])assert(!/\p{Script=Han}/u.test(t(text,'en')),text);
 const s=createFlight(null,{levelId:'a380-takeoff'});s.result={success:true,levelCleared:true,score:90};const p=recordResult(normalizeProgress(null),s);assert.equal(p.levels['a380-takeoff'].bestScore,90);assert.equal(recommendedLevel(p).id,'takeoff');const completed=normalizeProgress({levels:Object.fromEntries(LEVELS.map(l=>[l.id,{bestScore:90,revision:l.revision}]))});assert.equal(recommendedLevel(completed).id,'a380-takeoff');assert.equal(createFlight(null,{levelId:'takeoff'}).aircraft.model,'a320');
});

for(const level of AIRCRAFT_MISSIONS)test('control-path whole A380 exercise: '+level.id,()=>{
 const s=createFlight(null,{levelId:level.id}),recording=new FlightRecording();let airborne=false,reverse=false;recording.observe(s);
 for(let i=0;i<22000&&!s.result;i++){
  advanceFlight(s,a380PilotInput(s),.02);airborne||=s.airborne;
  if(s.reverse){reverse=true;assert(s.engines[0].thrustN>=0&&s.engines[3].thrustN>=0);assert(s.engines[1].thrustN<=0&&s.engines[2].thrustN<=0);}
  if(i%10===0)recording.observe(s);
 }
 assert(s.result?.levelCleared,JSON.stringify({level:level.id,result:s.result,time:s.time,ra:radioAltitude(s),z:s.z}));assert(airborne);assert.equal(s.aircraft.model,'a380');assert.deepEqual(restoreCheckpoint(s).aircraft,s.aircraft);
 const frame=recording.sample(0,recording.segments[0].end);assert.equal(frame.aircraft.model,'a380');assert.equal(frame.aircraft.definitionVersion,1);assert.equal(frame.engines.length,4);assert.equal(frame.engines[3].status,'running');
 if(level.kind==='landing'){assert(reverse);assert.equal(s.gates.length,2);assert(s.gates.every(g=>g.passed&&!g.preset));assert(s.touchdown.descent<3);assert(s.z>-2600);assert(s.airData.groundSpeed<.6);}
 if(level.kind==='engine-out'){assert.equal(s.engines[0].status,'failed');assert.equal(s.engines[0].thrustN,0);assert(s.engines.slice(1).every(e=>e.status==='running'&&e.thrustN>100000));assert.equal(frame.engines[0].status,'failed');assert(s.mission.acknowledged);}
});
