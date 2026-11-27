import {chooseAirportPractice} from './airport-selection.mjs';
import assert from 'node:assert/strict';
import {writeFile}from 'node:fs/promises';
import {AIRPORTS}from '../game/src/airports/registry.js';
import {AIRLINE_ROUTES}from '../game/src/missions/catalog.js';
import {connect}from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18084/',b=await connect(url,1280,800),samples={};
const scroll=selector=>b.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
async function clean(){assert.deepEqual(await b.evaluate('document.body.innerText.split("\\n").filter(x=>/\\p{Script=Han}/u.test(x))'),[]);assert.deepEqual(await b.evaluate('window.__flightSim.missingTranslations()'),[]);}
async function airline(){if(!await b.evaluate('!!document.querySelector(".level-select")'))await b.click('.level-menu-button');await scroll('[data-stage-id="airline"]');await b.click('[data-stage-id="airline"]');await b.waitFor('!!document.querySelector(".world-route-map")');}

try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',60000);if(await b.evaluate('document.documentElement.lang!=="en"'))await b.click('.language-switch');await airline();assert.equal(await b.evaluate('document.querySelectorAll("[data-airport-id]").length'),6);
 for(const route of AIRLINE_ROUTES){await b.click('.route-endpoint');await b.click(`[data-airport-id="${route.origin}"] circle:last-of-type`);await b.click('[data-route-slot="destination"]');await b.click(`[data-airport-id="${route.destination}"] circle:last-of-type`);assert.equal(await b.evaluate('document.querySelector(".enter-flight").dataset.routeId'),route.id);await clean();}
 await b.screenshot('qa/world-airports-map-en.png');await b.click('.map-zoom');await b.screenshot('qa/world-airports-route-focus-en.png');await b.click('.map-zoom');
 for(const id of['kansai','jfk','lax']){
  await airline();await chooseAirportPractice(b,`${id}-takeoff`);await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',60000);await clean();await scroll('.flight-card .primary-button');await b.click('.flight-card .primary-button');await b.waitFor('window.__flightSim.snapshot().time>1',60000);await clean();await b.screenshot(`qa/${id}-preview.png`);
  const s=await b.evaluate('window.__flightSim.snapshot()'),stats=await b.evaluate('window.__flightSim.stats()'),audio=await b.evaluate('window.__flightSim.audioStats()');assert.equal(s.airportId,id);assert(s.ground.stand&&!s.ground.entryCleared&&!s.ground.takeoffCleared);assert(audio.language==='en'&&audio.radioClip?.startsWith(`${id}-preparation-`)&&audio.radioEffect&&!audio.blocked);assert(stats.calls<130&&stats.triangles>100000);samples[id]={state:s,stats,audio};
 }
 await airline();await b.waitFor('!!document.querySelector(".enter-flight")');await b.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});await clean();await b.screenshot('qa/world-airports-map-mobile-en.png');await scroll('.enter-flight');const r=await b.evaluate('document.querySelector(".enter-flight").getBoundingClientRect().toJSON()');assert(r.top>=0&&r.bottom<=390);await b.click('.language-switch');await b.screenshot('qa/world-airports-map-mobile-zh.png');
 samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);console.log('30 routes, 12 practices and three airport EN openings passed');
}catch(e){await b.screenshot('qa/world-airports-ui-failure.png').catch(()=>{});throw e;}finally{await writeFile('qa/world-airports-ui-browser.json',JSON.stringify(samples,null,2));await b.close();}
