import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{gunzipSync}from'node:zlib';
import * as THREE from'three';
import city from'../src/airports/data/lax-city.json'with{type:'json'};
import physics from'../src/airports/data/lax-city-physics.json'with{type:'json'};
import{LAX,seaAt}from'../src/airports/registry.js';
import{cityLayout}from'../src/airports/city-layout.js';
import{buildLaxCityLandmarks,landmarkLayout}from'../src/airports/lax-city-landmarks.js';
import{geographicUv,detailRect,buildCityBlocks,batchCityGeometry}from'../src/airports/lax-city-world.js';
import{buildLaxScenery}from'../src/airports/lax-scene.js';
import{cameraObstacles}from'../src/views/camera-obstacles.js';
import{createImageryStream,selectImageryTiles}from'../src/airports/imagery-stream.js';
import{cityRay,sweptCityContact,predictCityObstacles,installDenseCity}from'../src/terrain/city-obstacles.js';
import{decodeDenseCity,readDenseResponse,footprintEntry,CITY_BUILDING_MANIFEST}from'../src/airports/dense-city-data.js';
import{createCityInstances,cityTemplate,buildingFrame}from'../src/airports/dense-city-instances.js';
import{createDenseGeometry,createDenseCityRenderer}from'../src/airports/dense-city-render.js';
import{flyLevel}from'./pilot.mjs';
import{surfaceHeight,terrainHeight}from'../src/terrain/heightfield.js';
import{createFlight,advanceFlight,setMotion,KT}from'../src/flight.js';
import{runwayFootprints,clipGroundTriangle}from'../src/airports/ground-footprints.js';
import{departureOf}from'../src/missions/ground.js';
const heightAt=(x,z)=>surfaceHeight(x,z,'lax');
const stadium=()=>cityLayout().landmarks.find(o=>/SoFi/i.test(o.name));
const denseManifest=JSON.parse(await readFile(new URL('../../public/'+CITY_BUILDING_MANIFEST,import.meta.url))),denseCompressed=await readFile(new URL('../../public/'+denseManifest.path,import.meta.url)),denseRaw=gunzipSync(denseCompressed),dense=decodeDenseCity(denseRaw.buffer.slice(denseRaw.byteOffset,denseRaw.byteOffset+denseRaw.byteLength),denseManifest);
function dispose(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});gs.forEach(g=>g.dispose());ms.forEach(m=>{m.map?.dispose();m.dispose();});}
test('continuous city pack has complete unsampled source coverage, stable heights/colours and verified compact data',async()=>{
 assert.equal((await readDenseResponse(new Response(denseCompressed),denseManifest)).count,dense.count);assert.equal((await readDenseResponse(new Response(denseRaw,{headers:{'Content-Encoding':'gzip'}}),denseManifest)).count,dense.count);assert(dense.count>1000000);assert.equal(denseCompressed.byteLength,denseManifest.bytes);assert.equal(createHash('sha256').update(denseCompressed).digest('hex'),denseManifest.sha256);assert.equal(createHash('sha256').update(denseRaw).digest('hex'),denseManifest.geometrySha256);assert(denseCompressed.byteLength<180*1024*1024);assert(dense.byteLength<400*1024*1024);assert(denseManifest.tiles.length>500);
 const ids=new Set();let airportCount=0,approachCount=0,northRegion=0,southRegion=0;for(let i=0;i<dense.count;i++){const b=dense.building(i);assert(!ids.has(b.id));ids.add(b.id);assert(b.height>0&&b.height<600);assert(b.roofColor>=0&&b.roofColor<=0xffffff);assert(b.wallColor>=0&&b.wallColor<=0xffffff);assert(b.rings[0].length>=6);if(Math.hypot(b.cx,b.cz+2000)<5000)airportCount++;if(b.cz>0&&b.cz<22000&&Math.abs(b.cx)<1800)approachCount++;if(Math.abs(b.cx-7000)<1500&&Math.abs(b.cz-12000)<3000)northRegion++;if(Math.abs(b.cx+7000)<1500&&Math.abs(b.cz-12000)<3000)southRegion++;if(i%31===0){assert(!seaAt('lax',b.cx,b.cz));assert(b.baseY<=heightAt(b.cx,b.cz)+.002);assert(b.topY>=heightAt(b.cx,b.cz)+1.9);for(const ring of b.rings)for(const v of ring)assert(Number.isFinite(v));assert.deepEqual(dense.building(i),b);}}
 assert(airportCount>40000);assert(northRegion>1000&&southRegion>1000,'continuous coverage extends beyond both approach-strip edges');assert(approachCount>100000);assert.equal(Object.values(denseManifest.heightSources).reduce((s,n)=>s+n,0),dense.count);
});
test('regional shared middle/district models stay compact and reduce distant geometry without omitting source buildings',()=>{
 const material=new THREE.MeshStandardMaterial(),totals=[];
 try{for(const lod of[0,2]){let bytes=0,triangles=0,represented=0,instances=0;for(const tile of denseManifest.tiles){const p=createCityInstances(dense,tile,lod,material);represented+=p.represented+p.exceptions.length;instances+=p.instances;bytes+=p.bytes;triangles+=p.triangles;if(p.exceptions.length){const g=createDenseGeometry(dense,tile,0,p.exceptions);bytes+=g.userData.bytes;triangles+=g.index.count/3;g.dispose();}for(const m of p.meshes)m.geometry.dispose();}assert.equal(represented,dense.count);assert(bytes<dense.count*100,'shared middle/district geometry budget');totals.push({bytes,triangles,instances});}assert(totals[1].triangles<totals[0].triangles*.35,'subpixel low homes aggregate instead of wasting triangles');assert(totals[0].instances>dense.count*.95);
 }finally{material.dispose();}
});
test('near and far city chunks share roof/contact heights and source bounds with packed GPU attributes',()=>{
 const tiles=[denseManifest.tiles.find(t=>t.id==='-1:4')||denseManifest.tiles[0],denseManifest.tiles.at(-1)];
 for(const tile of tiles)for(const lod of[0,1]){const g=createDenseGeometry(dense,tile,lod);try{const p=g.attributes.position,o=g.userData.origin;assert(g.attributes.normal.normalized&&g.attributes.color.normalized);assert(g.userData.bytes<tile.count*(lod===1?4600:1600));for(const a of Object.values(g.attributes))assert([...a.array].every(Number.isFinite));for(const r of g.userData.ranges){const b=dense.building(r.index);let top=-Infinity;for(let i=r.start;i<r.start+r.count;i++){const x=p.getX(i)+o.x,z=p.getZ(i)+o.z,y=p.getY(i);assert(x>=b.minX-.03&&x<=b.maxX+.03,b.id+' x');assert(z>=b.minZ-.03&&z<=b.maxZ+.03,b.id+' z');assert(y>=b.baseY-.002&&y<=b.topY+.002,b.id+' y');top=Math.max(top,y);}assert(Math.abs(top-b.topY)<.002);}}finally{g.dispose();}}
});
test('dense source courtyards stay open to visible roof rays, camera rays and swept building contact',()=>{
 const b={index:0,id:'fixture',kind:'industrial',seed:3,cx:10,cz:10,width:20,depth:20,minX:0,maxX:20,minZ:0,maxZ:20,baseY:0,topY:10,height:10,angle:0,roofColor:0xaaaaaa,wallColor:0xbbbbbb,rings:[new Float32Array([0,0,0,20,20,20,20,0]),new Float32Array([6,6,14,6,14,14,6,14])]},data={building:()=>b,candidates:()=>[b]},g=createDenseGeometry(data,{start:0,count:1,minX:0,maxX:20,minZ:0,maxZ:20},1),mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.position.set(10,0,10);mesh.updateMatrixWorld();const uninstall=installDenseCity(data);
 try{const ray=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh);assert.equal(ray(10,10).length,0);assert(ray(3,3).length>0);assert.equal(cityRay({x:10,y:20,z:10},{x:10,y:-2,z:10}),null);const hit=cityRay({x:-5,y:5,z:10},{x:25,y:5,z:10});assert(hit&&Math.abs(hit.distance-5)<.001);assert.equal(footprintEntry({x:8,y:5,z:10},{x:12,y:5,z:10},b.rings,0,1,0),null);assert(footprintEntry({x:5.5,y:5,z:10},{x:10,y:5,z:10},b.rings,0,1,1)!==null);
 }finally{uninstall();g.dispose();mesh.material.dispose();}
});
test('dense-city installation preserves actual LAX takeoff and landing and releases queued chunks on airport switch',async()=>{
 const uninstall=installDenseCity(dense);try{for(const levelId of['lax-takeoff','lax-landing']){const s=flyLevel(createFlight(null,{levelId}),1800);assert(s.result?.levelCleared,JSON.stringify({levelId,result:s.result,impact:s.impact}));assert(!s.terrain.events.some(e=>e.level>0),JSON.stringify(s.terrain.events));}}finally{uninstall();}
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),renderer=createDenseCityRenderer({root,data:dense,material}),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000);camera.position.set(-1500,500,12000);camera.lookAt(0,0,15000);camera.updateProjectionMatrix();renderer.update(camera);const pending=renderer.settled();renderer.dispose();await pending;await new Promise(r=>setTimeout(r,5));assert.equal(root.children.length,0);
 material.dispose();

});
test('whole-city preload retains all LOD models across rotations, long revisits and distant GPU releases',async()=>{
 const template=dense.building(0),records=[0,7000,14000].map((x,index)=>({...template,index,id:'cache-fixture-'+index,cx:x+10,cz:10,minX:x,maxX:x+20,minZ:0,maxZ:20,width:20,depth:20,baseY:0,topY:8,height:8,kind:'industrial',frame:{x:x+10,z:10,width:20,depth:20,angle:0,fill:1},ringCount:1,rings:[new Float32Array([x,0,x,20,x+20,20,x+20,0])]})),tiles=records.map(b=>({id:String(b.index),start:b.index,count:1,minX:b.minX,maxX:b.maxX,minZ:0,maxZ:20,topY:8})),sample={count:3,building:i=>records[i],manifest:{tiles}},root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),cache=createDenseCityRenderer({root,data:sample,material,gpuCacheBytes:1}),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000);
 const view=(x,tx)=>{camera.position.set(x,100,100);camera.lookAt(tx,0,0);camera.updateProjectionMatrix();cache.update(camera);};
 try{
  view(10,0);await cache.settled();assert.equal(cache.stats().farTiles,tiles.length);assert.equal(cache.stats().preloadedBuildings,3);assert.equal(cache.stats().detailTiles,1);
  const original=new Map(root.children.map(m=>[m.name,{mesh:m,geometries:m.children.map(c=>c.geometry),positions:m.children.map(c=>c.geometry.attributes.position.array)}])),built=cache.stats().generatedTiles;
  camera.lookAt(10,100,1000);cache.update(camera);assert.equal(cache.stats().pendingTiles,0);assert.equal(cache.stats().generatedTiles,built,'turning in place has no construction work');
  for(const m of root.children)for(const child of m.children)child.onBeforeRender();
  view(14010,14000);await cache.settled();assert(cache.stats().gpuReleases>0,'far GPU buffers can be reclaimed without deleting the model');
  const complete=cache.stats().generatedTiles;view(10,0);assert.equal(cache.stats().pendingTiles,0);assert.equal(cache.stats().generatedTiles,complete,'revisiting preserves prepared detail');
  for(const[name,r]of original){const m=root.getObjectByName(name);assert.equal(m,r.mesh);assert.deepEqual(m.children.map(c=>c.geometry),r.geometries);for(let i=0;i<m.children.length;i++)assert.equal(m.children[i].geometry.attributes.position.array,r.positions[i]);}
  assert.equal(cache.stats().cachedVariants,8);assert.equal(root.children.length,8);
 }finally{cache.dispose();assert.equal(root.children.length,0);material.dispose();}
 // Cancel an obsolete preload before it can build the entire city.
 let current=true;const cancelledRoot=new THREE.Group(),cancelledMaterial=new THREE.MeshStandardMaterial(),cancelled=createDenseCityRenderer({root:cancelledRoot,data:sample,material:cancelledMaterial,isCurrent:()=>current});cancelled.update(camera);current=false;await cancelled.settled();assert.equal(cancelledRoot.children.length,0);cancelled.dispose();cancelledMaterial.dispose();
});
test('repeated homes share template arrays while retaining metre-scaled dimensions, colours and source roof heights',()=>{
 const base={kind:'home',seed:1,baseY:3,topY:11,height:8,roofColor:0xaa8877,wallColor:0xccbbaa,ringCount:1},records=Array.from({length:100},(_,i)=>({...base,index:i,id:'house/'+i,cx:i*20,cz:0,width:10,depth:8,minX:i*20-5,maxX:i*20+5,minZ:-4,maxZ:4,roofColor:0xaa8877+i*7,seed:i*15+1,frame:{x:i*20,z:0,width:10+i%3,depth:8,angle:i%2*.3,fill:1}})),data={building:i=>records[i]},tile={start:0,count:records.length,minX:-10,maxX:2010,minZ:-10,maxZ:10,topY:11},material=new THREE.MeshStandardMaterial(),a=createCityInstances(data,tile,1,material),b=createCityInstances(data,tile,1,material);
 try{assert.equal(a.exceptions.length,0);assert.equal(a.instances,100);assert.equal(a.meshes.length,1);const g=a.meshes[0].geometry,h=b.meshes[0].geometry;assert(g.isInstancedBufferGeometry);assert.equal(g.attributes.position.array,h.attributes.position.array,'CPU vertex template is shared across chunks');assert.notEqual(g.attributes.position,h.attributes.position,'GPU attribute lifetimes are independent');assert.equal(g.attributes.position.array,cityTemplate('hip').position);assert(a.bytes<100*50+5000);assert.notDeepEqual(Array.from(g.attributes.cityRoofColor.array.slice(0,3)),Array.from(g.attributes.cityRoofColor.array.slice(99*3,100*3)));for(let i=0;i<100;i++){const pose=g.attributes.cityInstance,d=g.attributes.cityDimensions;assert(Math.abs(pose.getY(i)+d.getY(i)+d.getW(i)-records[i].topY)<.00001);assert.equal(d.getX(i),records[i].frame.width);assert(Math.abs(pose.getW(i)-records[i].frame.angle)<.00001);}assert.equal(a.triangles,1400);
 }finally{for(const p of[a,b])for(const m of p.meshes)m.geometry.dispose();material.dispose();}
});
test('district proxies preserve represented source count while courtyards and tall buildings retain individual geometry',()=>{
 const records=Array.from({length:36},(_,i)=>{const x=i%6*12,z=Math.floor(i/6)*12;return{index:i,id:'district/'+i,kind:'home',seed:i,baseY:0,topY:7,height:7,cx:x,cz:z,minX:x-4,maxX:x+4,minZ:z-4,maxZ:z+4,width:8,depth:8,roofColor:0xaa9988,wallColor:0xccbbaa,ringCount:1,frame:{x,z,width:8,depth:8,angle:0,fill:1}};}),tower={...records[0],index:36,id:'tower',height:80,topY:80,frame:{...records[0].frame,fill:.8}},courtyard={...records[1],index:37,id:'courtyard',ringCount:2};records.push(tower,courtyard);const data={building:i=>records[i]},tile={start:0,count:38,minX:-4,maxX:64,minZ:-4,maxZ:64,topY:80},material=new THREE.MeshStandardMaterial(),far=createCityInstances(data,tile,2,material),near=createCityInstances(data,tile,1,material);
 try{assert(far.instances<records.length/4);assert.equal(far.represented+far.exceptions.length,records.length);assert(far.exceptions.includes(36));assert(near.exceptions.includes(36)&&near.exceptions.includes(37),'courtyard geometry never becomes a closed near house template');assert.equal(near.instances,36);for(const m of far.meshes)for(const attr of Object.values(m.geometry.attributes))assert([...attr.array].every(Number.isFinite));
 }finally{for(const p of[far,near])for(const m of p.meshes)m.geometry.dispose();material.dispose();}
});
test('adjacent distant tiles share one draw batch and switch together without duplicate district/middle buildings',async()=>{
 const records=[10,1610].map((x,index)=>({index,id:'pooled/'+index,kind:'industrial',seed:1,cx:x,cz:10,minX:x-10,maxX:x+10,minZ:0,maxZ:20,width:20,depth:20,baseY:0,height:8,topY:8,roofColor:0xaaaaaa,wallColor:0xccccbb,ringCount:1,frame:{x,z:10,width:20,depth:20,angle:0,fill:1}})),tiles=records.map((b,i)=>({id:i+':0',start:i,count:1,minX:b.minX,maxX:b.maxX,minZ:0,maxZ:20,topY:8})),root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),cache=createDenseCityRenderer({root,data:{count:2,manifest:{tiles},building:i=>records[i]},material}),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000),view=z=>{camera.position.set(800,100,z);camera.lookAt(800,0,10);cache.update(camera);};
 try{view(-15000);await cache.settled();assert.equal(cache.stats().districtTiles,1);assert.equal(cache.stats().farTiles,2);assert.equal(root.children.filter(m=>m.visible).length,1);const built=cache.stats().generatedTiles;view(-12000);assert.equal(root.children.filter(m=>m.visible).length,1,'district hysteresis');view(-10000);assert.equal(root.children.filter(m=>m.visible).length,2,'both middle batches replace the entire district');assert.equal(cache.stats().generatedTiles,built);assert.equal(cache.stats().pendingTiles,0);assert.equal(cache.stats().visibleBuildings,2);
 }finally{cache.dispose();material.dispose();}
});
test('runway clipping removes only the covered ground and preserves sloped surface interpolation',()=>{
 const triangle=[{x:-10,y:-3,z:-10},{x:10,y:17,z:-10},{x:0,y:17,z:10}],cut=[{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}],fragments=clipGroundTriangle(triangle,[cut]),area=t=>Math.abs((t[1].x-t[0].x)*(t[2].z-t[0].z)-(t[1].z-t[0].z)*(t[2].x-t[0].x))/2;
 assert(Math.abs(fragments.reduce((s,t)=>s+area(t),0)-(area(triangle)-4))<1e-7);
 for(const t of fragments)for(const p of t)assert(Math.abs(p.y-(p.x+p.z*.5+12))<1e-7);
 assert.deepEqual(clipGroundTriangle([{x:-.5,y:0,z:-.5},{x:.5,y:0,z:-.5},{x:0,y:0,z:.5}],[cut]),[]);
 const angle=.73,co=Math.cos(angle),si=Math.sin(angle),rotate=p=>({...p,x:p.x*co-p.z*si,z:p.x*si+p.z*co});
 assert(Math.abs(clipGroundTriangle(triangle.map(rotate),[cut.map(rotate)]).reduce((s,t)=>s+area(t),0)-(area(triangle)-4))<1e-7);
});
test('actual LAX taxi surfaces and shoulder rings leave every runway interior open before and after render batching',async()=>{
 const{buildRealAirportWorld}=await import('../src/airports/real-airport-world.js'),previous=globalThis.document,root=new THREE.Group(),sourceGeometries=new Set();
 globalThis.document={createElement:()=>({width:256,height:320,getContext:()=>({fillRect(){},fillText(){}})})};
 try{
  buildRealAirportWorld({scene:root,airport:LAX,asphalt:new THREE.Texture(),departurePlan:departureOf('lax'),mat:(color,extra={})=>new THREE.MeshStandardMaterial({color,...extra})});root.updateMatrixWorld(true);
  const strips=[],shoulders=[];root.traverse(o=>{if(o.name==='source-ground-strip')strips.push(o);if(o.name==='source-runway-shoulder')shoulders.push(o);});assert(strips.length>100);assert.equal(shoulders.length,LAX.data.runways.length);assert.equal(runwayFootprints(LAX).length,LAX.data.runways.length);
  const reserved=[...strips,...shoulders];
  for(const r of LAX.data.runways){const a=LAX.project(r.ends[0].longitude,r.ends[0].latitude),b=LAX.project(r.ends[1].longitude,r.ends[1].latitude),len=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/len,dz=(b.z-a.z)/len;
   for(let along=100;along<len-100;along+=160)for(const cross of[-r.widthM*.3,0,r.widthM*.3]){const origin=new THREE.Vector3(a.x+dx*along-dz*cross,100,a.z+dz*along+dx*cross);assert.equal(new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0)).intersectObjects(reserved,false).length,0,'lower roads/taxiways/shoulders cannot cover the runway');}
   const cross=r.widthM/2+4,origin=new THREE.Vector3(a.x+dx*len/2-dz*cross,100,a.z+dz*len/2+dx*cross);assert(new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0)).intersectObjects(shoulders,false).length,'shoulder paving is still connected to the runway edge');
  }
  // Ground surfaces sharing one material retain their empty runway regions
  // after the same merge used by scene rendering.
  const stripRoot=new THREE.Group();strips.forEach(m=>stripRoot.add(m));batchCityGeometry(stripRoot,sourceGeometries);assert(stripRoot.children.length<strips.length);root.add(stripRoot);root.updateMatrixWorld(true);
  const r=LAX.runway;assert.equal(new THREE.Raycaster(new THREE.Vector3(0,100,-r.length/2),new THREE.Vector3(0,-1,0)).intersectObject(stripRoot,true).length,0);
 }finally{globalThis.document=previous;dispose(root);sourceGeometries.forEach(g=>g.dispose());}
});
test('original terminal details keep courtyard openings, valid texture UVs and shadow flags through batching',()=>{
 const group=new THREE.Group(),root=buildLaxScenery({THREE,group,project:(x,z)=>({x,z}),features:[{id:'terminal-fixture',tags:{aeroway:'terminal',height:'12',name:'Terminal 8'},geometry:[[0,0],[40,0],[40,40],[0,40],[0,0]],holes:[[[10,10],[10,30],[30,30],[30,10],[10,10]]]},{id:'bridge-fixture',tags:{aeroway:'jet_bridge'},geometry:[[45,5],[60,5]]}]});
 const sourceGeometries=new Set();try{
  root.updateMatrixWorld(true);const roof=root.getObjectByName('LAX-terminal-terminal-fixture');assert(roof);
  const ray=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObject(roof);
  assert.equal(ray(20,20).length,0,'courtyard is open');assert(ray(5,5).length>0,'roof still covers the terminal');
  assert(root.getObjectByName('LAX-recessed-gate-canopy'));assert(root.userData.sceneryStats.facadeBays>0);
  const obstruction=cameraObstacles(root),a=new THREE.Vector3(52,5.8,-2),b=new THREE.Vector3(52,5.8,12);assert(obstruction(a,b),'thin bridge shell blocks the exterior camera');
  batchCityGeometry(root,sourceGeometries);assert(obstruction(a,b),'bridge ray tests survive render batching');let textured=0,triangles=0,shadowCasters=0;
  root.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(o.castShadow)shadowCasters++;for(const a of Object.values(o.geometry.attributes))assert([...a.array].every(Number.isFinite));if(o.material.map){textured++;const uv=o.geometry.attributes.uv;assert(uv);assert.equal(uv.count,o.geometry.attributes.position.count);assert(o.castShadow);}});
  assert(textured>=3&&shadowCasters>=3);assert(triangles<20000);
 }finally{for(const g of sourceGeometries)g.dispose();dispose(root);}
});
test('LAX city source retains real identities, an independently dated NAIP pack and complete finite building selection',async()=>{
 assert(!city.provisional&&!physics.provisional);assert.equal(city.airportId,'lax');assert(physics.buildings.length>=500&&physics.buildings.length<=2000);assert(city.landmarks.sofi.id&&city.landmarks.forum.id);assert(city.landmarks.downtown.some(o=>/Wilshire Grand/i.test(o.name)));assert(city.landmarks.downtown.length>=8);assert.equal(physics.sourceSha256,createHash('sha256').update(await readFile(new URL('../src/airports/data/lax-city.json',import.meta.url))).digest('hex'));
 const ids=new Set();for(const b of cityLayout().buildings){assert(!ids.has(b.id));ids.add(b.id);assert(!seaAt('lax',b.cx,b.cz));for(const k of['cx','cz','width','depth','height','baseY','topY','angle'])assert(Number.isFinite(b[k]),`${b.id}:${k}`);assert(b.width>0&&b.depth>0&&b.height>0);}
});
test('all nine self-hosted NAIP images match measured metadata, checksums and bounded texture memory',async()=>{
 const imagery=JSON.parse(await readFile(new URL('../../public/assets/cities/lax/imagery.json',import.meta.url),'utf8'));assert.equal(imagery.tiles.length,8);assert(imagery.captureDates.every(d=>d.startsWith('2022-')));assert(/public domain/i.test(imagery.copyright));let rgba=0,bytes=0;
 for(const item of[imagery.overview,...imagery.tiles]){const b=await readFile(new URL('../../public/'+item.path,import.meta.url));assert.equal(b.byteLength,item.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),item.sha256);assert.equal(b.toString('ascii',0,4),'RIFF');rgba+=item.width*item.height*4;bytes+=b.length;}
 const mask=imagery.seaMask,maskBytes=await readFile(new URL('../../public/'+mask.path,import.meta.url));assert.equal(createHash('sha256').update(maskBytes).digest('hex'),mask.sha256);assert.equal(maskBytes.length,mask.bytes);assert.deepEqual(mask.bounds,imagery.overview.bounds);assert(mask.width===imagery.overview.width&&mask.height===imagery.overview.height);assert(bytes+maskBytes.length<8e6);assert(rgba*4/3+mask.width*mask.height<120e6);
});
test('north-up city imagery stays georeferenced in the rotated25R frame and detail tiles meet without UV gaps',()=>{
 const bounds=[33.87,-118.53,34.09,-118.13];for(const[lon,lat,u,v]of[[-118.53,33.87,0,0],[-118.13,34.09,1,1],[-118.33,33.98,.5,.5]]){const p=LAX.project(lon,lat),uv=geographicUv(LAX,bounds,p.x,p.z);assert(Math.abs(uv[0]-u)<1e-10);assert(Math.abs(uv[1]-v)<1e-10);}
 const a=detailRect(bounds,[33.91,-118.46,33.95,-118.4225]),b=detailRect(bounds,[33.91,-118.4225,33.95,-118.385]);assert(Math.abs(a[0]+a[2]-b[0])<1e-10);assert.equal(a[1],b[1]);
});
test('expanded self-hosted imagery covers the terrain frame and adds genuine high-resolution approach tiles',async()=>{
 const metadata=JSON.parse(await readFile(new URL('../../public/assets/cities/lax/imagery-lod.json',import.meta.url),'utf8'));
 assert.equal(metadata.tiles.length,19);assert(metadata.sourceItems.length>50);assert(metadata.captureDates.every(d=>d.startsWith('2022-')));
 const records=[metadata.overview,metadata.regional,...metadata.tiles,metadata.seaMask,metadata.coastMask];
 for(const item of records){
  assert(item.path.startsWith('assets/cities/lax/'));const bytes=await readFile(new URL('../../public/'+item.path,import.meta.url));
  assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
 }
 for(const[x,z]of[[-30000,-30000],[-30000,30000],[30000,-30000],[30000,30000]]){
  const[u,v]=geographicUv(LAX,metadata.overview.bounds,x,z);assert(u>0&&u<1&&v>0&&v<1);
 }
 const arrival=createFlight(null,{levelId:'lax-landing'}),choice=selectImageryTiles(metadata.tiles,LAX,arrival,arrival);
 assert.equal(choice.length,3);assert(choice.some(t=>{const[u,v]=geographicUv(LAX,t.bounds,arrival.x,arrival.z);return u>=0&&u<=1&&v>=0&&v<=1;}));
 assert(metadata.tiles.every(t=>t.width===2048&&t.height===2048));
 const base=[metadata.overview,metadata.regional].reduce((s,t)=>s+t.width*t.height*4*4/3,0),masks=metadata.seaMask.width*metadata.seaMask.height+metadata.coastMask.width*metadata.coastMask.height;
 assert(base+masks+4*2048*2048*4*4/3<200*1024*1024,'four-detail cache stays within the GPU texture budget');
 assert.deepEqual(metadata.coastMask.bounds,metadata.regional.bounds);assert.deepEqual(metadata.seaMask.bounds,metadata.overview.bounds);
});
test('detail streaming limits requests, reuses cached images and disposes evictions and late arrivals',async()=>{
 const requested=[],waiting=new Map(),textures=[],tiles=Array.from({length:9},(_,i)=>({id:String(i)}));
 const stream=createImageryStream({load:tile=>{requested.push(tile.id);return new Promise(resolve=>waiting.set(tile.id,resolve));}});
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 const finish=async id=>{const texture={id,disposed:false,dispose(){this.disposed=true;}};textures.push(texture);waiting.get(id)(texture);await tick();};
 try{
  stream.update(tiles.slice(0,3));await tick();assert.deepEqual(requested,['0','1']);assert.equal(stream.stats().pendingDetails,2);
  await finish('0');assert.deepEqual(requested,['0','1','2']);await finish('1');await finish('2');await stream.settled();
  assert.deepEqual(stream.stats().activeDetailIds,['0','1','2']);
  stream.update(tiles.slice(1,4));await tick();await finish('3');await stream.settled();assert.equal(stream.stats().cachedDetailIds.length,4);
  stream.update(tiles.slice(0,3));await tick();assert.equal(requested.length,4,'returning to a nearby view reuses textures');
  stream.update(tiles.slice(4,7));await tick();await finish('4');await finish('5');await finish('6');await stream.settled();
  assert(stream.stats().cachedDetailIds.length<=4);assert(textures.some(t=>t.disposed));
  stream.update(tiles.slice(7,9));await tick();stream.dispose();await finish('7');await finish('8');await stream.settled();
  assert(textures.every(t=>t.disposed),'textures arriving after airport switch are released');
 }finally{stream.dispose();}
});
test('missing optional details keep the regional fallback available and do not repeatedly retry',async()=>{
 let requests=0;const errors=[];const stream=createImageryStream({load:async()=>{requests++;throw Error('missing tile');},onError:(error,tile)=>errors.push(tile.id)});
 try{stream.update([{id:'missing'}]);await stream.settled();stream.update([{id:'missing'}]);assert.equal(requests,1);assert.deepEqual(errors,['missing']);assert.deepEqual(stream.active(),[]);assert.deepEqual(stream.stats().failedDetails,['missing']);}finally{stream.dispose();}
});
test('actual landmark mesh vertices are finite and contained in the same collision envelopes at source coordinates',()=>{
 const root=new THREE.Group(),r=buildLaxCityLandmarks({THREE,group:root,project:LAX.project,heightAt,landmarks:physics.landmarks}),layouts=landmarkLayout({project:LAX.project,heightAt,landmarks:physics.landmarks});try{
  root.updateMatrixWorld(true);assert(r.stats.triangles<30000);assert(r.stats.landmarks>=10);
  for(const group of r.group.children){const id=group.userData.sourceId,collider=r.colliders.find(c=>c.id===id),layout=layouts.find(c=>c.id===id);assert(collider&&layout);assert(Math.hypot(group.position.x-layout.cx,group.position.z-layout.cz)<.001);group.traverse(o=>{if(!o.geometry)return;if(o.material?.map)assert(o.geometry.attributes.uv,'mapped landmark geometry retains UVs through batching');for(const a of Object.values(o.geometry.attributes))assert([...a.array].every(Number.isFinite));const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);assert(v.x>=collider.cx-collider.width/2-.02&&v.x<=collider.cx+collider.width/2+.02);assert(v.z>=collider.cz-collider.depth/2-.02&&v.z<=collider.cz+collider.depth/2+.02);assert(v.y>=collider.baseY-.02&&v.y<=collider.topY+.02,group.name);}});}
 }finally{dispose(root);}
});
test('detailed urban roofs and facades remain finite inside their source contact envelopes',()=>{
 const root=new THREE.Group(),blocks=cityLayout().buildings,result=buildCityBlocks(root),byId=new Map(blocks.map(b=>[b.id,b])),extents=new Map();try{
  assert.equal(result.count,blocks.length);assert(result.pitchedRoofs>100&&result.flatRoofs>500);assert(result.roofUnits>500);assert(result.materialBatches<=7);assert(result.triangles<250000);
  for(const mesh of root.children){assert(mesh.material.map||mesh.material.name.endsWith('trim')||mesh.material.name.endsWith('service'));const g=mesh.geometry,p=g.attributes.position;for(const a of Object.values(g.attributes))assert([...a.array].every(Number.isFinite));
   for(const range of g.userData.buildingRanges){const b=byId.get(range.id),co=Math.cos(b.angle),si=Math.sin(b.angle);assert(b);for(let i=range.start;i<range.start+range.count;i++){const dx=p.getX(i)-b.cx,dz=p.getZ(i)-b.cz,x=dx*co+dz*si,z=-dx*si+dz*co,y=p.getY(i);assert(Math.abs(x)<=b.width/2+.005,b.id+' width');assert(Math.abs(z)<=b.depth/2+.005,b.id+' depth');assert(y>=b.baseY-.005&&y<=b.topY+.005,b.id+' height');extents.set(b.id,Math.max(extents.get(b.id)??-Infinity,y));}}
  }
  assert.equal(extents.size,blocks.length);for(const b of blocks)assert(Math.abs(extents.get(b.id)-b.topY)<.005,b.id+' architectural roof top matches contact height');
  // The authored roof faces must face the sky, otherwise houses disappear
  // when viewed from the aircraft despite having valid bounds.
  const roofs=root.getObjectByName('LAX-source-city-tile');for(let i=0;i<roofs.geometry.attributes.normal.count;i++)assert(roofs.geometry.attributes.normal.getY(i)>0);
 }finally{dispose(root);}
});
test('a high-speed swept wall crossing stops before a landmark and camera rays use the same source envelopes',()=>{
 const o=stadium(),from={airportId:'lax',x:o.cx-1000,y:o.baseY+o.height*.5,z:o.cz,pitch:0,roll:0,yaw:Math.PI/2},to={...from,x:o.cx+1000},hit=sweptCityContact(from,to);assert(hit&&hit.type==='building');assert(hit.x<o.cx);assert(hit.y<o.topY-5);assert(hit.fraction<.5);const ray=cityRay(from,to,'lax');assert(ray&&ray.distance<1000);assert.equal(cityRay(from,to,'jfk'),null);assert.equal(sweptCityContact(from,{...to,airportId:'jfk'}),null);
});
test('city roofs remain independent of the DEM and gear/APPR cannot silence a real future building strike',()=>{
 const o=stadium(),s=createFlight(null,{levelId:'lax-landing'});Object.assign(s,{airborne:true,x:o.cx,y:o.topY-10,z:o.cz+1000,gearPosition:1,apprArmed:true});setMotion(s,{speed:150/KT,verticalSpeed:0,yaw:0});const p=predictCityObstacles(s);assert(p?.level===2&&p.timeToImpact<15);assert(heightAt(o.cx,o.cz)<o.topY-10);s.y=o.topY+50;assert.equal(predictCityObstacles(s),null);
});
test('an actual force-integrated building impact freezes at wall contact without lifting the aircraft onto the roof',()=>{
 const o=stadium(),s=createFlight(null,{levelId:'lax-landing'});Object.assign(s,{airborne:true,x:o.cx-o.width/2-50,y:o.baseY+o.height*.5,z:o.cz,autoPilot:false,autoThrust:false,throttle:.5});setMotion(s,{speed:150/KT,verticalSpeed:0,yaw:Math.PI/2});for(let i=0;i<500&&!s.result;i++)advanceFlight(s,{},.01);assert(s.result&&!s.result.success);assert.equal(s.impact?.type,'building');assert(s.y<o.topY-5);const frozen={x:s.x,y:s.y,z:s.z,time:s.time};for(let i=0;i<100;i++)advanceFlight(s,{pitch:1,throttle:1},.01);assert.deepEqual({x:s.x,y:s.y,z:s.z,time:s.time},frozen);
});
test('the true LAX sea polygon overrides coarse shore triangles while all land elevations stay unchanged',()=>{
 let oldProtrusions=0,land=0,ocean=0;for(let latitude=33.915;latitude<33.965;latitude+=.001)for(let longitude=-118.455;longitude< -118.425;longitude+=.0004){const p=LAX.project(longitude,latitude),terrain=terrainHeight(p.x,p.z,'lax'),surface=surfaceHeight(p.x,p.z,'lax');if(seaAt('lax',p.x,p.z)){ocean++;assert.equal(surface,-LAX.elevationM);if(terrain> -LAX.elevationM+.05)oldProtrusions++;}else{land++;assert.equal(surface,Math.max(-LAX.elevationM,terrain));}}
 assert(ocean>100&&land>100);assert(oldProtrusions>0,'fixture crosses actual coarse-grid sand protrusions');
});
