import {chooseMapAirport} from './airport-selection.mjs';
import assert from 'node:assert/strict';
import {connect}from './cdp.mjs';
import {AIRPORTS}from '../game/src/airports/registry.js';
const b=await connect(process.argv[2]||'http://127.0.0.1:18084/',844,390);
const settle=()=>b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const scroll=async s=>{await b.evaluate(`document.querySelector(${JSON.stringify(s)}).scrollIntoView({block:'nearest'})`);await settle();};
try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',60000);if(await b.evaluate('document.documentElement.lang!=="en"'))await b.click('.language-switch');await b.click('[data-stage-id="airline"]');await b.waitFor('!!document.querySelector(".world-route-map")');
 for(const ap of AIRPORTS){await scroll('.route-endpoint');await b.click('.route-endpoint');await chooseMapAirport(b,ap.id);await settle();assert.equal(await b.evaluate('document.querySelector(".route-endpoint strong").textContent'),ap.iata);}
 await scroll('.world-route-map');await b.screenshot('qa/world-map-mobile-hit-regions.png');await scroll('.enter-flight');await b.screenshot('qa/world-map-mobile-enter.png');const r=await b.evaluate('document.querySelector(".enter-flight").getBoundingClientRect().toJSON()');assert(r.top>=0&&r.bottom<=390);assert.deepEqual(await b.evaluate('document.body.innerText.split("\\n").filter(s=>/\\p{Script=Han}/u.test(s))'),[]);assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'),[]);console.log('Compact city markers and airport dropdown select all airports; start button visible');
}finally{await b.close();}
