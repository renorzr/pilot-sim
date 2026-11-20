import test from'node:test';import assert from'node:assert/strict';
import{LEVELS}from'../src/missions/catalog.js';import{createFlight,advanceFlight,radioAltitude,KT,FT,stepFlaps,restoreCheckpoint,saveCheckpoint}from'../src/flight.js';
import{afterLevelPhysics}from'../src/missions/runtime.js';
import{pilotInput,flyLevel}from'./pilot.mjs';import{airPocket,sampleCabinMotion}from'../src/sim/cabin-motion.js';import{sampleWeather}from'../src/sim/weather.js';import{surfaceHeight}from'../src/terrain/heightfield.js';
test('every airborne lesson starts off-axis and clean, with ILS/checklist/ground arming left to the player',()=>{
 const arrivals=LEVELS.filter(l=>l.mode==='landing');assert.equal(arrivals.length,10);
 for(const l of arrivals){const s=createFlight(null,{levelId:l.id});assert(s.arrival);assert(Math.abs(s.x)>=500);assert(Math.abs(s.yaw-Math.atan2(-s.x,s.z))>5*Math.PI/180);assert(s.y-surfaceHeight(s.x,s.z)>300);
  assert.equal(s.gearPosition,0);assert.equal(s.flapPosition,0);assert(!s.gear&&s.flaps===0);assert(!s.spoilersArmed&&s.autoBrake==='OFF');assert(!s.apprArmed&&!s.locCaptured&&!s.gsCaptured&&!s.autoPilot);assert(!s.landingChecklistConfirmed);assert.deepEqual(s.gates,[]);
 }
});
test('selecting planned CONF 3 or FULL changes the plan without deploying a single actuator',()=>{
 for(const landingConfig of[3,4]){const s=createFlight(null,{levelId:'short-landing',landingConfig});assert.equal(s.landingConfig,landingConfig);assert.equal(s.flapPosition,0);assert.equal(s.gearPosition,0);assert(!s.landingChecklistConfirmed);}
});
test('side-intercept normal landing actually captures, configures, checks and stops from the clean start',()=>{
 const s=createFlight(null,{levelId:'short-landing'});const start={x:s.x,heading:s.yaw};flyLevel(s);assert(s.result?.levelCleared);assert(Math.abs(start.x)>600&&start.heading!==0);assert(s.locCaptured&&s.gsCaptured);assert(s.gates.every(g=>g.passed&&!g.preset));assert(s.touchdown.checklistConfirmed);assert.equal(s.touchdown.gearPosition,1);assert.equal(s.touchdown.flapPosition,s.landingConfig);
});
test('flap jam waits for actual CONF 2 instead of jamming at clean position after rapid commands',()=>{
 const s=createFlight(null,{levelId:'flap-jam'});s.flaps=3;
 for(let i=0;i<50;i++)advanceFlight(s,{},.02);assert(!s.mission.triggered);assert(s.flapPosition>0&&s.flapPosition<1);
 for(let i=0;i<500&&!s.mission.triggered;i++)advanceFlight(s,pilotInput(s),.02);assert(s.mission.triggered);assert.equal(s.flapPosition,2);assert.equal(s.systems.jammedPosition,2);
});
test('go-around instruction occurs during the approach rather than two seconds into a clean start',()=>{
 const s=createFlight(null,{levelId:'goaround'});for(let i=0;i<150;i++)advanceFlight(s,{},.02);assert(!s.mission.triggered);
 let atCue=null;for(let i=0;i<20000&&!s.result;i++){advanceFlight(s,pilotInput(s),.02);if(s.mission.triggered&&!atCue)atCue={ra:radioAltitude(s),gear:s.gearPosition,flaps:s.flapPosition};}
 assert(s.result?.levelCleared);assert(atCue.ra<=801&&atCue.gear>.98&&atCue.flaps>=3);
});
test('clean/unconfirmed landing cannot clear a preparation lesson by configuring after touchdown',()=>{
 const s=createFlight(null,{levelId:'short-landing'});flyLevel(s);const score=s.result.score;s.touchdown.checklistConfirmed=false;s.landingChecklistConfirmed=true;s.result={success:true,score};
 // Outcome validation is also used by the runtime, independent of current switches.
 afterLevelPhysics(s,.02);assert.equal(s.result.levelCleared,false);assert.equal(s.touchdown.checklistConfirmed,false);
});
test('touchdown head motion scales with actual descent and decays, with a smaller nose-wheel impulse',()=>{
 const s=createFlight('landing');s.landed=true;s.airborne=false;s.airData.groundSpeed=0;s.time=10.04;s.touchdown={time:10,descent:1};const soft=sampleCabinMotion(s);s.touchdown.descent=3;const firm=sampleCabinMotion(s);assert(Math.abs(firm.y)>Math.abs(soft.y)*2);s.time=14;assert.equal(sampleCabinMotion(s).sources.touchdown,0);
 s.cabin.noseAt=14;s.time=14.04;assert(sampleCabinMotion(s).sources.nose>0);assert(Math.abs(sampleCabinMotion(s).y)<Math.abs(firm.y));
});
test('weather motion follows real gust/shear and cruising air pockets are occasional and seeded',()=>{
 const calm=createFlight(null,{levelId:'ils-approach'}),wet=createFlight(null,{levelId:'crosswind'});calm.time=wet.time=2;assert(sampleCabinMotion(wet).sources.weather>sampleCabinMotion(calm).sources.weather);
 let active=0,chosen=0;for(let t=0;t<110;t+=.1){const e=airPocket(t,27);assert.equal(e,airPocket(t,27));if(e>0){active++;chosen=t;}}
 assert(active>0&&active<100);calm.time=chosen;calm.verticalSpeed=0;calm.roll=0;assert(sampleCabinMotion(calm).sources.ambient>0);calm.verticalSpeed=4;assert.equal(sampleCabinMotion(calm).sources.ambient,0);
 const w={...calm.weather,gust:{...calm.weather.gust,amplitude:0}},p={x:0,y:1000,z:0};assert.notDeepEqual(sampleWeather(w,p,chosen).wind,sampleWeather({...w,ambientTurbulence:0},p,chosen).wind);
});
test('visual shake never changes physics, pauses deterministically and supports reduced/off intensity',()=>{
 const s=createFlight(null,{levelId:'crosswind'});s.time=3;const before=structuredClone(s),normal=sampleCabinMotion(s),reduced=sampleCabinMotion(s,.35),off=sampleCabinMotion(s,0);assert.deepEqual(s,before);assert.deepEqual(sampleCabinMotion(s),normal);assert(Math.abs(reduced.x-normal.x*.35)<1e-10);
 for(const k of['x','y','roll','cameraY','cameraPitch'])assert.equal(Math.abs(off[k]),0,k);
 saveCheckpoint(s,'颠簸');const r=restoreCheckpoint(s);assert.deepEqual(sampleCabinMotion(r),normal);
});
