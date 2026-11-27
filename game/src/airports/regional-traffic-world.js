import * as THREE from 'three';
import {surfaceHeight} from '../terrain/heightfield.js';
import {trafficHash} from './road-data.js';
import {createVehicleRenderer} from './road-vehicles.js';
import {prepareRoadSurfaces,createRoadMeshes} from './road-meshes.js';
import {createRoadObstacleIndex} from './road-obstacles.js';
import {createRegionalFlow} from './regional-traffic-flow.js';
import {REGION_MODEL_REVISION,selectRegionalTiles,regionalTileId,loadRegionalManifest,loadRegionalTile,prepareRegionalRoute,regionalSurfaceGraph} from './regional-traffic-data.js';

const pause=()=>new Promise(r=>setTimeout(r,0));
function validGeometry(a,m){return !!a&&Number.isFinite(m?.maxY)&&Array.isArray(m?.obstacles)&&m.obstacles.every(o=>['cx','cz','angle','width','depth','baseY','topY'].every(k=>Number.isFinite(o[k]))&&o.width>0&&o.depth>0&&o.topY>=o.baseY)&&['roadGround','roadDecks','roadConcrete','roadPaint'].every(k=>a[k] instanceof Float32Array&&a[k].length%9===0&&a[k].every(Number.isFinite))&&a.roadPaintDistance instanceof Float32Array&&a.roadPaintDistance.length===a.roadPaint.length/3&&a.roadPaintDistance.every(Number.isFinite)&&a.roadPaintTint instanceof Float32Array&&a.roadPaintTint.length===a.roadPaint.length&&a.roadPaintTint.every(Number.isFinite);}
export async function loadRegionalTraffic({root,airport,cache,sourceCache=cache,isCurrent=()=>true,onChange=()=>{},camera,clock,onProgress=()=>{}}){
 const manifest=await loadRegionalManifest(airport,airport.region?.regionalTrafficManifestPath||`assets/cities/${airport.id}/traffic-region-v1.json`,sourceCache),terrainKey=trafficHash(JSON.stringify([airport.data.dem,airport.grading,airport.elevationM,...(airport.region?[airport.region.revision]:[])])),namespace=`${airport.id}:regional-roads:${REGION_MODEL_REVISION}:${manifest.identity}:${terrainKey}`;
 const group=new THREE.Group();group.name=airport.id+'-regional-traffic';root.add(group);
 const entries=new Map(),pending=new Map(),tiers=new Map(),routeRefs=new Map(),routes=new Map(),wanted=new Set(),failures=new Map(),heightAt=(x,z)=>surfaceHeight(x,z,airport.id),recordById=new Map(manifest.tiles.map(t=>[t.id,t])),position={x:camera?.position.x??manifest.center[0],y:camera?.position.y??0,z:camera?.position.z??manifest.center[1]};
 let disposed=false,active=0,revision=0,lastFocus='',unavailable=0,cacheHits=0,index=null,indexDirty=true,lastUsed=0;
 const current=()=>!disposed&&isCurrent(),flow=createRegionalFlow({clock,manifest,contains:(x,z,car)=>{const e=entries.get(regionalTileId(x,z));return e?.ready===true&&(car.major||e.tier==='full')&&x>=e.record.bounds[0]&&x<=e.record.bounds[2]&&z>=e.record.bounds[1]&&z<=e.record.bounds[3];}}),vehicles=createVehicleRenderer(group,flow,{capacity:3600,maxDistance:8500,viewportHeight:()=>globalThis.innerHeight||600});
 function release(e){
  if(e.released)return;e.released=true;
  e.surfaces?.dispose();e.group?.removeFromParent();for(const id of e.routeIds||[]){const n=(routeRefs.get(id)||1)-1;if(n){routeRefs.set(id,n);}else{routeRefs.delete(id);routes.delete(id);flow.remove(id);}}
  if(entries.get(e.record.id)===e)entries.delete(e.record.id);indexDirty=true;revision++;
 }
 function prune(){
  const old=[...entries.values()].filter(e=>e.ready&&!wanted.has(e.record.id)).sort((a,b)=>a.used-b.used);
  let bytes=[...entries.values()].reduce((n,e)=>n+(e.surfaces?.bytes||0),0);while((entries.size>32||bytes>80*1024*1024)&&old.length){const e=old.shift();bytes-=e.surfaces.bytes;release(e);}
 }
 async function prepare(record,tier){
  const previous=entries.get(record.id),e={record,tier,ready:false,used:++lastUsed,routeIds:[]};if(!previous)entries.set(record.id,e);pending.set(record.id,e);active++;
  try{
   const tile=await loadRegionalTile(record,airport,sourceCache,current);if(!current())return;
   const include=r=>tier==='full'||!['residential','unclassified','living_street','service'].includes(r.kind),key=record.id+'/'+tier;
   for(const r of tile.routes){if(!include(r))continue;if(!routes.has(r.id)){const prepared=prepareRegionalRoute(r,airport,manifest,heightAt,{lazyLanes:true});routes.set(r.id,prepared);flow.add(prepared);}routeRefs.set(r.id,(routeRefs.get(r.id)||0)+1);e.routeIds.push(r.id);}
   let arrays=await cache.getArrays(namespace,key+'/prepared',{isCurrent:current}),metadata=await cache.get(namespace,key+'/metadata');
   if(!validGeometry(arrays,metadata)){
    const graph=regionalSurfaceGraph({...tile,pieces:tile.pieces.filter(([i])=>include(tile.routes[i]))},routes,airport,manifest,heightAt),steps=prepareRoadSurfaces(graph,heightAt);let step,last=performance.now();
    while(!(step=steps.next()).done){if(!current())return;if(performance.now()-last>10){await pause();last=performance.now();}}
    arrays=step.value.arrays;metadata={obstacles:step.value.obstacles,maxY:0};for(const a of ['roadGround','roadDecks','roadConcrete'])for(let j=1;j<arrays[a].length;j+=3)metadata.maxY=Math.max(metadata.maxY,arrays[a][j]);
    cache.putArrays(namespace,key+'/prepared',arrays,{isCurrent:current});cache.put(namespace,key+'/metadata',metadata);
   }else cacheHits++;
   if(!current())return;
   const tileRoot=new THREE.Group();tileRoot.name='regional-roads/'+record.id;group.add(tileRoot);e.group=tileRoot;e.surfaces=createRoadMeshes(tileRoot,arrays);e.metadata=metadata;e.ready=true;entries.set(record.id,e);if(previous)release(previous);indexDirty=true;revision++;
   flow.update(position,true);onChange();prune();
  }catch(error){
   if(current()){unavailable++;failures.set(record.id,performance.now()+15000);}
   release(e);
  }finally{
   active--;pending.delete(record.id);if(!current()&&(!e.ready||entries.get(record.id)===e))release(e);pump();
  }
 }
 function pump(){
  if(!current())return;
  for(const id of wanted){if(active>=2)break;const e=entries.get(id),tier=tiers.get(id);if(pending.has(id)||e?.ready&&(e.tier==='full'||e.tier===tier)||(failures.get(id)||0)>performance.now())continue;const record=recordById.get(id);if(record)prepare(record,tier);}
 }
 function focus(p,velocity){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))return;
  position.x=p.x;position.y=p.y||0;position.z=p.z;
  const key=Math.floor(p.x/500)+':'+Math.floor(p.z/500)+':'+Math.round((velocity?.x||0)/30)+':'+Math.round((velocity?.z||0)/30);
  if(key!==lastFocus){lastFocus=key;wanted.clear();tiers.clear();for(const t of selectRegionalTiles(manifest,p,velocity)){wanted.add(t.id);const b=t.bounds,d=Math.hypot(Math.max(b[0]-p.x,0,p.x-b[2]),Math.max(b[1]-p.z,0,p.z-b[3]));tiers.set(t.id,d<3000?'full':'major');}for(const id of wanted)if(entries.has(id))entries.get(id).used=++lastUsed;prune();}
  pump();flow.update(position);
 }
 function obstacleIndex(){
  if(!indexDirty&&index)return index;indexDirty=false;const points=[],obstacles=[];
  for(const e of entries.values())if(e.ready){const [x,z,xx,zz]=e.record.bounds;for(let a=x;a<=xx;a+=180)for(let b=z;b<=zz;b+=180)points.push(a,e.metadata.maxY+4,b);obstacles.push(...e.metadata.obstacles);}
  index=createRoadObstacleIndex({airportId:airport.id,roads:[{width:130,path:{positions:new Float32Array(points)}}]},flow,obstacles);return index;
 }
 async function settled(){
  while(current()&&(active||[...wanted].some(id=>!entries.has(id)&&!(failures.get(id)>performance.now())))){pump();await new Promise(r=>setTimeout(r,10));}
 }
 focus(position);
 try{
  // Starting landing positions can be 22km from the airport. Prepare the first
  // footprint before ready instead of revealing an empty city below the plane.
  let fraction=0;while(current()&&active){onProgress({fraction:Math.min(.99,fraction+=.015)});await new Promise(r=>setTimeout(r,15));}
  if(!current())throw new DOMException('Regional load cancelled','AbortError');onProgress({fraction:1});flow.update(position,true);if(camera)vehicles.update(camera);
 }catch(error){disposed=true;for(const e of [...entries.values()])if(e.ready)release(e);vehicles.dispose();group.removeFromParent();throw error;}
 return{namespace,manifest,flow,index:{airportId:airport.id,*candidates(a,b,margin=0,vertical=0,time=null){yield*obstacleIndex().candidates(a,b,margin,vertical,time);}},
  update(camera,{position:p,velocity}={}){if(disposed)return;focus(p||position,velocity);if(vehicles.update(camera))onChange();},settled,
  stats(){const ready=[...entries.values()].filter(e=>e.ready);return{...flow.stats(),coverageBounds:manifest.bounds,tileSize:manifest.tileSize,availableTiles:manifest.tiles.length,loadedTiles:ready.length,fullDetailTiles:ready.filter(e=>e.tier==='full').length,majorOnlyTiles:ready.filter(e=>e.tier==='major').length,pendingTiles:active,wantedTiles:wanted.size,cacheHits,unavailableTiles:unavailable,revision,render:vehicles.stats(),surfaceTriangles:ready.reduce((n,e)=>n+e.surfaces.triangles,0),surfaceGpuBytes:ready.reduce((n,e)=>n+e.surfaces.bytes,0),loadedTileIds:ready.map(e=>e.record.id)};},
  dispose(){if(disposed)return;disposed=true;wanted.clear();for(const e of [...entries.values()])if(e.ready)release(e);vehicles.dispose();group.removeFromParent();},
 };
}
