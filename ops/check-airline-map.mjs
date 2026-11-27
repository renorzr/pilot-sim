import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {connect} from './cdp.mjs';
import {chooseAirportPractice,chooseMapAirport} from './airport-selection.mjs';
import {AIRPORTS} from '../game/src/airports/registry.js';
import {AIRLINE_ROUTES} from '../game/src/missions/catalog.js';
const url=process.argv[2]||'http://127.0.0.1:18082/',b=await connect(url,1360,820),report={url};
await mkdir('qa/airline-map',{recursive:true});
const settle=()=>b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
async function click(selector){
 await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);await settle();
 const hit=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===h||e.contains(h);})()`);
 assert(hit,'Occluded click: '+selector);await b.click(selector);await settle();
}
const routeId=()=>b.evaluate('document.querySelector(".enter-flight").dataset.routeId');
const viewport=()=>b.evaluate('JSON.stringify([...document.querySelectorAll("[data-city-id] circle:last-of-type")].map(e=>[e.getAttribute("cx"),e.getAttribute("cy")]))');
async function english(){assert.deepEqual(await b.evaluate('document.body.innerText.split("\\n").filter(s=>/\\p{Script=Han}/u.test(s))'),[]);assert.deepEqual(await b.evaluate('window.__flightSim.missingTranslations()'),[]);}
try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',120000);
 if(await b.evaluate('document.documentElement.lang!=="zh-CN"'))await click('.language-switch');
 await click('[data-stage-id=airline]');await b.waitFor('!!document.querySelector(".world-route-map")');
 if(await b.evaluate('!!JSON.parse(localStorage.getItem("pilot-sim.airline-map.v1"))?.bounds'))await click('.map-zoom');
 assert.equal(await b.evaluate('document.querySelectorAll(".airline-mode-tabs,[data-airline-mode]").length'),0);
 let position=await viewport();
 for(const airport of AIRPORTS){await chooseMapAirport(b,airport.id);assert.equal(await b.evaluate('document.querySelector(".map-airport-card").dataset.selectedAirport'),airport.id);assert.equal(await viewport(),position);assert.equal(await b.evaluate('document.querySelectorAll(".airport-picker-trigger").length'),airport.cityId==='new-york'?1:0);assert.equal(await b.evaluate('document.querySelectorAll(".airport-practice-actions [data-level-id]").length'),2);}
 await b.screenshot('qa/airline-map-pair/desktop-zh.png');
 await click('.language-switch');await english();await settle();position=await viewport();
 await click('[data-route-slot=origin]');assert.equal(await b.evaluate('document.querySelectorAll("[data-set-endpoint]").length'),0);
 for(const route of AIRLINE_ROUTES){await chooseMapAirport(b,route.origin);await chooseMapAirport(b,route.destination);assert.equal(await routeId(),route.id);assert.equal(await viewport(),position);}
 report.routes=AIRLINE_ROUTES.length;console.log(AIRLINE_ROUTES.length+' routes and stable map selection passed');
 // Keyboard and pointer selection use the same alternating endpoint flow.
 await b.evaluate('document.querySelector("[data-city-id=new-york]").focus()');await b.key('Enter','Enter');await b.key('Enter','Enter','keyUp');await settle();assert(await b.evaluate('!!document.querySelector("[data-airport-option=jfk]")'));await click('[data-airport-option=jfk]');assert.equal(await b.evaluate('document.querySelector(".map-airport-card").dataset.selectedAirport'),'jfk');
 await click('[data-airport-id=lax] circle:last-of-type');assert.equal(await routeId(),'jfk-lax');await click('.swap-airports');assert.equal(await routeId(),'lax-jfk');
 await click('.map-zoom');const focused=await viewport();await chooseMapAirport(b,'jfk');assert.equal(await viewport(),focused);await click('.map-zoom');
 await b.screenshot('qa/airline-map-pair/desktop-en.png');
 for(const [width,height]of[[844,390],[700,390]]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await settle();
  for(const ap of AIRPORTS){await chooseMapAirport(b,ap.id);assert.equal(await b.evaluate('document.querySelector(".map-airport-card").dataset.selectedAirport'),ap.id);}
  const practices=await b.evaluate('(()=>{const card=document.querySelector(".map-airport-card").getBoundingClientRect();return [...document.querySelectorAll(".airport-practice-actions button")].every(e=>{const r=e.getBoundingClientRect();return r.top>=card.top&&r.bottom<=card.bottom+1})})()');assert(practices,'Both compact practice actions must be visible');
  const rect=await b.evaluate('document.querySelector(".enter-flight").getBoundingClientRect().toJSON()');assert(rect.top>=0&&rect.bottom<=height&&rect.right<=width);await english();await b.screenshot(`qa/airline-map-pair/${width}-en.png`);await click('.language-switch');await b.screenshot(`qa/airline-map-pair/${width}-zh.png`);await click('.language-switch');
 }
 await b.send('Emulation.setDeviceMetricsOverride',{width:1360,height:820,deviceScaleFactor:1,mobile:false});await settle();
 await click('[data-route-slot=origin]');await click('[data-airport-id=xiaoshan] circle:last-of-type');const plannedRoute=await routeId();
 for(const id of['xiaoshan-takeoff','xiaoshan-landing']){
  await chooseAirportPractice(b,id);await b.waitFor(`window.__flightSim.snapshot().levelId===${JSON.stringify(id)}&&!!document.querySelector('.briefing-card')`,120000);
  await b.screenshot(`qa/airline-map-pair/${id}-brief.png`);await click('.level-menu-button');await b.waitFor('!!document.querySelector(".world-route-map")');assert.equal(await routeId(),plannedRoute);assert.equal(await b.evaluate('document.querySelector(".map-airport-card").dataset.selectedAirport'),'xiaoshan');
 }
 await click('.enter-flight');await b.waitFor(`window.__flightSim.snapshot().levelId===${JSON.stringify(plannedRoute)}&&!!document.querySelector('.briefing-card')`,120000);report.actualBriefing=await b.evaluate('window.__flightSim.snapshot().levelId');
 report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(report.errors,[]);report.passed=true;console.log('Unified map: '+AIRLINE_ROUTES.length+' routes, 6 cities, EN/ZH, 3 landscape sizes, both practices and route return passed');
}catch(e){report.error=e.message;await b.screenshot('qa/airline-map-pair/failed.png').catch(()=>{});throw e;}
finally{await writeFile('qa/airline-map-pair/browser.json',JSON.stringify(report,null,2));await b.close();}
