// Actual UI and network throttling; never changes flight state through debug APIs.
import assert from 'node:assert/strict';
import {writeFile}from 'node:fs/promises';
import {connect}from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18082/',b=await connect(url,1280,800),report={};
const settle=()=>b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
async function click(selector){await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);await settle();await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...await b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)});await new Promise(r=>setTimeout(r,250));await b.click(selector);await settle();}
async function choose(id){
 if(!await b.evaluate('!!document.querySelector(".level-select")'))await click('.level-menu-button');
 await click('[data-stage-id="airline"]');await b.waitFor('!!document.querySelector("[data-airline-mode=practice]")');await click('[data-airline-mode="practice"]');
 await b.waitFor(`!!document.querySelector('[data-level-id="${id}"]')`);await click(`[data-level-id="${id}"]`);await click('.enter-level');
}
const throttle=rate=>b.send('Network.emulateNetworkConditions',{offline:false,latency:30,downloadThroughput:rate,uploadThroughput:rate,connectionType:'wifi'});
const errors=()=>b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',90000);
 if(await b.evaluate('document.documentElement.lang!=="en"'))await click('.language-switch');
 await b.send('Network.enable');await b.send('Network.setCacheDisabled',{cacheDisabled:true});await b.send('Network.setBlockedURLs',{urls:['https://*']});await throttle(8*1024*1024);
 await b.evaluate(`(()=>{window.__loadingSamples=[];const sample=()=>{const e=document.querySelector('.airport-loading'),p=e?.querySelector('progress');if(!p)return;const s={airport:window.__flightSim?.snapshot().airportId,stage:e.dataset.loadingStage,percent:p.value,text:e.innerText,lang:document.documentElement.lang,disabled:document.querySelector('.flight-card .primary-button')?.disabled,time:window.__flightSim?.snapshot().time};const a=window.__loadingSamples;if(JSON.stringify(a.at(-1))!==JSON.stringify(s))a.push(s);};new MutationObserver(sample).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});sample();})()`);
 await choose('jfk-takeoff');
 await b.waitFor('document.querySelector(".airport-loading")?.dataset.loadingStage==="download"',120000);
 assert(await b.evaluate('document.querySelector(".flight-card .primary-button").disabled'));
 await b.screenshot('qa/airport-loading-download-en.png');await click('.language-switch');await b.screenshot('qa/airport-loading-download-zh.png');await click('.language-switch');
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',180000);
 assert.equal(await b.evaluate('!!document.querySelector(".airport-loading")'),false);
 report.jfk=await b.evaluate('window.__loadingSamples.filter(s=>s.airport==="jfk")');
 for(const stage of['download','decompress','decode','models'])assert(report.jfk.some(s=>s.stage===stage),stage);
 for(let i=1;i<report.jfk.length;i++)assert(report.jfk[i].percent>=report.jfk[i-1].percent,'monotonic JFK progress');
 assert(report.jfk.some(s=>s.percent>0&&s.percent<99));assert(report.jfk.every(s=>s.percent<100&&s.disabled&&s.time===0));
 assert(!/\p{Script=Han}/u.test(await b.evaluate('document.body.innerText')),'settled English UI');
 assert(report.jfk.some(s=>s.stage==='models'&&/Prepared \d+ \/ \d+ models/.test(s.text)));
 assert.deepEqual(await b.evaluate('window.__flightSim.missingTranslations()'),[]);
 report.errorsBeforeFailure=errors();assert.deepEqual(report.errorsBeforeFailure,[]);
 console.log('JFK real loading phases and bilingual progress passed',report.jfk.length,'samples');
 // Leave a second city while its real transfer is in flight. Its old progress
 // must never overwrite the accepted, smaller airport.
 await throttle(2*1024*1024);await choose('changi-takeoff');await b.waitFor('document.querySelector(".airport-loading")?.dataset.loadingStage==="download"',90000);await choose('kansai-takeoff');
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',90000);
 await new Promise(r=>setTimeout(r,2000));assert.equal(await b.evaluate('window.__flightSim.snapshot().airportId'),'kansai');assert.equal(await b.evaluate('!!document.querySelector(".airport-loading")'),false);
 report.reset=await b.evaluate('window.__loadingSamples.filter(s=>s.airport==="kansai")');assert(report.reset.some(s=>s.percent<30));
 report.errorsBeforeFailure=errors();assert.deepEqual(report.errorsBeforeFailure,[]);
 // A real blocked transfer surfaces an error and keeps Start disabled.
 await b.send('Network.setBlockedURLs',{urls:['https://*','*assets/cities/changi/buildings-v1.bin.gz*']});await choose('changi-takeoff');await b.waitFor('document.querySelector(".flight-card h1")?.textContent.includes("temporarily")||document.querySelector(".flight-card")?.getAttribute("aria-label")==="Load failed"',90000);
 report.failure=await b.evaluate('({text:document.querySelector(".flight-card").innerText,disabled:document.querySelector(".flight-card .primary-button").disabled,bar:!!document.querySelector(".airport-loading")})');assert(report.failure.disabled&&!report.failure.bar);await b.screenshot('qa/airport-loading-error-en.png');
 console.log('Airport reset, stale-load cancellation and failure gating passed');
 report.passed=true;
}catch(e){report.failureMessage=e.message;await b.screenshot('qa/airport-loading-failure.png').catch(()=>{});throw e;}
finally{report.samples=await b.evaluate('window.__loadingSamples').catch(()=>[]);report.browserErrors=errors();await writeFile('qa/airport-loading-browser.json',JSON.stringify(report,null,2));await b.close();}
