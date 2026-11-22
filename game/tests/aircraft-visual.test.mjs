import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile}from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader}from 'three/addons/loaders/GLTFLoader.js';
import {createAircraftVisual,AIRCRAFT_CONTACTS}from '../src/aircraft/visual.js';
import {createFlight}from '../src/flight.js';
async function model(){const b=await readFile(new URL('../../public/assets/aircraft/skyline-320.glb',import.meta.url));const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');return createAircraftVisual({THREE,scene:gltf.scene});}
test('aircraft batching preserves authored UV channels, tangent frames and vertex colours',()=>{
 const scene=new THREE.Group(),airframe=new THREE.Group();airframe.name='Airframe';scene.add(airframe);airframe.rotation.y=.3;
 const material=new THREE.MeshStandardMaterial(),expected=[];
 for(let i=0;i<2;i++){
  const geometry=new THREE.PlaneGeometry(2,1);
  geometry.setAttribute('uv1',geometry.attributes.uv.clone());
  geometry.attributes.uv1.setXY(0,.2+i*.1,.7);
  geometry.computeTangents();
  geometry.setAttribute('color',new THREE.Uint8BufferAttribute([255,0,0,0,255,0,0,0,255,255,255,255],3,true));
  const mesh=new THREE.Mesh(geometry,material);mesh.position.x=i*3;mesh.rotation.z=i*.4;airframe.add(mesh);mesh.updateMatrix();
  expected.push(geometry.toNonIndexed().applyMatrix4(mesh.matrix));
 }
 const sources=airframe.children.map(m=>({geometry:m.geometry,uv:[...m.geometry.attributes.uv.array]}));
 const v=createAircraftVisual({THREE,scene});
 try{
  assert.equal(airframe.children.length,1);
  const geometry=airframe.children[0].geometry;
  for(const name of ['position','normal','uv','uv1','tangent','color']){
   const attribute=geometry.getAttribute(name);assert(attribute,`missing ${name}`);
   const values=expected.flatMap(g=>[...g.getAttribute(name).array]);
   assert.equal(attribute.array.length,values.length);
   for(let i=0;i<values.length;i++)assert(Math.abs(attribute.array[i]-values[i])<1e-6,`${name}[${i}]`);
  }
  assert.equal(geometry.attributes.color.normalized,true);
  assert(geometry.attributes.color.array instanceof Uint8Array);
  for(const source of sources)assert.deepEqual([...source.geometry.attributes.uv.array],source.uv);
 }finally{v.dispose();expected.forEach(g=>g.dispose());}
});
test('aircraft batching keeps incompatible UV layouts and storage formats in separate batches',()=>{
 const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial();scene.name='Airframe';
 for(const variant of ['plain','uv','uv1','tangent','uv16'])for(let i=0;i<2;i++){
  const geometry=new THREE.PlaneGeometry(1,1);
  if(variant==='plain')geometry.deleteAttribute('uv');
  if(variant==='uv1')geometry.setAttribute('uv1',geometry.attributes.uv.clone());
  if(variant==='tangent')geometry.computeTangents();
  if(variant==='uv16')geometry.setAttribute('uv',new THREE.Uint16BufferAttribute([0,65535,65535,65535,0,0,65535,0],2,true));
  scene.add(new THREE.Mesh(geometry,material));
 }
 const v=createAircraftVisual({THREE,scene});
 try{
  assert.equal(scene.children.length,5);
  assert(scene.children.every(m=>m.geometry.attributes.position.count===12));
  assert.equal(scene.children.filter(m=>!m.geometry.attributes.uv).length,1);
  assert.equal(scene.children.filter(m=>m.geometry.attributes.uv1).length,1);
  assert.equal(scene.children.filter(m=>m.geometry.attributes.tangent).length,1);
  const quantized=scene.children.find(m=>m.geometry.attributes.uv?.array instanceof Uint16Array);
  assert(quantized);assert.equal(quantized.geometry.attributes.uv.normalized,true);
  const triangleUvs=[0,65535,0,0,65535,65535,0,0,65535,0,65535,65535];
  assert.deepEqual([...quantized.geometry.attributes.uv.array],[...triangleUvs,...triangleUvs]);
 }finally{v.dispose();}
});
test('self-hosted exterior model has airliner dimensions, finite geometry and named moving systems',async()=>{const v=await model();try{const s=createFlight(null,{levelId:'takeoff'});v.update(s,0);const st=v.stats();assert(st.triangles>20000&&st.triangles<120000);assert(st.draws<100);const width=st.bounds.max[0]-st.bounds.min[0],length=st.bounds.max[2]-st.bounds.min[2];assert(width>35&&width<37);assert(length>37&&length<39);for(const name of['NoseGear','NoseSteering','MainGear_L','MainGear_R','Flap_L_0','Rudder','Fan_L','Fan_R'])assert(st.joints.includes(name),name);v.group.traverse(o=>{if(o.geometry)for(const name of Object.keys(o.geometry.attributes))assert([...o.geometry.attributes[name].array].every(Number.isFinite),o.name);});for(const p of[...AIRCRAFT_CONTACTS.main,...AIRCRAFT_CONTACTS.nose])assert.equal(p.y,-2.8);}finally{v.dispose();}});
test('visual animation follows actual actuator positions and cannot repair or change engine state',async()=>{const v=await model();try{const s=createFlight(null,{levelId:'ils-approach'});s.gear=true;s.gearPosition=.35;s.flaps=4;s.flapPosition=1.6;s.engines[0].status='failed';s.engines[0].spool=0;s.engines[0].n1=0;s.time=5;const before=structuredClone(s);v.update(s,.02);assert.deepEqual(s,before);const st=v.stats();assert.equal(st.gearPosition,.35);assert.equal(st.flapPosition,1.6);assert.equal(st.engines[0].status,'failed');assert.equal(st.engines[0].spool,0);s.time+=.1;v.update(s,.1);const later=v.stats();assert.equal(later.fanAngles.L,st.fanAngles.L);assert.notEqual(later.fanAngles.R,st.fanAngles.R);const paused=structuredClone(later.fanAngles);v.update(s,0);assert.deepEqual(v.stats().fanAngles,paused);}finally{v.dispose();}});
