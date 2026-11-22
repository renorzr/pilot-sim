import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{gunzipSync}from'node:zlib';
import * as THREE from'three';
import{XIAOSHAN}from'../src/airports/registry.js';
import{surfaceHeight}from'../src/terrain/heightfield.js';
import{decodeDenseCity}from'../src/airports/dense-city-data.js';
import{createCityInstances,cityTemplate}from'../src/airports/dense-city-instances.js';
import{createDenseCityRenderer}from'../src/airports/dense-city-render.js';
import{installDenseCity,cityRay,sweptCityContact}from'../src/terrain/city-obstacles.js';
import{createPolygonMask}from'../src/airports/polygon-mask.js';
import{createFlight}from'../src/flight.js';
import{flyLevel}from'./pilot.mjs';
const root=new URL('../../public/assets/cities/xiaoshan/',import.meta.url),manifest=JSON.parse(await readFile(new URL('buildings-v2.json',root))),compressed=await readFile(new URL('../../public/'+manifest.path,import.meta.url)),raw=gunzipSync(compressed),data=decodeDenseCity(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),manifest),imagery=JSON.parse(await readFile(new URL('imagery-v1.json',root)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('Xiaoshan source pack has verified continuous coverage, distinct EAB/OSM identities and the source runway frame',()=>{
 assert.equal(manifest.airportId,'xiaoshan');assert(manifest.buildings>100000);assert.equal(compressed.length,manifest.bytes);assert.equal(sha(compressed),manifest.sha256);assert.equal(sha(raw),manifest.geometrySha256);assert.equal(manifest.tiles.reduce((n,t)=>n+t.count,0),data.count);assert.equal(manifest.frame.runway,'07');assert(Math.abs(manifest.frame.heading-XIAOSHAN.runway.heading)<1e-9);assert.deepEqual(manifest.frame.threshold,XIAOSHAN.unproject(0,0));assert.equal(manifest.provenance.footprints.license,'CC-BY-4.0');assert.equal(manifest.provenance.osm.license,'ODbL-1.0');assert(compressed.length<128*1024*1024);assert(data.byteLength<250*1024*1024);
 const ids=new Set(),kinds=new Set();let eab=0,osm=0,outsideOld=0,west=0,east=0;for(let i=0;i<data.count;i++){const b=data.building(i);assert(!ids.has(b.id));ids.add(b.id);kinds.add(b.kind);if(b.id.startsWith('eab/'))eab++;else{assert(/^(way|relation)\//.test(b.id));osm++;}assert(b.height>0&&b.height<800);if(Math.abs(b.cx)>7500)outsideOld++;if(b.cz>5000&&b.cx< -2500)west++;if(b.cz>5000&&b.cx>2500)east++;if(i%101===0){assert(b.frame.width>0&&b.frame.depth>0);assert(b.frame.fill>0&&b.frame.fill<=1);assert(b.baseY<=surfaceHeight(b.cx,b.cz,'xiaoshan')+.01);for(const ring of b.rings)assert([...ring].every(Number.isFinite));assert.deepEqual(data.building(i),b);}}
 assert.equal(kinds.size,3);assert(eab>50000&&osm>5000&&outsideOld>50000&&west>1000&&east>1000);assert.equal(eab,manifest.sourceCounts.eab);assert.equal(osm,manifest.sourceCounts.osm);
});
test('satellite levels are genuine dated 10 m Sentinel data with bounded self-hosted assets',async()=>{
 assert.equal(imagery.sourceNativeGsdM,10);assert.equal(imagery.tiles.length,20);assert.equal(imagery.source.collection,'sentinel-2-l2a');assert(imagery.captureDates[0].startsWith('2025-09-16'));assert(imagery.source.cloudCoverPercent<1);assert(!imagery.label.includes('NAIP'));
 let bytes=0;for(const r of[imagery.regional,imagery.overview,...imagery.tiles]){assert(r.path.startsWith('assets/cities/xiaoshan/'));const asset=await readFile(new URL('../../public/'+r.path,import.meta.url));assert.equal(asset.length,r.bytes);assert.equal(sha(asset),r.sha256);bytes+=asset.length;const [s,w,n,e]=r.bounds;assert(s<n&&w<e);}assert(bytes<30*1024*1024);
 for(const [x,z]of[[-30000,-30000],[-30000,30000],[30000,-30000],[30000,30000]]){const p=XIAOSHAN.unproject(x,z),[s,w,n,e]=imagery.regional.bounds;assert(p.longitude>w&&p.longitude<e&&p.latitude>s&&p.latitude<n);}
});
test('airport footprint excludes the source city while its original terminal and stand retain clear space',()=>{
 const polygons=XIAOSHAN.data.osm.features.filter(f=>f.tags.aeroway==='aerodrome').map(f=>({outer:f.geometry.map(p=>XIAOSHAN.project(...p)),holes:(f.holes||[]).map(r=>r.map(p=>XIAOSHAN.project(...p)))})),inside=createPolygonMask(polygons);assert(polygons.length>0);for(let i=0;i<data.count;i+=13){const b=data.building(i),r=b.rings[0];const x=r.reduce((s,v,j)=>s+(j%2===0?v:0),0)/(r.length/2),z=r.reduce((s,v,j)=>s+(j%2===1?v:0),0)/(r.length/2);if(inside(x,z))assert(!inside(b.cx,b.cz),'no city envelope within the airport');}
});
test('simple high-rise apartments reuse flat templates without lowering source roof height',()=>{
 const b={index:0,id:'eab/123',kind:'commercial',seed:8,cx:0,cz:0,minX:-10,maxX:10,minZ:-7,maxZ:7,width:20,depth:14,baseY:3,height:75,topY:78,roofColor:0x999999,wallColor:0xccccbb,ringCount:1,frame:{x:0,z:0,width:20,depth:14,angle:.3,fill:1}},material=new THREE.MeshStandardMaterial(),parts=createCityInstances({manifest,building:()=>b},{start:0,count:1,minX:-10,maxX:10,minZ:-7,maxZ:7,topY:78},1,material);
 try{assert.equal(parts.instances,1);assert.deepEqual(parts.exceptions,[]);const g=parts.meshes[0].geometry;assert.equal(g.attributes.position.array,cityTemplate('flat').position);assert.equal(g.attributes.cityInstance.getY(0)+g.attributes.cityDimensions.getY(0),78);assert.equal(g.attributes.cityType.getX(0),2);}finally{for(const m of parts.meshes)m.geometry.dispose();material.dispose();}
});
function fixture(height){const b={id:'fixture',cx:10,cz:10,width:20,depth:20,angle:0,baseY:0,topY:height,rings:[new Float32Array([0,0,0,20,20,20,20,0])]};return{candidates:()=>[b]};}
test('airport-keyed city ownership isolates LAX/Xiaoshan and obsolete disposal cannot remove the accepted index',()=>{
 const a=installDenseCity(fixture(30),'lax'),old=installDenseCity(fixture(5),'xiaoshan'),current=installDenseCity(fixture(10),'xiaoshan'),from={x:10,y:40,z:10},to={x:10,y:-5,z:10};
 try{old();assert.equal(cityRay(from,to,'xiaoshan').distance,30);assert.equal(cityRay(from,to,'lax').distance,10);a();assert.equal(cityRay(from,to,'xiaoshan').distance,30);assert.equal(cityRay(from,to,'jfk'),null);const p={airportId:'xiaoshan',x:-10,y:5,z:10,pitch:0,roll:0,yaw:0},hit=sweptCityContact(p,{...p,x:30});assert(hit?.type==='building'&&hit.x<0);}finally{old();current();a();}assert.equal(cityRay(from,to,'xiaoshan'),null);
});
test('actual Xiaoshan takeoff and landing stay clear of city buildings and retain mission completion',()=>{
 const uninstall=installDenseCity(data,'xiaoshan');try{for(const levelId of['xiaoshan-takeoff','xiaoshan-landing']){const s=flyLevel(createFlight(null,{levelId}),1800);assert(s.result?.levelCleared,JSON.stringify({levelId,result:s.result,impact:s.impact}));assert(!s.terrain.events.some(e=>e.level>0),JSON.stringify(s.terrain.events));}}finally{uninstall();}
});
test('regional models preload all directions and retain identities through travel and reverse views within memory budgets',async()=>{
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),renderer=createDenseCityRenderer({root,data,material}),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000),models=new Map();
 try{for(const p of[[2000,1900,1000],[-7000,900,18000],[1000,1000,23000]]){camera.position.fromArray(p);camera.lookAt(p[0],0,p[2]-2000);renderer.update(camera);await renderer.settled();const s=renderer.stats();assert.equal(s.preloadedBuildings,data.count);assert.equal(s.farTiles,manifest.tiles.length);assert.equal(s.districtTiles,s.availableDistrictTiles);assert.equal(s.pendingTiles,0);assert(s.geometryBytes<256*1024*1024);for(const m of root.children){if(models.has(m.name))assert.equal(models.get(m.name),m);models.set(m.name,m);}}
 const built=renderer.stats().generatedTiles;camera.rotateOnWorldAxis(new THREE.Vector3(0,1,0),Math.PI);renderer.update(camera);assert.equal(renderer.stats().pendingTiles,0);assert.equal(renderer.stats().generatedTiles,built);
 }finally{renderer.dispose();assert.equal(root.children.length,0);material.dispose();}
});

test('native roof sampling keeps blue/red factory panels and the original source positions and heights',async()=>{
 const fixture=JSON.parse(await readFile(new URL('fixtures/xiaoshan-appearance.json',import.meta.url)));
 for(const s of fixture.samples){const a={x:s.cx,y:s.topY+20,z:s.cz},b=[...data.candidates(a,{...a,y:s.baseY-20})].find(b=>b.id===s.id);assert(b,'Source factory retained: '+s.id);for(const k of['cx','cz','baseY','topY'])assert.equal(b[k],s[k],s.id+' '+k);assert.deepEqual([...b.rings[0].slice(0,2)],s.firstPoint);const r=b.roofColor>>>16,g=b.roofColor>>>8&255,blue=b.roofColor&255;if(s.roofClass==='blue')assert(blue>r*1.4&&blue>g*1.12,'Blue metal must not turn grey');else assert(r>blue*1.35&&r>g*1.15,'Red metal remains red');}
});
test('imagery agreement removes only high-confidence vegetation EAB estimates and retains every OSM outline',()=>{
 const a=manifest.appearance;assert.equal(a.version,2);assert(a.vegetationExcluded>0);assert.equal(a.candidateBuildings-manifest.buildings,a.vegetationExcluded);assert.equal(manifest.sourceCounts.osm,47013);
 for(const e of a.excludedExamples){assert(e.id.startsWith('eab/'));assert(e.evidence.vegetation>=.92&&e.evidence.context>=.88);const p={x:e.x,y:1000,z:e.z};assert(![...data.candidates(p,{...p,y:-1000})].some(b=>b.id===e.id));}
});
