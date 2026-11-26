import englishPilotClean from '../src/comms/english-pilot-clean.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import {stat}from 'node:fs/promises';
import {createFlight,advanceFlight,advanceSimulation,setDetent,setLever,stepFlaps,restoreCheckpoint,setEngineStatus,KT}from '../src/flight.js';
import {DEPARTURE,groundActive,groundFrozen,skipTaxi,skipAirportIntro}from '../src/missions/ground.js';
import {groundPilot}from './ground-pilot.mjs';
import {pilotInput}from './pilot.mjs';
import {setRadioLanguage,clipUrl}from '../src/comms/radio.js';
import radio from '../src/comms/ground-radio.json' with{type:'json'};
import {normalizeProgress}from '../src/missions/progress.js';
import {refreshAirData}from '../src/sim/aerodynamics.js';
import {t}from '../src/i18n/index.js';
const create=()=>createFlight(null,{levelId:'daxing-takeoff'});
function until(s,condition,input=()=>({}),seconds=600){for(let i=0;i<seconds*50&&!s.result&&!condition(s);i++)advanceFlight(s,input(s),.02);assert(condition(s),JSON.stringify({result:s.result,ground:s.ground,x:s.x,z:s.z}));return s;}
const atTaxi=()=>until(create(),s=>s.ground.stage==='taxi');
const atHold=()=>{const s=atTaxi();assert(skipTaxi(s));return until(s,s=>s.ground.stage==='holding');};

test('real stand 107 starts stopped, unpowered and with no runway permission; training remains on runway',()=>{
 const s=create();assert.equal(s.x,DEPARTURE.stand.x);assert.equal(s.z,DEPARTURE.stand.z);assert(s.engines.every(e=>e.status==='off'&&e.thrustN===0));assert.equal(s.flapPosition,0);assert(!s.ground.entryCleared&&!s.ground.takeoffCleared);assert(!createFlight(null,{levelId:'takeoff'}).ground);
 for(let i=0;i<150;i++){setDetent(s,'TOGA');advanceFlight(s,{throttle:1,pitch:1,steer:1},.02);}
 assert.equal(s.x,DEPARTURE.stand.x);assert.equal(s.throttle,0);assert.equal(s.stickRoll,0);assert(!skipTaxi(s));
});
test('airport view can be skipped independently of automatic preparation and permission',()=>{
 const s=create();assert(skipAirportIntro(s));assert(s.ground.introSkipped);assert.equal(s.ground.stage,'gate');assert(!s.ground.entryCleared);const before=structuredClone(s);advanceSimulation(s,{},0);assert.deepEqual(s,before);
 until(s,s=>s.ground.stage==='taxi');assert.equal(s.x,DEPARTURE.handoff.x);assert.equal(s.flapPosition,1);assert(s.engines.every(e=>e.status==='running'));assert.equal(s.throttle,0);assert(!s.radio.fired.takeoff);
});
test('skip transfers only to a stationary external hold, preserves failures and requires manual entry',()=>{
 const s=atTaxi();setEngineStatus(s,0,'failed');setEngineStatus(s,1,'off');setLever(s,.1);advanceFlight(s,{steer:.7},.02);assert(skipTaxi(s));assert(groundFrozen(s));until(s,s=>s.ground.stage==='holding');
 assert.equal(s.x,DEPARTURE.hold.x);assert.equal(s.z,DEPARTURE.hold.z);assert.equal(s.airData.groundSpeed,0);assert.equal(s.throttle,0);assert.equal(s.stickRoll,0);assert(s.ground.heldShort);assert(!s.ground.entryCleared&&!s.ground.lineupComplete&&!s.ground.takeoffCleared);assert(!s.radio.fired.takeoff);assert(s.ground.skippedSeconds>200);assert.equal(s.engines[0].status,'failed');assert.equal(s.engines[1].status,'off');
 const restored=restoreCheckpoint(s);assert.equal(restored.x,s.x);assert.equal(restored.ground.stage,'holding');assert(!restored.ground.entryCleared);assert.equal(restored.engines[0].status,'failed');
});
test('taxi limits actual engine demand, keeps wheels down, and automatically retains takeoff configuration',()=>{
 const s=atTaxi();assert(!stepFlaps(s));setDetent(s,'TOGA');assert.equal(s.throttle,0);setLever(s,1);assert.equal(s.throttle,.18);
 for(let i=0;i<300;i++)advanceFlight(s,{pitch:1},.02);
 assert(s.engines.every(e=>e.command<=.18));assert.equal(s.pitch,0);assert(!s.airborne);assert.equal(s.flaps,1);
});
for(const skip of[false,true])test(`${skip?'skipped':'complete'} taxi, stopped hold, manual lineup, separate clearances and takeoff complete through controls`,()=>{
 const s=create();let stages=new Set();until(s,s=>s.ground.takeoffCleared,s=>{stages.add(s.ground.stage);return groundPilot(s,{skip})||{};},600);
 assert(stages.has('holding')&&stages.has('lineup')&&stages.has('takeoff-clearance'));assert(s.ground.manualEntryDistance>200);assert(s.ground.heldShort&&s.ground.lineupComplete);assert(Math.abs(s.x)<6&&Math.abs(s.yaw)<5*Math.PI/180);assert(s.airData.groundSpeed<1/KT);
 assert.equal(s.ground.skipped,skip);if(!skip)assert(s.ground.distance>1500);
 until(s,s=>!!s.result,pilotInput,150);assert(s.result.levelCleared);assert(s.airborne&&s.gearPosition<.02);assert(!s.terrain.events.some(e=>e.level));
});
test('entry clearance alone never authorizes TOGA or grants lineup completion',()=>{
 const s=atHold();until(s,s=>s.ground.entryCleared);setDetent(s,'TOGA');assert.equal(s.throttle,0);assert(!s.ground.takeoffCleared&&!s.ground.lineupComplete);assert(!s.radio.fired.takeoff);
 for(let i=0;i<500;i++)advanceFlight(s,{brake:true},.02);assert.equal(s.ground.stage,'lineup');assert(!s.ground.lineupComplete);assert(!skipTaxi(s));
});
test('surface departure detects off-route driving and unauthorized runway entry before mission completion',()=>{
 const warned=atTaxi();Object.assign(warned,{x:-105,z:-100,yaw:Math.PI/2,velocity:{x:5,y:0,z:0}});refreshAirData(warned);advanceFlight(warned,{},.02);assert(warned.radio.active?.event==='ground-stop'||warned.radio.pending.some(l=>l.event==='ground-stop'));assert(!warned.result);
 for(const type of['route','incursion']){const s=atTaxi();if(type==='route'){s.x-=80;}else{s.x=-88;s.z=-100;s.yaw=Math.PI/2;}
  until(s,s=>!!s.result,()=>({brake:true}),4);assert.equal(s.result.success,false);assert.equal(s.result.title,type==='route'?'偏离滑行道':'未经许可进入跑道');assert(!s.result.levelCleared);
 }
});
test('taxi speeding triggers an ATC reminder and sustained excessive speed ends the attempt',()=>{
 const s=atTaxi();s.velocity={x:26/KT,y:0,z:0};refreshAirData(s);advanceFlight(s,{},.02);assert(s.radio.pending.some(l=>l.event==='ground-speed')||s.radio.active?.event==='ground-speed');
 // Deliberate invalid-speed fixture exercises the sustained limit independently
 // of the low-power acceleration ceiling and the route curvature.
 for(let i=0;i<220&&!s.result;i++){s.velocity={x:27/KT,y:0,z:0};advanceFlight(s,{},.02);}
 assert.equal(s.result?.title,'滑行速度过高');
});
test('ground radio uses bilingual recordings, measured timing and the normal radio DSP URLs',async()=>{
 for(const lang of['zh','en'])for(const[key,lines]of Object.entries(radio[lang]))for(let i=0;i<lines.length;i++){const id=`ground-${key}-${i}`;assert((await stat(new URL(`../../public/assets/radio/${lang==='en'?'en/':''}${id}.mp3`,import.meta.url))).size>1000);assert(radio.durations[lang][id]>0);assert(!/\p{Script=Han}/u.test(t(lines[i][1],'en')));assert(clipUrl(id,lang).includes(radio.version));}
 const s=create();advanceFlight(s,{},.02);assert.equal(s.radio.active.clip,'ground-preparation-0');setRadioLanguage(s,'en');assert(Math.abs(s.radio.active.until-(s.time+(englishPilotClean.clips[s.radio.active.clip]?.duration??radio.durations.en[s.radio.active.clip])+.2))<1e-8);until(s,s=>s.ground.stage==='taxi');assert(s.time>12);
});
test('old runway-only Daxing scores expire without affecting training or landing records',()=>{
 const p=normalizeProgress({levels:{takeoff:{bestScore:90},'daxing-takeoff':{bestScore:95},'daxing-landing':{bestScore:92}}});assert(!p.levels['daxing-takeoff']);assert.equal(p.levels.takeoff.bestScore,90);assert.equal(p.levels['daxing-landing'].bestScore,92);
});
