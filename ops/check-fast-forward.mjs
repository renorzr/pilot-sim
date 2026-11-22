// Real game inputs only: no pose, clock, mission or result setters.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const b=await connect(process.argv[2]||'http://127.0.0.1:18083/',1280,800),samples=[];
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
const point=async()=>{const r=await b.evaluate('document.querySelector(".fast-forward-button").getBoundingClientRect().toJSON()');return{x:r.x+r.width/2,y:r.y+r.height/2};};
const down=async p=>b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
const move=async p=>b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p,button:'left',buttons:1});
const up=async p=>b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});
const speed=async n=>{await b.waitFor('window.__flightSim.snapshot().timeScale==='+n);await b.waitFor('document.querySelector(".fast-forward-button").dataset.speed==="'+n+'"');};
async function normal(){await speed(1);assert(await b.evaluate('!!document.querySelector(".fast-forward-button svg")&&!document.querySelector(".fast-forward-button output")'));}
try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',60000);
 if(await b.evaluate('document.documentElement.lang!=="en"'))await b.click('.language-switch');
 await b.click('[data-level-id="takeoff"]');await b.click('.enter-level');
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',60000);
 assert(await b.evaluate('document.querySelector(".fast-forward-button").disabled'));assert.equal(await b.evaluate('document.querySelectorAll(".toolbar-actions .fast-forward-button").length'),0);assert.equal(await b.evaluate('document.querySelectorAll(".cockpit-footer .fast-forward-button").length'),1);
 await b.click('.flight-card .primary-button');await b.waitFor('window.__flightSim.snapshot().playing&&window.__flightSim.snapshot().time>.1',60000);
 const before=await snap();assert(before.y<100);let p=await point();
 await down(p);await speed(2);assert(await b.evaluate('document.querySelector(".fast-forward-button output").textContent==="2×"'));assert(await b.evaluate('!document.activeElement.matches("button,[role=button]")'));
 await b.waitFor('window.__flightSim.snapshot().time>'+JSON.stringify(before.time+.2));await speed(2);
 await move({x:p.x,y:p.y-28});await speed(4);assert(await b.evaluate('document.querySelector(".fast-forward-button output").textContent==="4×"'));
 const at4=await snap();await b.waitFor('window.__flightSim.snapshot().time>'+JSON.stringify(at4.time+.2));await speed(4);samples.push({kind:'ground-4x',state:await snap()});await b.screenshot('qa/fast-forward-4x.png');
 await up({x:p.x-100,y:p.y-32});await normal();
 await down(p);await speed(2);await move({x:p.x,y:p.y-28});await speed(4);await move(p);await speed(2);await up(p);await normal();
 // Pausing while physically holding the mouse must cancel capture and rate.
 await down(p);await move({x:p.x,y:p.y-28});await speed(4);await tap('KeyP','p');await normal();assert(!(await snap()).playing);await up(p);assert(await b.evaluate('document.querySelector(".fast-forward-button").disabled'));
 await tap('KeyP','p');await b.waitFor('window.__flightSim.snapshot().playing');
 // Retry stays playing, so cancellation cannot rely only on disabled changes.
 p=await point();await down(p);await speed(2);await tap('KeyR','r');await normal();await move({x:p.x,y:p.y-30});await normal();await up(p);
 // Touch cancellation should restore the icon without leaving 4x behind.
 await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});p=await point();
 await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await speed(2);
 await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-28,id:1}]});await speed(4);
 await b.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await normal();await b.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 // Window focus loss follows the actual existing game pause path.
 p=await point();await down(p);await speed(2);await b.evaluate('window.dispatchEvent(new Event("blur"))');await normal();assert(!(await snap()).playing);await up(p);
 for(const lang of['zh','en']){
  if(await b.evaluate('document.documentElement.lang')!==(lang==='en'?'en':'zh-CN'))await b.click('.language-switch');
  for(const[width,height]of[[1280,800],[844,390],[640,400]]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   const r=await b.evaluate('(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return{button:r(".fast-forward-button"),footer:r(".cockpit-footer"),stage:r(".stage"),missing:window.__flightSim.missingTranslations()}})()');
   assert(r.button.left>=r.footer.left&&r.button.right<=r.footer.right);assert(r.button.top>=r.footer.top-.5&&r.button.bottom<=r.footer.bottom+.5);assert.deepEqual(r.missing,[]);samples.push({lang,width,height,...r});
  }
 }
 await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await b.screenshot('qa/fast-forward-footer.png');
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(errors,[]);assert(!(await snap()).result);
 console.log('Fast-forward: footer, 2x/4x real ground simulation, drag-back/release, pause/retry, touch cancel, blur, no focus, 6 responsive/locale cases passed.');
}catch(e){await b.screenshot('qa/fast-forward-failure.png').catch(()=>{});throw e;}
finally{await writeFile('qa/fast-forward-browser.json',JSON.stringify(samples,null,2));await b.close();}
