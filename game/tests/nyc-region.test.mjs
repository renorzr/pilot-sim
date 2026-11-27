import {newYorkCityData} from '../src/regions/new-york-city-data.js';
import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{gzipSync,gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import * as THREE from 'three';
import{airportOf,seaAt}from'../src/airports/registry.js';import{NEW_YORK_REGION as REGION}from'../src/regions/new-york.js';import{validateSceneryFrame,sceneryCacheId}from'../src/regions/scenery-source.js';import{terrainConfig,surfaceHeight}from'../src/terrain/heightfield.js';import{buildRegionalWater}from'../src/regions/water-world.js';
import{buildRoadGraph}from'../src/airports/road-data.js';import{loadRoadSource}from'../src/airports/road-world.js';import{generateWoodlandSteps,restoreWoodlandData}from'../src/airports/woodland-data.js';import{createWoodlandRenderer,loadWoodlands}from'../src/airports/woodland-world.js';
const jfk=airportOf('jfk'),history=airportOf('us1549'),sha=b=>createHash('sha256').update(b).digest('hex');
const memory=()=>{const entries=new Map();return{entries,get:async(n,k)=>entries.get(n+'|'+k)??null,put:async(n,k,v)=>entries.set(n+'|'+k,v),getArrays:async(n,k)=>entries.get(n+'|'+k)??null,putArrays:async(n,k,v)=>entries.set(n+'|'+k,v),remove:async(n,k)=>entries.delete(n+'|'+k)};};
const square=(x,z,width=500)=>{const ring=[[x,z],[x+width,z],[x+width,z+width],[x,z+width],[x,z]];return ring.map(p=>{const q=jfk.unproject(...p);return[q.longitude,q.latitude];});};
function vegetation(airport,features,height=0){const steps=generateWoodlandSteps({airport:{...airport,data:{...airport.data,osm:{features:[]}}},extraFeatures:features,heightAt:()=>height});let step;while(!(step=steps.next()).done){}return restoreWoodlandData(step.value.arrays,{airportId:airport.id,extent:REGION.extent,...step.value});}
function roads(){const a=jfk.unproject(10000,8000),b=jfk.unproject(10600,8000);return{schema:1,airportId:'jfk',drivingSide:'right',frame:REGION.frame,center:[10000,8000],radius:6000,nodes:[[1,a.longitude,a.latitude,0,''],[2,b.longitude,b.latitude,0,'']],edges:[{id:'way/fixture',nodes:[0,1],kind:'primary',width:8,oneway:0,forward:1,backward:1,bridge:false}],restrictions:[],ground:[],fingerprint:'fixture'};}

test('NYC scenes share a geographic region and source frame while active runway, mission and height datums stay separate',()=>{
 assert.equal(jfk.region,history.region);assert.equal(jfk.data.osm,history.data.osm);assert.equal(sceneryCacheId(jfk),sceneryCacheId(history));assert.notEqual(jfk.id,history.id);assert.notEqual(jfk.elevationM,history.elevationM);assert.notEqual(jfk.runway.id,history.runway.id);assert.equal(terrainConfig(jfk.id).width,80000);assert.equal(terrainConfig(history.id).columns,320);
 for(const airport of[jfk,history]){validateSceneryFrame(airport,REGION.frame);validateSceneryFrame({...airport,runway:{...airport.runway,heading:44}},REGION.frame);}
 assert.throws(()=>validateSceneryFrame({...history,project:(lon,lat)=>{const p=history.project(lon,lat);return{x:-p.z,z:p.x};}},REGION.frame),/frame mismatch/);
});
test('both NYC variants render and classify identical tidal banks/islands at their respective MSL offsets',()=>{
 const roots=[new THREE.Group(),new THREE.Group()],materials=[];
 for(const [i,airport]of[jfk,history].entries()){const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});materials.push(material);buildRegionalWater({root:roots[i],airport,material});roots[i].updateMatrixWorld(true);}
 for(const q of[[-73.925347,40.9],[-73.911478,40.94],[-74.0057,40.7713],[-73.95,40.91],[-73.98,40.77]]){
  const p=jfk.project(...q),a=seaAt('jfk',p.x,p.z);assert.equal(a,seaAt('us1549',p.x,p.z));
  for(const [i,airport]of[jfk,history].entries()){const hit=new THREE.Raycaster(new THREE.Vector3(p.x,1000,p.z),new THREE.Vector3(0,-1,0)).intersectObjects(roots[i].children)[0];assert.equal(!!hit,a);if(hit){assert(Math.abs(hit.point.y+airport.elevationM)<1e-5);assert.equal(surfaceHeight(p.x,p.z,airport.id),-airport.elevationM);}}
 }
 roots.forEach(root=>root.traverse(o=>o.geometry?.dispose()));materials.forEach(m=>m.dispose());
});
test('road source downloads once for NYC while geometry is generated in each scene datum',async()=>{
 const source=roads(),raw=Buffer.from(JSON.stringify(source)),packed=gzipSync(raw),manifest={schema:1,airportId:'jfk',path:'assets/cities/jfk/fixture.json.gz',bytes:packed.length,decodedBytes:raw.length,sha256:sha(packed),decodedSha256:sha(raw),fingerprint:source.fingerprint},shared=memory(),original=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));return String(url).includes('.json.gz')?new Response(packed):Response.json(manifest);};
 try{const a=await loadRoadSource({airport:jfk,path:REGION.trafficManifestPath,cache:shared}),b=await loadRoadSource({airport:history,path:REGION.trafficManifestPath,cache:shared});assert.deepEqual(a.source,b.source);assert.equal(calls.filter(p=>p.includes('.json.gz')).length,1);
  const normal=buildRoadGraph(a.source,jfk,{heightAt:()=>-jfk.elevationM}),historical=buildRoadGraph(b.source,history,{heightAt:()=>0});assert.equal(normal.airportId,'jfk');assert.equal(historical.airportId,'us1549');assert.equal(normal.roads[0].path.positions[0],historical.roads[0].path.positions[0]);assert(Math.abs(historical.roads[0].path.positions[1]-normal.roads[0].path.positions[1]-jfk.elevationM)<1e-5);
  assert.throws(()=>buildRoadGraph(source,airportOf('changi')),/Invalid road source/);
 }finally{globalThis.fetch=original;}
});
test('park canopy estimates remain sparse and deterministic; regional trees beyond the former 30km edge retain valid contacts',()=>{
 const features=[{id:'park',tags:{leisure:'park'},treeCoverageEstimate:.32,geometry:square(35000,0)}],a=vegetation(jfk,features,-jfk.elevationM),b=vegetation(history,features,0),full=vegetation(jfk,[{...features[0],treeCoverageEstimate:1}],0);
 assert(a.standCount>10);assert(a.standCount<full.standCount*.5);assert.equal(a.standCount,b.standCount);assert.deepEqual(a.tints,b.tints);
 for(let i=0;i<a.poses.length;i+=8){assert(a.poses[i]>30000);assert.equal(a.poses[i],b.poses[i]);assert(Math.abs(b.poses[i+1]-a.poses[i+1]-jfk.elevationM)<1e-5);}
 assert([...a.candidates({x:35000,y:-10,z:0},{x:35500,y:100,z:500})].some(o=>o.kind==='tree'));assert.throws(()=>restoreWoodlandData({poses:a.poses,tints:a.tints,farPoses:a.farPoses,farTints:a.farTints}),/Invalid woodland/);
});
test('winter trees have shared 3D branches at every LOD and both render/depth passes suppress deciduous foliage',()=>{
 const data=vegetation(history,[{id:'wood',tags:{natural:'wood'},geometry:square(10000,8000)}]),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(55,1,.1,100000);camera.position.set(10250,200,8250);camera.lookAt(10250,0,8250);const renderer=createWoodlandRenderer({root,data,camera,season:'winter'});
 assert.equal(renderer.stats().season,'winter');for(const mesh of root.children){const leaves=mesh.geometry.attributes.forestLeaf.array;assert(Array.from(leaves).includes(0),'Every winter LOD needs branches');for(const material of[mesh.material,mesh.customDepthMaterial]){const shader={vertexShader:'#include <begin_vertex>\n#include <beginnormal_vertex>\n#include <color_vertex>',fragmentShader:'#include <color_fragment>'};material.onBeforeCompile(shader);assert(shader.vertexShader.includes('forestTint.a<.5)transformed=forestPose.xyz'));}}
 renderer.dispose();assert.equal(root.children.length,0);
});
test('the compressed regional woodland source is shared and a processed cache hit avoids fetching/decompressing it again',async()=>{
 const data=vegetation(history,[{id:'wood',tags:{natural:'wood'},geometry:square(10000,8000)}]),manifest=JSON.parse(await readFile(new URL('../../public/assets/cities/new-york/woodlands-v1.json',import.meta.url))),shared=memory(),prepared=memory(),original=globalThis.fetch,root=new THREE.Group();let samples=0,requests=[];
 // Prepared arrays are numerical fixtures, independent of browser-flight evidence.
 prepared.getArrays=async()=>({poses:data.poses,tints:data.tints,farPoses:data.farPoses,farTints:data.farTints});globalThis.fetch=async url=>{requests.push(String(url));assert(!String(url).includes('.gz'),'A processed hit must not load the raw woodland payload');return Response.json(manifest);};
 try{const layer=await loadWoodlands({root,airport:history,denseData:{manifest:{sha256:'fixture'}},imagery:{overview:{sha256:'a'},regional:{sha256:'b'}},textures:[],cache:prepared,sourceCache:shared,isCurrent:()=>true,extraSourcePath:REGION.woodlandSourcePath,season:'winter'});assert(layer.sourceCacheHit);assert.equal(layer.data.standCount,data.standCount);assert.equal(requests.length,1);assert([...shared.entries.keys()].every(k=>k.startsWith('new-york:images:1')));layer.dispose();}finally{globalThis.fetch=original;}
});

test('bank-height rebasing keeps immutable sources and raises contact queries to include lowered buildings',()=>{
 const p=jfk.project(-73.90,40.9),ground=surfaceHeight(p.x,p.z,'jfk'),sourceBuilding={index:0,id:'bank-fixture',cx:p.x,cz:p.z,baseY:ground+20,topY:ground+30,height:10};let queried;
 const raw={count:1,building:()=>({...sourceBuilding}),candidates:function*(a,b,margin,vertical){queried={a,b,vertical};if(sourceBuilding.baseY<=Math.max(a.y,b.y)+vertical)yield{...sourceBuilding};}};
 const adjusted=newYorkCityData(raw,jfk),b=adjusted.building(0);assert(Math.abs(b.baseY-ground)<1e-4);assert.equal(b.height,10);assert.deepEqual(raw.building(),sourceBuilding);assert.equal([...adjusted.candidates({x:p.x,y:ground+5,z:p.z},{x:p.x,y:ground+6,z:p.z})].length,1);assert(queried.vertical>=20);
});

test('shared NYC terrain keeps the same MSL geometry through the JFK platform as well as river banks',()=>{
 for(const [x,z]of[[0,-200],[300,-1500],[1500,-2000],[10000,8000]])assert(Math.abs(surfaceHeight(x,z,'jfk')+jfk.elevationM-surfaceHeight(x,z,'us1549'))<.0001);
});
test('prepared tree arrays restore without source generation, transform only scene height, and reject changed identities/truncation',async()=>{
 const {encodePreparedWoodlands,decodePreparedWoodlands,loadPreparedWoodlands}=await import('../src/airports/woodland-prepared.js'),input={source:'fixture',buildings:'building'},arrays={poses:new Float32Array([100,12,200,0,22,14,0,0]),tints:new Uint8Array([20,40,10,0]),farPoses:new Float32Array([100,12,200,0,22,14,0,0]),farTints:new Uint8Array([20,40,10,0])},bytes=encodePreparedWoodlands(arrays,{datum:'MSL',inputs:input,sourceFeatures:1,excludedCount:0}),before=bytes.slice();
 assert.throws(()=>decodePreparedWoodlands(bytes,{inputs:{source:'changed'}}),/sources changed/);assert.throws(()=>decodePreparedWoodlands(bytes.subarray(0,bytes.length-1)),/arrays|Incomplete/);
 const packed=gzipSync(bytes),record={path:'assets/cities/new-york/trees-fixture.bin.gz',bytes:packed.length,decodedBytes:bytes.length,sha256:sha(packed),decodedSha256:sha(bytes)},cache=memory(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(packed);};
 try{const a=await loadPreparedWoodlands(record,{cache,namespace:'new-york:images:1',inputs:input,datumOffset:-jfk.elevationM}),b=await loadPreparedWoodlands(record,{cache,namespace:'new-york:images:1',inputs:input});assert.equal(calls,1);assert(Math.abs(a.arrays.poses[1]-12+jfk.elevationM)<1e-5);assert.equal(b.arrays.poses[1],12);assert.equal(a.arrays.poses[0],b.arrays.poses[0]);assert.deepEqual(bytes,before);}finally{globalThis.fetch=original;}
});
