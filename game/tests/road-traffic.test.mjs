import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {airportOf} from '../src/airports/registry.js';
import {surfaceHeight} from '../src/terrain/heightfield.js';
import {buildRoadGraph,sampleRoadPath,TRAFFIC_PROFILES} from '../src/airports/road-data.js';
import {createRoadTraffic,trafficGreen,VEHICLE_TYPES} from '../src/airports/road-traffic.js';
import {prepareRoadSurfaces,createRoadMeshes} from '../src/airports/road-meshes.js';
import {createVehicleRenderer,vehicleTemplate} from '../src/airports/road-vehicles.js';
import {createRoadObstacleIndex} from '../src/airports/road-obstacles.js';
import {loadRoadSource,loadRoadWorld} from '../src/airports/road-world.js';
import {installRoadTraffic,cityRay,sweptCityContact} from '../src/terrain/city-obstacles.js';
import {t} from '../src/i18n/index.js';
import {createFlight,advanceFlight} from '../src/flight.js';
import {pilotInput} from './pilot.mjs';
const airport={id:'trafficfixture',runway:{heading:0},data:{dem:{heights:[0]}},grading:{},elevationM:0,project:(x,z)=>({x,z}),unproject:(x,z)=>({longitude:x,latitude:z})};
function fixture(){return{schema:1,airportId:airport.id,fingerprint:'fixture',center:[150,-150],radius:1000,frame:{threshold:[0,0],heading:0},nodes:[[1,0,0,0,''],[2,0,-300,0,''],[3,300,-300,0,''],[4,300,0,0,'']],edges:[[0,1],[1,2],[2,3],[3,0]].map((nodes,i)=>({id:'loop/'+i,way:i+1,nodes,kind:'primary',oneway:1,forward:2,backward:0,width:7,speed:15,bridge:false,tunnel:false})),restrictions:[],ground:[[[[-4,-304],[304,-304],[304,4],[-4,4],[-4,-304]],[[4,-296],[4,-4],[296,-4],[296,-296],[4,-296]]]]};}
const graphOf=source=>buildRoadGraph(source||fixture(),airport,{heightAt:()=>0});
function surfaces(graph,heightAt=()=>0){const it=prepareRoadSurfaces(graph,heightAt);let s;while(!(s=it.next()).done){}return s.value;}
function memoryCache(){const values=new Map();return{values,get:async(ns,k)=>values.get(ns+'|'+k)??null,put:async(ns,k,v)=>{values.set(ns+'|'+k,v);return true;},remove:async(ns,k)=>values.delete(ns+'|'+k),getArrays:async(ns,k)=>values.get(ns+'|'+k)??null,putArrays:async(ns,k,v)=>{values.set(ns+'|'+k,v);return true;}};}
async function sourceFetch(source,fn){
 const blob=gzipSync(JSON.stringify(source)),sha256=createHash('sha256').update(blob).digest('hex'),manifest={schema:1,airportId:source.airportId,path:'assets/cities/lax/fixture.json.gz',bytes:blob.length,decodedBytes:Buffer.byteLength(JSON.stringify(source)),decodedSha256:createHash('sha256').update(JSON.stringify(source)).digest('hex'),sha256,fingerprint:source.fingerprint},calls=[],original=globalThis.fetch;
 globalThis.fetch=async url=>{calls.push(url);return String(url).includes('.gz')?new Response(blob):Response.json(manifest);};
 try{return await fn({manifest,calls});}finally{globalThis.fetch=original;}
}
test('directed lanes respect reverse one-way, right-hand traffic, true node connections and turn restrictions',()=>{
 const source=fixture();source.edges[0].oneway=0;source.edges[0].backward=1;source.edges[0].width=10;source.edges[1].oneway=-1;
 const graph=graphOf(source),forward=graph.lanes[0],backward=graph.lanes[2],a=sampleRoadPath(forward,0),b=sampleRoadPath(backward,0);
 assert(a.x>0);assert(b.x<0);assert.equal(forward.to,1);assert.equal(backward.to,0);assert.equal(graph.roads[1].lanes.length,2);assert(graph.roads[1].lanes.every(i=>graph.lanes[i].reverse));
 assert.equal(graph.options[forward.id].length,0); // the neighbouring reverse one-way is incoming
 const restricted=fixture();restricted.restrictions=[[1,2,2,'no_right_turn']];assert.equal(graphOf(restricted).options[0].length,0);
 const ordinary=graphOf();const connection=ordinary.connector(0,2),end=sampleRoadPath(ordinary.lanes[0],ordinary.lanes[0].length),start=sampleRoadPath(ordinary.lanes[2],0),c0=sampleRoadPath(connection,0),c1=sampleRoadPath(connection,connection.length);
 assert(Math.hypot(end.x-c0.x,end.z-c0.z)<.0001);assert(Math.hypot(start.x-c1.x,start.z-c1.z)<.0001);assert(connection.length>1);assert(connection.speed<ordinary.lanes[0].speed);
});
test('left-hand regions mirror lane positions, turn-lane ordering and asymmetric white lane markings',()=>{
 const source=fixture();source.edges[0].oneway=0;source.edges[0].backward=1;source.edges[0].width=11;for(let i=1;i<source.edges.length;i++)source.edges[i].kind='residential';
 const right=graphOf(source);source.drivingSide='left';const left=graphOf(source);assert.equal(left.hand,-1);assert.equal(right.hand,1);
 for(const id of left.roads[0].lanes){assert.equal(Math.sign(sampleRoadPath(left.lanes[id],10).x),-Math.sign(sampleRoadPath(right.lanes[id],10).x));assert.equal(left.lanes[id].reverse,right.lanes[id].reverse);}
 const prepared=surfaces(left),p=prepared.arrays.roadPaint,tint=prepared.arrays.roadPaintTint;assert(p.length>0);assert(Math.min(...p.filter((_,i)=>i%3===0))< -3);assert(Math.max(...p.filter((_,i)=>i%3===0))<.1);for(let i=0;i<tint.length;i+=3)assert(Math.abs(tint[i]-tint[i+1])<1e-6);
 const traffic=createRoadTraffic(left);traffic.advanceTo(60);assert.equal(traffic.stats().parked,0);assert(traffic.stats().transitions>0);
});
test('coastal bridge decks stay above the water and share the airport datum with their cars',()=>{
 const source=fixture();source.bridgeDeckReference='airport';source.nodes[0][3]=source.nodes[1][3]=8;source.edges[0].bridge=true;
 const graph=buildRoadGraph(source,airport,{heightAt:()=>-8}),p=sampleRoadPath(graph.roads[0].path,100);assert(Math.abs(p.y-8.055)<.0001);const lane=sampleRoadPath(graph.lanes[0],100);assert.equal(lane.y,p.y);assert.equal(graph.nodes[0].lift,16);
 const prepared=surfaces(graph,()=>-8);assert(prepared.obstacles.some(o=>o.kind==='bridge'&&o.topY>=8));
});
test('cars keep stable identities and continuous paths, follow without overlap, and survive short links',()=>{
 const source=fixture();source.nodes.push([5,5,-300,0,'']);source.edges[1].nodes=[1,4];source.edges.push({...source.edges[1],id:'short-continuation',way:8,nodes:[4,2]});
 const traffic=createRoadTraffic(graphOf(source),{densityScale:2}),reference=traffic.vehicles.map(v=>[v,v.seed,v.color]),previous=new Map();assert(traffic.vehicles.length>5);
 for(let step=0;step<1200;step++){
  traffic.advanceTo((step+1)*.1);const lanes=new Map();
  for(const v of traffic.vehicles){const p=traffic.pose(v);assert(Object.values(p).every(Number.isFinite));if(previous.has(v.id))assert(Math.hypot(p.x-previous.get(v.id).x,p.z-previous.get(v.id).z)<5);previous.set(v.id,p);
   if(v.phase==='lane'){if(!lanes.has(v.lane))lanes.set(v.lane,[]);lanes.get(v.lane).push(v);}}
  for(const cars of lanes.values()){cars.sort((a,b)=>a.s-b.s);for(let j=1;j<cars.length;j++)assert(cars[j].s-cars[j-1].s>=(cars[j].length+cars[j-1].length)/2-.02);}
 }
 assert.equal(traffic.stats().parked,0);assert(traffic.stats().transitions>100);for(const[v,seed,color]of reference){assert(traffic.vehicles.includes(v));assert.equal(v.seed,seed);assert.equal(v.color,color);}
});
test('sub-metre source splits do not create reversing connector loops',()=>{
 const source=fixture();source.nodes.push([5,.2,-300,0,''],[6,.4,-300,0,'']);source.edges[1].nodes=[1,4];source.edges.push({...source.edges[1],id:'tiny',way:8,nodes:[4,5]},{...source.edges[1],id:'continuation',way:9,nodes:[5,2]});
 const graph=graphOf(source),connection=graph.connector(graph.roads[1].lanes[0],graph.roads[4].lanes[0]);let previous=-Infinity;
 for(let j=0;j<=100;j++){const p=sampleRoadPath(connection,connection.length*j/100);assert(p.x>=previous-.000001);previous=p.x;}assert(connection.length<.2);
});
test('source signal axes alternate; simulation pause and presentation clocks do not reset traffic',()=>{
 const graph=graphOf(),node={...graph.nodes[1],control:'traffic_signals'},vertical=graph.lanes[0],horizontal=graph.lanes[2];
 for(let sec=0;sec<120;sec++)assert(!(trafficGreen(node,vertical,sec)&&trafficGreen(node,horizontal,sec)));
 assert(Array.from({length:60},(_,i)=>trafficGreen(node,vertical,i)).some(Boolean));
 const traffic=createRoadTraffic(graph);traffic.sync(100);traffic.sync(101);assert.equal(traffic.clock,1);const p=traffic.pose(traffic.vehicles[0]);traffic.sync(101);assert.deepEqual(traffic.pose(traffic.vehicles[0]),p);traffic.sync(101,0);traffic.sync(101,2);assert.equal(traffic.clock,3);traffic.sync(104);assert.equal(traffic.clock,6);traffic.sync(10000);assert.equal(traffic.clock,6);
 assert(TRAFFIC_PROFILES.motorway.density>TRAFFIC_PROFILES.primary.density);assert(TRAFFIC_PROFILES.primary.density>TRAFFIC_PROFILES.residential.density);assert(TRAFFIC_PROFILES.residential.density>TRAFFIC_PROFILES.service.density);
});
test('prepared graph reuse rejects partial/nonfinite arrays and reproduces original lane geometry',()=>{
 const graph=graphOf(),snapshot=graph.snapshot(),restored=buildRoadGraph(fixture(),airport,{heightAt:()=>{throw Error('must reuse');},prepared:snapshot});assert(restored.prepared);assert.deepEqual(restored.snapshot(),snapshot);
 const invalid={...snapshot,lanePositions:snapshot.lanePositions.slice()};invalid.lanePositions[0]=NaN;assert(!buildRoadGraph(fixture(),airport,{heightAt:()=>0,prepared:invalid}).prepared);
 assert(!buildRoadGraph(fixture(),airport,{heightAt:()=>0,prepared:{...snapshot,laneRanges:new Uint32Array(2)}}).prepared);
 const shifted=fixture();shifted.frame.threshold=[1,0];assert.throws(()=>graphOf(shifted),/frame mismatch/);
});
test('road surfaces conform to terrain triangles, preserve holes, and share raised bridge dimensions with contact',()=>{
 const source=fixture();source.nodes[0][3]=source.nodes[1][3]=6;source.edges[0].bridge=true;const graph=graphOf(source),heightAt=(x,z)=>Math.max(0,x+z-250)*.1,prepared=surfaces(graph,heightAt),p=prepared.arrays.roadGround;
 for(let i=0;i<p.length;i+=9){const x=(p[i]+p[i+3]+p[i+6])/3,z=(p[i+2]+p[i+5]+p[i+8])/3,y=(p[i+1]+p[i+4]+p[i+7])/3;assert(Math.abs(y-heightAt(x,z)-.055)<.0001);assert(!(x>4&&x<296&&z> -296&&z< -4));}
 assert(prepared.obstacles.some(o=>o.id.includes('/deck/')));assert(prepared.obstacles.every(o=>o.topY>=o.baseY));
 const root=new THREE.Group(),meshes=createRoadMeshes(root,prepared.arrays);assert(root.children.length>=4&&root.children.length<20);assert(meshes.triangles<5000);meshes.dispose();assert.equal(root.children.length,0);
});
test('shared vehicle LOD models retain geometry across camera reversals and point their nose along travel',()=>{
 const traffic=createRoadTraffic(graphOf()),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(50,1.6,.1,6000),renderer=createVehicleRenderer(root,traffic),identities=root.children.map(m=>m.geometry);
 camera.position.set(140,300,180);camera.lookAt(150,0,-150);camera.updateMatrixWorld();renderer.update(camera);assert(renderer.stats().visible>0);assert(renderer.stats().drawCalls<=10);
 const matrix=new THREE.Matrix4(),front=new THREE.Vector3(0,0,-1);for(const mesh of root.children)if(mesh.count){mesh.getMatrixAt(0,matrix);front.set(0,0,-1).transformDirection(matrix);assert(front.length()>.99);}
 camera.lookAt(1000,1000,5000);renderer.update(camera);camera.lookAt(150,0,-150);renderer.update(camera);root.children.forEach((m,i)=>assert.equal(m.geometry,identities[i]));renderer.dispose();assert.equal(root.children.length,0);
 for(let i=0;i<VEHICLE_TYPES.length;i++){const near=vehicleTemplate(i),far=vehicleTemplate(i,false);assert(near.attributes.position.count>far.attributes.position.count);near.computeBoundingBox();assert(near.boundingBox.max.y<=VEHICLE_TYPES[i].height+.01);near.dispose();far.dispose();}
 const one={vehicles:[{...VEHICLE_TYPES[0],type:0,color:0xffffff}],clock:0,pose:(v,out)=>Object.assign(out,{x:0,y:0,z:0,yaw:Math.PI/2,pitch:0,fade:1})},single=createVehicleRenderer(root,one);camera.position.set(20,20,20);camera.lookAt(0,0,0);single.update(camera);const mesh=root.children.find(m=>m.count);mesh.getMatrixAt(0,matrix);front.set(0,0,-1).transformDirection(matrix);assert(front.x>.999);single.dispose();
});
test('road contacts use rendered car poses and accepted-world ownership, independently of LOD',()=>{
 const graph=graphOf(),traffic=createRoadTraffic(graph),index=createRoadObstacleIndex(graph,traffic,[]),remove=installRoadTraffic(index),p=traffic.pose(traffic.vehicles[0]),a={airportId:airport.id,time:0,x:p.x-30,y:p.y+.8,z:p.z,yaw:0,pitch:0,roll:0},b={...a,x:p.x+30};
 const hit=cityRay(a,b,airport.id);assert.equal(hit?.obstacle.kind,'vehicle');const contact=sweptCityContact(a,b);assert.equal(contact.obstacleKind,'vehicle');assert.equal(cityRay(a,b,'changi'),null);
 const replacement=installRoadTraffic(index);remove();assert(cityRay(a,b,airport.id));replacement();assert.equal(cityRay(a,b,airport.id),null);
});
test('compressed self-hosted sources reuse local blobs, recover corrupt cache and support offline metadata',async()=>sourceFetch(fixture(),async({calls})=>{
 const cache=memoryCache(),options={airport,path:'assets/cities/lax/fixture.json',cache};await loadRoadSource(options);assert.equal(calls.length,2);await loadRoadSource(options);assert.equal(calls.length,3);
 for(const k of cache.values.keys())if(k.includes('|roads/'))cache.values.set(k,new Blob(['broken']));await loadRoadSource(options);assert.equal(calls.length,5);
 const online=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline');};try{const cached=await loadRoadSource(options);assert.equal(cached.source.fingerprint,'fixture');}finally{globalThis.fetch=online;}
 await assert.rejects(loadRoadSource({...options,isCurrent:()=>false}),{name:'AbortError'});
}));
test('HTTP gzip decoding verifies decoded identity and remains locally reusable',async()=>sourceFetch(fixture(),async({manifest})=>{
 const original=globalThis.fetch;globalThis.fetch=async url=>String(url).includes('.gz')?new Response(JSON.stringify(fixture()),{headers:{'Content-Encoding':'gzip'}}):Response.json(manifest);
 try{const cache=memoryCache(),options={airport,path:'assets/cities/lax/fixture.json',cache};assert.equal((await loadRoadSource(options)).source.fingerprint,'fixture');assert.equal((await loadRoadSource(options)).source.fingerprint,'fixture');}finally{globalThis.fetch=original;}
}));
test('processed road caches require complete geometry and metadata; cancelled loads never install models',async()=>sourceFetch(fixture(),async()=>{
 const cache=memoryCache(),root=new THREE.Group(),options={root,airport,path:'assets/cities/lax/fixture.json',cache};let world=await loadRoadWorld(options);assert(!world.sourceCacheHit);assert(world.woodlandExclusions.length===4);world.dispose();assert.equal(root.children.length,0);
 world=await loadRoadWorld(options);assert(world.sourceCacheHit);world.dispose();for(const k of cache.values.keys())if(k.endsWith('|metadata'))cache.values.delete(k);
 world=await loadRoadWorld(options);assert(!world.sourceCacheHit);world.dispose();await assert.rejects(loadRoadWorld({...options,isCurrent:()=>false}),{name:'AbortError'});assert.equal(root.children.length,0);
}));
test('actual LAX source contains distinct class traffic, junction restrictions and no vehicle-only-airport roads',async()=>{
 const source=JSON.parse(gunzipSync(await readFile(new URL('../../public/assets/cities/lax/traffic-v1.source.json.gz',import.meta.url)))),graph=buildRoadGraph(source,airportOf('lax')),traffic=createRoadTraffic(graph),stats=traffic.stats();
 assert.equal(graph.roads.length,20631);assert(source.restrictions.length>500);assert(source.nodes.some(n=>n[4]==='traffic_signals'));assert(stats.vehicles>2500&&stats.vehicles<=3600);assert(stats.byClass.motorway>300);assert(stats.byClass.residential>100);assert.equal(stats.parked,0);
 for(const e of source.edges){assert(!['private','no'].includes(e.tags?.access));assert(!['parking_aisle','driveway'].includes(e.tags?.service));}
});
test('LAX departure and landing remain physically clear with actual bridge and vehicle contacts installed',async()=>{
 const source=JSON.parse(gunzipSync(await readFile(new URL('../../public/assets/cities/lax/traffic-v1.source.json.gz',import.meta.url)))),a=airportOf('lax'),graph=buildRoadGraph(source,a),prepared=surfaces(graph,(x,z)=>surfaceHeight(x,z,'lax'));
 for(const kind of ['takeoff','landing']){
  const traffic=createRoadTraffic(graph),remove=installRoadTraffic(createRoadObstacleIndex(graph,traffic,prepared.obstacles),'lax');
  try{const s=createFlight(null,{levelId:'lax-'+kind});for(let i=0;i<80000&&!s.result;i++)advanceFlight(s,pilotInput(s),.02);assert(s.result?.levelCleared,JSON.stringify({kind,result:s.result,impact:s.impact}));}finally{remove();}
 }
});
test('vehicle and overpass impact messages are bilingual',()=>{for(const text of['撞击车辆','撞击高架道路','飞机已在车辆接触位置停止。注意地面道路，保持安全间隔。','飞机已在高架道路接触位置停止。注意前方障碍，保持安全高度并提前响应 TERRAIN / PULL UP。'])assert(!/\p{Script=Han}/u.test(t(text,'en')));});
