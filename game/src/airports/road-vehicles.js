import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {VEHICLE_TYPES} from './road-traffic.js';

export function vehicleTemplate(type,detail=true){
 const v=VEHICLE_TYPES[type],parts=[],color=new THREE.Color();
 function box(w,h,d,x,y,z,hex=0xffffff,body=1){
  const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();g.translate(x,y,z);const count=g.attributes.position.count,colors=new Float32Array(count*3),flags=new Float32Array(count).fill(body);color.setHex(hex);
  for(let j=0;j<count;j++)colors.set([color.r,color.g,color.b],j*3);g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('trafficBody',new THREE.BufferAttribute(flags,1));parts.push(g);
 }
 const{width:w,height:h,length:l}=v;
 if(type<2){
  box(w,h*.34,l,0,h*.31,0);box(w*.8,h*.4,l*.49,0,h*.64,l*.04,0x24343e,0);box(w*.84,h*.055,l*.51,0,h*.86,l*.04);
 }else if(type===2){
  box(w,h*.66,l*.95,0,h*.47,0);box(w*.86,h*.3,l*.27,0,h*.66,-l*.33,0x24343e,0);box(w,h*.075,l*.98,0,h*.84,0);
 }else if(type===3){
  box(w,h*.82,l*.65,0,h*.54,l*.15);box(w*.95,h*.59,l*.28,0,h*.38,-l*.35);box(w*.86,h*.23,l*.2,0,h*.61,-l*.36,0x24343e,0);
 }else{
  box(w,h*.65,l,0,h*.43,0);box(w*.98,h*.29,l*.88,0,h*.68,-l*.025,0x24343e,0);box(w,h*.075,l*.98,0,h*.86,0);
 }
 if(detail){
  for(const x of [-1,1])for(const z of [-1,1])box(.2,.44,l*.12,x*(w/2-.06),.22,z*l*.31,0x151a1d,0);
  for(const x of [-1,1]){box(w*.19,.12,.07,x*w*.31,h*.34,-l/2-.015,0xe5e2bd,0);box(w*.18,.12,.07,x*w*.31,h*.34,l/2+.015,0x9a302a,0);}
 }
 const result=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());return result;
}
function vehicleMaterial(){
 const m=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.65,metalness:.12});
 m.onBeforeCompile=shader=>{
  shader.vertexShader='attribute float trafficBody;attribute float trafficFade;varying float vehicleFade;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.xyz=color.xyz*mix(vec3(1.),instanceColor.xyz,trafficBody);\n#endif\nvehicleFade=trafficFade;');
  shader.fragmentShader='varying float vehicleFade;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)>vehicleFade)discard;');
 };m.customProgramCacheKey=()=> 'shared-road-vehicle-v1';return m;
}
export function createVehicleRenderer(root,traffic,{viewportHeight=()=>600,capacity=null,maxDistance=5500}={}){
 const material=vehicleMaterial(),batches=[],counts=[],palette=new Map(),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),euler=new THREE.Euler(0,0,0,'YXZ'),unit=new THREE.Vector3(1,1,1),frustum=new THREE.Frustum(),clip=new THREE.Matrix4(),sphere=new THREE.Sphere(),p={};
 for(let type=0;type<VEHICLE_TYPES.length;type++)for(const detail of [true,false]){
  const slots=capacity??traffic.vehicles.filter(v=>v.type===type).length,geometry=vehicleTemplate(type,detail),fade=new Float32Array(slots);
  geometry.setAttribute('trafficFade',new THREE.InstancedBufferAttribute(fade,1));const mesh=new THREE.InstancedMesh(geometry,material,slots);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.name='traffic/cars/'+VEHICLE_TYPES[type].name+'/'+(detail?'near':'far');root.add(mesh);batches.push({mesh,type,detail,fade,triangles:geometry.index?geometry.index.count/3:geometry.attributes.position.count/3});
 }
 let lastTime=-1,lastRevision=-1,lastCamera='',visible=0,near=0,far=0,triangles=0,disposed=false;
 function update(camera){
  if(disposed)return false;
  camera.updateMatrixWorld();const cameraKey=camera.matrixWorld.elements.join(',')+':'+camera.projectionMatrix.elements.join(',');if(lastTime===traffic.clock&&lastRevision===(traffic.revision||0)&&lastCamera===cameraKey)return false;lastTime=traffic.clock;lastRevision=traffic.revision||0;lastCamera=cameraKey;
  clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(clip);counts.fill(0,0,batches.length);visible=near=far=triangles=0;
  const pixels=viewportHeight()/(2*Math.tan((camera.fov||50)*Math.PI/360));
  for(const v of traffic.vehicles){
   traffic.pose(v,p);if(p.fade<.015)continue;position.set(p.x,p.y+v.height/2,p.z);sphere.center.copy(position);sphere.radius=v.length*.65;
   const distance=position.distanceTo(camera.position);if(distance>maxDistance||v.length/distance*pixels<.7||!frustum.intersectsSphere(sphere))continue;
   const detail=v.lod===true?distance<1700:distance<1450;v.lod=detail;
   const index=v.type*2+(detail?0:1),batch=batches[index],i=counts[index]||0;if(i>=batch.fade.length)continue;position.set(p.x,p.y,p.z);euler.set(p.pitch,-p.yaw,0);rotation.setFromEuler(euler);matrix.compose(position,rotation,unit);batch.mesh.setMatrixAt(i,matrix);
   if(!palette.has(v.color))palette.set(v.color,new THREE.Color(v.color));batch.mesh.setColorAt(i,palette.get(v.color));batch.fade[i]=p.fade;counts[index]=i+1;visible++;if(detail)near++;else far++;triangles+=batch.triangles;
  }
  for(let j=0;j<batches.length;j++){
   const b=batches[j],count=counts[j]||0;b.mesh.count=count;b.mesh.visible=count>0;
   if(count){b.mesh.instanceMatrix.clearUpdateRanges();b.mesh.instanceMatrix.addUpdateRange(0,count*16);b.mesh.instanceMatrix.needsUpdate=true;b.mesh.instanceColor.clearUpdateRanges();b.mesh.instanceColor.addUpdateRange(0,count*3);b.mesh.instanceColor.needsUpdate=true;b.mesh.geometry.attributes.trafficFade.needsUpdate=true;}
  }
  return true;
 }
 return{update,stats:()=>({visible,near,far,triangles,drawCalls:batches.filter(b=>b.mesh.visible).length,instanceBytes:batches.reduce((n,b)=>n+b.fade.byteLength+b.mesh.instanceMatrix.array.byteLength+(b.mesh.instanceColor?.array.byteLength||0),0)}),dispose(){if(disposed)return;disposed=true;for(const b of batches){b.mesh.geometry.dispose();b.mesh.dispose();b.mesh.removeFromParent();}material.dispose();}};
}
