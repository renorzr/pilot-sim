import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {aircraftRegistry,aircraftDefinition,createAircraftRegistry,DEFAULT_DEFINITION,validateAircraftDefinition} from '../src/aircraft/registry.js';
import {resolveAircraft,DEFAULT_AIRCRAFT} from '../src/aircraft/catalog.js';
import {createFlight,advanceFlight,restoreCheckpoint,setEngineStatus} from '../src/flight.js';
import {refreshAirData} from '../src/sim/aerodynamics.js';
import {stepEngines,engineYawMoment} from '../src/sim/engines.js';
import {stepAttitude} from '../src/sim/controls.js';
import {createAircraftRig} from '../src/aircraft/rig.js';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {soundTargets} from '../src/audio/soundscape.js';
import {captureAircraftBaseline} from './helpers/aircraft-baseline.mjs';

function fixture(){
 const d=structuredClone(DEFAULT_DEFINITION);d.id='fixture';d.name='Non-playable test fixture';d.defaultAppearance.model='fixture';
 d.engines=[-8,-4,4,8].map((x,id)=>({id,key:'test-'+id,side:x<0?'left':'right',maxThrustN:90000,yawArmM:-x,audioPan:x/12}));
 d.visual.rig.fans=d.engines.map(e=>({engine:e.id,node:'TestFan'+e.id,key:e.key,axis:'z'}));
 return createAircraftRegistry([d]).resolve({model:'fixture',definitionVersion:1});
}

test('takeoff, approach, engine-out, go-around and historical trajectories retain pre-refactor numerics',async()=>{
 const expected=JSON.parse(await readFile(new URL('fixtures/a320-before-foundation.json',import.meta.url))),actual=captureAircraftBaseline();
 function compare(a,b,path){
  if(typeof a==='number'){assert(Number.isFinite(b),path);assert(Math.abs(a-b)<=1e-9+Math.abs(a)*1e-12,path+': '+a+' != '+b);}
  else if(a&&typeof a==='object'){assert(b&&typeof b==='object',path);assert.equal(Array.isArray(a)?a.length:Object.keys(a).length,Array.isArray(b)?b.length:Object.keys(b).length,path);for(const key of Object.keys(a))compare(a[key],b[key],path+'.'+key);}
  else assert.equal(b,a,path);
 }
 compare(expected,actual,'baseline');
});

test('versioned definitions are immutable, isolated and reject unsupported identities and invalid adapters',()=>{
 assert.deepEqual(aircraftRegistry.list().map(d=>d.id),['a320','a380'],'only completed aircraft ship');
 assert.equal(aircraftDefinition({y:100}),DEFAULT_DEFINITION);assert.equal(resolveAircraft({model:'a320'}).definitionVersion,1);
 assert.throws(()=>aircraftDefinition({model:'a320',definitionVersion:999}));assert.throws(()=>resolveAircraft({model:'missing'}));assert.throws(()=>{DEFAULT_DEFINITION.engines[0].maxThrustN=1;},TypeError);
 for(const mutate of [d=>d.engines[1].id=0,d=>d.flaps.angles.pop(),d=>d.controls.law='missing',d=>d.visual.rig.transforms[0].signal='nonexistent']){const d=structuredClone(DEFAULT_DEFINITION);mutate(d);assert.throws(()=>validateAircraftDefinition(d));}
 const d=fixture();assert.equal(d.engines.length,4);assert.equal(DEFAULT_DEFINITION.engines.length,2);
});

test('the shared engine integrator supports four unequal mounting arms, shutdown and independent reverse',()=>{
 const d=fixture(),s=createFlight('takeoff');s.engines=d.engines.map(e=>({id:e.id,side:e.side,status:'running',health:1,spool:.5,lever:.5,n1:60,thrustN:0}));s.autoThrust=false;s.throttle=.5;s.airborne=true;
 stepEngines(s,80,0,d);assert.equal(s.totalThrustN,s.engines.reduce((n,e)=>n+e.thrustN,0));assert.equal(s.propulsion.asymmetricMoment,0);assert.equal(s.thrust,s.totalThrustN/360000);
 setEngineStatus(s,0,'failed');stepEngines(s,80,0,d);assert(s.propulsion.asymmetricMoment<0);assert.equal(s.engines[0].thrustN,0);assert.equal(s.propulsion.asymmetricMoment,engineYawMoment(s.engines,d.engines));
 s.landed=true;s.airborne=false;s.throttle=0;s.reverse=true;stepEngines(s,0,.01,d);assert.equal(s.engines[0].thrustN,0);assert(s.engines.slice(1).every(e=>e.thrustN<0));
 const sounds=soundTargets(s);assert.equal(sounds.engines.length,4);assert.equal(sounds.engineNoise,.75);assert(sounds.wind>=0);
});

test('aerodynamic area and control response are supplied by the definition rather than global A320 constants',()=>{
 const s=createFlight('landing'),d=structuredClone(DEFAULT_DEFINITION);s.airborne=true;const a=structuredClone(refreshAirData(s));d.airframe.wingArea*=2;const b=refreshAirData(s,d);assert.equal(b.lift,a.lift*2);assert.equal(b.drag,a.drag*2);
 const one=structuredClone(s),two=structuredClone(s);one.autoPilot=two.autoPilot=false;one.stickPitch=two.stickPitch=.5;d.controls.pitchCommandRate*=2;stepAttitude(one,.02);stepAttitude(two,.02,d);assert(two.controls.pitchCommand===one.controls.pitchCommand*2);assert(two.pitchRate>one.pitchRate);
});

test('one rig drives any declared engine count, respects failures and freezes when paused',()=>{
 const d=fixture(),nodes=new Map(d.visual.rig.fans.map(f=>[f.node,new THREE.Group()])),rig=createAircraftRig(name=>nodes.get(name),d),s=createFlight('takeoff');
 s.engines=d.engines.map(e=>({id:e.id,status:e.id===2?'failed':'running',n1:e.id===2?0:60,spool:.5,thrustN:100}));rig.update(s,0);s.time=.1;const a=rig.update(s,.1);assert.equal(Object.keys(a.fanAngles).length,4);assert.equal(a.fanAngles['test-2'],0);assert(a.fanAngles['test-3']>0);assert.deepEqual(rig.update(s,0).fanAngles,a.fanAngles);
});

test('new flights, retries, historical variants and replay retain definition identity; legacy state resolves to version 1',()=>{
 for(const levelId of ['takeoff','short-landing','history-us1549']){
  const s=createFlight(null,{levelId}),r=new FlightRecording();assert.equal(s.aircraft.definitionVersion,1);r.observe(s);assert.equal(r.sample(0,s.time).aircraft.definitionVersion,1);assert.equal(restoreCheckpoint(s).aircraft.definitionVersion,1);
  const legacy=structuredClone(s);delete legacy.aircraft.definitionVersion;delete legacy.checkpoint.aircraft.definitionVersion;assert.equal(aircraftDefinition(legacy),DEFAULT_DEFINITION);assert.equal(restoreCheckpoint(legacy).aircraft.definitionVersion,1);
 }
 assert.deepEqual(createFlight('takeoff').aircraft,{...DEFAULT_AIRCRAFT});
});

test('additional engines replay their sampled state and an appearance change starts a separate versioned segment',()=>{
 const s=createFlight('takeoff');s.engines.push({...s.engines[0],id:2},{...s.engines[1],id:3});const r=new FlightRecording();r.observe(s);
 s.time=.1;s.engines[2].spool=.6;s.engines[2].n1=68.8;s.engines[3].status='failed';s.engines[3].thrustN=0;r.observe(s);
 const sampled=r.sample(0,.1);assert.equal(sampled.engines.length,4);assert(Math.abs(sampled.engines[2].spool-.6)<1e-6);assert.equal(sampled.engines[3].status,'failed');assert(r.segments[0].chunks[0].extraEngines.byteLength>0);
 s.time=.2;s.aircraft.variant='wingtip-fence';r.observe(s);assert.equal(r.segments.length,2);assert.equal(r.sample(0,.1).aircraft.variant,'sharklet');assert.equal(r.sample(1,.2).aircraft.variant,'wingtip-fence');
});
