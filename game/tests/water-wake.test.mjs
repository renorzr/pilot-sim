// Deterministic visual fixtures only; these are not flight/landing evidence.
import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createWaterWake,WAKE_APPROACH_HEIGHT,WAKE_LIFETIME} from '../src/history/water-wake.js';
import {eventProject} from '../src/history/event-world.js';import {createHistoricalEffects} from '../src/history/effects.js';
const origin=eventProject(-73.911478,40.94),next=eventProject(-73.9111,40.941),length=Math.hypot(next.x-origin.x,next.z-origin.z),vx=(next.x-origin.x)/length*65,vz=(next.z-origin.z)/length*65;
function fixture(time,{height=3,wet=false,speed=65}={}){return{time,x:origin.x+vx*time,y:height,z:origin.z+vz*time,yaw:Math.atan2(vx,-vz),pitch:.14,roll:0,speed,airData:{tas:speed},velocity:{x:wet&&speed<3?0:vx,y:wet?0:-1,z:wet&&speed<3?0:vz},...(wet?{water:{phase:'water-run',waterSpeed:speed,firstImpact:{time:1,sinkMps:2.5}}}:{})};}
const setup=()=>{const scene=new THREE.Scene(),wake=createWaterWake(scene);return{scene,wake};};
const position=(mesh,index=0)=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(mesh.instanceMatrix.array,index*16));
test('subtle surface disturbance starts below 20 feet over water; airborne passes never spray',()=>{
 assert(Math.abs(WAKE_APPROACH_HEIGHT-6.096)<.001);
 const {scene,wake}=setup(),s=fixture(0,{height:WAKE_APPROACH_HEIGHT+.1}),before=structuredClone(s);wake.update(s);assert.equal(wake.stats().phase,'none');assert.equal(wake.stats().foam,0);assert.deepEqual(s,before);
 for(let t=.05;t<=.6;t+=.05)wake.update(fixture(t,{height:5}));assert.equal(wake.stats().phase,'approach');assert(wake.stats().foam>0);assert.equal(wake.stats().spray,0);assert(wake.stats().peakOpacity<.13);assert.equal(wake.stats().approachHeightFt,20);
 const land=eventProject(-73.95,40.91);wake.update({...fixture(3,{height:3}),x:land.x,z:land.z});assert.equal(wake.stats().foam,0);assert.equal(wake.stats().spray,0);wake.dispose();assert.equal(scene.children.length,0);
});
test('real contact produces dense foam and spray; older foam stays on the water and spreads sideways',()=>{
 const {scene,wake}=setup();for(let t=0;t<1;t+=.05)wake.update(fixture(t));const light=wake.stats().peakOpacity;
 for(let t=1;t<=2;t+=.05)wake.update(fixture(t,{height:2.3,wet:true}));assert(wake.stats().spray>0&&wake.stats().foam>100);assert(wake.stats().peakOpacity>light*2);const foam=scene.getObjectByName('ditching-world-foam'),index=Array.from(foam.geometry.attributes.wakeOpacity.array.subarray(0,foam.count)).findIndex(v=>v>.3),seed=foam.geometry.attributes.wakeSeed.array[index],a=position(foam,index),spread=wake.stats().maxSpread;assert(index>=0);
 for(let t=2.05;t<=2.5;t+=.05)wake.update(fixture(t,{height:2.3,wet:true}));const nextIndex=Array.from(foam.geometry.attributes.wakeSeed.array.subarray(0,foam.count)).findIndex(v=>v===seed),b=position(foam,nextIndex);assert(nextIndex>=0);assert(a.distanceTo(b)<10,'Emitted foam must not follow the aircraft moving over 30 m');assert(wake.stats().maxSpread>spread);assert(Math.abs(b.y-.05)<.03);wake.dispose();
});
test('stopping leaves an expanding wake which fades out; pause and all effects leave flight state immutable',()=>{
 const {scene,wake}=setup();for(let t=0;t<=3;t+=.05)wake.update(fixture(t,{wet:t>=1}));const fixed=fixture(3,{wet:true,speed:0}),before=structuredClone(fixed);wake.update(fixed);const initial=wake.stats(),foam=scene.getObjectByName('ditching-world-foam'),matrix=foam.instanceMatrix.array.slice();for(let i=0;i<20;i++)wake.update(fixed);assert.deepEqual(foam.instanceMatrix.array,matrix);assert.deepEqual(fixed,before);
 for(let t=3.05;t<=6;t+=.05)wake.update({...fixed,time:t});assert(wake.stats().maxSpread>initial.maxSpread);assert(wake.stats().peakOpacity<initial.peakOpacity);
 for(let t=6;t<=3+WAKE_LIFETIME+1;t+=.1)wake.update({...fixed,time:t});assert.equal(wake.stats().foam,0);assert.equal(wake.stats().spray,0);assert.equal(wake.stats().phase,'none');wake.dispose();
});
test('replay seeks reconstruct the same water-space trail and reset old clip/attempt emissions',()=>{
 const live=setup(),replay=setup(),sample=time=>({...fixture(Math.max(0,time),{wet:time>=1}),replayAudio:{segment:0,attempt:1,cycle:0,epoch:0}});
 for(let i=0;i<=80;i++)live.wake.update(sample(i/16));replay.wake.update(sample(5),{sampleState:sample});assert.equal(replay.wake.stats().foam,live.wake.stats().foam);assert.equal(replay.wake.stats().spray,live.wake.stats().spray);
 const a=live.scene.getObjectByName('ditching-world-foam'),b=replay.scene.getObjectByName('ditching-world-foam');assert.deepEqual(a.instanceMatrix.array,b.instanceMatrix.array);
 replay.wake.update({...sample(.5),replayAudio:{segment:1,attempt:2,cycle:0,epoch:1}});assert.equal(replay.wake.stats().spray,0);assert(replay.wake.stats().foam<20);assert.equal(replay.wake.stats().rebuilds,1);live.wake.dispose();replay.wake.dispose();
});
test('wake allocation remains bounded through a long moving contact and historical integration disposes it',()=>{
 const {wake}=setup();for(let i=0;i<600;i++)wake.update(fixture(i*.05,{wet:i*.05>=1}));const stats=wake.stats();assert(stats.foam+stats.spray<=stats.capacity);assert(stats.bufferBytes<180000);assert(stats.waterCells<=4096);wake.dispose();
 const s=fixture(1.5,{wet:true}),before=structuredClone(s),scene=new THREE.Scene(),fx=createHistoricalEffects(scene);fx.update(s,null);assert(fx.stats().wake.foam>=0);assert.deepEqual(s,before);fx.dispose();assert.equal(scene.children.length,0);
});
