import test from'node:test';import assert from'node:assert/strict';
import {createFlight,advanceFlight,radioAltitude,beginGoAround,restoreCheckpoint,saveCheckpoint,KT} from'../src/flight.js';
import {liftMaximum,liftZero,refreshAirData} from'../src/sim/aerodynamics.js';import {AIRFRAME}from'../src/sim/constants.js';
import {createStallWarning,updateStallWarning}from'../src/sim/stall-warning.js';import{requiresLanding}from'../src/missions/recovery.js';
import{LEVELS}from'../src/missions/catalog.js';import{pilotInput}from'./pilot.mjs';import{sampleCabinMotion}from'../src/sim/cabin-motion.js';
const warn=(s,ratio,dt=.02)=>{s.airData.alpha=ratio*(liftMaximum(s.flapPosition)-liftZero(s.flapPosition))/AIRFRAME.liftSlope;s.airData.stalled=ratio>1;const out=[];updateStallWarning(s,dt,(_,text,spoken)=>out.push({text,spoken}));return out;};
test('stall warning precedes the actual lift peak and follows the actual flap-dependent AoA',()=>{
 for(const flap of[0,1,2,3,4]){const s=createFlight('landing');s.flapPosition=flap;assert.equal(warn(s,.84).length,0);assert.equal(s.stallWarning.level,0);warn(s,.88);assert.equal(s.stallWarning.level,1);assert(!s.stallWarning.active);const calls=warn(s,.96);assert(s.stallWarning.active&&!s.airData.stalled);assert.equal(calls[0].spoken,'Stall, stall');}
});
test('stall speech repeats on simulation time and clear hysteresis prevents chatter',()=>{
 const s=createFlight('landing');assert.equal(warn(s,1.05).length,1);s.time=1;assert.equal(warn(s,1.02).length,0);s.time=3;assert.equal(warn(s,1.01).length,1);
 warn(s,.77,.4);assert(s.stallWarning.active);warn(s,.83,.1);warn(s,.77,.4);assert(s.stallWarning.active);warn(s,.76,.21);assert(!s.stallWarning.active&&s.stallWarning.level===0);
});
test('ground and stopped/paused flights remain quiet while a low airborne stall still warns',()=>{
 const s=createFlight('takeoff');warn(s,2);assert(!s.stallWarning.active);s.airborne=true;s.speed=80/KT;s.y=2.8+5;warn(s,1.1);assert(s.stallWarning.active);s.landed=true;warn(s,1.1);assert(!s.stallWarning.active);
});
test('warning state is checkpointed and visual sampling never alters the stall physics',()=>{
 const s=createFlight('landing');warn(s,1.1);saveCheckpoint(s,'失速');const r=restoreCheckpoint(s);assert.deepEqual(r.stallWarning,s.stallWarning);const v=structuredClone(r.velocity),a=structuredClone(r.airData);sampleCabinMotion(r);assert.deepEqual(r.velocity,v);assert.deepEqual(r.airData,a);
});
test('ordinary takeoff and normal landings do not raise a red stall warning',()=>{
 for(const id of['takeoff','short-landing']){const s=createFlight(null,{levelId:id});for(let i=0;i<15000&&!s.result;i++){advanceFlight(s,pilotInput(s),.02);assert(!s.stallWarning.active,`${id} ${s.time}`);}assert(s.result?.levelCleared);}
});
test('every lesson except takeoff and the explicit go-around drill requires landing',()=>{
 for(const l of LEVELS){assert.equal(requiresLanding(createFlight(null,{levelId:l.id})),!['takeoff','goaround'].includes(l.kind));}
});
for(const id of['short-landing','ils-approach','ils-loss','athr-failure','flap-jam'])test(`a continuous missed approach in ${id} ends only after a real landing`,()=>{
 const s=createFlight(null,{levelId:id});let ga=false,seenReturn=false,maxJump=0,returnFault=null;
 for(let i=0;i<60000&&!s.result;i++){
  if(!ga&&radioAltitude(s)<700)ga=beginGoAround(s);
  const before={x:s.x,y:s.y,z:s.z};advanceFlight(s,pilotInput(s),.02);maxJump=Math.max(maxJump,Math.hypot(s.x-before.x,s.y-before.y,s.z-before.z));
  if(s.mission.recovery?.stage==='return'&&!seenReturn){seenReturn=true;assert.equal(s.result,null);assert(s.airborne&&!s.goAround);returnFault=structuredClone(s.systems);}
 }
 assert(ga&&seenReturn);assert(maxJump<10);assert(s.result?.levelCleared,JSON.stringify(s.result));assert(s.touchdown&&s.landed&&s.airData.groundSpeed===0);assert(s.touchdown.checklistConfirmed);
 if(id==='short-landing'){for(const key of['crosswind','downwind','base'])assert(!s.radio.fired[key],'recovery must not play the different original circuit altitude clearances');}
 if(id==='ils-loss'){assert(!s.systems.ils.localizer&&!returnFault.ils.localizer);assert(!s.autoPilot);}
 if(id==='athr-failure')assert(!s.systems.autoThrustAvailable&&s.mission.manualTakenOver);
 if(id==='flap-jam')assert(s.systems.flapsJammed&&s.touchdown.flapPosition===2);
 if(id==='ils-approach'){assert(s.gsCaptured&&s.locCaptured);assert(s.gates.length===2&&s.gates.every(g=>g.passed&&!g.preset));assert(Math.abs(s.yaw)>Math.PI*2-1,'capture works after a full heading wrap');}
});
test('a second go-around restarts recovery without resetting failed capabilities or awarding completion',()=>{
 const s=createFlight(null,{levelId:'flap-jam'});let ga=false;for(let i=0;i<30000&&!s.result;i++){if(!ga&&radioAltitude(s)<700)ga=beginGoAround(s);advanceFlight(s,pilotInput(s),.02);if(s.mission.recovery?.stage==='return')break;}
 assert(s.systems.flapsJammed);assert(beginGoAround(s));assert.equal(s.mission.goAroundCount,2);assert.equal(s.mission.recovery.stage,'climb');assert(s.systems.flapsJammed&&s.mission.acknowledged);assert.equal(s.result,null);
});


test('a missed approach preserves the failed engine throughout a second continuous circuit and landing',()=>{
 const s=createFlight(null,{levelId:'engine-out'});let ga=false,returning=false;
 for(let i=0;i<70000&&!s.result;i++){if(!ga&&s.route.inFinal&&radioAltitude(s)<600)ga=beginGoAround(s);advanceFlight(s,pilotInput(s),.02);if(s.mission.recovery?.stage==='return'){returning=true;assert.equal(s.engines[0].status,'failed');assert.equal(s.engines[0].thrustN,0);if(!s.landed)assert.equal(s.result,null);}}
 assert(ga&&returning);assert(s.result?.levelCleared&&s.landed);assert.equal(s.engines[0].thrustN,0);
});


test('a repeated weather go-around never brings back cleared fog or a dissipated shear field',()=>{
 for(const id of['low-visibility','windshear']){const s=createFlight(null,{levelId:id});beginGoAround(s);let readyAt=null;
  for(let i=0;i<25000;i++){advanceFlight(s,pilotInput(s),.02);if(s.mission.recovery?.stage==='return'){readyAt??=s.time;if(s.time-readyAt>61)break;}}
  assert(readyAt);const visibility=s.weather.visibility,winds=structuredClone(s.weather.disturbances);assert(beginGoAround(s));const attempt=s.mission.goAroundCount;
  for(let i=0;i<25000&&!s.result;i++){advanceFlight(s,pilotInput(s),.02);if(s.mission.recovery?.stage==='return'&&s.mission.goAroundCount===attempt)break;}
  assert.equal(s.mission.recovery.stage,'return');advanceFlight(s,pilotInput(s),.02);assert(s.weather.visibility>=visibility);
  if(id==='windshear')s.weather.disturbances.forEach((f,i)=>assert((f.strength??1)<=(winds[i].strength??1)+1e-8));
 }
});


test('early windshear avoidance still needs landing and the faded field cannot trigger another encounter',()=>{
 const s=createFlight(null,{levelId:'windshear'});assert(beginGoAround(s));let returned=false;
 for(let i=0;i<60000&&!s.result;i++){advanceFlight(s,pilotInput(s),.02);if(s.mission.recovery?.stage==='return')returned=true;}
 assert(returned&&s.mission.avoided);assert(s.result?.levelCleared&&s.landed);assert(!s.mission.triggered);assert.equal(s.airData.disturbanceStrength,0);
});


test('deliberate TOGA overrides failed-autothrust THR LK without restoring automatic thrust',()=>{
 const s=createFlight(null,{levelId:'athr-failure'});for(let i=0;i<12000&&!s.mission.triggered;i++)advanceFlight(s,pilotInput(s),.02);
 assert(s.systems.thrustLocked&&!s.systems.autoThrustAvailable);assert(beginGoAround(s));assert(!s.systems.thrustLocked);assert(s.mission.manualTakenOver);assert.equal(s.throttle,1);assert(!s.systems.autoThrustAvailable);assert.equal(s.result,null);
});
