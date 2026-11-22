import {loadCityManifest}from '../src/airports/city-cached-assets.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile}from 'node:fs/promises';
import {gunzipSync}from 'node:zlib';
import * as THREE from 'three';
import {decodeDenseCity,restoreDenseCity}from '../src/airports/dense-city-data.js';
import {createDenseCityRenderer}from '../src/airports/dense-city-render.js';
import {cityCacheNamespaces,createCityPersistentCache}from '../src/airports/city-persistent-cache.js';
import {packCityModel,restoreCityModel}from '../src/airports/city-model-cache.js';
const manifest=JSON.parse(await readFile(new URL('../../public/assets/cities/changi/buildings-v1.json',import.meta.url))),raw=gunzipSync(await readFile(new URL('../../public/'+manifest.path,import.meta.url))),data=decodeDenseCity(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),manifest);
test('persisted source arrays restore every point and the same courtyard/contact candidates without reindexing',()=>{
 const snapshot=data.snapshot(),restored=restoreDenseCity(structuredClone(snapshot),manifest);
 assert.equal(restored.count,data.count);assert.equal(restored.byteLength,data.byteLength);
 for(const[name,array]of Object.entries(restored.snapshot()))assert.deepEqual(array,snapshot[name]);
 let holes=0;for(let i=0;i<data.count;i+=97){const b=data.building(i);assert.deepEqual(restored.building(i),b);if(b.ringCount>1)holes++;const a={x:b.cx,y:b.topY+10,z:b.cz},end={...a,y:b.baseY-10};assert.deepEqual([...restored.candidates(a,end,2,3)].map(b=>b.id),[...data.candidates(a,end,2,3)].map(b=>b.id));}assert(holes>0);
});
test('corrupt source arrays and changed source manifests are rejected before activation',()=>{
 const s=data.snapshot();assert.throws(()=>restoreDenseCity(s,{...manifest,buildings:1}),/Incompatible/);
 assert.throws(()=>restoreDenseCity({...s,points:s.points.subarray(1)},manifest),/Incompatible/);
 assert.throws(()=>restoreDenseCity({...s,indices:new Uint32Array(s.indices.length).fill(data.count)},manifest),/contact index/);
 const starts=s.starts.slice();starts[1]=s.indices.length+1;assert.throws(()=>restoreDenseCity({...s,starts},manifest),/grid/);
});
test('source hashes and architecture changes select independent model cache generations',()=>{
 const a=cityCacheNamespaces('changi',manifest),b=cityCacheNamespaces('changi',{...manifest,sha256:'changed'}),c=cityCacheNamespaces('changi',{...manifest,architecture:{...manifest.architecture,facadePalette:[[1,2,3]]}});
 assert.notEqual(a.source,b.source);assert.notEqual(a.models,b.models);assert.equal(a.source,c.source);assert.notEqual(a.models,c.models);assert.notEqual(a.source,cityCacheNamespaces('jfk',manifest).source);
});
test('real prepared geometry survives a persistent-array round trip and invalid cached models rebuild',async()=>{
 const tiles=manifest.tiles.slice(0,2),small={...data,manifest:{...manifest,tiles}},records=new Map(),cache={stats:()=>({available:true}),get:async(ns,k)=>structuredClone(records.get(k)||null),put(ns,k,v){records.set(k,structuredClone(v));return Promise.resolve(true);},remove(ns,k){records.delete(k);}},material=new THREE.MeshStandardMaterial(),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000),t=tiles[0];camera.position.set((t.minX+t.maxX)/2,1500,(t.minZ+t.maxZ)/2);camera.lookAt(camera.position.x,0,camera.position.z);
 const render=async()=>{const root=new THREE.Group(),r=createDenseCityRenderer({root,data:small,material,persistentCache:cache,modelNamespace:'test'});r.update(camera);await r.settled();return{root,r};};
 let a,b,c;try{
  a=await render();assert(a.r.stats().builtTiles>0);const packed=a.root.children.map(g=>packCityModel({meshes:g.children,bytes:0,triangles:0,instances:0}));
  b=await render();assert.equal(b.r.stats().builtTiles,0);assert.equal(b.r.stats().restoredTiles,a.r.stats().builtTiles);
  assert.deepEqual(b.root.children.map(g=>packCityModel({meshes:g.children,bytes:0,triangles:0,instances:0})),packed);
  const key=records.keys().next().value;records.set(key,{format:-1});c=await render();assert.equal(c.r.stats().builtTiles,1);assert(c.r.stats().restoredTiles>0);
 }finally{for(const x of[a,b,c])x?.r.dispose();material.dispose();}
});
test('unsupported or denied browser storage remains an optional optimization',async()=>{
 for(const open of[async()=>null,async()=>{throw new Error('Denied');}]){
  const c=createCityPersistentCache('changi',{open});assert.equal(await c.get('n','key'),null);assert.equal(await c.put('n','key',{bytes:new Uint8Array(10)}),false);assert.equal(await c.putArrays('n','decoded',{points:new Float32Array(10)}),false);await c.settled();assert.equal(c.stats().pendingWrites,0);
 }
 const originalFetch=globalThis.fetch,records=new Map(),cache={get:async(ns,k)=>records.get(k)||null,put(ns,k,v){records.set(k,v);}};
 try{const manifest={tiles:[],sha256:'dated-version'};globalThis.fetch=async()=>new Response(JSON.stringify(manifest));assert.deepEqual(await loadCityManifest('assets/test-manifest.json',cache,'fixture'),manifest);globalThis.fetch=async()=>{throw new Error('Offline');};assert.deepEqual(await loadCityManifest('assets/test-manifest.json',cache,'fixture'),manifest);await assert.rejects(loadCityManifest('assets/missing.json',cache,'fixture'),/Offline/);}finally{globalThis.fetch=originalFetch;}
 assert.throws(()=>restoreCityModel({format:-1},null),/Invalid model cache/);
});
