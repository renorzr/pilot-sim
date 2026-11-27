import {sceneryCacheId,scenerySourceId} from '../regions/scenery-source.js';
import * as THREE from 'three';
import {siteUrl} from '../urls.js';
import {surfaceHeight} from '../terrain/heightfield.js';
import {ROAD_DATA_REVISION,buildRoadGraph,validateRoadSource,trafficHash} from './road-data.js';
import {prepareRoadSurfaces,createRoadMeshes} from './road-meshes.js';
import {createRoadTraffic} from './road-traffic.js';
import {createVehicleRenderer} from './road-vehicles.js';
import {createRoadObstacleIndex} from './road-obstacles.js';
import {loadRegionalTraffic} from './regional-traffic-world.js';

const cancelled=()=>new DOMException('Road load cancelled','AbortError');
function validManifest(m,id){return m?.schema===1&&m.airportId===id&&/^assets\/cities\/[a-z]+\/[^?]+\.json\.gz$/.test(m.path)&&/^[a-f0-9]{64}$/.test(m.sha256)&&/^[a-f0-9]{64}$/.test(m.decodedSha256)&&m.bytes>0&&m.decodedBytes>0&&m.decodedBytes<32*1024*1024&&!!m.fingerprint;}
export async function loadRoadSource({airport,path,cache,isCurrent=()=>true}){
 const namespace=sceneryCacheId(airport)+':images:1',key='manifest/'+siteUrl(path);let manifest;
 try{const r=await fetch(siteUrl(path),{cache:'no-cache'});if(!r.ok)throw Error('Road metadata unavailable');manifest=await r.json();if(!validManifest(manifest,scenerySourceId(airport)))throw Error('Invalid road metadata');cache.put(namespace,key,manifest);}
 catch(e){manifest=await cache.get(namespace,key);if(!validManifest(manifest,scenerySourceId(airport)))throw e;}
 const blobKey='roads/'+manifest.sha256;
 async function decode(blob){
  // Servers may serve .gz as a file or Content-Encoding:gzip. Fetch has already
  // decompressed the latter; verify the appropriate identity in either case.
  if(!(blob instanceof Blob)||![manifest.bytes,manifest.decodedBytes].includes(blob.size))throw Error('Incomplete road download');
  const raw=await blob.arrayBuffer(),head=new Uint8Array(raw,0,Math.min(2,raw.byteLength)),compressed=head[0]===31&&head[1]===139;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==(compressed?manifest.sha256:manifest.decodedSha256))throw Error('Road source checksum mismatch');
  const buffer=compressed?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():raw;if(buffer.byteLength!==manifest.decodedBytes)throw Error('Incomplete decoded roads');
  const source=JSON.parse(new TextDecoder().decode(buffer));validateRoadSource(source,airport);if(source.fingerprint!==manifest.fingerprint)throw Error('Road source identity mismatch');return source;
 }
 let blob=await cache.get(namespace,blobKey),source;
 if(blob)try{source=await decode(blob);}catch{await cache.remove(namespace,blobKey);}
 if(!source){if(!isCurrent())throw cancelled();const r=await fetch(siteUrl(manifest.path)+'?v='+manifest.sha256.slice(0,12));if(!r.ok)throw Error('Road network unavailable');blob=await r.blob();source=await decode(blob);cache.put(namespace,blobKey,blob);}
 if(!isCurrent())throw cancelled();return{source,manifest};
}
function validPrepared(arrays,metadata){
 if(!arrays||!Array.isArray(metadata?.obstacles))return false;
 for(const name of ['roadGround','roadDecks','roadConcrete','roadPaint'])if(!(arrays[name] instanceof Float32Array)||arrays[name].length%9||!arrays[name].every(Number.isFinite))return false;
 if(!(arrays.roadPaintDistance instanceof Float32Array)||arrays.roadPaintDistance.length!==arrays.roadPaint.length/3||!arrays.roadPaintDistance.every(Number.isFinite)||!(arrays.roadPaintTint instanceof Float32Array)||arrays.roadPaintTint.length!==arrays.roadPaint.length||!arrays.roadPaintTint.every(Number.isFinite))return false;
 return metadata.obstacles.every(o=>o.kind==='bridge'&&['cx','cz','angle','width','depth','baseY','topY'].every(k=>Number.isFinite(o[k]))&&o.width>0&&o.depth>0&&o.topY>=o.baseY);
}
export async function loadRoadWorld({root,airport,path,cache,sourceCache=cache,isCurrent=()=>true,onProgress=()=>{},onChange=()=>{},camera=null}){
 const{source,manifest}=await loadRoadSource({airport,path,cache:sourceCache,isCurrent}),terrainKey=trafficHash(JSON.stringify([airport.data.dem,airport.grading,airport.elevationM,...(airport.region?[airport.region.revision]:[])]));
 const namespace=`${airport.id}:roads:${ROAD_DATA_REVISION}:${manifest.sha256}:${terrainKey}`;
 let arrays=await cache.getArrays(namespace,'prepared',{isCurrent}),metadata=await cache.get(namespace,'metadata');
 if(!validPrepared(arrays,metadata)){arrays=null;metadata=null;}
 onProgress({fraction:.2});if(!isCurrent())throw cancelled();
 const heightAt=(x,z)=>surfaceHeight(x,z,airport.id),graph=buildRoadGraph(source,airport,{heightAt,prepared:arrays});let sourceCacheHit=!!arrays&&graph.prepared;
 if(!sourceCacheHit){
  const steps=prepareRoadSurfaces(graph,heightAt);let step,last=performance.now(),progress=.2;
  while(!(step=steps.next()).done){if(!isCurrent())throw cancelled();progress=Math.min(.94,progress+.003);onProgress({fraction:progress});if(performance.now()-last>12){await new Promise(r=>setTimeout(r,0));last=performance.now();}}
  arrays={...graph.snapshot(),...step.value.arrays};metadata={obstacles:step.value.obstacles};
  cache.putArrays(namespace,'prepared',arrays,{isCurrent});cache.put(namespace,'metadata',metadata);
 }
 if(!isCurrent())throw cancelled();
 const group=new THREE.Group();group.name=airport.id+'-roads-and-traffic';root.add(group);let surfaces,vehicles,regional;
 try{
  surfaces=createRoadMeshes(group,arrays);const traffic=createRoadTraffic(graph);vehicles=createVehicleRenderer(group,traffic,{viewportHeight:()=>globalThis.innerHeight||600});
  const coreIndex=createRoadObstacleIndex(graph,traffic,metadata.obstacles),woodlandExclusions=source.edges.filter(e=>!e.tunnel).map(e=>({id:'traffic/'+e.id,tags:{highway:e.kind,width:e.width},geometry:e.nodes.map(i=>[source.nodes[i][1],source.nodes[i][2]])}));
  // Unit fixtures have no regional manifest; real airport worlds all use it.
  if(airport.data?.airport)regional=await loadRegionalTraffic({root:group,airport,cache,sourceCache,isCurrent,onChange,camera,clock:()=>traffic.clock,onProgress:d=>onProgress({fraction:.95+.05*d.fraction})});
  const index={airportId:airport.id,*candidates(a,b,margin=0,vertical=0,time=null){if(Number.isFinite(time))traffic.sync(time);yield*coreIndex.candidates(a,b,margin,vertical,time);if(regional)yield*regional.index.candidates(a,b,margin,vertical,time);}};
  const preparedBytes=Object.values(arrays).reduce((n,a)=>n+a.byteLength,0);
  let disposed=false;if(camera)vehicles.update(camera);onProgress({fraction:1});
  return{namespace,extraNamespaces:regional?[regional.namespace]:[],index,woodlandExclusions,sourceCacheHit,settled:()=>regional?.settled()??Promise.resolve(),update(camera,{time=0,presentationTime=null,position,velocity}={}){if(disposed)return;traffic.sync(time,presentationTime);regional?.update(camera,{position,velocity});if(vehicles.update(camera))onChange();},
   stats:()=>({...traffic.stats(),drivingSide:graph.drivingSide,regional:regional?.stats(),render:vehicles.stats(),structures:metadata.obstacles.length,roadSegments:graph.roads.length,lanes:graph.lanes.length,coverageRadiusM:source.radius,sourceBytes:manifest.bytes,graphArrayBytes:graph.byteLength,surfaceGpuBytes:surfaces.bytes,preparedBytes,surfaceTriangles:surfaces.triangles,surfaceBatches:surfaces.meshes.length,sourceCacheHit}),
   dispose(){if(disposed)return;disposed=true;regional?.dispose();vehicles.dispose();surfaces.dispose();group.removeFromParent();},
  };
 }catch(e){regional?.dispose();vehicles?.dispose();surfaces?.dispose();group.removeFromParent();throw e;}
}
