import * as THREE from 'three';
import {cityTemplate}from './dense-city-instances.js';
const INSTANCE_NAMES=['cityInstance','cityDimensions','cityRoofColor','cityWallColor','cityType'];
export function packCityModel(parts){
 return{format:1,bytes:parts.bytes,triangles:parts.triangles,instances:parts.instances,meshes:parts.meshes.map(m=>{
  const g=m.geometry,instanced=!!m.userData.cityInstances,attributes={};
  for(const[name,a]of Object.entries(g.attributes))if(!instanced||INSTANCE_NAMES.includes(name))attributes[name]={array:a.array,size:a.itemSize,normalized:a.normalized};
  return{instanced,style:g.userData.style,name:m.name,position:m.position.toArray(),castShadow:m.castShadow,attributes,index:instanced?null:g.index?.array,instanceCount:instanced?g.instanceCount:null,box:g.boundingBox?[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()]:null,sphere:g.boundingSphere?[g.boundingSphere.center.toArray(),g.boundingSphere.radius]:null};
 })};
}
export function restoreCityModel(record,material){
 if(record?.format!==1||!Array.isArray(record.meshes)||record.meshes.length>8||![record.bytes,record.triangles,record.instances].every(n=>Number.isFinite(n)&&n>=0))throw Error('Invalid model cache');
 const meshes=[];
 try{
  for(const r of record.meshes){
   const g=r.instanced?new THREE.InstancedBufferGeometry():new THREE.BufferGeometry();
   // Keep wrappers independent and reuse the same template arrays as cold loads.
   if(r.instanced){
    if(!['flat','gable','hip'].includes(r.style)||!Number.isSafeInteger(r.instanceCount)||r.instanceCount<0)throw Error('Invalid cached instances');
    const t=cityTemplate(r.style);for(const[name,size]of[['position',3],['normal',3],['citySurface',3],['roofLift',1]])g.setAttribute(name,new THREE.BufferAttribute(t[name],size));
    g.setAttribute('color',new THREE.BufferAttribute(new Uint8Array(t.position.length).fill(255),3,true));g.setIndex(new THREE.BufferAttribute(t.index,1));g.instanceCount=r.instanceCount;
   }
   for(const[name,a]of Object.entries(r.attributes||{})){
    if(!ArrayBuffer.isView(a.array)||!Number.isInteger(a.size)||a.size<1||a.size>4||a.array.length%a.size)throw Error('Invalid cached attribute');
    if(r.instanced&&(!INSTANCE_NAMES.includes(name)||a.array.length!==r.instanceCount*a.size))throw Error('Truncated cached instance');
    g.setAttribute(name,new (r.instanced?THREE.InstancedBufferAttribute:THREE.BufferAttribute)(a.array,a.size,a.normalized));
   }
   if(r.instanced&&INSTANCE_NAMES.some(n=>!g.getAttribute(n)))throw Error('Missing cached instance');
   if(!g.getAttribute('position')||!g.getAttribute('normal')||!g.getAttribute('citySurface'))throw Error('Missing cached geometry');
   if(!r.instanced){if(!(r.index instanceof Uint16Array||r.index instanceof Uint32Array))throw Error('Invalid cached index');g.setIndex(new THREE.BufferAttribute(r.index,1));}
   if(r.box)g.boundingBox=new THREE.Box3(new THREE.Vector3(...r.box[0]),new THREE.Vector3(...r.box[1]));else g.computeBoundingBox();
   if(r.sphere)g.boundingSphere=new THREE.Sphere(new THREE.Vector3(...r.sphere[0]),r.sphere[1]);else g.computeBoundingSphere();
   g.userData={style:r.style};const m=new THREE.Mesh(g,material);m.name=r.name;m.position.fromArray(r.position);m.castShadow=!!r.castShadow;if(r.instanced)m.userData.cityInstances=true;meshes.push(m);
  }
  return{meshes,bytes:record.bytes,triangles:record.triangles,instances:record.instances};
 }catch(e){for(const m of meshes)m.geometry.dispose();throw e;}
}
