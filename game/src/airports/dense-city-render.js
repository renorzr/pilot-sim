import {packCityModel,restoreCityModel}from './city-model-cache.js';
import * as THREE from 'three';

import {channels,facadeColor}from './city-colours.js';
import {createCityInstances,CITY_INSTANCE_DECLARATIONS,CITY_INSTANCE_POSITION}from './dense-city-instances.js';

function simplified(ring,max=6){
 const p=[];for(let i=0;i<ring.length;i+=2)p.push([ring[i],ring[i+1]]);
 while(p.length>max){let best=Infinity,index=-1;for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length],area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));if(area<best){best=area;index=i;}}p.splice(index,1);}
 return p;
}
export function createDenseGeometry(data,tile,lod=0,buildingIndices=null){
 const origin={x:(tile.minX+tile.maxX)/2,z:(tile.minZ+tile.maxZ)/2},positions=[],normals=[],colors=[],surfaces=[],indices=[],ranges=[];
 function vertex(p,n,color,u,v,kind){const i=positions.length/3;positions.push(p[0]-origin.x,p[1],p[2]-origin.z);normals.push(...n.map(x=>Math.round(x*127)));colors.push(...color);surfaces.push(Math.min(65535,Math.max(0,Math.round(u*16))),Math.min(65535,Math.max(0,Math.round(v*16))),kind);return i;}
 function triangle(a,b,c,color,kind=3){
  const ab=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),ac=new THREE.Vector3(c[0]-a[0],c[1]-a[1],c[2]-a[2]),n=ab.cross(ac).normalize();if(n.y<0)[b,c]=[c,b];const normal=[n.x*(n.y<0?-1:1),Math.abs(n.y),n.z*(n.y<0?-1:1)],start=positions.length/3;for(const p of[a,b,c])vertex(p,normal,color,0,0,kind);indices.push(start,start+1,start+2);
 }
 for(const i of buildingIndices||Array.from({length:tile.count},(_,i)=>tile.start+i)){
  const b=data.building(i);if(b.height<=0)continue;const start=positions.length/3,near=lod===1,all=near?b.rings.map(r=>{const p=[];for(let j=0;j<r.length;j+=2)p.push([r[j],r[j+1]]);return p;}):[simplified(b.rings[0],Math.max(b.width,b.depth)>100||b.height>30?6:4)],outer=all[0],roof=channels(b.roofColor),wall=facadeColor(b,data.manifest?.architecture?.facadePalette),kind=b.kind==='home'?0:b.kind==='industrial'?1:2;
  // Small homes get source-footprint hip roofs. Shared internal midpoints
  // make adjoining roof triangles continuous, including concave home plans.
  const pitched=near&&kind===0&&b.height<13&&b.width*b.depth<800&&all.length===1&&b.seed%5!==0,rise=pitched?Math.min(1.7,b.height*.22):0,eave=b.topY-rise,floors=Math.max(1,Math.round((eave-b.baseY)/(kind===1?8:3.2))),floorHeight=(eave-b.baseY)/floors;
  for(const ring of all)for(let j=0;j<ring.length;j++){
   const a=ring[j],c=ring[(j+1)%ring.length],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);if(len<.03)continue;const n=[-dz/len,0,dx/len],u=Math.max(1,Math.round(len/(kind===1?12:kind===0?3.8:2.4)))*(kind===1?12:kind===0?3.8:2.4),k=positions.length/3;
   vertex([a[0],b.baseY,a[1]],n,wall,0,0,kind);vertex([c[0],b.baseY,c[1]],n,wall,u,0,kind);vertex([c[0],eave,c[1]],n,wall,u,(eave-b.baseY)/floorHeight*3.2,kind);vertex([a[0],eave,a[1]],n,wall,0,(eave-b.baseY)/floorHeight*3.2,kind);indices.push(k,k+1,k+2,k,k+2,k+3);
  }
  if(pitched){
   const triangles=THREE.ShapeUtils.triangulateShape(outer.map(p=>new THREE.Vector2(p[0],-p[1])),[]),parts=[],distance=p=>{let best=Infinity;for(let j=0;j<outer.length;j++){const a=outer[j],c=outer[(j+1)%outer.length],dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t));}return best;};let peak=0;
   for(const t of triangles){const[a,c,d]=t.map(j=>outer[j]),mid=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2],ac=mid(a,c),cd=mid(c,d),da=mid(d,a);for(const p of[ac,cd,da])peak=Math.max(peak,distance(p));parts.push([a,ac,da],[ac,c,cd],[da,cd,d],[ac,cd,da]);}
   if(peak<.01){parts.length=0;for(const t of triangles){const[a,c,d]=t.map(j=>outer[j]),centre=[(a[0]+c[0]+d[0])/3,(a[1]+c[1]+d[1])/3];peak=Math.max(peak,distance(centre));parts.push([a,c,centre],[c,d,centre],[d,a,centre]);}}
   for(const part of parts)triangle(...part.map(p=>[p[0],eave+rise*distance(p)/Math.max(.01,peak),p[1]]),roof);
  }
  else{
   const rings=all.map(r=>r.map(p=>new THREE.Vector2(p[0],-p[1]))),triangles=THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1)),flat=all.flat(),start=positions.length/3;
   // A flat roof has shared colour/normal/coordinates at each corner; reuse
   // these vertices instead of uploading another three for every triangle.
   for(const p of flat)vertex([p[0],b.topY,p[1]],[0,1,0],roof,0,0,3);
   for(const t of triangles){const[a,c,d]=t.map(i=>flat[i]),up=(c[0]-a[0])*(d[1]-a[1])-(c[1]-a[1])*(d[0]-a[0])<0;for(const i of up?t:[t[0],t[2],t[1]])indices.push(start+i);}
  }
  ranges.push({index:i,start,count:positions.length/3-start});
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Int8BufferAttribute(normals,3,true));geometry.setAttribute('color',new THREE.Uint8BufferAttribute(colors,3,true));geometry.setAttribute('citySurface',new THREE.Uint16BufferAttribute(surfaces,3));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={origin,ranges,lod,buildings:tile.count,bytes:Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,geometry.index.array.byteLength)};return geometry;
}

// Models and their compact instance arrays live until world disposal. GPU
// buffers can be released independently without scheduling model construction.
export const CITY_PRELOAD_RADIUS=3200,CITY_GPU_CACHE_BYTES=256*1024*1024;
export function createDenseCityRenderer({root,data,material,instanceMaterials={},depthMaterial,persistentCache=null,modelNamespace=null,onProgress=()=>{},onChange=()=>{},isCurrent=()=>true,gpuCacheBytes=CITY_GPU_CACHE_BYTES}){
 const tiles=data.manifest.tiles,models=new Map(),selected=new Map(),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),box=new THREE.Box3(),lastPosition=new THREE.Vector3(Infinity,Infinity,Infinity),lastRotation=new THREE.Quaternion(),waiters=[];
 const districts=new Map(),districtOf=new Map();
 for(const tile of tiles){const coords=tile.id.split(':').map(Number),x=coords.length===2?coords[0]:Math.floor((tile.minX+tile.maxX)/3000),z=coords.length===2?coords[1]:Math.floor((tile.minZ+tile.maxZ)/3000),id='district/'+Math.floor(x/2)+':'+Math.floor(z/2);let group=districts.get(id);if(!group){group={id,count:0,minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity,topY:-Infinity,members:[]};districts.set(id,group);}group.members.push(tile);group.count+=tile.count;group.minX=Math.min(group.minX,tile.minX);group.minZ=Math.min(group.minZ,tile.minZ);group.maxX=Math.max(group.maxX,tile.maxX);group.maxZ=Math.max(group.maxZ,tile.maxZ);group.topY=Math.max(group.topY,tile.topY);districtOf.set(tile.id,group);}
 let queue=[],running=false,disposed=false,serial=0,totalBuilt=0,gpuReleases=0,restoredTiles=0,builtTiles=0;
 const key=(tile,lod)=>tile.id+'/'+lod,distance=(t,p)=>Math.hypot(Math.max(t.minX-p.x,0,p.x-t.maxX),Math.max(t.minZ-p.z,0,p.z-t.maxZ));
 const bounds=t=>{box.min.set(t.minX-150,-500,t.minZ-150);box.max.set(t.maxX+150,t.topY+100,t.maxZ+150);return box;};
 function select(tile){
  const far=models.get(key(tile,0)),near=models.get(key(tile,1)),districtTile=districtOf.get(tile.id),district=models.get(key(districtTile,2)),previous=selected.get(tile.id),d=distance(tile,lastPosition),wantNear=d<(previous?.lod===1?3000:2200),wantDistrict=distance(districtTile,lastPosition)>(previous?.lod===2?11000:13000),current=wantNear&&near?near:wantDistrict&&district?district:far;
  const inView=frustum.intersectsBox(bounds(tile));
  for(const r of[far,near,district])if(r){r.mesh.visible=current===r;r.inView=current===r&&(r.lod===2?frustum.intersectsBox(bounds(r.tile)):inView);}
  if(current)selected.set(tile.id,current);return current;
 }
 function trimGpu(){
  let bytes=0;const cold=[];
  for(const r of models.values())if(r.gpu){bytes+=r.bytes;if(!r.inView&&r.lastDraw<serial&&distance(r.tile,lastPosition)>6000)cold.push(r);}
  if(bytes<=gpuCacheBytes)return;cold.sort((a,b)=>a.lastDraw-b.lastDraw);
  for(const r of cold){if(bytes<=gpuCacheBytes)break;bytes-=r.bytes;for(const m of r.mesh.children)m.geometry.dispose();r.gpu=false;gpuReleases++;}
 }
 function finish(){running=false;waiters.splice(0).forEach(r=>r());}
 async function pump(){
  if(disposed||!isCurrent()){dispose();return;}let task;
  while(queue.length){const next=queue.shift();if(!models.has(key(next.tile,next.lod))){task=next;break;}}
  if(!task){finish();return;}
  const{tile,lod}=task,cacheKey=key(tile,lod),instanceMaterial=instanceMaterials[lod===1?'near':'far']||material;let parts=null;
  if(persistentCache&&persistentCache.stats().available!==false){
   const record=await persistentCache.get(modelNamespace,cacheKey);
   if(disposed||!isCurrent()){dispose();return;}
   if(record)try{parts=restoreCityModel(record,instanceMaterial);for(const m of parts.meshes)if(!m.userData.cityInstances)m.material=material;restoredTiles++;}catch{persistentCache.remove(modelNamespace,cacheKey);}
  }
  if(!parts){
   parts=createCityInstances(data,tile,lod,instanceMaterial);
   if(parts.exceptions.length){const geometry=createDenseGeometry(data,tile,lod===1?1:0,parts.exceptions),m=new THREE.Mesh(geometry,material);m.position.set(geometry.userData.origin.x,0,geometry.userData.origin.z);m.castShadow=lod===1;delete geometry.userData.ranges;parts.meshes.push(m);parts.bytes+=geometry.userData.bytes;parts.triangles+=geometry.index.count/3;}
   builtTiles++;if(persistentCache)persistentCache.put(modelNamespace,cacheKey,packCityModel(parts));
  }
  const mesh=new THREE.Group();mesh.add(...parts.meshes);
  mesh.name=(data.manifest.airportId||'lax')+'-city-tile-'+tile.id+'-lod'+lod;mesh.userData.cityTile=true;
  const entry={tile,lod,mesh,bytes:parts.bytes,triangles:parts.triangles,instances:parts.instances,gpu:false,lastDraw:0,inView:false},drawn=()=>{entry.gpu=true;entry.lastDraw=serial;};
  for(const m of mesh.children){m.userData.cityTile=true;m.onBeforeRender=drawn;m.onBeforeShadow=drawn;if(m.userData.cityInstances&&depthMaterial)m.customDepthMaterial=depthMaterial;}
  models.set(key(tile,lod),entry);root.add(mesh);let current;if(lod===2){for(const member of tile.members)current=select(member);}else current=select(tile);entry.inView=current===entry&&frustum.intersectsBox(bounds(tile));totalBuilt++;onProgress({completed:totalBuilt,total:totalBuilt+queue.length});if(entry.inView)onChange();setTimeout(pump,0);
 }
 function schedule(){if(!running&&queue.length){running=true;setTimeout(pump,0);}}
 function dispose(){disposed=true;queue=[];for(const r of models.values()){for(const m of r.mesh.children)m.geometry.dispose();r.mesh.removeFromParent();}models.clear();selected.clear();finish();}
 return{
  update(camera){
   if(disposed)return;
   if(camera.position.distanceToSquared(lastPosition)<2500&&1-Math.abs(lastRotation.dot(camera.quaternion))<.00015){trimGpu();return;}
   lastPosition.copy(camera.position);lastRotation.copy(camera.quaternion);serial++;camera.updateMatrixWorld();matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
   const tasks=[];
   for(const tile of tiles){
    const d=distance(tile,lastPosition),inView=frustum.intersectsBox(bounds(tile));
    // Prepare all compact middle/district variants before accepting the world.
    if(!models.has(key(tile,0)))tasks.push({tile,lod:0,priority:inView&&d<13000?0:4,distance:d});
    if(d<CITY_PRELOAD_RADIUS&&!models.has(key(tile,1)))tasks.push({tile,lod:1,priority:inView&&d<2200?1:5,distance:d});
    select(tile);
   }
   // Neighbouring far chunks share one district draw batch. The entire
   // district changes LOD together, avoiding overlap with its member chunks.
   for(const tile of districts.values())if(!models.has(key(tile,2))){const d=distance(tile,lastPosition),inView=frustum.intersectsBox(bounds(tile));tasks.push({tile,lod:2,priority:inView&&d>13000?0:4,distance:d});}
   queue=tasks.sort((a,b)=>a.priority-b.priority||a.distance-b.distance);onProgress({completed:totalBuilt,total:totalBuilt+queue.length});schedule();trimGpu();onChange();
  },
  settled(){return running||queue.length?new Promise(resolve=>waiters.push(resolve)):Promise.resolve();},
  stats(){
   let visibleTiles=0,visibleBuildings=0,geometryBytes=0,visibleGeometryBytes=0,gpuGeometryBytes=0,triangles=0,farTiles=0,detailTiles=0,districtTiles=0,preloadedBuildings=0,instances=0,visibleInstances=0;
   for(const r of models.values()){
    geometryBytes+=r.bytes;instances+=r.instances;if(r.gpu)gpuGeometryBytes+=r.bytes;if(r.lod===0){farTiles++;preloadedBuildings+=r.tile.count;}else if(r.lod===1)detailTiles++;else districtTiles++;
    if(r.mesh.visible&&r.inView){visibleTiles++;visibleBuildings+=r.tile.count;visibleGeometryBytes+=r.bytes;triangles+=r.triangles;visibleInstances+=r.instances;}
   }
   return{totalBuildings:data.count,visibleBuildings,residentTiles:farTiles,cachedVariants:models.size,farTiles,detailTiles,districtTiles,availableDistrictTiles:districts.size,preloadedBuildings,instances,visibleInstances,visibleTiles,geometryBytes,visibleGeometryBytes,gpuGeometryBytes,gpuReleases,triangles,pendingTiles:queue.length+(running?1:0),generatedTiles:totalBuilt,restoredTiles,builtTiles};
  },
  dispose
 };
}

export function configureDenseCityMaterial(material,{airport,bounds,uniforms,sampleFunction,instanced=false,detail=true}){
 const[s,w,n,e]=bounds,a=airport.unproject(0,0),x=airport.unproject(1,0),z=airport.unproject(0,1),geoU=new THREE.Vector3((x.longitude-a.longitude)/(e-w),(z.longitude-a.longitude)/(e-w),(a.longitude-w)/(e-w)),geoV=new THREE.Vector3((x.latitude-a.latitude)/(n-s),(z.latitude-a.latitude)/(n-s),(a.latitude-s)/(n-s));
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms,{cityGeoU:{value:geoU},cityGeoV:{value:geoV}});
  shader.vertexShader=(instanced?CITY_INSTANCE_DECLARATIONS+'\n':'')+'attribute vec3 citySurface;varying vec3 cityFacade;varying vec2 cityRoofUV;uniform vec3 cityGeoU;uniform vec3 cityGeoV;\n'+shader.vertexShader;
  if(instanced){shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',CITY_INSTANCE_POSITION).replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=cityRotate(normal/vec3(cityDimensions.x,citySurface.z>2.5?max(.01,cityDimensions.w):cityDimensions.y,cityDimensions.z));').replace('#include <color_vertex>','#include <color_vertex>\nvColor.rgb=citySurface.z>2.5?cityRoofColor:cityWallColor;');}
  shader.vertexShader=shader.vertexShader.replace(instanced?CITY_INSTANCE_POSITION:'#include <begin_vertex>',(instanced?CITY_INSTANCE_POSITION:'#include <begin_vertex>')+'\n'+(instanced?'cityFacade=vec3(citySurface.x*(abs(normal.x)>.5?cityDimensions.z:cityDimensions.x),citySurface.y*cityDimensions.y,citySurface.z>2.5?3.:cityType);':'cityFacade=vec3(citySurface.xy/16.,citySurface.z);')+'vec4 cityWorld=modelMatrix*vec4(transformed,1.);cityRoofUV=vec2(dot(vec3(cityWorld.xz,1.),cityGeoU),dot(vec3(cityWorld.xz,1.),cityGeoV));');
  shader.fragmentShader='varying vec3 cityFacade;varying vec2 cityRoofUV;\n'+sampleFunction+'\n'+shader.fragmentShader;
  const pattern=`
if(cityFacade.z>2.5){vec4 photo=sampleCityRoof(cityRoofUV);float vegetation=step(photo.r*1.18,photo.g);diffuseColor.rgb=mix(diffuseColor.rgb,photo.rgb,photo.a*(1.-vegetation)*.9);}
else{diffuseColor.rgb*=.88;float bay=cityFacade.z<.5?3.8:cityFacade.z<1.5?12.:2.4;vec2 grid=fract(cityFacade.xy/vec2(bay,3.2));vec2 aa=max(fwidth(cityFacade.xy/vec2(bay,3.2)),vec2(.002));float pane;
if(cityFacade.z<.5){pane=smoothstep(.19-aa.x,.19+aa.x,grid.x)*(1.-smoothstep(.67-aa.x,.67+aa.x,grid.x))*smoothstep(.27-aa.y,.27+aa.y,grid.y)*(1.-smoothstep(.79-aa.y,.79+aa.y,grid.y));pane*=smoothstep(.009,.018+aa.x,abs(grid.x-.43))*smoothstep(.009,.018+aa.y,abs(grid.y-.53));}
else if(cityFacade.z<1.5){pane=smoothstep(.17-aa.x,.17+aa.x,grid.x)*(1.-smoothstep(.58-aa.x,.58+aa.x,grid.x))*step(grid.y,.69);}
else{pane=smoothstep(.07-aa.x,.07+aa.x,grid.x)*(1.-smoothstep(.93-aa.x,.93+aa.x,grid.x))*smoothstep(.2-aa.y,.2+aa.y,grid.y)*(1.-smoothstep(.91-aa.y,.91+aa.y,grid.y));}
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.075,.105,.115),pane*.83);
}`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n'+(detail?pattern:'if(cityFacade.z<2.5)diffuseColor.rgb*=.73;'));
 };
 material.customProgramCacheKey=()=> 'shared-city-v2-'+instanced+'-'+detail;
}
