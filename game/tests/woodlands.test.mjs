import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {airportOf} from '../src/airports/registry.js';
import {generateWoodlandSteps,restoreWoodlandData,TREE_ROOTS} from '../src/airports/woodland-data.js';
import {createWoodlandRenderer,loadWoodlands} from '../src/airports/woodland-world.js';
import {installWoodlands,cityRay,sweptCityContact,predictCityObstacles} from '../src/terrain/city-obstacles.js';
import {createFlight,advanceFlight} from '../src/flight.js';
import {pilotInput} from './pilot.mjs';
import {t} from '../src/i18n/index.js';
import {surfaceHeight} from '../src/terrain/heightfield.js';
const polygon=(id,tags,x,z,w,h)=>({id,tags,geometry:[[x,z],[x+w,z],[x+w,z+h],[x,z+h],[x,z]]});
const source=()=>({id:'daxing',runway:{length:3800,width:60},project:(x,z)=>({x,z}),data:{osm:{features:[polygon('woods',{natural:'wood'},4000,4000,2200,1800)]}}});
function generate(options){const iterator=generateWoodlandSteps({heightAt:()=>12,...options});let step;while(!(step=iterator.next()).done){}return restoreWoodlandData(step.value.arrays,{airportId:options.airport.id,...step.value});}
function arrays(d){return{poses:d.poses,tints:d.tints,farPoses:d.farPoses,farTints:d.farTints};}

test('woodlands retain source holes, exclude airport/roads/water/buildings, and deduplicate overlapping woodland polygons',()=>{
 const airport=source(),features=airport.data.osm.features;
 features[0].holes=[[[4500,4400],[4700,4400],[4700,4600],[4500,4600],[4500,4400]]];features.push(structuredClone(features[0]),polygon('apron',{aeroway:'apron'},4800,4500,180,180),polygon('water',{natural:'water'},5100,4400,120,170),{id:'road',tags:{highway:'primary',width:20},geometry:[[4000,4700],[6200,4700]]});
 const denseData={candidates:()=>[{minX:5300,maxX:5450,minZ:4400,maxZ:4600}]},a=generate({airport,denseData}),b=generate({airport,denseData});assert.deepEqual(arrays(a),arrays(b));assert(a.treeCount>5000);
 const positions=new Set();for(let i=0;i<a.poses.length;i+=8){const[x,,z]=a.poses.subarray(i,i+8);assert(!(x>4500&&x<4700&&z>4400&&z<4600));assert(!(x>4800&&x<4980&&z>4500&&z<4680));assert(!(x>5100&&x<5220&&z>4400&&z<4570));assert(!(x>5285&&x<5465&&z>4385&&z<4615));assert(Math.abs(z-4700)>=25);positions.add(x+':'+z);}assert.equal(positions.size,a.standCount);
 assert.deepEqual(arrays(restoreWoodlandData(arrays(a))),arrays(a));assert(a.farPoses.length<a.poses.length);assert(a.byteLength<a.treeCount*24);
 const invalid={...arrays(a),poses:a.poses.slice()};invalid.poses[5]=NaN;assert.throws(()=>restoreWoodlandData(invalid),/Invalid woodland/);
});
test('tree roots follow the shared terrain slope while forest stands stay outside the protected runway corridor',()=>{
 const airport=source();airport.data.osm.features.push(polygon('final-woods',{landuse:'forest'},-150,100,300,900));
 const data=generate({airport,heightAt:(x,z)=>10+.1*x+.05*z});
 for(let i=0;i<data.poses.length;i+=8){const[x,y,z,,,h,sx,sz]=data.poses.subarray(i,i+8);assert(x>190);assert(Math.abs(y-(10+.1*x+.05*z))<.001);assert(Math.abs(sx-.1)<1e-5);assert(Math.abs(sz-.05)<1e-5);assert(h>=5&&h<=26);}
});
test('all LODs have volume from above; observer reversals retain shared woodland models and compact source arrays',()=>{
 const data=generate({airport:source()}),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(42,1.6,1,60000);camera.position.set(4900,250,4800);camera.lookAt(5000,12,4900);camera.updateProjectionMatrix();
 const renderer=createWoodlandRenderer({root,data,camera}),first=[...root.children],identities=first.map(m=>[m,m.geometry,m.geometry.attributes.forestPose.data.array]);
 const stats=renderer.stats();assert(stats.visibleStands>0);assert(stats.nearTiles>0);assert(stats.drawBatches<30);assert(stats.estimatedGpuInstanceBytes<3*data.byteLength);
 for(const mesh of first){const p=mesh.geometry.attributes.position;let minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;for(let i=0;i<p.count;i++){minY=Math.min(minY,p.getY(i));maxY=Math.max(maxY,p.getY(i));minZ=Math.min(minZ,p.getZ(i));maxZ=Math.max(maxZ,p.getZ(i));}assert(maxY-minY>.3);assert(maxZ-minZ>.3);assert(!mesh.material.transparent);}
 camera.position.set(25000,2000,24000);camera.lookAt(5000,12,4900);renderer.update(camera);assert(renderer.stats().drawBatches<10);
 camera.position.set(4900,250,4800);camera.lookAt(5000,12,4900);renderer.update(camera);assert.equal(root.children.length,first.length);
 for(const[m,g,a]of identities){assert(root.children.includes(m));assert.equal(m.geometry,g);assert.equal(m.geometry.attributes.forestPose.data.array,a);}renderer.dispose();assert.equal(root.children.length,0);
});
test('woodland camera rays, swept airframe contacts and forward obstacle prediction use the same source trees and isolate airport worlds',()=>{
 const data=generate({airport:source()}),first=[...data.candidates({x:4100,y:0,z:4100},{x:4100,y:50,z:4100},100,0)].find(o=>!o.id.endsWith('/trunk'));assert(first);
 const remove=installWoodlands(data,'daxing'),y=(first.baseY+first.topY)/2,a={x:first.cx-100,y,z:first.cz,yaw:0,pitch:0,roll:0,airportId:'daxing'},b={...a,x:first.cx+100};
 const hit=cityRay(a,b,'daxing');assert(hit&&hit.obstacle.kind==='tree');assert.equal(cityRay(a,b,'xiaoshan'),null);
 const contact=sweptCityContact(a,b);assert.equal(contact.obstacleKind,'tree');assert(contact.x<b.x&&contact.x>=a.x);assert.equal(contact.y,y);
 assert(predictCityObstacles({...a,airData:{groundSpeed:50,groundTrack:Math.PI/2},velocity:{y:0}}));
 const replacement=installWoodlands({...data},'daxing');remove();assert(cityRay(a,b,'daxing'));replacement();assert.equal(cityRay(a,b,'daxing'),null);
});
test('processed woodland cache avoids resampling, includes imagery identity and rejects cancelled world publication',async()=>{
 const airport=source(),data=generate({airport}),keys=[],cache={getArrays:async ns=>{keys.push(ns);return arrays(data);},get:async()=>({sourceFeatures:1,excludedCount:0})};
 const root=new THREE.Group(),options={root,airport,denseData:{manifest:{sha256:'building-a'}},imagery:{overview:{sha256:'overview-a'},regional:{sha256:'region-a'}},textures:[],cache,isCurrent:()=>true};
 const layer=await loadWoodlands(options);assert(layer.sourceCacheHit);assert.equal(layer.data.treeCount,data.treeCount);layer.dispose();assert.equal(root.children.length,0);
 const changed=await loadWoodlands({...options,imagery:{...options.imagery,regional:{sha256:'region-b'}}});assert.notEqual(keys[0],keys[1]);changed.dispose();
 await assert.rejects(loadWoodlands({...options,isCurrent:()=>false}),{name:'AbortError'});assert.equal(root.children.length,0);
});
for(const id of['daxing','xiaoshan','changi','kansai','jfk','lax'])test(id+': actual source woodland polygons build complete bounded regional stands',async()=>{
 const airport=airportOf(id),extraFeatures=id==='lax'?JSON.parse(await readFile(new URL('../../public/assets/cities/lax/woodlands-v1.json',import.meta.url),'utf8')).features:[],data=generate({airport,extraFeatures,heightAt:(x,z)=>surfaceHeight(x,z,id)});
 assert(data.sourceFeatures>0);assert(data.treeCount>1000);assert(data.byteLength<24*1024*1024);assert(data.tiles.length<1800);assert(data.districts.length<500);
 for(let i=0;i<data.poses.length;i+=8){assert(Math.abs(data.poses[i])<30000);assert(Math.abs(data.poses[i+2])<30000);}
 assert.equal(data.treeCount,data.standCount*TREE_ROOTS.length);
 const remove=installWoodlands(data,id);
 try{for(const kind of['takeoff','landing']){const s=createFlight(null,{levelId:id+'-'+kind});for(let i=0;i<80000&&!s.result;i++)advanceFlight(s,pilotInput(s),.02);assert(s.result?.levelCleared,JSON.stringify({id,kind,result:s.result,impact:s.impact}));}}finally{remove();}
});
test('tree-contact messages are localized without changing canonical simulation strings',()=>{
 for(const text of['撞击树木','飞机已在树木接触位置停止。注意前方障碍，保持安全高度并提前响应 TERRAIN / PULL UP。']){assert(!/\p{Script=Han}/u.test(t(text,'en')));assert.equal(t(text,'zh'),text);}
});
