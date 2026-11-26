import * as THREE from 'three';
import {mergeGeometries}from 'three/addons/utils/BufferGeometryUtils.js';
import {siteUrl}from '../urls.js';
import {surfaceHeight}from '../terrain/heightfield.js';
import {createImageryStream,selectImageryTiles}from './imagery-stream.js';
import {configureInstanceDepth}from './dense-city-instances.js';
import {readDenseResponse,restoreDenseCity}from './dense-city-data.js';
import {createCityPersistentCache,cityCacheNamespaces}from './city-persistent-cache.js';
import {loadCachedCityTexture,loadCityManifest}from './city-cached-assets.js';
import {createDenseCityRenderer,configureDenseCityMaterial}from './dense-city-render.js';
import {installDenseCity,installWoodlands,installRoadTraffic}from '../terrain/city-obstacles.js';
import {loadWoodlands}from './woodland-world.js';
import {loadRoadWorld}from './road-world.js';

export function geographicUv(airport,bounds,x,z){const [south,west,north,east]=bounds,p=airport.unproject(x,z);return[(p.longitude-west)/(east-west),(p.latitude-south)/(north-south)];}
export function detailRect(overview,tile){const[s,w,n,e]=overview,[ts,tw,tn,te]=tile;return[(tw-w)/(e-w),(ts-s)/(n-s),(te-tw)/(e-w),(tn-ts)/(n-s)];}

export function batchCityGeometry(root,sourceGeometries){
 root.updateMatrixWorld(true);const batches=new Map(),inverse=root.matrixWorld.clone().invert();
 root.traverse(o=>{if(o.geometry)sourceGeometries.add(o.geometry);if(!o.isMesh||o.isInstancedMesh||o.userData.cityTile||Array.isArray(o.material))return;if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(o);});
 for(const[material,meshes]of batches){if(meshes.length<2)continue;const parts=meshes.map(m=>{const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(inverse.clone().multiply(m.matrixWorld));const keep=['position','normal',...(material.map?['uv']:[]),...(material.vertexColors?['color']:[])];for(const a of Object.keys(g.attributes))if(!keep.includes(a))g.deleteAttribute(a);if(!g.attributes.normal)g.computeVertexNormals();return g;}),merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!merged)throw Error('City geometry merge failed');const mesh=new THREE.Mesh(merged,material);mesh.name='LAX-city-batch-'+material.name;mesh.renderOrder=meshes[0].renderOrder;mesh.castShadow=meshes.some(m=>m.castShadow);mesh.receiveShadow=meshes.some(m=>m.receiveShadow);root.add(mesh);meshes.forEach(m=>m.removeFromParent());}
}
export async function loadMappedCity({scene,terrain,airport,camera=null,loadingManager,onProgress=()=>{},onChange=()=>{},isCurrent=()=>true,maxAnisotropy=8,buildingManifestPath,imageryManifestPath,woodlandSourcePath=null,trafficManifestPath=null,adaptData=null,createLandmarks=()=>({stats:{triangles:0},records:[]})}){
 const persistentCache=createCityPersistentCache(airport.id),imageNamespace=airport.id+':images:1';
 const loadTexture=(record,loader)=>loadCachedCityTexture(record,loader,persistentCache,imageNamespace);
 onProgress({stage:'imagery',fraction:0});let imageryDone=0;const imageryStep=()=>onProgress({stage:'imagery',fraction:.12*(++imageryDone/4)});
 const imagery=await loadCityManifest(imageryManifestPath,persistentCache,imageNamespace),loader=new THREE.TextureLoader(loadingManager),records=[imagery.overview,imagery.regional];
 const textures=await Promise.all(records.map(async item=>{const t=await loadTexture(item,loader);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.anisotropy=8;imageryStep();return t;}));
 for(const t of textures){t.anisotropy=Math.min(8,maxAnisotropy);t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;}
 async function loadMask(record){
  if(!record){const t=new THREE.DataTexture(new Uint8Array([0]),1,1,THREE.RedFormat,THREE.UnsignedByteType);t.needsUpdate=true;imageryStep();return t;}
  const original=await loadTexture(record,loader),canvas=document.createElement('canvas');canvas.width=record.width;canvas.height=record.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(original.image,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data,red=new Uint8Array(canvas.width*canvas.height);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)red[y*canvas.width+x]=rgba[((canvas.height-1-y)*canvas.width+x)*4];
  const t=new THREE.DataTexture(red,canvas.width,canvas.height,THREE.RedFormat,THREE.UnsignedByteType);t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;original.dispose();imageryStep();return t;
 }
 const[seaMask,coastMask]=await Promise.all([loadMask(imagery.seaMask),loadMask(imagery.coastMask)]);
 const root=new THREE.Group();root.name=airport.id+'-city-region';const sourceGeometries=new Set();
 const buildingManifest=await loadCityManifest(buildingManifestPath,persistentCache,imageNamespace),namespaces=cityCacheNamespaces(airport.id,buildingManifest);
 let denseData=null,sourceCacheHit=false;
 onProgress({stage:'cache',fraction:.12});
 const arrays=await persistentCache.getArrays(namespaces.source,'decoded',{isCurrent,onProgress:d=>onProgress({stage:'cache',fraction:.12+.6*d.completed/Math.max(1,d.total),...d})});
 if(!isCurrent())throw new DOMException('City load cancelled','AbortError');
 if(arrays)try{denseData=restoreDenseCity(arrays,buildingManifest);sourceCacheHit=true;}catch{await persistentCache.remove(namespaces.source,'decoded');}
 if(!denseData){
  const buildingResponse=await fetch(siteUrl(buildingManifest.path)+'?v='+buildingManifest.sha256.slice(0,12));if(!buildingResponse.ok)throw Error('City footprints unavailable');
  denseData=await readDenseResponse(buildingResponse,buildingManifest,{isCurrent,onProgress:detail=>{const ranges={download:[.12,.4],decompress:[.52,.06],decode:[.58,.14]},[start,size]=ranges[detail.stage];onProgress({...detail,fraction:start+size*detail.fraction});}});
  onProgress({stage:'save',fraction:.72});await persistentCache.putArrays(namespaces.source,'decoded',denseData.snapshot(),{isCurrent});
 }
 if(!isCurrent())throw new DOMException('City load cancelled','AbortError');
 if(adaptData)denseData=adaptData(denseData,airport);
 onProgress({stage:'models',fraction:.72,completed:0,total:buildingManifest.tiles.length});
 const landmarks=createLandmarks({THREE,group:root,project:airport.project,heightAt:(x,z)=>surfaceHeight(x,z,airport.id)});batchCityGeometry(root,sourceGeometries);
 const uv=terrain.geometry.attributes.uv,p=terrain.geometry.attributes.position;for(let i=0;i<p.count;i++)uv.setXY(i,...geographicUv(airport,imagery.overview.bounds,p.getX(i),p.getZ(i)));uv.needsUpdate=true;
 const material=terrain.material;material.map=textures[0];material.vertexColors=false;material.color.set('#eeeede');material.roughness=1;
 const fallback=new THREE.Color('#a8a18b'),detailLoader=new THREE.TextureLoader(),uniforms={cityRegional:{value:textures[1]},cityRegionRect:{value:new THREE.Vector4(...detailRect(imagery.overview.bounds,imagery.regional.bounds))},citySeaMask:{value:seaMask},cityCoastMask:{value:coastMask},cityFallback:{value:fallback}};
 const slots=3,capacity=4;let disposed=false;
 for(let i=0;i<slots;i++){uniforms['cityDetail'+i]={value:textures[0]};uniforms['cityRect'+i]={value:new THREE.Vector4(2,2,1,1)};}
 function syncDetails(){
  const active=stream.active();for(let i=0;i<slots;i++){const entry=active[i];uniforms['cityDetail'+i].value=entry?.texture||textures[0];uniforms['cityRect'+i].value.set(...(entry?detailRect(imagery.overview.bounds,entry.tile.bounds):[2,2,1,1]));}onChange();
 }
 const stream=createImageryStream({slots,capacity,concurrency:2,onChange:syncDetails,load:async tile=>{
  // Optional details use their own manager: a failed tile never blocks flight.
  const t=await loadTexture(tile,detailLoader);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.anisotropy=Math.min(8,maxAnisotropy);t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;return t;
 }});
 const roofUniforms={...uniforms,cityOverview:{value:textures[0]}},roofDeclarations='uniform sampler2D cityOverview;uniform sampler2D cityRegional;uniform vec4 cityRegionRect;'+Array.from({length:slots},(_,i)=>`uniform sampler2D cityDetail${i};uniform vec4 cityRect${i};`).join('');
 const roofSample=roofDeclarations+`\nvec4 sampleCityRoof(vec2 p){vec4 c=vec4(0.);vec2 uv=(p-cityRegionRect.xy)/cityRegionRect.zw;if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){c=vec4(texture2D(cityRegional,uv).rgb,${imagery.roofProjectionOpacity??.12});}`+Array.from({length:slots},(_,i)=>`{vec2 q=(p-cityRect${i}.xy)/cityRect${i}.zw;if(all(greaterThanEqual(q,vec2(0.)))&&all(lessThanEqual(q,vec2(1.)))){vec4 tex=texture2D(cityDetail${i},q);float edge=min(min(q.x,q.y),min(1.-q.x,1.-q.y));c=mix(c,vec4(tex.rgb,${imagery.roofProjectionOpacity??.95}),tex.a*smoothstep(0.,.012,edge));}}`).join('')+'return c;}\n';
 const cityMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.88});cityMaterial.name=airport.id+'-continuous-source-city';configureDenseCityMaterial(cityMaterial,{airport,bounds:imagery.overview.bounds,uniforms:roofUniforms,sampleFunction:roofSample});
 const nearMaterial=cityMaterial.clone(),farMaterial=cityMaterial.clone(),depthMaterial=configureInstanceDepth(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}));
 configureDenseCityMaterial(nearMaterial,{airport,bounds:imagery.overview.bounds,uniforms:roofUniforms,sampleFunction:roofSample,instanced:true});
 configureDenseCityMaterial(farMaterial,{airport,bounds:imagery.overview.bounds,uniforms:roofUniforms,sampleFunction:roofSample,instanced:true,detail:false});
 let preparing=true;
 const denseRenderer=createDenseCityRenderer({persistentCache,modelNamespace:namespaces.models,onProgress:detail=>{if(preparing)onProgress({stage:'models',fraction:.72+.21*(detail.total?detail.completed/detail.total:0),...detail});},root,data:denseData,material:cityMaterial,instanceMaterials:{near:nearMaterial,far:farMaterial},depthMaterial,onChange:()=>{if(root.parent)onChange();},isCurrent});let uninstallDenseCity=()=>{},uninstallWoodland=()=>{},uninstallRoads=()=>{},active=false;
 if(camera){denseRenderer.update(camera);await denseRenderer.settled();}
 let roads=null,woodlands;
 try{
  if(trafficManifestPath)roads=await loadRoadWorld({root,airport,path:trafficManifestPath,cache:persistentCache,isCurrent,camera,onChange,onProgress:d=>onProgress({stage:'roads',fraction:.93+.025*d.fraction})});
  woodlands=await loadWoodlands({root,airport,denseData,imagery,textures,camera,cache:persistentCache,isCurrent,onChange,onProgress:d=>onProgress({stage:'models',fraction:(roads ? .955 : .93)+(roads ? .035 : .06)*d.completed/Math.max(1,d.total),...d}),extraSourcePath:woodlandSourcePath,extraExclusions:roads?.woodlandExclusions||[]});
 }catch(e){roads?.dispose();denseRenderer.dispose();stream.dispose();for(const t of textures)t.dispose();seaMask.dispose();coastMask.dispose();root.removeFromParent();throw e;}
 if(roads)roads.woodlandExclusions.length=0;
 preparing=false;onProgress({stage:'save',fraction:.99});await persistentCache.settled();
 if(!isCurrent()){roads?.dispose();woodlands.dispose();denseRenderer.dispose();throw new DOMException('City load cancelled','AbortError');}
 persistentCache.prune([...Object.values(namespaces),woodlands.namespace,...(roads?[roads.namespace,...roads.extraNamespaces]:[])]);onProgress({stage:'models',fraction:1});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  let declarations='uniform vec3 cityFallback;uniform sampler2D citySeaMask;uniform sampler2D cityCoastMask;uniform sampler2D cityRegional;uniform vec4 cityRegionRect;\n',samples='vec2 cityUV=vMapUv;\nvec4 cityColor=vec4(cityFallback,1.);\nif(all(greaterThanEqual(cityUV,vec2(0.)))&&all(lessThanEqual(cityUV,vec2(1.)))){if(texture2D(citySeaMask,cityUV).r>.98)discard;vec4 c=texture2D(map,cityUV);float edge=min(min(cityUV.x,cityUV.y),min(1.-cityUV.x,1.-cityUV.y));cityColor.rgb=mix(cityColor.rgb,c.rgb,c.a*smoothstep(0.,.008,edge));}\n';
  samples+='vec2 regionUV=(cityUV-cityRegionRect.xy)/cityRegionRect.zw;if(all(greaterThanEqual(regionUV,vec2(0.)))&&all(lessThanEqual(regionUV,vec2(1.)))){if(texture2D(cityCoastMask,regionUV).r>.98)discard;float edge=min(min(regionUV.x,regionUV.y),min(1.-regionUV.x,1.-regionUV.y));vec4 c=texture2D(cityRegional,regionUV);cityColor.rgb=mix(cityColor.rgb,c.rgb,c.a*smoothstep(0.,.008,edge));}\n';
  for(let i=0;i<slots;i++){
   declarations+=`uniform sampler2D cityDetail${i};uniform vec4 cityRect${i};\n`;
   samples+=`{vec2 uv=(cityUV-cityRect${i}.xy)/cityRect${i}.zw;if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){float border=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));vec4 c=texture2D(cityDetail${i},uv);cityColor.rgb=mix(cityColor.rgb,c.rgb,smoothstep(0.,.012,border)*c.a);}}\n`;
  }
  shader.fragmentShader=declarations+shader.fragmentShader.replace('#include <map_fragment>',samples+'diffuseColor*=cityColor;');
 };
 material.customProgramCacheKey=()=>`${airport.id}-imagery-lod-v1-${slots}`;material.needsUpdate=true;scene.add(root);
 const proceduralTextures=new Set();root.traverse(o=>{if(o.material?.map)proceduralTextures.add(o.material.map);});const proceduralTextureBytes=[...proceduralTextures].reduce((sum,t)=>sum+t.image.width*t.image.height*4,0);
 const baseBytes=records.reduce((s,r)=>s+r.bytes,0)+(imagery.seaMask?.bytes||0)+(imagery.coastMask?.bytes||0),baseGpuBytes=records.reduce((s,r)=>s+r.width*r.height*4*4/3,0)+(imagery.seaMask?imagery.seaMask.width*imagery.seaMask.height:1)+(imagery.coastMask?imagery.coastMask.width*imagery.coastMask.height:1);
 const stats={airportId:airport.id,imagery:imagery.label||'USDA NAIP 2022',imageryNativeGsdM:imagery.sourceNativeGsdM,captureDates:imagery.captureDates,overviewBounds:imagery.overview.bounds,availableDetailTiles:imagery.tiles.length,blocks:denseData.count,sourceCacheHit,heightSources:buildingManifest.heightSources,buildingDataBytes:buildingManifest.bytes,buildingDecodedBytes:denseData.byteLength,proceduralTextureCount:proceduralTextures.size,proceduralTextureBytes,landmarks:landmarks.records||[],landmarkStats:landmarks.stats};
 const direction=new THREE.Vector3(),focus=new THREE.Vector3();
 return{root,activate(){if(!disposed&&!active){uninstallDenseCity=installDenseCity(denseData,airport.id);uninstallWoodland=installWoodlands(woodlands.data,airport.id);if(roads)uninstallRoads=installRoadTraffic(roads.index,airport.id);active=true;}},deactivate(){if(active){uninstallRoads();uninstallDenseCity();uninstallWoodland();active=false;}},update(camera,timing={}){
  if(disposed)return;camera.getWorldDirection(direction);const height=surfaceHeight(camera.position.x,camera.position.z,airport.id),distance=direction.y<-.03?Math.min(6000,Math.max(0,(camera.position.y-height)/-direction.y)):6000;
  focus.copy(camera.position).addScaledVector(direction,distance);stream.update(selectImageryTiles(imagery.tiles,airport,camera.position,focus,slots));denseRenderer.update(camera);woodlands.update(camera);roads?.update(camera,timing);
 },settled:()=>Promise.all([stream.settled(),denseRenderer.settled(),roads?.settled()]),stats(){const info=stream.stats(),urban=denseRenderer.stats(),forest=woodlands.stats(),traffic=roads?.stats(),cached=imagery.tiles.filter(t=>info.cachedDetailIds.includes(t.id));return{...stats,...info,persistentCache:persistentCache.stats(),urbanStats:urban,woodlandStats:{...forest,sourceCacheHit:woodlands.sourceCacheHit},roadTraffic:traffic,triangles:urban.triangles+landmarks.stats.triangles+forest.triangles+(traffic?traffic.surfaceTriangles+traffic.render.triangles+(traffic.regional?traffic.regional.surfaceTriangles+traffic.regional.render.triangles:0):0),textureCount:textures.length+2+cached.length+proceduralTextures.size,textureBytes:baseBytes+proceduralTextureBytes+cached.reduce((s,r)=>s+r.bytes,0),estimatedTextureGpuBytes:Math.ceil(baseGpuBytes+proceduralTextureBytes*4/3+cached.reduce((s,r)=>s+r.width*r.height*4*4/3,0))};},dispose(){disposed=true;stream.dispose();denseRenderer.dispose();woodlands.dispose();roads?.dispose();uninstallRoads();uninstallDenseCity();uninstallWoodland();cityMaterial.dispose();nearMaterial.dispose();farMaterial.dispose();depthMaterial.dispose();const gs=new Set(sourceGeometries),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});for(const g of gs)g.dispose();const proceduralTextures=new Set();for(const m of ms){for(const value of Object.values(m))if(value?.isTexture)proceduralTextures.add(value);m.dispose();}for(const t of proceduralTextures)t.dispose();for(const t of textures)t.dispose();seaMask.dispose();coastMask.dispose();root.removeFromParent();}};
}
