import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {airportOf} from '../src/airports/registry.js';
import {createRegionalFlow} from '../src/airports/regional-traffic-flow.js';
import {prepareRegionalRoute,regionalSurfaceGraph,selectRegionalTiles,regionalTileId} from '../src/airports/regional-traffic-data.js';
import {loadRegionalTraffic} from '../src/airports/regional-traffic-world.js';
import {createVehicleRenderer} from '../src/airports/road-vehicles.js';
const airport=airportOf('lax'),manifest={schema:1,airportId:'lax',identity:'a'.repeat(64),bounds:[-30000,-30000,30000,30000],tileSize:4000,innerRadiusM:6000,center:[airport.viewCenter.x,airport.viewCenter.z],frame:{threshold:Object.values(airport.unproject(0,0)),heading:airport.runway.heading},drivingSide:'right',bridgeDeckReference:'terrain',tiles:[]};
function route(id='way/123',kind='primary',z=500){return{id,kind,oneway:0,forward:1,backward:1,width:7,speed:15,bridge:false,tunnel:false,points:[11000,14000,17000].map(x=>{const p=airport.unproject(x,z);return[p.longitude,p.latitude,0];})};}
function prepared(r=route(),m=manifest){return prepareRegionalRoute(r,airport,m,()=>0);}
function cache(){const map=new Map();return{map,get:async(n,k)=>map.get(n+'|'+k)??null,getArrays:async(n,k)=>map.get(n+'|'+k)??null,put:async(n,k,v)=>{map.set(n+'|'+k,v);return true;},putArrays:async(n,k,v)=>{map.set(n+'|'+k,v);return true;},remove:async(n,k)=>map.delete(n+'|'+k)};}
async function fixture(fn){
 const tile={schema:1,airportId:'lax',id:'3:0',bounds:[12000,0,16000,4000],routes:[route()],pieces:[[0,1000,5000]]},raw=Buffer.from(JSON.stringify(tile)),packed=gzipSync(raw),record={id:tile.id,bounds:tile.bounds,path:'assets/cities/lax/traffic-region-v1/3_0-fixture.json.gz',bytes:packed.length,decodedBytes:raw.length,sha256:createHash('sha256').update(packed).digest('hex'),decodedSha256:createHash('sha256').update(raw).digest('hex'),routes:1,pieces:1},m={...manifest,tiles:[record]},original=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(url);return String(url).includes('.json.gz')?new Response(packed):Response.json(m);};
 try{return await fn({calls,tile,manifest:m,packed});}finally{globalThis.fetch=original;}
}

test('tile selection follows the plane across the city independently of camera and retains a bounded prefetch footprint',()=>{
 const tiles=[];for(let x=-8;x<8;x++)for(let z=-8;z<8;z++)tiles.push({id:x+':'+z,bounds:[x*4000,z*4000,(x+1)*4000,(z+1)*4000]});
 const near=selectRegionalTiles({...manifest,tiles},{x:0,z:0}),away=selectRegionalTiles({...manifest,tiles},{x:18000,z:500},{x:100,z:0});assert(near.length<=28&&away.length<=28);assert(away.some(t=>t.id===regionalTileId(18000,500)));assert(!away.some(t=>t.id==='0:0'));assert(away.some(t=>t.bounds[0]>18000));assert(!near.some(t=>t.id==='5:0'));
});
test('regional cars beyond the old airport radius preserve their identities and trajectories through tile eviction and revisits',()=>{
 let time=0;const flow=createRegionalFlow({clock:()=>time,manifest}),r=prepared();flow.add(r);flow.update({x:13000,z:500},true);assert(flow.vehicles.length>10);const v=flow.vehicles[3],id=v.id,shape=[v.type,v.color],before=flow.pose(v);
 assert(Math.hypot(before.x-manifest.center[0],before.z-manifest.center[1])>6000);flow.update({x:-15000,z:0},true);assert.equal(flow.vehicles.length,0);time=7;flow.update({x:13000,z:500},true);assert(flow.vehicles.includes(v));const progressed=flow.pose(v);assert(Math.hypot(progressed.x-before.x,progressed.z-before.z)>10);
 const frozen=flow.pose(v);flow.update({x:13000,z:500},true);assert.deepEqual(flow.pose(v),frozen);flow.remove(r.id);flow.add(prepared());flow.update({x:13000,z:500},true);const recovered=flow.vehicles.find(c=>c.id===id);assert(recovered);assert.deepEqual([recovered.type,recovered.color],shape);assert.deepEqual(flow.pose(recovered),progressed);
});
test('minor roads thin at distance while arterials remain populated and fleet selection stays bounded',()=>{
 let time=11;const flow=createRegionalFlow({clock:()=>time,manifest,maxVehicles:60});for(let i=0;i<20;i++)flow.add(prepared(route('way/'+(1000+i),i%2?'residential':'primary',500+i*80)));flow.update({x:13000,z:500},true);assert.equal(flow.vehicles.length,60);
 for(const v of flow.vehicles){const p=flow.pose(v);assert(p.fade>=0&&p.fade<=1);assert(Math.hypot(p.x-13000,p.z-500)<(v.major?6500:2500));}
});
test('lane handedness and clipped road intervals remain registered across neighboring tiles',()=>{
 const r=prepared(route()),l=prepared(route(),{...manifest,drivingSide:'left'});assert(r.lanes[0].positions[2]>500);assert(l.lanes[0].positions[2]<500);
 const tile={id:'3:0',routes:[route()],pieces:[[0,1000,5000]]},graph=regionalSurfaceGraph(tile,new Map([[r.id,r]]),airport,manifest),p=graph.roads[0].path.positions;assert(Math.abs(p[0]-12000)<.02);assert(Math.abs(p.at(-3)-16000)<.02);assert(graph.source.ground.length>0);
});
test('a retained instanced vehicle pool accepts a changing local fleet without rebuilding shared models',()=>{
 let time=0;const flow=createRegionalFlow({clock:()=>time,manifest,maxVehicles:80}),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(50,1.5,1,10000);camera.position.set(13000,500,1200);camera.lookAt(13000,0,500);const renderer=createVehicleRenderer(root,flow,{capacity:80,maxDistance:8500}),identities=root.children.map(m=>m.geometry);flow.add(prepared());flow.update({x:13000,z:500},true);renderer.update(camera);assert(renderer.stats().visible>0);assert(renderer.stats().drawCalls<=10);flow.update({x:-10000,z:0},true);renderer.update(camera);assert.equal(renderer.stats().visible,0);flow.update({x:13000,z:500},true);renderer.update(camera);assert(renderer.stats().visible>0);root.children.forEach((m,i)=>assert.equal(m.geometry,identities[i]));renderer.dispose();assert.equal(root.children.length,0);
});
test('regional geometry caches survive reload, storage denial and cancellation without installing partial scenery',async()=>fixture(async({calls})=>{
 const stored=cache(),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(45,1.5,1,60000);camera.position.set(13000,500,500);camera.lookAt(13000,0,100);let time=0;const options={root,airport,camera,cache:stored,clock:()=>time};let world=await loadRegionalTraffic(options);assert(world.stats().loadedTiles===1);assert(world.stats().vehicles>0);assert(world.stats().surfaceTriangles>0);assert.equal(world.stats().cacheHits,0);const pose=world.flow.pose(world.flow.vehicles[0]);assert([...world.index.candidates({x:pose.x-10,y:pose.y+.8,z:pose.z},{x:pose.x+10,y:pose.y+.8,z:pose.z},20,20)].some(o=>o.kind==='vehicle'));world.dispose();assert.equal(root.children.length,0);const sourceCalls=calls.filter(u=>u.includes('.json.gz')).length;
 world=await loadRegionalTraffic(options);assert.equal(world.stats().cacheHits,1);assert.equal(calls.filter(u=>u.includes('.json.gz')).length,sourceCalls);world.dispose();
 const denied={get:async()=>null,getArrays:async()=>null,put:async()=>false,putArrays:async()=>false,remove:async()=>false};world=await loadRegionalTraffic({...options,cache:denied});assert(world.stats().vehicles>0);world.dispose();
 await assert.rejects(loadRegionalTraffic({...options,isCurrent:()=>false}),{name:'AbortError'});assert.equal(root.children.length,0);
}));

test('cancelled asynchronous regional downloads cannot publish late models',async()=>fixture(async({packed})=>{
 const original=globalThis.fetch;let complete;globalThis.fetch=url=>String(url).includes('.json.gz')?new Promise(resolve=>{complete=resolve;}):original(url);
 const root=new THREE.Group(),camera=new THREE.PerspectiveCamera();camera.position.set(13000,500,500);let current=true;
 try{const task=loadRegionalTraffic({root,airport,camera,cache:cache(),clock:()=>0,isCurrent:()=>current});while(!complete)await new Promise(r=>setTimeout(r,1));current=false;await assert.rejects(task,{name:'AbortError'});assert.equal(root.children.length,0);complete(new Response(packed));await new Promise(r=>setTimeout(r,40));assert.equal(root.children.length,0);}finally{globalThis.fetch=original;}
}));
test('streaming upgrades a nearby district without removing its existing cars, and uses plane position instead of the camera',async()=>{
 const road=route(),minor=route('way/987','residential',900),tiles=[{schema:1,airportId:'lax',id:'2:0',bounds:[8000,0,12000,4000],routes:[road,minor],pieces:[[0,0,1000],[1,0,1000]]},{schema:1,airportId:'lax',id:'3:0',bounds:[12000,0,16000,4000],routes:[road,minor],pieces:[[0,1000,5000],[1,1000,5000]]}],blobs=new Map(),records=tiles.map(t=>{const raw=Buffer.from(JSON.stringify(t)),blob=gzipSync(raw),path='assets/cities/lax/traffic-region-v1/'+t.id+'.json.gz';blobs.set('/'+path,blob);return{id:t.id,bounds:t.bounds,path,bytes:blob.length,decodedBytes:raw.length,sha256:createHash('sha256').update(blob).digest('hex'),decodedSha256:createHash('sha256').update(raw).digest('hex'),routes:t.routes.length,pieces:t.pieces.length};}),m={...manifest,tiles:records},original=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('.json.gz')?new Response(blobs.get(String(url).split('?')[0])):Response.json(m);
 const root=new THREE.Group(),camera=new THREE.PerspectiveCamera(45,1.5,1,60000);camera.position.set(9000,500,500);camera.lookAt(12000,0,500);let time=0,world;
 try{world=await loadRegionalTraffic({root,airport,camera,cache:cache(),clock:()=>time});assert.equal(world.stats().majorOnlyTiles,1);const v=world.flow.vehicles.find(v=>v.major&&world.flow.pose(v).x>12000);assert(v);const x=world.flow.pose(v).x;time=2;world.update(camera,{position:{x:13000,y:500,z:500},velocity:{x:100,z:0}});assert.equal(world.stats().focus.x,13000);assert.equal(world.stats().loadedTiles,2);await world.settled();assert.equal(world.stats().fullDetailTiles,2);const same=world.flow.vehicles.find(c=>c.id===v.id);assert.equal(same,v);assert(world.flow.pose(v).x!==x);}finally{world?.dispose();globalThis.fetch=original;}
 assert.equal(root.children.length,0);
});
for(const id of ['lax','xiaoshan','changi','jfk','kansai','daxing'])test(id+': genuine road data exists well beyond the former airport radius',async()=>{
 const a=airportOf(id),m=JSON.parse(await readFile(new URL(`../../public/assets/cities/${id}/traffic-region-v1.json`,import.meta.url))),tile=m.tiles.filter(t=>Math.hypot((t.bounds[0]+t.bounds[2])/2-m.center[0],(t.bounds[1]+t.bounds[3])/2-m.center[1])>12000).sort((x,y)=>y.routes-x.routes)[0];assert(tile);const t=JSON.parse(gunzipSync(await readFile(new URL('../../public/'+tile.path,import.meta.url))));assert(t.routes.length>0);assert(m.tiles.length>30);assert.equal(m.drivingSide,['changi','kansai'].includes(id)?'left':'right');
 let found=false;for(const [i,start,end]of t.pieces.slice(0,100)){const r=prepareRegionalRoute(t.routes[i],a,m,()=>0),part=regionalSurfaceGraph({...t,pieces:[[i,start,end]]},new Map([[r.id,r]]),a,m);if(part.roads.length&&r.lanes.some(l=>l.length>30)){found=true;const p=part.roads[0].path.positions;assert(p.every(Number.isFinite));break;}}assert(found);
});
