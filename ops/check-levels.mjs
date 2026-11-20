import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
import {LEVELS} from '../game/src/missions/catalog.js';
if(process.argv[3]==='engine-out'){await import('./check-expanded.mjs');process.exit(0);}
const url=process.argv[2]||'http://127.0.0.1:18083/',mode=process.argv[3]||'menu';
const b=await connect(url,1024,640),samples={};
const snap=()=>b.evaluate('window.__flightSim.snapshot()');
const tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
const choose=async id=>{
 if(!await b.evaluate('!!document.querySelector(".level-select")'))await b.click('.level-menu-button');
 await b.evaluate(`document.querySelector('[data-level-id="${id}"]').scrollIntoView({block:'nearest'})`);await b.click(`[data-level-id="${id}"]`);await b.click('.enter-level');
 await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled',30000);assert.equal((await snap()).levelId,id);
};
const start=()=>b.click('.flight-card .primary-button');
const retract=async()=>{await b.key('ShiftLeft','Shift');await tap('KeyF','f');await b.key('ShiftLeft','Shift','keyUp');};
async function takeoff(){
 await start();await tap('KeyT','t');assert.equal((await snap()).throttle,1);
 await b.waitFor('window.__flightSim.snapshot().speed*1.94384>=125',120000);
 await b.key('ArrowDown','ArrowDown');await b.waitFor('window.__flightSim.snapshot().pitch>.195',20000);
 await b.key('ArrowDown','ArrowDown','keyUp');
 await b.waitFor('window.__flightSim.snapshot().airborne && window.__flightSim.snapshot().verticalSpeed>.5',30000);await tap('KeyG','g');
}
try{
 await b.waitFor('window.__flightSim && !!document.querySelector(".level-select")',60000);
 console.log('Curriculum loaded:',mode);
 assert.equal(await b.evaluate('document.querySelectorAll(".level-tile").length'),13);
 if(mode==='menu'){
  await b.screenshot('qa/levels-browser-menu.png');
  for(const id of LEVELS.map(l=>l.id)){await choose(id);assert.equal((await snap()).playing,false);}
  await choose('takeoff');await takeoff();await b.waitFor('window.__flightSim.snapshot().result',120000);
  samples.takeoff=await snap();assert(samples.takeoff.result.levelCleared,JSON.stringify(samples.takeoff.result));
  await b.waitFor('JSON.parse(localStorage.getItem("pilot-sim.levels.v1")).levels.takeoff');
  await b.screenshot('qa/levels-normal-result.png');
  await b.click('.next-level');assert.equal((await snap()).levelId,'short-landing');
  await b.send('Page.reload');await b.waitFor('window.__flightSim && !!document.querySelector(".level-select")',60000);
  assert.equal((await snap()).levelId,'short-landing');assert(await b.evaluate('document.querySelector("[data-level-id=takeoff]").classList.contains("completed")'));
  await b.screenshot('qa/levels-progress.png');console.log('Thirteen tasks, normal takeoff, next-level flow and persisted recommendation passed.');
 }else if(mode==='engine-out'){
  await choose('engine-out');await takeoff();
  await b.waitFor('window.__flightSim.snapshot().mission.triggered',60000);
  samples.failure=await snap();assert.equal(samples.failure.engines[0].status,'failed');assert.equal(samples.failure.engines[0].thrustN,0);assert.equal(samples.failure.engines[1].status,'running');assert.equal(samples.failure.result,null);
  await b.screenshot('qa/levels-engine-failure.png');await tap('KeyC','c');assert((await snap()).mission.acknowledged);
  await b.waitFor('(window.__flightSim.snapshot().y-2.8)*3.28084>220',30000);await tap('KeyA','a');assert((await snap()).autoPilot);
  await b.waitFor('window.__flightSim.snapshot().result',180000);samples.finished=await snap();assert(samples.finished.result.levelCleared,JSON.stringify(samples.finished.result));assert.equal(samples.finished.engines[0].status,'failed');
  await b.screenshot('qa/levels-engine-result.png');console.log('Actual engine failure, C acknowledgement and single-engine climb passed:',samples.finished.result);
 }else if(mode==='windshear'){
  await choose('windshear');await start();await tap('KeyA','a');
  await b.waitFor('window.__flightSim.snapshot().mission.triggered',120000);samples.encounter=await snap();assert(samples.encounter.airData.disturbanceStrength>.045);assert(samples.encounter.autoPilot);
  await b.screenshot('qa/levels-windshear-alert.png');
  const gear=samples.encounter.gear,flaps=samples.encounter.flaps;await tap('KeyG','g');await retract();assert.equal((await snap()).gear,gear);assert.equal((await snap()).flaps,flaps);
  await tap('KeyT','t');assert((await snap()).goAround);
  await b.waitFor('window.__flightSim.snapshot().mission.clear',150000);samples.clear=await snap();assert.equal(samples.clear.gear,gear);assert.equal(samples.clear.flaps,flaps);
  await tap('KeyG','g');
  let stage=-1;const deadline=Date.now()+210000;
  while(Date.now()<deadline){
   const s=await snap();if(s.result)break;
   const band=Math.floor((s.y-2.8)*3.28084/500);if(band!==stage){stage=band;console.log('Wind recovery:',Math.round((s.y-2.8)*3.28084),'ft');}
   if(s.flaps>1&&Math.abs(s.flapPosition-s.flaps)<.05&&s.speed*1.94384>=150)await retract();
   if(s.throttle>.8)await tap('KeyL','l');
   await new Promise(r=>setTimeout(r,250));
  }
  samples.finished=await snap();assert(samples.finished.result?.levelCleared,JSON.stringify(samples.finished.result));assert(samples.finished.mission.clear);
  await b.screenshot('qa/levels-windshear-result.png');
  const before=await b.evaluate('localStorage.getItem("pilot-sim.levels.v1")');
  await tap('KeyK','k');samples.practice=await snap();assert(samples.practice.mission.practice);assert(samples.practice.mission.clear);assert.equal(samples.practice.result,null);
  assert.equal(await b.evaluate('localStorage.getItem("pilot-sim.levels.v1")'),before);
  console.log('Physical windshear, config hold, escape, cleanup and phase practice passed:',samples.finished.result);
 }else if(mode==='smoke'){
  await b.screenshot('qa/levels-production-menu.png');
  for(const id of LEVELS.map(l=>l.id))await choose(id);
  await b.screenshot('qa/levels-production.png');await start();await tap('KeyA','a');assert((await snap()).autoPilot);await tap('KeyP','p');assert.equal((await snap()).playing,false);
  console.log('Published curriculum, all level briefings, physical presets and controls loaded.');
 }
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Log.entryAdded'&&e.params.entry.level==='error'));assert.deepEqual(errors,[]);
 await writeFile(`qa/levels-${mode}-check.json`,JSON.stringify({url,viewport:{width:1024,height:640},samples,errors},null,2));
}catch(error){samples.failure={message:error.message,state:await snap().catch(()=>null),body:await b.evaluate('document.body.innerText.slice(0,2000)').catch(()=>null),events:b.events.filter(e=>e.method==='Runtime.exceptionThrown')};await b.screenshot(`qa/levels-${mode}-failure.png`).catch(()=>{});throw error;}finally{await writeFile(`qa/levels-${mode}-progress.json`,JSON.stringify({url,samples},null,2));await b.close();}
