import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{gunzipSync}from'node:zlib';
import * as THREE from'three';
import{CHANGI,seaAt}from'../src/airports/registry.js';
import{surfaceHeight}from'../src/terrain/heightfield.js';
import{decodeDenseCity,footprintContains}from'../src/airports/dense-city-data.js';
import{createDenseCityRenderer}from'../src/airports/dense-city-render.js';
import{installDenseCity,cityRay}from'../src/terrain/city-obstacles.js';
import{createFlight}from'../src/flight.js';
import{flyLevel}from'./pilot.mjs';
const root=new URL('../../public/assets/cities/changi/',import.meta.url),manifest=JSON.parse(await readFile(new URL('buildings-v1.json',root))),compressed=await readFile(new URL('../../public/'+manifest.path,import.meta.url)),raw=gunzipSync(compressed),data=decodeDenseCity(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),manifest),imagery=JSON.parse(await readFile(new URL('imagery-v1.json',root))),sha=b=>createHash('sha256').update(b).digest('hex');
test('Changi includes continuous regional source footprints, original heights, coherent colours and courtyards',()=>{
 assert.equal(manifest.airportId,'changi');assert.equal(sha(compressed),manifest.sha256);assert.equal(sha(raw),manifest.geometrySha256);assert.equal(compressed.length,manifest.bytes);assert.equal(raw.length,manifest.uncompressedBytes);assert.equal(manifest.provenance.osm.snapshot,'2026-11-20');assert.equal(manifest.provenance.osm.license,'ODbL-1.0');assert(data.count>80000);assert.equal(manifest.tiles.reduce((n,t)=>n+t.count,0),data.count);assert(manifest.heightSources.tagged+manifest.heightSources.levels>5000);
 const ids=new Set(),kinds=new Set();let courtyards=0,outsideAirport=0,tall=0;const sourceHeights=new Map();
 for(let i=0;i<data.count;i++){const b=data.building(i,false);assert(!ids.has(b.id));ids.add(b.id);assert(/^(way|relation)\//.test(b.id));assert(b.height>0&&b.height<800);assert(!seaAt('changi',b.cx,b.cz));kinds.add(b.kind);if(['way/116801004','way/172307471','way/172307472'].includes(b.id))sourceHeights.set(b.id,b.topY-surfaceHeight(b.cx,b.cz,'changi'));if(b.ringCount>1)courtyards++;if(Math.hypot(b.cx,b.cz)>10000)outsideAirport++;if(b.height>35)tall++;
  if(i%101===0){assert(b.frame.width>0&&b.frame.depth>0&&b.frame.fill>0);assert(b.baseY<=surfaceHeight(b.cx,b.cz,'changi')+.01);for(const r of data.rings(i))assert([...r].every(Number.isFinite));}
 }
 assert.equal(sourceHeights.size,3);for(const h of sourceHeights.values())assert(Math.abs(h-193)<.01);assert.equal(kinds.size,3);assert(courtyards>10&&outsideAirport>20000&&tall>5000);
});
test('Changi imagery is attributed dated 10 m cloud-screened data with self-hosted marine masks',async()=>{
 assert.equal(imagery.sourceNativeGsdM,10);assert.equal(imagery.source.collection,'sentinel-2-l2a');assert.equal(imagery.tiles.length,36);assert(imagery.captureDates.length>=4);assert(imagery.mosaic.clearPixelFraction>.97);assert(!/NAIP|Esri/i.test(imagery.label));
 let bytes=0;for(const r of[imagery.regional,imagery.overview,imagery.seaMask,imagery.coastMask,...imagery.tiles]){assert(r.path.startsWith('assets/cities/changi/'));const asset=await readFile(new URL('../../public/'+r.path,import.meta.url));assert.equal(asset.length,r.bytes);assert.equal(sha(asset),r.sha256);bytes+=asset.length;const[s,w,n,e]=r.bounds;assert(s<n&&w<e);}assert(bytes<40*1024*1024);
 for(const[x,z]of[[-30000,-30000],[-30000,30000],[30000,-30000],[30000,30000]]){const p=CHANGI.unproject(x,z),[s,w,n,e]=imagery.regional.bounds;assert(p.longitude>w&&p.longitude<e&&p.latitude>s&&p.latitude<n);}
});
test('Changi city contacts agree with roof heights and neither occupy the airport nor leak across airport frames',()=>{
 const boundaries=CHANGI.data.osm.features.filter(f=>f.tags.aeroway==='aerodrome').map(f=>[Float32Array.from(f.geometry.flatMap(p=>{const q=CHANGI.project(...p);return[q.x,q.z];}))]);assert(boundaries.length>0);
 let probe;for(let i=0;i<data.count;i++){const b=data.building(i);if(i%31===0)for(const rings of boundaries){const r=b.rings[0];assert(!Array.from({length:r.length/2},(_,j)=>footprintContains(r[j*2],r[j*2+1],rings)).every(Boolean),'source airport remains clear');}if(!probe&&b.height>40&&footprintContains(b.cx,b.cz,b.rings))probe=b;}
 assert(probe);const uninstall=installDenseCity(data,'changi');try{const from={x:probe.cx,y:probe.topY+50,z:probe.cz},to={...from,y:probe.baseY-5},hit=cityRay(from,to,'changi');assert(hit);assert(Math.abs(hit.distance-50)<.01);assert.equal(cityRay(from,to,'training'),null);}finally{uninstall();}
});
test('Changi full taxi/takeoff and configured landing still complete with actual city collisions active',()=>{
 const uninstall=installDenseCity(data,'changi');try{for(const levelId of['changi-takeoff','changi-landing']){const s=flyLevel(createFlight(null,{levelId}),1800);assert(s.result?.levelCleared,JSON.stringify({levelId,result:s.result,impact:s.impact}));assert(!s.terrain.events.some(e=>e.level>0),JSON.stringify(s.terrain.events));}}finally{uninstall();}
});
test('Changi buildings prepare in advance and retain model identities across reverse views and revisits',async()=>{
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),renderer=createDenseCityRenderer({root,data,material}),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000),models=new Map();
 try{for(const[lon,lat]of[[103.990,1.36],[103.945,1.35],[103.902,1.404]]){const p=CHANGI.project(lon,lat);camera.position.set(p.x,1200,p.z+1200);camera.lookAt(p.x,0,p.z);renderer.update(camera);await renderer.settled();const s=renderer.stats();assert.equal(s.preloadedBuildings,data.count);assert.equal(s.farTiles,manifest.tiles.length);assert.equal(s.districtTiles,s.availableDistrictTiles);assert.equal(s.pendingTiles,0);assert(s.geometryBytes<256*1024*1024);for(const m of root.children){if(models.has(m.name))assert.equal(models.get(m.name),m);models.set(m.name,m);}}
 const built=renderer.stats().generatedTiles;camera.rotateOnWorldAxis(new THREE.Vector3(0,1,0),Math.PI);renderer.update(camera);assert.equal(renderer.stats().pendingTiles,0);assert.equal(renderer.stats().generatedTiles,built);
 }finally{renderer.dispose();assert.equal(root.children.length,0);material.dispose();}
});
