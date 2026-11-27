// Final-layout smoke check; real engine failure, rendering and menu controls.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
import {captureRenderedFrame} from './lib/capture-rendered-frame.mjs';
const url=process.argv[2]||'http://127.0.0.1:18112/',out=process.env.PILOT_QA_OUTPUT||'qa/a380/final-browser';
await mkdir(out,{recursive:true});const b=await connect('about:blank',1000,600),report={url};
const click=async selector=>{await b.evaluate('document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"nearest"})');await b.click(selector);};
const tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
const raster=on=>b.evaluate(`(()=>{if(!window.__visualRaster){const s=window.__visualRaster={on:true},p=WebGL2RenderingContext.prototype;for(const k of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const f=p[k];p[k]=function(...a){if(s.on)return f.apply(this,a);};}}window.__visualRaster.on=${!!on};})()`);
async function capture(name){await raster(true);await captureRenderedFrame(b,out+'/'+name+'.png');await raster(false);}
try{
 await b.send('Emulation.setDeviceMetricsOverride',{width:1000,height:600,deviceScaleFactor:.5,mobile:false});await b.send('Page.navigate',{url});
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".level-select")&&!!window.__flightSim.aircraftStats()',120000);await click('[data-stage-id=training]');await capture('menu');await click('[data-level-id=a380-engine-out]');await click('.enter-level');
 await b.waitFor('!!document.querySelector(".briefing-card .primary-button")&&!document.querySelector(".briefing-card .primary-button").disabled&&window.__flightSim.aircraftStats()?.engines?.length===4',120000);await click('.briefing-card .primary-button');
 await click('[data-view-mode=exterior]');await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:170,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:750,y:170,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:750,y:170,button:'left',buttons:0,clickCount:1});await tap('KeyP','p');await capture('exterior');
 report.visual=await b.evaluate('window.__flightSim.aircraftStats()');assert.equal(report.visual.appearance.model,'a380');assert.equal(report.visual.engines.length,4);assert(report.visual.visible);assert(report.visual.texture.compressed);assert(report.visual.draws<130);
 await click('[data-view-mode=cockpit]');await capture('cockpit');await tap('KeyP','p');await tap('KeyT','t');
 await b.waitFor('window.__flightSim.snapshot().speed*1.94384>=150',150000);await b.key('ArrowDown','ArrowDown');await b.waitFor('window.__flightSim.snapshot().pitch>=.17',15000);await b.key('ArrowDown','ArrowDown','keyUp');
 await b.waitFor('window.__flightSim.snapshot().airborne&&window.__flightSim.snapshot().verticalSpeed>.5',30000);await tap('KeyG','g');await b.waitFor('window.__flightSim.snapshot().mission.triggered',40000);await tap('KeyC','c');
 await b.waitFor('window.__flightSim.audioStats().soundscape.engines[0].rms<.00001&&window.__flightSim.audioStats().soundscape.engines.slice(1).every(e=>e.rms>.0001)',15000);
 report.failure=await b.evaluate('({state:window.__flightSim.snapshot(),audio:window.__flightSim.audioStats().soundscape})');assert.equal(report.failure.state.engines[0].thrustN,0);await tap('KeyP','p');await capture('cockpit-engine-out');
 await tap('KeyK','k');await b.waitFor('window.__flightSim.snapshot().mission.practice');report.retry=await b.evaluate('window.__flightSim.snapshot().aircraft');assert.equal(report.retry.model,'a380');assert.equal(report.retry.definitionVersion,1);await tap('KeyP','p');
 await click('.level-menu-button');await b.waitFor('!!document.querySelector(".level-select")');if(await b.evaluate('document.documentElement.lang!=="en"'))await click('.language-switch');await b.waitFor('document.documentElement.lang==="en"');await b.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:.5,mobile:false});await click('[data-stage-id=training]');await capture('english-menu');
 assert(await b.evaluate('[...document.querySelectorAll(".stage-tabs button")].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})'));
 await click('[data-level-id=a380-landing]');await click('.enter-level');await b.waitFor('!!document.querySelector(".briefing-card .primary-button")&&!document.querySelector(".briefing-card .primary-button").disabled');await capture('english-briefing');
 await click('.level-menu-button');await b.waitFor('!!document.querySelector(".level-select")');await click('[data-stage-id=training]');await click('[data-level-id=takeoff]');await click('.enter-level');await b.waitFor('!document.querySelector(".briefing-card .primary-button").disabled&&window.__flightSim.aircraftStats()?.appearance.model==="a320"',120000);
 report.switchBack=await b.evaluate('({aircraft:window.__flightSim.snapshot().aircraft,audio:window.__flightSim.audioStats().soundscape})');assert.equal(report.switchBack.aircraft.model,'a320');assert.equal(report.switchBack.audio.engines.length,2);report.passed=true;
}catch(error){report.error=error.stack;report.state=await b.evaluate('window.__flightSim?.snapshot()').catch(()=>null);await b.key('ArrowDown','ArrowDown','keyUp').catch(()=>{});await raster(true).catch(()=>{});await captureRenderedFrame(b,out+'/failure.png').catch(()=>{});process.exitCode=1;}
report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');if(report.errors.length){report.passed=false;process.exitCode=1;}
await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,errors:report.errors.length}));await b.close();process.exit(process.exitCode||0);
