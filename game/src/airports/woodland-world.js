import {airportOf} from './registry.js';
import {loadPreparedWoodlands} from './woodland-prepared.js';
import {sceneryCacheId,sceneryExtent,scenerySourceId} from '../regions/scenery-source.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {generateWoodlandSteps,restoreWoodlandData,woodlandSourceKey,WOODLAND_TILE,WOODLAND_DISTRICT,TREE_ROOTS} from './woodland-data.js';
import {siteUrl} from '../urls.js';

const DECLARATIONS=`attribute vec4 forestPose;attribute vec4 forestSize;attribute vec4 forestTint;attribute vec2 forestRoot;attribute float forestLeaf;
vec3 forestRotate(vec3 p){float c=cos(forestPose.w),s=sin(forestPose.w);return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);}`;
const POSITION=`vec3 p=position;float narrow=mix(1.,.72,forestTint.a);p.xz=forestRoot+(p.xz-forestRoot)*narrow;
vec3 transformed=forestRotate(vec3(p.x*forestSize.x,p.y*forestSize.y,p.z*forestSize.x));
vec3 rootPosition=forestRotate(vec3(forestRoot.x*forestSize.x,0.,forestRoot.y*forestSize.x));
transformed.y+=dot(rootPosition.xz,forestSize.zw);transformed+=forestPose.xyz;`;
function configure(material,depth=false,winter=false){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=DECLARATIONS+'\n'+shader.vertexShader.replace('#include <begin_vertex>',POSITION+(winter?'\nif(forestLeaf>.5&&forestTint.a<.5)transformed=forestPose.xyz;':''));
  if(!depth){
   shader.vertexShader='varying vec3 forestPoint;varying float forestLeafMask;\n'+shader.vertexShader.replace(POSITION,POSITION+'\nforestPoint=transformed;forestLeafMask=forestLeaf;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=forestRotate(normal/vec3(forestSize.x,forestSize.y,forestSize.x));').replace('#include <color_vertex>','#include <color_vertex>\nvColor.rgb*=mix(vec3(1.),forestTint.rgb,forestLeaf);');
   shader.fragmentShader='varying vec3 forestPoint;varying float forestLeafMask;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
if(forestLeafMask>.5){
 float footprint=max(length(dFdx(forestPoint)),length(dFdy(forestPoint)));
 if(footprint<1.5){float grain=fract(sin(dot(floor(forestPoint*3.2),vec3(127.1,311.7,74.7)))*43758.5453);float clump=.5+.5*sin(forestPoint.x*2.8+sin(forestPoint.z*3.7))*sin(forestPoint.y*4.1-forestPoint.z*2.3);diffuseColor.rgb*=mix(.74+grain*.34+clump*.28,1.,smoothstep(.15,1.5,footprint));}
}`);
  }
 };material.customProgramCacheKey=()=> 'woodland-3-'+depth+'-'+winter;return material;
}
function template(lod,winter=false){
 const parts=[];
 for(const[rx,rz,h]of(lod===0?[[0,0,1]]:TREE_ROOTS)){
  const crown=lod===2?new THREE.SphereGeometry(1,12,7):lod===1?new THREE.IcosahedronGeometry(1,0):new THREE.OctahedronGeometry(1,0);
  // Geometry remains upright with a visible canopy from above as well as the
  // side. Opaque, lit crowns avoid leaf-card overdraw and billboard collapse.
  const p=crown.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),lobe=1+.13*Math.sin(x*11+z*7)*Math.cos(y*8);
   p.setXYZ(i,rx+x*(lod===0?.56:.275)*lobe,.68*h+y*.32*h,rz+z*(lod===0?.56:.275)*lobe);
  }
  crown.computeVertexNormals();add(crown,rx,rz,true);
  if(winter){
   const limb=(a,b,r)=>{const from=new THREE.Vector3(rx+a[0],a[1]*h,rz+a[2]),to=new THREE.Vector3(rx+b[0],b[1]*h,rz+b[2]),direction=to.clone().sub(from),g=new THREE.CylinderGeometry(r*.45,r,direction.length(),lod===2?5:3,1,true);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));g.translate(...from.add(to).multiplyScalar(.5).toArray());add(g,rx,rz,false);};
   limb([0,0,0],[0,.96,0],.012);
   const branches=lod===0?3:lod===1?5:8;
   for(let i=0;i<branches;i++){const a=i*2.399,level=.36+(i%3)*.12,dx=Math.cos(a),dz=Math.sin(a),end=[dx*.25,.76+(i%3)*.09,dz*.25];limb([0,level,0],end,.006);if(lod===2)limb([dx*.14,level+.16,dz*.14],[dx*.32,.85,dz*.32],.003);}
  }

  if(lod===2&&!winter){const trunk=new THREE.CylinderGeometry(.009,.014,h*.65,5,1,true);trunk.translate(rx,h*.325,rz);add(trunk,rx,rz,false);}
 }
 function add(g,x,z,leaf){
  if(winter&&g.index){const original=g;g=g.toNonIndexed();original.dispose();}
  const n=g.attributes.position.count,roots=new Float32Array(n*2),leaves=new Float32Array(n),colors=new Float32Array(n*3);
  for(let i=0;i<n;i++){roots.set([x,z],i*2);leaves[i]=leaf?1:0;const shade=leaf?.70+.28*Math.max(0,g.attributes.normal.getY(i)):.13;colors.set(leaf?[shade,shade,shade]:[shade,shade*.68,shade*.36],i*3);}
  g.setAttribute('forestRoot',new THREE.BufferAttribute(roots,2));g.setAttribute('forestLeaf',new THREE.BufferAttribute(leaves,1));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.deleteAttribute('uv');parts.push(g);
 }
 const merged=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return merged;
}
export function createWoodlandRenderer({root,data,camera,onChange=()=>{},season='summer'}){
 const winter=season==='winter',templates=[template(0,winter),template(1,winter),template(2,winter)],material=configure(new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),false,winter),depth=configure(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),true,winter),records=[],groups=new Map(),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),last=new THREE.Vector3(Infinity,Infinity,Infinity),rotation=new THREE.Quaternion();let disposed=false,generated=0;
 function mesh(tile,lod){
  const poses=lod===0?data.farPoses:data.poses,tints=lod===0?data.farTints:data.tints,start=tile.start,count=tile.count,g=new THREE.InstancedBufferGeometry(),base=templates[lod];g.setIndex(base.index);for(const[k,a]of Object.entries(base.attributes))g.setAttribute(k,a);
  const view=new THREE.InstancedInterleavedBuffer(poses.subarray(start*8,(start+count)*8),8);
  g.setAttribute('forestPose',new THREE.InterleavedBufferAttribute(view,4,0));g.setAttribute('forestSize',new THREE.InterleavedBufferAttribute(view,4,4));g.setAttribute('forestTint',new THREE.InstancedBufferAttribute(tints.subarray(start*4,(start+count)*4),4,true));g.instanceCount=count;
  g.boundingBox=new THREE.Box3(new THREE.Vector3(tile.minX,tile.minY,tile.minZ),new THREE.Vector3(tile.maxX,tile.topY,tile.maxZ));g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());
  const m=new THREE.Mesh(g,material);m.name='woodland/'+tile.id+'/'+lod;m.customDepthMaterial=depth;m.castShadow=lod===2;m.receiveShadow=lod>0;m.visible=false;root.add(m);generated++;return m;
 }
 for(const d of data.districts){const group={tile:d,mesh:mesh(d,0),far:true,tiles:[]};groups.set(d.id,group);}
 for(const t of data.tiles){const centerX=(t.minX+t.maxX)/2,centerZ=(t.minZ+t.maxZ)/2,id=Math.floor(centerX/WOODLAND_DISTRICT)+':'+Math.floor(centerZ/WOODLAND_DISTRICT);let group=groups.get(id);
  // A fine tile is partitioned by its grid key, not its irregular canopy bounds.
  const [tx,tz]=t.id.split(':').map(Number),ratio=WOODLAND_DISTRICT/WOODLAND_TILE,correct=Math.floor(tx/ratio)+':'+Math.floor(tz/ratio);group=groups.get(correct)||group;
  const record={tile:t,mid:mesh(t,1),near:null,group};records.push(record);group?.tiles.push(record);
 }
 const distance=(t,p)=>Math.hypot(Math.max(t.minX-p.x,0,p.x-t.maxX),Math.max(t.minY-p.y,0,p.y-t.topY),Math.max(t.minZ-p.z,0,p.z-t.maxZ));
 function update(cam){
  if(disposed||!cam)return;if(cam.position.distanceToSquared(last)<900&&1-Math.abs(rotation.dot(cam.quaternion))<.00012)return;
  last.copy(cam.position);rotation.copy(cam.quaternion);cam.updateMatrixWorld();matrix.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
  for(const group of groups.values()){const d=distance(group.tile,last);group.far=d>(group.far?6200:7000);group.mesh.visible=group.far;}
  for(const r of records){const d=distance(r.tile,last);if(d<1800&&!r.near)r.near=mesh(r.tile,2);const fine=d<(r.near?.visible?1050:850),far=r.group?.far??false;r.mid.visible=!far&&!fine;if(r.near)r.near.visible=!far&&fine;}
  onChange();
 }
 update(camera);
 return{data,update,settled:()=>Promise.resolve(),stats(){let visibleStands=0,triangles=0,drawBatches=0,nearTiles=0;
  for(const r of records)if(r.near)nearTiles++;
  root.traverse(m=>{if(m.name.startsWith('woodland/')&&m.isMesh&&m.visible&&frustum.intersectsSphere(m.geometry.boundingSphere)){visibleStands+=m.geometry.instanceCount;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*m.geometry.instanceCount;drawBatches++;}});
  return{season,standCount:data.standCount,estimatedTrees:data.treeCount,sourceFeatures:data.sourceFeatures,excludedStands:data.excludedCount,sourceBytes:data.byteLength,estimatedGpuInstanceBytes:(data.poses.byteLength+data.tints.byteLength)+(data.farPoses.byteLength+data.farTints.byteLength)+records.filter(r=>r.near).reduce((n,r)=>n+r.tile.count*36,0),generatedBatches:generated,nearTiles,visibleStands,drawBatches,triangles};
 },dispose(){if(disposed)return;disposed=true;for(const r of records)for(const m of[r.mid,r.near])if(m){m.geometry.dispose();m.removeFromParent();}for(const g of groups.values()){g.mesh.geometry.dispose();g.mesh.removeFromParent();}templates.forEach(g=>g.dispose());material.dispose();depth.dispose();}};
}

function imageSampler(airport,imagery,textures){
 const samples=[imagery.regional,imagery.overview].map((record,i)=>{const image=textures[i===0?1:0].image,canvas=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,canvas.width,canvas.height);return{bounds:record.bounds,width:canvas.width,height:canvas.height,pixels:context.getImageData(0,0,canvas.width,canvas.height).data};});
 return(x,z)=>{const p=airport.unproject(x,z);for(const a of samples){const[s,w,n,e]=a.bounds,u=(p.longitude-w)/(e-w),v=(n-p.latitude)/(n-s);if(u<0||u>=1||v<0||v>=1)continue;const i=(Math.floor(v*a.height)*a.width+Math.floor(u*a.width))*4;return[a.pixels[i],a.pixels[i+1],a.pixels[i+2]];}return null;};
}
export async function loadWoodlands({root,airport,denseData,imagery,textures,camera,cache,sourceCache=cache,season='summer',isCurrent,onProgress=()=>{},onChange=()=>{},extraSourcePath=null,extraExclusions=[]}){
 let extra=[],manifest=null;
 const sourceNamespace=sceneryCacheId(airport)+':images:1';
 if(extraSourcePath){const key='source/'+extraSourcePath;let source;try{const r=await fetch(siteUrl(extraSourcePath),{cache:'no-cache'});if(!r.ok)throw Error('Woodland source unavailable');source=await r.json();if(!Array.isArray(source.features)&&!(source.regionId===airport.region?.id&&source.path?.startsWith('assets/cities/'+source.regionId+'/')&&/^[a-f0-9]{64}$/.test(source.sha256)&&source.bytes>0&&source.decodedBytes<64*1024*1024))throw Error('Invalid woodland source');sourceCache.put(sourceNamespace,key,source);}catch(e){source=await sourceCache.get(sourceNamespace,key);if(!source)throw e;}
  if(Array.isArray(source.features))extra=source.features;else manifest=source;
 }
 const identityFeatures=manifest?[{sourceSha256:manifest.sha256,...(manifest.prepared?{preparedSha256:manifest.prepared.sha256}:{})}]:extra;
 const namespace=airport.id+':woodlands:1:'+woodlandSourceKey(airport,[...identityFeatures,...extraExclusions])+':'+denseData.manifest.sha256+':'+imagery.overview.sha256+':'+imagery.regional.sha256;
 let arrays=await cache.getArrays(namespace,'stands',{isCurrent}),data,sourceCacheHit=false,offlinePrepared=false;
 if(arrays)try{data=restoreWoodlandData(arrays,{airportId:airport.id,extent:sceneryExtent(airport)});sourceCacheHit=true;}catch{await cache.remove(namespace,'stands');}
 if(!data&&manifest?.prepared){
  const canonical=airportOf(scenerySourceId(airport)),inputs={region:canonical.region.id,revision:canonical.region.revision,source:manifest.sha256,buildings:denseData.manifest.sha256,overview:imagery.overview.sha256,regional:imagery.regional.sha256,key:woodlandSourceKey(canonical,[{sourceSha256:manifest.sha256},...extraExclusions])};
  try{
   const prepared=await loadPreparedWoodlands(manifest.prepared,{cache:sourceCache,namespace:sourceNamespace,inputs,datumOffset:-airport.elevationM,isCurrent});arrays=prepared.arrays;offlinePrepared=true;data=restoreWoodlandData(arrays,{airportId:airport.id,extent:sceneryExtent(airport),sourceFeatures:prepared.sourceFeatures,excludedCount:prepared.excludedCount});cache.putArrays(namespace,'stands',arrays,{isCurrent});cache.put(namespace,'metadata',{sourceFeatures:data.sourceFeatures,excludedCount:data.excludedCount,offlinePrepared:true});
  }catch(error){if(!isCurrent())throw error;console.warn('Prepared regional trees unavailable; rebuilding from source.',error);}
 }
 if(!data){
  if(manifest){
   const key='woodland/'+manifest.sha256;
   async function decode(blob){
    if(!(blob instanceof Blob)||![manifest.bytes,manifest.decodedBytes].includes(blob.size))throw Error('Incomplete woodland download');const raw=await blob.arrayBuffer(),head=new Uint8Array(raw,0,2),packed=head[0]===31&&head[1]===139,sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join('');if(sha!==(packed?manifest.sha256:manifest.decodedSha256))throw Error('Woodland checksum mismatch');
    const bytes=packed?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():raw;if(bytes.byteLength!==manifest.decodedBytes)throw Error('Incomplete decoded woodlands');const source=JSON.parse(new TextDecoder().decode(bytes));if(source.regionId!==airport.region.id||!Array.isArray(source.features)||source.features.length!==manifest.features)throw Error('Invalid regional woodlands');return source.features;
   }
   let blob=await sourceCache.get(sourceNamespace,key),features;if(blob)try{features=await decode(blob);}catch{await sourceCache.remove(sourceNamespace,key);}
   if(!features){const r=await fetch(siteUrl(manifest.path)+'?v='+manifest.sha256.slice(0,12));if(!r.ok)throw Error('Regional woodland source unavailable');blob=await r.blob();features=await decode(blob);sourceCache.put(sourceNamespace,key,blob);}
   extra=features;
  }
  extra=[...extra,...extraExclusions];
  const steps=generateWoodlandSteps({airport,denseData,extraFeatures:extra,colorAt:imageSampler(airport,imagery,textures)});let last=performance.now(),step;
  while(!(step=steps.next()).done){if(!isCurrent())throw new DOMException('Woodland load cancelled','AbortError');onProgress(step.value);if(performance.now()-last>12){await new Promise(r=>setTimeout(r,0));last=performance.now();}}
  if(!isCurrent())throw new DOMException('Woodland load cancelled','AbortError');arrays=step.value.arrays;data=restoreWoodlandData(arrays,{airportId:airport.id,extent:sceneryExtent(airport),...step.value});cache.putArrays(namespace,'stands',arrays,{isCurrent});
  cache.put(namespace,'metadata',{sourceFeatures:data.sourceFeatures,excludedCount:data.excludedCount});
 }else{const meta=await cache.get(namespace,'metadata');if(meta){data.sourceFeatures=meta.sourceFeatures;data.excludedCount=meta.excludedCount;offlinePrepared=!!meta.offlinePrepared;}}
 if(!isCurrent())throw new DOMException('Woodland load cancelled','AbortError');const renderer=createWoodlandRenderer({root,data,camera,onChange,season});return{...renderer,namespace,sourceCacheHit,offlinePrepared};
}
