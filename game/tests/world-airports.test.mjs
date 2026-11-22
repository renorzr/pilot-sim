import test from 'node:test';
import assert from 'node:assert/strict';
import {stat}from 'node:fs/promises';
import * as THREE from 'three';
import {AIRPORTS,airportOf,seaAt}from '../src/airports/registry.js';
import {createFlight,advanceFlight,beginGoAround,FT}from '../src/flight.js';
import {AIRLINE_ROUTES,AIRPORT_MISSIONS,LEVELS}from '../src/missions/catalog.js';
import {groundActive,departureOf,skipTaxi}from '../src/missions/ground.js';
import {groundPilot}from './ground-pilot.mjs';
import {flyLevel,pilotInput}from './pilot.mjs';
import {vertexHeight,terrainHeight,terrainConfig,surfaceHeight}from '../src/terrain/heightfield.js';
import {AIRPORT_RADIO}from '../src/comms/radio-packs.js';
import {clipUrl}from '../src/comms/radio.js';
import {normalizeProgress}from '../src/missions/progress.js';
import {t}from '../src/i18n/index.js';
const added=['kansai','jfk','lax'];
test('six real airports expose 30 unique directional flights and preserve existing records',()=>{
 assert.equal(AIRPORTS.length,6);assert.equal(AIRPORT_MISSIONS.length,12);assert.equal(AIRLINE_ROUTES.length,30);assert.equal(LEVELS.length,13);assert.equal(new Set(AIRLINE_ROUTES.map(l=>l.id)).size,30);
 for(const a of AIRPORTS)for(const b of AIRPORTS.filter(b=>b.id!==a.id))assert(AIRLINE_ROUTES.some(l=>l.origin===a.id&&l.destination===b.id));
 assert.deepEqual(AIRLINE_ROUTES.slice(0,6).map(l=>l.id),['pkx-hgh','hgh-pkx','pkx-sin','hgh-sin','sin-pkx','sin-hgh']);
 const p=normalizeProgress({levels:{takeoff:{bestScore:99},'daxing-takeoff':{bestScore:96,revision:2},'changi-landing':{bestScore:97},'hgh-sin':{bestScore:96}}});assert.equal(Object.keys(p.levels).length,4);
});
for(const id of added){
 test(`${id} source pack, coast and runway frame remain distinct and finite`,()=>{
  const a=airportOf(id),d=departureOf(id);assert(a.coastal&&a.data.osm.features.some(f=>f.tags?.water==='sea'));assert.equal(a.data.dem.heights.length,129*129);assert(a.data.dem.heights.every(Number.isFinite));assert(a.runway.length>2500&&a.runway.width>40);assert(d.stand.sourceId&&a.data.osm.features.some(f=>f.id===d.stand.sourceId));const q=a.unproject(d.stand.x,d.stand.z),p=a.project(q.longitude,q.latitude);assert(Math.abs(p.x-d.stand.x)<.001&&Math.abs(p.z-d.stand.z)<.001);assert(!seaAt(id,d.stand.x,d.stand.z));assert.equal(terrainHeight(0,-200,id),0);
 });
 test(`${id} rendered terrain triangles agree with collision sampling`,()=>{
  const cfg=terrainConfig(id),g=new THREE.PlaneGeometry(cfg.width,cfg.depth,cfg.columns,cfg.rows);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,vertexHeight(p.getX(i),p.getZ(i),id));const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();for(const[x,z]of[[0,-200],[-1500,22000],[13000,17000],[-12000,-8000],[23000,-24000]]){const hit=new THREE.Raycaster(new THREE.Vector3(x,10000,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0];assert(hit&&Math.abs(hit.point.y-terrainHeight(x,z,id))<.02);}g.dispose();mesh.material.dispose();
 });
 for(const skip of[false,true])test(`${id} ${skip?'skipped':'complete'} taxi enforces stopped hold, manual entry and separate takeoff clearance`,()=>{
  const s=createFlight(null,{levelId:id+'-takeoff'}),d=departureOf(s);assert.equal(s.x,d.stand.x);assert(!s.ground.entryCleared&&!s.ground.takeoffCleared);assert(s.radio.pending[0].clip.startsWith(id+'-preparation-'));for(let i=0;i<50000&&groundActive(s)&&!s.result;i++)advanceFlight(s,groundPilot(s,{skip})||{},.02);assert(!s.result,JSON.stringify(s.result));assert(s.ground.heldShort&&s.ground.entryCleared&&s.ground.lineupComplete&&s.ground.takeoffCleared);assert.equal(s.ground.skipped,skip);assert(s.ground.manualEntryDistance>100&&Math.abs(s.x)<6);assert(Math.abs(Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw)))<5*Math.PI/180);assert(s.airData.groundSpeed<1/1.94384);
 });
 for(const suffix of['takeoff','landing'])test(`${id}-${suffix} completes using physical controls without terrain nuisance alerts`,()=>{const s=flyLevel(createFlight(null,{levelId:id+'-'+suffix}),1800);assert(s.result?.levelCleared,JSON.stringify({result:s.result,ground:s.ground}));assert(!s.terrain.events.some(e=>e.level>0));if(suffix==='landing')assert(s.landed&&s.gates.every(g=>g.passed&&!g.preset));});
 test(`${id} clips use matching captions, voices, measured durations and per-pack cache fingerprints`,async()=>{const pack=AIRPORT_RADIO[id];for(const language of['zh','en'])for(const[key,lines]of Object.entries(pack[language]))for(let i=0;i<lines.length;i++){const clip=`${id}-${key}-${i}`;assert(pack.durations[language][clip]>0);assert((await stat(new URL(`../../public/assets/radio/${language==='en'?'en/':''}${clip}.mp3`,import.meta.url))).size>1000);assert(clipUrl(clip,language).includes(pack.version));assert(!/\p{Script=Han}/u.test(t(lines[i][1],'en')));}});
}
// Every new pair is flown independently; none is satisfied by a route listing.
for(const level of AIRLINE_ROUTES.filter(l=>added.includes(l.origin)||added.includes(l.destination)))test(`${level.id}: gate departure, explicit cruise cut and configured destination landing`,()=>{
 const s=flyLevel(createFlight(null,{levelId:level.id}),1800);assert(s.result?.levelCleared,JSON.stringify({result:s.result,ground:s.ground,airline:s.airline}));assert(s.airportId===level.destination&&s.airline.cruiseSkipped&&s.airline.phase==='complete');assert(s.airline.departureEvidence.takeoffCleared);assert(s.landed&&s.touchdown.gearPosition>.98&&s.touchdown.checklistConfirmed);assert(s.gates.length===2&&s.gates.every(g=>g.passed&&!g.preset));assert(!s.terrain.events.some(e=>e.level>0));
});
for(const id of added)test(`${id} missed approach continues in the same frame and requires a later landing`,()=>{
 const s=createFlight(null,{levelId:id+'-landing'});let requested=false,returned=false;for(let i=0;i<120000&&!s.result;i++){const input=pilotInput(s);if(!requested&&(s.y-2.8)*FT<700){assert(beginGoAround(s));requested=true;}advanceFlight(s,input,.02);if(s.mission.recovery?.stage==='return')returned=true;}
 assert(requested&&returned);assert(s.result?.levelCleared,JSON.stringify(s.result));assert.equal(s.airportId,id);assert(s.landed&&s.landingAttempts.length===0&&!s.impact);assert.equal(s.terrain.level,0);
});
// Build the actual water mesh and ray-test it, including island holes. Canvas
// labels are irrelevant here, so supply only the 2D methods their textures use.
for(const[id,probes]of Object.entries({
 kansai:[[135.244,34.4273,false],[135.222,34.440,false],[135.3273,34.4056,false],[135.18,34.425,true],[135.10,34.34,true]],
 jfk:[[-73.7781,40.6413,false],[-73.841,40.615,true],[-73.70,40.70,false],[-73.75,40.50,true],[-73.9857,40.7484,false]],
 lax:[[-118.3975,33.9404,false],[-118.4039,33.944,false],[-118.5,33.94,true],[-118.4,33.8,false],[-118.35,33.99,false],[-118.5,34.015,false],[-118.5,34.0,true]]
}))test(`${id} rendered sea holes match coastal classification and physical water level`,async()=>{
 const{buildRealAirportWorld}=await import('../src/airports/real-airport-world.js'),a=airportOf(id),prior=globalThis.document;
 globalThis.document={createElement:()=>({width:256,height:320,getContext:()=>({fillRect(){},fillText(){}})})};const scene=new THREE.Scene();try{
  buildRealAirportWorld({scene,airport:a,departurePlan:departureOf(id),mat:(color,extra={})=>new THREE.MeshStandardMaterial({color,...extra})});scene.updateMatrixWorld(true);const waters=[];scene.traverse(o=>{if(o.name==='sea-surface')waters.push(o);});assert(waters.length>0);
  for(const[lon,lat,expected]of probes){const p=a.project(lon,lat),hit=new THREE.Raycaster(new THREE.Vector3(p.x,10000,p.z),new THREE.Vector3(0,-1,0)).intersectObjects(waters)[0];assert.equal(seaAt(id,p.x,p.z),expected,`${lon},${lat}`);assert.equal(!!hit,expected,`water triangles ${lon},${lat}`);if(expected){assert(Math.abs(hit.point.y+a.elevationM-.15)<.01);assert.equal(surfaceHeight(p.x,p.z,id),-a.elevationM);}}
 }finally{globalThis.document=prior;const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials){m.map?.dispose();m.dispose();}}
});
