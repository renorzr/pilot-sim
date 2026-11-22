import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync}from 'node:zlib';
import * as THREE from 'three';
import {createLoadingProgress,LOADING_STAGES}from '../src/loading-progress.js';
import {decodeDenseCity,readDenseResponse,DENSE_MAGIC}from '../src/airports/dense-city-data.js';
import {createDenseCityRenderer}from '../src/airports/dense-city-render.js';
import {t}from '../src/i18n/index.js';

function fixture(format=3){
 const stride=format===3?76:64,ringOffset=32+stride*2,pointOffset=ringOffset+12,buffer=new ArrayBuffer(pointOffset+32),v=new DataView(buffer);
 [DENSE_MAGIC,format,2,2,8,stride].forEach((n,i)=>v.setUint32(i*4,n,true));
 new Uint32Array(buffer,ringOffset,3).set([0,4,8]);
 for(let i=0;i<2;i++){
  const o=32+i*stride,cx=i*500;v.setFloat64(o,i+1,true);v.setUint32(o+40,i,true);v.setUint32(o+44,1,true);
  for(const[k,n]of [[16,cx-5],[20,cx+5],[24,-5],[28,5],[32,0],[36,10],[56,cx],[60,0]])v.setFloat32(o+k,n,true);
  if(format===3){v.setUint16(o+68,500,true);v.setUint16(o+70,500,true);v.setUint16(o+74,65535,true);}
  new Int16Array(buffer,pointOffset+i*16,8).set([-250,-250,250,-250,250,250,-250,250]);
 }
 return{buffer,manifest:{buildings:2,tiles:[{id:'0:0',start:0,count:2,minX:-5,maxX:505,minZ:-5,maxZ:5,topY:10}]}};
}
test('parallel loading never rewinds, discovers additional work and reaches 100 only when accepted',()=>{
 const seen=[],p=createLoadingProgress(v=>seen.push(v),{hasCity:true});
 p.update('assets',1);p.update('city',.5,{stage:'download',loadedBytes:50,totalBytes:100});p.update('assets',.2);p.update('city',.4,{stage:'models',completed:1,total:8});p.update('aircraft',1);p.update('city',1);
 assert(seen.every((s,i)=>s.percent<100&&(!i||s.percent>=seen[i-1].percent)));p.complete();assert.equal(seen.at(-1).percent,100);assert.equal(seen.at(-1).stage,'ready');
 const n=seen.length;p.update('assets',0);p.complete();assert.equal(seen.length,n);
 const reset=[];createLoadingProgress(v=>reset.push(v),{hasCity:true}).update('assets',0);assert.equal(reset[0].percent,0);
});
test('gzip streaming reports wire bytes and preserves both source formats, rings and contact candidates',async()=>{
 for(const format of[2,3]){
  const{buffer,manifest}=fixture(format),compressed=gzipSync(Buffer.from(buffer)),events=[];manifest.bytes=compressed.byteLength;
  let offset=0;const response=new Response(new ReadableStream({pull(c){if(offset>=compressed.length){c.close();return;}c.enqueue(compressed.subarray(offset,offset+17));offset+=17;}}),{headers:{'Content-Length':String(compressed.byteLength)}});
  const data=await readDenseResponse(response,manifest,{onProgress:s=>events.push(s)}),sync=decodeDenseCity(buffer,manifest);
  assert.equal(data.count,sync.count);assert.equal(data.byteLength,sync.byteLength);for(let i=0;i<2;i++)assert.deepEqual(data.building(i),sync.building(i));
  const a={x:0,y:5,z:-20},b={x:0,y:5,z:20};assert.deepEqual([...data.candidates(a,b)],[...sync.candidates(a,b)]);
  const download=events.filter(e=>e.stage==='download').at(-1);assert.equal(download.loadedBytes,compressed.byteLength);assert.equal(download.totalBytes,compressed.byteLength);
  for(const stage of['download','decompress','decode']){const all=events.filter(e=>e.stage===stage);assert(all.length>0);assert.equal(all.at(-1).fraction,1);}
 }
});
test('browser-inflated responses avoid misleading compressed totals and failures never finish loading',async()=>{
 const{buffer,manifest}=fixture();manifest.bytes=50;const events=[];
 const data=await readDenseResponse(new Response(buffer,{headers:{'Content-Encoding':'gzip','Content-Length':'50'}}),manifest,{onProgress:e=>events.push(e)});
 assert.equal(data.count,2);assert(events.filter(e=>e.stage==='download').every(e=>e.totalBytes===null));
 await assert.rejects(readDenseResponse(new Response('failed',{status:503}),manifest),/unavailable/);
 await assert.rejects(readDenseResponse(new Response(new Uint8Array(35)),manifest),/Invalid city geometry/);
 let cancelled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}});
 await assert.rejects(readDenseResponse(new Response(stream),manifest,{isCurrent:()=>false}),{name:'AbortError'});assert(cancelled);
});
test('model progress accounts for all prepared variants and finishes before readiness without rebuilding on turns',async()=>{
 const{buffer,manifest}=fixture(),data=decodeDenseCity(buffer,manifest),events=[],root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),r=createDenseCityRenderer({root,data,material,onProgress:e=>events.push(e)}),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000);
 try{camera.position.set(0,100,50);camera.lookAt(0,0,0);r.update(camera);await r.settled();const last=events.at(-1);assert(last.completed>0);assert.equal(last.completed,last.total);assert.equal(last.completed,r.stats().cachedVariants);assert.equal(r.stats().pendingTiles,0);assert.equal(r.stats().preloadedBuildings,2);const count=events.length;camera.rotateY(Math.PI);r.update(camera);await r.settled();assert.equal(r.stats().cachedVariants,last.completed);assert(events.slice(count).every(e=>e.completed===last.completed));}finally{r.dispose();material.dispose();}
});
test('all loading phases, byte/count feedback and accessible progress names have English translations',()=>{
 for(const s of[...Object.values(LOADING_STAGES),'机场数据加载进度','正在载入，请稍候…','已准备 24 / 150 个模型'])assert(!/\p{Script=Han}/u.test(t(s,'en')),s);
});
