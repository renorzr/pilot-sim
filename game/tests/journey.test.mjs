import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,advanceFlight,skipCruise,restoreCheckpoint,setEngineStatus} from '../src/flight.js';
import {AIRPORTS,runwayOf} from '../src/airports/registry.js';
import {AIRLINE_ROUTES} from '../src/missions/catalog.js';
import {cityBearing,arrivalNavigation,departureNavigation} from '../src/missions/airline-navigation.js';
import {canSkipCruise} from '../src/missions/airline.js';
import {ARRIVAL_TAXI,canSkipTaxiIn,skipTaxiIn,afterTaxiInPhysics} from '../src/missions/taxi-in.js';
import {pilotInput} from './pilot.mjs';
import {groundPilot} from './ground-pilot.mjs';
import {RAD,wrap,KT} from '../src/sim/constants.js';
import {t} from '../src/i18n/index.js';
function until(s,condition,input=pilotInput,max=2400){for(let i=0;i<max*50&&!s.result&&!condition(s);i++)advanceFlight(s,input(s),.02);assert(condition(s),JSON.stringify({result:s.result,phase:s.airline.phase,ground:s.ground,x:s.x,z:s.z}));return s;}
test('all thirty routes use airport initial departures and enter arrival from the origin radial',()=>{
 for(const l of AIRLINE_ROUTES){const d=departureNavigation(l.origin,l.destination),a=arrivalNavigation(l.origin,l.destination),rw=runwayOf(l.destination);
  assert(Math.abs(wrap((d.cityCourse-cityBearing(l.origin,l.destination))*RAD))<1e-10);
  const entryBearing=(rw.heading+Math.atan2(a.entry.x,-a.entry.z)/RAD+360)%360;
  assert(Math.abs(wrap((entryBearing-cityBearing(l.destination,l.origin))*RAD))<1e-10,l.id);
  assert(Math.abs(Math.hypot(a.entry.x,a.entry.z)-28000)<.01);assert(a.points.at(-1).z>=18000);assert(a.points.length>=4);
  for(const p of[d.origin,...d.points,a.origin,...a.points])assert(Number.isFinite(p.x)&&Number.isFinite(p.z));
  assert(d.procedure?.source&&d.points.length>=2);assert(d.altitude+d.elevationFt>=3000-1e-5);
 }
 // Great-circle terminal course is independently computed, including date line.
 assert(Math.abs(wrap((cityBearing('lax','jfk')+180-cityBearing('jfk','lax'))*RAD))>.1);
});
test('runway-heading climb cannot unlock cruise before joining the outbound route',()=>{
 const s=until(createFlight(null,{levelId:'hgh-pkx'}),s=>s.airborne&&s.airline.navigation.index===0);
 assert(!canSkipCruise(s));const pose={x:s.x,y:s.y,z:s.z};assert(!skipCruise(s));assert.deepEqual({x:s.x,y:s.y,z:s.z},pose);
 until(s,canSkipCruise);assert(s.airline.navigation.index===s.airline.navigation.points.length-1);const trk=runwayOf(s).heading+s.airData.groundTrack/RAD;
 assert(Math.abs(wrap((trk-s.airline.navigation.course)*RAD))<15*RAD);assert(!s.atc.violations.length);
});
test('ignoring the departure turn produces an observed ATC route deviation',()=>{
 const s=until(createFlight(null,{levelId:'hgh-pkx'}),s=>s.airline.navigation.index===1);
 until(s,s=>s.atc.violations.some(v=>v.type==='route'),s=>({stick:{pitch:Math.max(-.7,Math.min(.7,(s.guidance.pitch-s.pitch)*10-s.pitchRate*3)),roll:Math.max(-.7,Math.min(.7,-s.roll*8-s.rollRate*3))}}),180);
 assert.equal(s.atc.deviation.type,'route');assert(!canSkipCruise(s));
});
for(const airport of AIRPORTS)test(`${airport.id}: physical landing, runway exit and full manual taxi finish at its actual stand`,()=>{
 const origin=airport.id==='daxing'?'xiaoshan':'daxing',id=AIRLINE_ROUTES.find(l=>l.origin===origin&&l.destination===airport.id).id;
 const s=createFlight(null,{levelId:id}),stages=new Set();let landing=null;
 until(s,s=>!!s.result,s=>{stages.add(s.ground?.stage);if(s.ground?.arrival){landing??=structuredClone(s.airline.landingEvidence);return groundPilot(s,{skip:false})||{};}return pilotInput(s);},3200);
 assert(s.result.levelCleared,JSON.stringify(s.result));assert(stages.has('runway-exit')&&stages.has('taxi-in')&&stages.has('parking'));
 assert(!s.ground.skipped);assert(s.ground.runwayVacated);const stop=ARRIVAL_TAXI[airport.id].stand;
 assert(Math.hypot(s.x-stop.x,s.z-stop.z)<8);assert(Math.abs(wrap(s.yaw-stop.yaw))<12*RAD);assert.equal(s.airData.groundSpeed,0);
 assert.deepEqual(s.airline.landingEvidence,landing);assert(s.engines.every(e=>e.status==='off'));assert(!s.terrain.events.some(e=>e.level));
});
test('taxi skip needs actual runway exit, preserves assessed landing and failures; retry remains practice',()=>{
 const s=createFlight(null,{levelId:'pkx-hgh'}),initial=structuredClone({x:s.x,z:s.z});assert(!skipTaxiIn(s));assert.deepEqual({x:s.x,z:s.z},initial);
 until(s,s=>s.ground?.arrival);assert(!s.result&&!canSkipTaxiIn(s));const p={x:s.x,z:s.z};assert(!skipTaxiIn(s));assert.deepEqual({x:s.x,z:s.z},p);
 until(s,canSkipTaxiIn,s=>groundPilot(s,{skip:false})||{});assert(!s.result);const evidence=structuredClone(s.airline.landingEvidence),health=s.engines[0].health;
 setEngineStatus(s,0,'failed');const checkpoint=restoreCheckpoint(s);assert(checkpoint.mission.practice&&checkpoint.ground.runwayVacated);
 assert(skipTaxiIn(s));assert(s.ground.skipped&&s.ground.skippedSeconds>0);assert.equal(s.engines[0].status,'failed');assert.equal(s.engines[0].health,health);assert.deepEqual(s.airline.landingEvidence,evidence);
 until(s,s=>!!s.result,()=>({}));assert(s.result.levelCleared);assert.equal(s.result.score,evidence.score);
 assert(skipTaxiIn(checkpoint));until(checkpoint,s=>!!s.result,()=>({}));assert(!checkpoint.result.levelCleared);
});
test('arrival taxi gives braking time, ignores brief speed excursions and still warns/fails sustained speeding',()=>{
 // Reach arrival through the real flight, landing and rollout first. The
 // following isolated speed samples exercise the monitor without moving the
 // aircraft off its route or changing the physical braking model.
 const landed=until(createFlight(null,{levelId:'pkx-hgh'}),s=>s.ground?.arrival);
 const tick=(s,speed,seconds,checkpoint=()=>{})=>{for(let i=0;i<Math.round(seconds*100)&&!s.result;i++){s.time+=.01;s.airData.groundSpeed=speed/KT;afterTaxiInPhysics(s,{x:s.x,z:s.z},.01,{checkpoint});}};
 const warned=s=>s.radio.active?.event==='ground-speed'||s.radio.pending.some(l=>l.event==='ground-speed');
 const s=structuredClone(landed);tick(s,27,7.9);assert(!warned(s));assert(!s.result);assert.equal(s.ground.overspeedSeconds,0);
 tick(s,19,2.9);assert(!warned(s));tick(s,19,.3);assert(warned(s));assert(!s.result);
 // An unsent warning must not appear later after the pilot has slowed down.
 tick(s,15,.1);assert(!warned(s));assert.equal(s.ground.speedReminderSeconds,0);
 const spikes=structuredClone(landed);tick(spikes,15,9);for(let i=0;i<6;i++){tick(spikes,20,2);tick(spikes,17,.1);}assert(!warned(spikes));assert(!spikes.result);
 const excessive=structuredClone(landed);tick(excessive,27,11.8);assert(!excessive.result);assert(warned(excessive));tick(excessive,27,.4);assert.equal(excessive.result?.title,'滑行速度过高');
 // The runway-exit handoff starts its own grace and resets accumulated speed
 // timers, including the state saved for a phase retry.
 const exit=structuredClone(landed);tick(exit,20,10);assert(!warned(exit));
 const outside=exit.ground.points.find(p=>Math.abs(p.x)>runwayOf(exit).width/2+40);assert(outside);
 exit.x=outside.x;exit.z=outside.z;let saved;tick(exit,27,.01,s=>{saved=structuredClone(s);});assert.equal(exit.ground.stage,'taxi-in');assert.equal(saved.ground.overspeedSeconds,0);assert.equal(saved.ground.speedReminderSeconds,0);assert.equal(exit.ground.overspeedSeconds,0);assert.equal(exit.ground.speedReminderSeconds,0);tick(exit,27,7.8);assert(!warned(exit));assert(!exit.result);
});
test('new game navigation and ground status messages translate in English',()=>{
 for(const x of['到港引导','导航 · 航班航路','航路方向 162° · 下一点 3.5 km','出口 A5 · 机位 251','低速脱离跑道 · 出口 A5 · 按地面导航滑行','航班离场 · 转入目的地航路 · 3500 ft','对正最后进近 · 按 ND / FD 飞行，最后进近前保持未构型','跑道方向爬升 / 3500 FT'])assert(!/\p{Script=Han}/u.test(t(x,'en')),x);
});
test('a past runway-vacated flag cannot authorize a skip after runway re-entry',()=>{
 const s={airportId:'daxing',ground:{arrival:true,stage:'taxi-in',runwayVacated:true},airborne:false,x:0,z:-1200,result:null};
 assert(!canSkipTaxiIn(s));assert(!skipTaxiIn(s));assert.equal(s.x,0);assert.equal(s.z,-1200);
 s.x=200;assert(canSkipTaxiIn(s));
});
