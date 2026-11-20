import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,advanceFlight,advanceSimulation,setMotion,setWeather,setEngineStatus,setDetent,restoreCheckpoint,saveCheckpoint,KT} from '../src/flight.js';
import {refreshAirData,trimAlpha,liftCoefficient} from '../src/sim/aerodynamics.js';
import {sampleWeather,windReadout} from '../src/sim/weather.js';
import {G,RAD,wrap} from '../src/sim/constants.js';

function airborne(options={}){
 const s=createFlight('landing',{scenario:'full',weather:{wind:{speedKt:0}},...options});
 s.y=1500;s.z=22000;s.x=0;s.roll=s.yaw=0;s.gear=false;s.gearPosition=0;s.flaps=s.flapPosition=0;s.autoThrust=false;s.autoPilot=false;
 setMotion(s,{speed:90,verticalSpeed:0,yaw:0});s.pitch=trimAlpha(s);refreshAirData(s);return s;
}
function fly(s,seconds,input={}){for(let i=0;i<seconds*100&&!s.result;i++)advanceFlight(s,typeof input==='function'?input(s):input,.01);return s;}
const energy=s=>s.airData.energy;
const near=(a,b,t=1e-7)=>assert(Math.abs(a-b)<t,`${a} differs from ${b}`);

test('air/ground velocities obey vector addition for headwind, tailwind and crosswind',()=>{
 for(const directionDeg of [270,90,180,0]){
  const s=airborne({weather:{wind:{speedKt:20,directionDeg}}});setMotion(s,{speed:90});
  const a=s.airData,readout=windReadout(a.wind);near(readout.speedKt,20);near(wrap((readout.directionDeg-directionDeg)*RAD),0);
  for(const k of ['x','y','z'])near(s.velocity[k],a.airVelocity[k]+a.wind[k]);
  near(a.ias,90);if(directionDeg===270)assert(a.groundSpeed<a.horizontal);if(directionDeg===90)assert(a.groundSpeed>a.horizontal);
  if(directionDeg===180||directionDeg===0)assert(Math.abs(a.groundTrack-s.yaw)>.05);
 }
});
test('changing wind preserves inertia while changing indicated airspeed',()=>{
 const s=airborne(),before={...s.velocity};setWeather(s,{wind:{speedKt:30,directionDeg:270}});refreshAirData(s);
 assert.deepEqual(s.velocity,before);assert(s.speed>90+10);
});
test('wind fields and density are deterministic, height dependent and continuous',()=>{
 const s=airborne({weather:{gust:{amplitude:4,seed:91},shear:{base:100,depth:500,delta:{x:5,y:-3,z:8}}}});
 const a=sampleWeather(s.weather,{y:300},10),b=sampleWeather(s.weather,{y:300},10);assert.deepEqual(a,b);
 const adjacent=sampleWeather(s.weather,{y:300.01},10.01);assert(Math.abs(a.wind.z-adjacent.wind.z)<.1);
 assert(sampleWeather(s.weather,{y:1000},0).density<sampleWeather(s.weather,{y:0},0).density);
});
test('mass changes aerodynamic trim and available acceleration',()=>{
 const light=airborne({weight:50}),heavy=airborne({weight:75});assert(trimAlpha(heavy)>trimAlpha(light));
 for(const s of [light,heavy]){setDetent(s,'TOGA');s.engines.forEach(e=>e.spool=1);}
 fly(light,1);fly(heavy,1);assert(light.speed>heavy.speed);
});
test('lift scales with dynamic pressure and rolls away from the vertical',()=>{
 const s=airborne();s.pitch=.1;refreshAirData(s);const lift=s.airData.lift;
 setMotion(s,{speed:180});s.pitch=.1;refreshAirData(s);near(s.airData.lift/lift,4,1e-6);
 const level=airborne(),bank=structuredClone(level);level.throttle=bank.throttle=0;bank.roll=.5;
 fly(level,.2);fly(bank,.2);assert(bank.verticalSpeed<level.verticalSpeed);assert(bank.velocity.x>level.velocity.x);
});
test('post-stall lift falls instead of increasing without limit',()=>{
 assert(liftCoefficient(.5,0)<liftCoefficient(.2,0));
 const s=airborne();setMotion(s,{speed:35});s.pitch=.30;refreshAirData(s);assert(s.airData.stalled);assert(s.airData.loadFactor<1);
});
test('two engine spools are independent and preserve lever position',()=>{
 const s=airborne();setDetent(s,'CL');s.autoThrust=true;setEngineStatus(s,0,'failed');fly(s,2);
 assert.equal(s.throttle,.78);assert.equal(s.engines[0].thrustN,0);assert(s.engines[1].thrustN>0);assert(s.engines[0].n1<s.engines[1].n1);
});
test('left and right engine failures produce mirrored yaw without rudder assistance',()=>{
 const left=airborne(),right=airborne();
 for(const s of [left,right]){s.controls.rudderAssist=false;s.throttle=.7;s.engines.forEach(e=>e.spool=.7);}
 setEngineStatus(left,0,'failed');setEngineStatus(right,1,'failed');fly(left,5);fly(right,5);
 assert(left.yaw<-.02);assert(right.yaw>.02);near(left.yaw,-right.yaw,1e-7);near(left.x,-right.x,1e-7);
});
test('rudder moment and default assistance counter thrust asymmetry without creating thrust',()=>{
 const manual=airborne(),assisted=airborne();
 for(const s of [manual,assisted]){setEngineStatus(s,0,'failed');s.throttle=.7;s.engines.forEach(e=>e.spool=.7);}
 manual.controls.rudderAssist=false;fly(manual,5);fly(assisted,5);
 assert(Math.abs(assisted.yaw)<Math.abs(manual.yaw)*.4);assert(assisted.controls.rudderApplied>0);
 near(manual.totalThrustN,assisted.totalThrustN,5);
 const r=airborne();r.controls.rudderAssist=false;fly(r,2,{rudder:1});assert(r.yaw>0);assert(r.controls.rudder>.9);
 fly(r,1);assert.equal(r.controls.rudder,0);
});
test('both engines off prevent autothrust from regenerating power and reduce total energy',()=>{
 const s=airborne();setEngineStatus(s,0,'off');setEngineStatus(s,1,'off');s.autoThrust=true;
 const initial=energy(s);let previous=initial;
 for(let i=0;i<3000;i++){advanceFlight(s,{},.01);assert.equal(s.totalThrustN,0);assert(energy(s)<=previous+5);previous=energy(s);}
 assert.equal(s.autoThrustActive,false);assert(energy(s)<initial*.97);assert(s.y<1500);assert(s.engines.every(e=>e.thrustN===0));
});
test('a commanded climb with no engines trades speed/height, never supplies energy',()=>{
 const s=airborne();setEngineStatus(s,0,'failed');setEngineStatus(s,1,'failed');s.selectedAltitude=6000;s.autoPilot=true;
 const initial=energy(s);fly(s,15);assert(energy(s)<initial);assert(s.guidance.limited);assert(s.guidance.verticalSpeed<0);assert(s.y<1500);
});
test('ground brakes use groundspeed, never drive the aircraft backwards',()=>{
 const s=createFlight('landing',{weather:{wind:{speedKt:20,directionDeg:270}}});s.landed=true;s.airborne=false;s.y=2.8;s.z=-500;s.touchdown={descent:1,offset:0,z:-500};
 setMotion(s,{speed:15,verticalSpeed:0});setDetent(s,'IDLE');fly(s,8,{brake:true});
 assert.equal(s.airData.groundSpeed,0);near(s.speed*KT,20,.01);assert(s.result?.success);
});
test('reduced runway friction increases actual stopping distance',()=>{
 function stop(friction){const s=createFlight('landing',{weather:{wind:{speedKt:0},runwayFriction:friction}});s.landed=true;s.airborne=false;s.y=2.8;s.z=-100;s.touchdown={descent:1,offset:0,z:-100};setMotion(s,{speed:50,verticalSpeed:0});setDetent(s,'IDLE');s.engines.forEach(e=>e.spool=0);fly(s,50,{brake:true});assert(s.result?.success);return -s.z;}
 assert(stop(.25)>stop(1)*1.4);
});
test('engine state, velocity, weather and tick remainder survive checkpoint replay',()=>{
 const s=airborne({weather:{gust:{amplitude:3}}});setEngineStatus(s,1,'off');s.controls.rudderAssist=false;advanceSimulation(s,{rudder:.2},.037);saveCheckpoint(s,'physics');
 const restored=restoreCheckpoint(s);assert.equal(restored.controls.rudder,0);assert.equal(restored.engines[1].status,'off');near(restored.clock.accumulator,s.clock.accumulator);
 const a=restoreCheckpoint(s),b=restoreCheckpoint(s);advanceSimulation(a,{},.2);advanceSimulation(b,{},.2);
 assert.deepEqual(a.velocity,b.velocity);assert.deepEqual(a.airData.wind,b.airData.wind);
});
test('fixed-tick state is independent of render-frame chunking',()=>{
 const a=airborne(),b=structuredClone(a);for(let i=0;i<100;i++)advanceSimulation(a,{rudder:.1},.01);for(let i=0;i<20;i++)advanceSimulation(b,{rudder:.1},.05);
 assert.deepEqual(a.velocity,b.velocity);near(a.time,b.time);near(a.yaw,b.yaw);
});
test('gust/shear and both engine loss remain finite across the supported envelope',()=>{
 const s=airborne({weather:{gust:{amplitude:8},shear:{base:1000,depth:200,delta:{x:10,y:-4,z:15}}}});setEngineStatus(s,0,'failed');setEngineStatus(s,1,'failed');
 fly(s,60,{steer:.2,pitch:-.1});for(const n of [s.x,s.y,s.z,s.speed,s.yaw,s.airData.energy,...Object.values(s.velocity)])assert(Number.isFinite(n));
});


test('manual rudder disconnects AP through the same input path as the stick',()=>{
 const s=airborne();assert.equal(s.controls.rudderApplied,0);s.autoPilot=true;fly(s,.5,{rudder:.5});assert.equal(s.autoPilot,false);
});
test('positive climb guidance respects the current lever authority',()=>{
 const s=airborne();s.autoThrust=true;s.throttle=.15;s.selectedAltitude=6000;fly(s,.1);
 assert(s.guidance.limited);assert(s.guidance.verticalSpeed<1);
});
test('an updraft changes relative airflow before inertial climb velocity',()=>{
 const s=airborne(),vy=s.velocity.y,before=s.airData.lift;setWeather(s,{wind:{vertical:5}});refreshAirData(s);
 assert.equal(s.velocity.y,vy);assert.equal(s.verticalSpeed,vy);assert(s.airData.lift>before);fly(s,.1);assert(s.velocity.y>vy);
});
