import assert from 'node:assert/strict';
import {writeFile}from 'node:fs/promises';
import {connect}from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18082/',report={};let b;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function click(selector){await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const p=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await sleep(250);await b.click(selector);await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function open({block=false,deny=false}={}){
 b=await connect('about:blank',1100,720);
 await b.send('Network.enable');await b.send('Network.setCacheDisabled',{cacheDisabled:true});
 await b.send('Network.setBlockedURLs',{urls:['https://*',...(block?['*assets/cities/kansai/*.bin.gz*','*assets/cities/kansai/*.webp*','*assets/cities/kansai/*.png*']:[])]});
 if(deny)await b.send('Page.addScriptToEvaluateOnNewDocument',{source:'indexedDB.open=()=>{throw new DOMException("Test denied storage","SecurityError")};'});
 await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__cachePhases=[];new MutationObserver(()=>{const s=document.querySelector('.airport-loading')?.dataset.loadingStage;if(s&&window.__cachePhases.at(-1)!==s)window.__cachePhases.push(s);}).observe(document,{childList:true,subtree:true,attributes:true});`});
 await b.send('Page.navigate',{url});await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',120000);
 if(await b.evaluate('document.documentElement.lang!=="en"'))await click('.language-switch');
}
async function airport(id){
 await click('[data-stage-id="airline"]');await b.waitFor('!!document.querySelector("[data-airline-mode=practice]")');await click('[data-airline-mode="practice"]');await b.waitFor(`!!document.querySelector('[data-level-id="${id}-takeoff"]')`);await click(`[data-level-id="${id}-takeoff"]`);
 const started=Date.now();await click('.enter-level');
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',300000);
 await b.waitFor('window.__flightSim.stats().city.pendingDetails===0&&window.__flightSim.stats().city.persistentCache.pendingWrites===0',120000);
 const elapsedMs=Date.now()-started,result=await b.evaluate('({city:window.__flightSim.stats().city,time:window.__flightSim.snapshot().time,phases:window.__cachePhases,missing:window.__flightSim.missingTranslations()})');
 assert.equal(result.time,0);assert.deepEqual(result.missing,[]);result.elapsedMs=elapsedMs;
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(errors,[]);
 result.largeRequests=b.events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('/assets/cities/'+id+'/')&&/\.(bin\.gz|webp|png)\?/.test(e.params.request.url)).map(e=>e.params.request.url);
 return result;
}
try{
 await open();report.cold=await airport('kansai');assert.equal(report.cold.city.sourceCacheHit,false);assert(report.cold.city.urbanStats.builtTiles>100);assert(report.cold.city.persistentCache.writes>1000);assert(report.cold.largeRequests.length>0);await b.screenshot('qa/kansai-cache-cold-en.png');console.log('Cold Kansai saved',report.cold.elapsedMs,'ms',report.cold.city.persistentCache);await b.close();b=null;
 // New page, disabled HTTP cache and blocked large files: persistence is the
 // only source of decoded buildings, model arrays and previously used images.
 await open({block:true});report.warm=await airport('kansai');assert(report.warm.city.sourceCacheHit);assert.equal(report.warm.city.urbanStats.builtTiles,0);assert(report.warm.city.urbanStats.restoredTiles>100);assert.equal(report.warm.largeRequests.length,0);assert(!report.warm.phases.some(s=>['download','decompress','decode'].includes(s)));assert(report.warm.phases.includes('cache'));await click('.language-switch');await b.screenshot('qa/kansai-cache-warm-zh.png');console.log('Warm Kansai restored',report.warm.elapsedMs,'ms',report.warm.city.urbanStats.restoredTiles,'models');
 report.partialWrites=await b.evaluate(`(async()=>{
  const {createCityPersistentCache}=await import('http://127.0.0.1:18083/src/airports/city-persistent-cache.js'),arrays={bytes:new Uint8Array(4*1024*1024+17)},storage={estimate:async()=>({quota:1024**3,usage:0})},original=IDBObjectStore.prototype.put;let writes=0;
  try{IDBObjectStore.prototype.put=function(value,...args){if(value.airport==='qa-quota'&&++writes===2)throw new DOMException('Test quota','QuotaExceededError');return original.call(this,value,...args)};const c=createCityPersistentCache('qa-quota',{storage});const saved=await c.putArrays('qa-quota','decoded',arrays);const loaded=await c.getArrays('qa-quota','decoded');if(saved||loaded!==null||!c.stats().writeFailure)throw Error('Partial quota save published');}finally{IDBObjectStore.prototype.put=original;}
  const c=createCityPersistentCache('qa-cancel',{storage});let checks=0;const saved=await c.putArrays('qa-cancel','decoded',arrays,{isCurrent:()=>++checks<3});if(saved||await c.getArrays('qa-cancel','decoded')!==null)throw Error('Cancelled save published');return{quota:true,cancellation:true};
 })()`);console.log('Real IndexedDB partial writes stayed unpublished',report.partialWrites);await b.close();b=null;
 // Break one model, retaining its source key. All other models still restore.
 await open();
 report.corruptedKey=await b.evaluate(`new Promise((resolve,reject)=>{const o=indexedDB.open('pilot-sim-city-cache',1);o.onerror=()=>reject(o.error);o.onsuccess=()=>{const db=o.result,tx=db.transaction('entries','readwrite'),s=tx.objectStore('entries'),r=s.index('airport').openCursor(IDBKeyRange.only('kansai'));let key=null;r.onsuccess=()=>{const c=r.result;if(!c)return;if(c.primaryKey.includes(':models:')&&c.primaryKey.endsWith('/0')){key=c.primaryKey;c.update({...c.value,payload:{format:-1}});}else c.continue();};tx.oncomplete=()=>{db.close();resolve(key)};tx.onabort=()=>reject(tx.error);};})`);assert(report.corruptedKey);
 report.repaired=await airport('kansai');assert(report.repaired.city.sourceCacheHit);assert.equal(report.repaired.city.urbanStats.builtTiles,1);assert(report.repaired.city.urbanStats.restoredTiles>100);console.log('Corrupt model rebuilt independently');await b.close();b=null;
 // A fresh page whose storage API is denied must still load the real city.
 await open({deny:true});report.denied=await airport('changi');assert.equal(report.denied.city.sourceCacheHit,false);assert.equal(report.denied.city.persistentCache.available,false);assert(report.denied.city.urbanStats.builtTiles>0);console.log('Denied storage fell back to normal loading');report.passed=true;
}catch(e){report.failure=e.message;if(b)await b.screenshot('qa/kansai-cache-failure.png').catch(()=>{});throw e;}
finally{await writeFile('qa/kansai-persistent-cache-browser.json',JSON.stringify(report,null,2));if(b)await b.close();}
