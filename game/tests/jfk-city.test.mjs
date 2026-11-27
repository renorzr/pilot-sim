import {newYorkCityData,NEW_YORK_GROUND_MARGIN} from '../src/regions/new-york-city-data.js';
import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{gunzipSync}from'node:zlib';
import * as THREE from'three';
import{JFK,seaAt}from'../src/airports/registry.js';
import{surfaceHeight}from'../src/terrain/heightfield.js';
import{decodeDenseCity,footprintContains}from'../src/airports/dense-city-data.js';
import{createCityInstances,cityTemplate}from'../src/airports/dense-city-instances.js';
import{createDenseCityRenderer}from'../src/airports/dense-city-render.js';
import{installDenseCity,cityRay}from'../src/terrain/city-obstacles.js';
import{createFlight}from'../src/flight.js';
import{flyLevel}from'./pilot.mjs';
const root=new URL('../../public/assets/cities/jfk/',import.meta.url),manifest=JSON.parse(await readFile(new URL('buildings-v1.json',root))),compressed=await readFile(new URL('../../public/'+manifest.path,import.meta.url)),raw=gunzipSync(compressed),data=decodeDenseCity(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),manifest),imagery=JSON.parse(await readFile(new URL('imagery-v1.json',root))),sha=b=>createHash('sha256').update(b).digest('hex');
test('JFK includes full regional NY/NJ source coverage, actual high-rise heights and courtyard topology',()=>{
 assert.equal(manifest.airportId,'jfk');assert.equal(sha(compressed),manifest.sha256);assert.equal(sha(raw),manifest.geometrySha256);assert.equal(compressed.length,manifest.bytes);assert.equal(raw.length,manifest.uncompressedBytes);assert.equal(manifest.provenance.osm.snapshot,'2026-11-20');assert.equal(manifest.provenance.osm.sources.length,2);assert(data.count>500000);assert.equal(manifest.sourceCounts.osm,data.count);assert.equal(manifest.tiles.reduce((n,t)=>n+t.count,0),data.count);assert(manifest.heightSources.tagged+manifest.heightSources.levels>50000);
 const grounded=newYorkCityData(data,JFK),ids=new Set(),kinds=new Set();let courtyards=0,distant=0,tall=0,maxHeight=0;
 for(let i=0;i<data.count;i++){const b=grounded.building(i,false);assert(data.building(i,false).baseY-b.baseY<=NEW_YORK_GROUND_MARGIN);assert(!ids.has(b.id));ids.add(b.id);assert(/^(way|relation)\//.test(b.id));assert(b.height>0&&b.height<900);assert(!seaAt('jfk',b.cx,b.cz));kinds.add(b.kind);if(b.ringCount>1)courtyards++;if(Math.hypot(b.cx,b.cz)>10000)distant++;if(b.height>50)tall++;maxHeight=Math.max(maxHeight,b.height);
  if(i%101===0){assert(b.frame.width>0&&b.frame.depth>0&&b.frame.fill>0);assert(b.baseY<=surfaceHeight(b.cx,b.cz,'jfk')+.01);for(const r of data.rings(i))assert([...r].every(Number.isFinite));}
 }
 assert.equal(kinds.size,3);assert(courtyards>100&&distant>100000&&tall>1000&&maxHeight>300);
});
test('JFK self-hosted NAIP levels preserve dated 0.6 m source provenance and source marine masks',async()=>{
 assert.equal(imagery.sourceNativeGsdM,.6);assert.equal(imagery.source.collection,'naip');assert.equal(imagery.tiles.length,252);assert(imagery.captureDates.every(d=>d.startsWith('2022')));assert(imagery.source.items.some(i=>i.workingGsdM===1.2));assert(imagery.source.items.some(i=>i.workingGsdM===2.4));assert(imagery.source.items.every(i=>i.gsdM===.6));
 let bytes=0;for(const r of[imagery.regional,imagery.overview,imagery.seaMask,imagery.coastMask,...imagery.tiles]){assert(r.path.startsWith('assets/cities/jfk/'));const b=await readFile(new URL('../../public/'+r.path,import.meta.url));assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256);bytes+=b.length;const[s,w,n,e]=r.bounds;assert(s<n&&w<e);}assert(bytes<350*1024*1024);
 for(const[x,z]of[[-30000,-30000],[-30000,30000],[30000,-30000],[30000,30000]]){const p=JFK.unproject(x,z),[s,w,n,e]=imagery.regional.bounds;assert(p.longitude>w&&p.longitude<e&&p.latitude>s&&p.latitude<n);}
});
test('JFK shared roof styles use Queens gables while preserving the source roof height and compact arrays',()=>{
 const b={index:0,id:'way/1',kind:'home',seed:0,cx:0,cz:0,minX:-5,maxX:5,minZ:-4,maxZ:4,width:10,depth:8,baseY:3,height:10,topY:13,roofColor:0x555555,wallColor:0xa88e72,ringCount:1,frame:{x:0,z:0,width:10,depth:8,angle:.3,fill:1}},material=new THREE.MeshStandardMaterial(),parts=createCityInstances({manifest,building:()=>b},{start:0,count:1,minX:-5,maxX:5,minZ:-4,maxZ:4,topY:13},1,material);
 try{assert.equal(parts.instances,1);assert.deepEqual(parts.exceptions,[]);const g=parts.meshes[0].geometry;assert.equal(g.attributes.position.array,cityTemplate('gable').position);assert(Math.abs(g.attributes.cityInstance.getY(0)+g.attributes.cityDimensions.getY(0)+g.attributes.cityDimensions.getW(0)-13)<.001);assert(!g.attributes.instanceMatrix);assert.equal(g.attributes.cityInstance.count,1);}finally{for(const m of parts.meshes)m.geometry.dispose();material.dispose();}
});
test('JFK city contacts agree with source roofs, keep the airport clear and isolate other airport frames',()=>{
 const boundaries=JFK.data.osm.features.filter(f=>f.tags.aeroway==='aerodrome').map(f=>[Float32Array.from(f.geometry.flatMap(p=>{const q=JFK.project(...p);return[q.x,q.z];}))]);assert(boundaries.length>0);let probe;
 for(let i=0;i<data.count;i+=13){const b=data.building(i);for(const rings of boundaries){const r=b.rings[0];assert(!Array.from({length:r.length/2},(_,j)=>footprintContains(r[j*2],r[j*2+1],rings)).every(Boolean),'source airport remains clear');}if(b.height>40&&footprintContains(b.cx,b.cz,b.rings)&&(!probe||b.topY>probe.topY))probe=b;}
 assert(probe);const uninstall=installDenseCity(data,'jfk');try{const p={x:probe.cx,y:probe.topY+30,z:probe.cz},hit=cityRay(p,{...p,y:probe.baseY-5},'jfk');assert(hit&&hit.distance<=30.01&&hit.top>=probe.topY-.01);assert.equal(cityRay(p,{...p,y:-50},'training'),null);}finally{uninstall();}
});
test('JFK takeoff and configured landing still complete with the full real city contact index active',()=>{
 const uninstall=installDenseCity(data,'jfk');try{for(const levelId of['jfk-takeoff','jfk-landing']){const s=flyLevel(createFlight(null,{levelId}),1800);assert(s.result?.levelCleared,JSON.stringify({levelId,result:s.result,impact:s.impact}));assert(!s.terrain.events.some(e=>e.level>0),JSON.stringify(s.terrain.events));}}finally{uninstall();}
});
test('JFK middle/far models prepare before ready and camera reversals/revisits retain their identities',async()=>{
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),renderer=createDenseCityRenderer({root,data,material}),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000),models=new Map();
 try{for(const[lon,lat]of[[-73.7785,40.645],[-73.805,40.696],[-74.008,40.712]]){const p=JFK.project(lon,lat);camera.position.set(p.x,1500,p.z+1500);camera.lookAt(p.x,0,p.z);renderer.update(camera);await renderer.settled();const s=renderer.stats();assert.equal(s.preloadedBuildings,data.count);assert.equal(s.farTiles,manifest.tiles.length);assert.equal(s.districtTiles,s.availableDistrictTiles);assert.equal(s.pendingTiles,0);assert(s.geometryBytes<384*1024*1024);for(const m of root.children){if(models.has(m.name))assert.equal(models.get(m.name),m);models.set(m.name,m);}}
 const built=renderer.stats().generatedTiles;camera.rotateOnWorldAxis(new THREE.Vector3(0,1,0),Math.PI);renderer.update(camera);assert.equal(renderer.stats().pendingTiles,0);assert.equal(renderer.stats().generatedTiles,built);
 }finally{renderer.dispose();assert.equal(root.children.length,0);material.dispose();}
});
