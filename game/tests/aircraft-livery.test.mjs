import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DEFAULT_AIRCRAFT,resolveAircraft,aircraftIdentity,aircraftResources,aircraftTextureSize} from '../src/aircraft/catalog.js';
import {createAircraftVisual} from '../src/aircraft/visual.js';
import {createFlight,restoreCheckpoint} from '../src/flight.js';
import {US1549_PROFILE} from '../src/history/us1549-profile.js';
import {createHistoricalIntro,createHistoricalRescue} from '../src/history/presentation.js';
import {FlightRecording} from '../src/replay/flight-recording.js';
import manifest from '../src/aircraft/livery-manifest.json' with {type:'json'};
const bytes=await readFile(new URL('../../public/assets/aircraft/skyline-320-uv1.glb',import.meta.url));
const model=()=>new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');

test('authored paint surfaces have finite UVs; left/right titles are not mirrored and the rudder matches the fin',async()=>{
 const {scene}=await model();scene.updateMatrixWorld(true);
 const sides={left:[],right:[]};let surfaces=0;
 scene.traverse(o=>{
  if(!o.isMesh||o.material.name!=='Livery paint a320-uv1')return;
  const p=o.geometry.attributes.position,uv=o.geometry.attributes.uv;assert(uv,o.name);assert.equal(p.count,uv.count);surfaces++;
  for(let i=0;i<uv.count;i++)assert(Number.isFinite(uv.getX(i))&&Number.isFinite(uv.getY(i))&&uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1,o.name);
  if(o.name!=='Fuselage_shaped_pressure_shell')return;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))>1.8&&Math.abs(p.getY(i)-1.05)<.2&&p.getZ(i)>-11&&p.getZ(i)<10)sides[p.getX(i)<0?'left':'right'].push({z:p.getZ(i),u:uv.getX(i),v:uv.getY(i)});
 });
 assert(surfaces>15);
 for(const [side,points] of Object.entries(sides)){
  points.sort((a,b)=>a.z-b.z);assert(points.length>20);
  assert(side==='left'?points.at(-1).u>points[0].u:points.at(-1).u<points[0].u,side+' text direction');
  assert(points.every(p=>side==='left'?p.v<.24:p.v>.24&&p.v<.48),side+' independent island');
 }
 const paint=new THREE.Texture(),v=createAircraftVisual({THREE,scene,paint});
 try{const maps=new Set();v.group.traverse(o=>{if(o.material?.name==='Livery paint a320-uv1'){assert.equal(o.material.map,paint);assert(o.geometry.attributes.uv);maps.add(o.material.map);}});assert.equal(maps.size,1);}finally{v.dispose();}
});

test('wingtip variants keep animations and shared contacts while selecting only their own geometry',async()=>{
 const oldBytes=await readFile(new URL('../../public/assets/aircraft/skyline-320.glb',import.meta.url)),old=await new GLTFLoader().parseAsync(oldBytes.buffer.slice(oldBytes.byteOffset,oldBytes.byteOffset+oldBytes.byteLength),'');const baseline=createAircraftVisual({THREE,scene:old.scene}),budget=baseline.stats();baseline.dispose();
 for(const appearance of [DEFAULT_AIRCRAFT,US1549_PROFILE.aircraft]){
  const {scene}=await model(),paint=new THREE.Texture(),v=createAircraftVisual({THREE,scene,appearance,paint});let released=0;paint.addEventListener('dispose',()=>released++);
  try{
   const before=v.stats();assert(before.draws<=budget.draws);assert(before.triangles<budget.triangles);assert(before.materials<=budget.materials);
   const fence=appearance.variant==='wingtip-fence';assert(Math.abs(before.bounds.max[0]-(fence?17.05:17.905))<.05);
   assert.equal(v.group.getObjectByName('Wingtip_fence_L').visible,fence);assert.equal(v.group.getObjectByName('Wingtip_sharklet_L').visible,!fence);assert.equal(v.anchors.wing[0].x,fence?-17.05:-17.9);
   const s=createFlight(null,{levelId:fence?'history-us1549':'takeoff'}),snapshot=structuredClone(s);v.update(s,0);assert.deepEqual(s,snapshot);
   s.flapPosition=4;s.controls.rudderApplied=.5;v.update(s,0);assert(v.group.getObjectByName('Flap_L_0').rotation.x>.6);assert(v.group.getObjectByName('Rudder').rotation.y>0);
  }finally{v.dispose();v.dispose();assert.equal(released,1,'one shared atlas released exactly once');}
 }
});

test('flight, cover, checkpoint, final practice, rescue and recording pin the same historical appearance',()=>{
 const s=createFlight(null,{levelId:'history-us1549'}),identity=aircraftIdentity(s.aircraft);assert.equal(identity,aircraftIdentity(US1549_PROFILE.aircraft));
 assert.equal(aircraftIdentity(createHistoricalIntro(s).visual.aircraft),identity);assert.equal(aircraftIdentity(restoreCheckpoint(s).aircraft),identity);
 const practice=createFlight(null,{levelId:'history-us1549',historical:{finalApproach:true}});assert.equal(aircraftIdentity(practice.aircraft),identity);
 const r=new FlightRecording();r.observe(s);s.aircraft.livery='yunji';assert.equal(aircraftIdentity(r.sample(0,0).aircraft),identity,'recording owns a copy');
 s.aircraft={...US1549_PROFILE.aircraft};s.result={physicalSuccess:true};s.water={fatal:null};const rescue=createHistoricalRescue(s);assert(rescue);assert.equal(aircraftIdentity(rescue.visual.aircraft),identity);
 assert.equal(createFlight(null,{levelId:'takeoff'}).aircraft.livery,'yunji');
});

test('published atlases match their manifests and KTX2 dimensions/mips; unknown versions fail explicitly',async()=>{
 assert.throws(()=>resolveAircraft({livery:'missing'}));assert.throws(()=>resolveAircraft({assetVersion:2}));assert.throws(()=>resolveAircraft({uvLayout:'repacked'}));assert.throws(()=>aircraftResources(undefined,1024));
 for(const [livery,entry] of Object.entries(manifest.liveries))for(const [size,t] of Object.entries(entry.textures)){
  const b=await readFile(new URL('../../public/'+t.path,import.meta.url));assert.equal(b.length,t.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),t.sha256);
  assert.deepEqual([...b.subarray(0,12)],[171,75,84,88,32,50,48,187,13,10,26,10]);assert.equal(b.readUInt32LE(20),+size);assert.equal(b.readUInt32LE(24),+size);assert.equal(b.readUInt32LE(40),Math.log2(+size)+1);
  assert.equal(aircraftResources({livery},+size).paint.path,t.path);
 }
 const renderer={capabilities:{maxTextureSize:8192}};
 assert.equal(aircraftTextureSize(renderer,{width:1000,height:600,pixelRatio:3}),2048);
 assert.equal(aircraftTextureSize(renderer,{width:1600,height:1000,pixelRatio:2}),4096);
 assert.equal(aircraftTextureSize({capabilities:{maxTextureSize:2048}},{width:3840,height:2160,pixelRatio:1}),2048);
});
