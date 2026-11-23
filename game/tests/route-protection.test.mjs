import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteProtection,routeProtectionDistance,updateRouteProtection} from '../src/missions/route-protection.js';
import {createRadio} from '../src/comms/radio.js';
import {createControls} from '../src/sim/controls.js';
import {createFlight,advanceFlight,setDetent,toggleGear,toggleAP,radioAltitude,KT,advanceSimulation,restoreCheckpoint} from '../src/flight.js';
import {groundPilot} from './ground-pilot.mjs';
import {canSkipCruise} from '../src/missions/airline.js';
import {pilotInput} from './pilot.mjs';
import {t} from '../src/i18n/index.js';

// Isolated geometry/time fixtures exercise failures, never completed flights.
function fixture(x=0,z=-10000){
 const s={airportId:'daxing',airline:{phase:'climb',navigation:{kind:'departure',index:0,complete:false,origin:{x:0,z:0},points:[{x:0,z:-20000}]}},x,z,time:100,airborne:true,landed:false,terrain:{level:0},atc:{terrainFloorFt:0},radio:createRadio(),controls:createControls(),autoPilot:true,stickPitch:.2,stickRoll:.2,result:null};
 s.routeProtection={...createRouteProtection(),legKey:'daxing:departure:0',legSince:0};return s;
}
function step(s,seconds){for(let i=0;i<Math.round(seconds/.02)&&!s.result;i++){s.time+=.02;updateRouteProtection(s,.02);}return s;}
test('the current finite segment detects flying behind its origin and beyond its end',()=>{
 assert.equal(routeProtectionDistance(fixture(0,6000)).distance,6000);
 assert.equal(routeProtectionDistance(fixture(0,-27000)).distance,7000);
 const s=fixture(6000);assert.equal(routeProtectionDistance(s).distance,6000);
 // A later crossing segment does not excuse bypassing the active one.
 s.airline.navigation.points.push({x:20000,z:-10000});assert.equal(routeProtectionDistance(s).distance,6000);
});
for(const [distance,seconds]of [[4500,120],[8500,45],[12500,15]])test(`${distance}m deviation fails after ${seconds}s of simulation time`,()=>{
 const s=step(fixture(distance),seconds-.02);assert(!s.result);step(s,.02);assert(s.result&&!s.result.success&&!s.result.levelCleared);assert.equal(s.result.title,'持续偏离航路');assert.equal(s.autoPilot,false);assert.equal(s.stickRoll,0);
 assert(!/\p{Script=Han}/u.test(t(s.result.detail,'en')));
});
test('wide corrections and brief large excursions do not end a flight',()=>{
 const small=step(fixture(3500),180);assert(!small.result&&small.routeProtection.warning);
 const brief=step(fixture(12500),3);brief.x=0;step(brief,5);assert.deepEqual(brief.routeProtection.timers,[0,0,0]);assert(!brief.result);
});
test('threshold jitter does not erase a pending violation, but sustained recovery does',()=>{
 const s=step(fixture(4500),20);s.x=3800;step(s,4);assert(Math.abs(s.routeProtection.timers[0]-20)<1e-7);
 s.x=4500;step(s,5);assert(Math.abs(s.routeProtection.timers[0]-25)<1e-7);
 s.x=3400;step(s,5);assert.deepEqual(s.routeProtection.timers,[0,0,0]);
});
test('a waypoint switch provides turn grace without wiping sustained deviation history',()=>{
 const s=step(fixture(4500),110);s.airline.navigation.points.push({x:0,z:-30000});s.airline.navigation.index=1;
 step(s,35);assert(!s.result);assert(Math.abs(s.routeProtection.timers[0]-110)<1e-7);
 step(s,16);assert(s.result&&!s.result.success);
});
test('fly-by turns include the immediately previous leg during the turn window',()=>{
 const s=fixture(0,-6000);s.airline.navigation.points=[{x:0,z:-10000},{x:10000,z:-10000}];s.airline.navigation.index=1;
 updateRouteProtection(s,.02);assert.equal(s.routeProtection.distance,0);step(s,10);assert(!s.result);
 s.time+=40;updateRouteProtection(s,.02);assert.equal(s.routeProtection.distance,4000);
});
test('terrain avoidance pauses route penalties and does not issue a new flight route',()=>{
 const s=step(fixture(12500),3),route=structuredClone(s.airline.navigation),before=[...s.routeProtection.timers];s.terrain.level=2;
 step(s,60);assert(!s.result);assert.deepEqual(s.routeProtection.timers,before);assert(s.routeProtection.suspended);assert.deepEqual(s.airline.navigation,route);
 s.terrain.level=0;s.atc.terrainFloorFt=4000;step(s,20);assert.deepEqual(s.routeProtection.timers,before);
 s.atc.terrainFloorFt=0;s.x=0;step(s,5);assert.deepEqual(s.routeProtection.timers,[0,0,0]);
});
test('existing go-around heading is protected, with a fixed origin rather than one moving with the aircraft',()=>{
 const s=fixture(0,-10000);s.goAround=true;s.goAroundHeading=0;s.mission={goAroundCount:1};updateRouteProtection(s,.02);s.z=-22000;
 assert.equal(routeProtectionDistance(s).distance,0);s.x=9000;assert.equal(routeProtectionDistance(s).distance,9000);
});
test('pause, completed results and non-airline lessons cannot accumulate new route failures',()=>{
 const s=step(fixture(12500),2),before=structuredClone(s.routeProtection);updateRouteProtection(s,0);assert.deepEqual(s.routeProtection,before);
 s.result={success:false};updateRouteProtection(s,1);assert.deepEqual(s.routeProtection,before);
 const training=fixture(20000);delete training.airline;step(training,180);assert(!training.result);assert.deepEqual(training.routeProtection.timers,[0,0,0]);
});
test('a real takeoff followed by sustained wrong-route flying fails through the ordinary physical control path',()=>{
 const s=createFlight(null,{levelId:'hgh-pkx'});let ignored=false;
 for(let i=0;i<700*50&&!s.result;i++){
  let input=groundPilot(s,{skip:true})||{};
  if(s.ground?.takeoffCleared){
   if(!s.airborne){if(s.throttle<.9)setDetent(s,'TOGA');input={pitch:s.speed*KT>=125&&s.pitch<.2?1:0};}
   else{if(s.gear&&s.verticalSpeed>.5)toggleGear(s);if(radioAltitude(s)>500&&s.throttle>.845)setDetent(s,'CL');
    if(s.airline.navigation.index===1){ignored=true;input={stick:{pitch:Math.max(-.7,Math.min(.7,(s.guidance.pitch-s.pitch)*10-s.pitchRate*3)),roll:Math.max(-.7,Math.min(.7,-s.roll*8-s.rollRate*3))}};}
    else if(radioAltitude(s)>200&&!s.autoPilot)toggleAP(s);
   }
  }
  advanceFlight(s,input,.02);
 }
 assert(ignored);assert.equal(s.result?.title,'持续偏离航路',JSON.stringify(s.result));assert(s.atc.violations.some(v=>v.type==='route'));
 const p={x:s.x,y:s.y,z:s.z,time:s.time};advanceSimulation(s,{pitch:1},1);assert.deepEqual({x:s.x,y:s.y,z:s.z,time:s.time},p);
});
test('cruise eligibility is reached through a normal turn and retry preserves the protection snapshot',()=>{
 const s=createFlight(null,{levelId:'kix-pkx'});
 for(let i=0;i<800*50&&!s.result&&!canSkipCruise(s);i++)advanceFlight(s,pilotInput(s),.02);
 assert(canSkipCruise(s),JSON.stringify(s.result));assert.deepEqual(s.routeProtection.timers,[0,0,0]);
 const restored=restoreCheckpoint(s);assert(restored.mission.practice);assert(restored.routeProtection);
});
