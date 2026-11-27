// Real menus, controls and an actual failed flight produce the replay. No pose,
// engine, clock or result setters are used. Run against a completed static build
// (a simultaneous Vite authoring rebuild would reset its menu through HMR).
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
import {captureRenderedFrame} from './lib/capture-rendered-frame.mjs';
const url=process.argv[2]||'http://127.0.0.1:18101/',output=process.env.PILOT_QA_OUTPUT||'qa/liveries/game';
await mkdir(output,{recursive:true});
const b=await connect('about:blank',1000,600),report={url,target:b.target.id};
const snapshot=()=>b.evaluate('window.__flightSim.snapshot()');
const click=async selector=>{await b.evaluate('document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"nearest"})');await b.click(selector);};
// Same software-GPU endurance approach as check-us1549-ui: rendering alone is
// suppressed between captures. Flight integration, scenery contacts, clocks,
// input events and appearance resources continue normally.
const raster=async on=>b.evaluate(`(()=>{if(!window.__liveryRaster){const state=window.__liveryRaster={on:true,originals:{}},p=WebGL2RenderingContext.prototype;for(const k of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){state.originals[k]=p[k];p[k]=function(...args){if(state.on)return state.originals[k].apply(this,args);};}}window.__liveryRaster.on=${!!on};})()`);
const finalScreenshot=path=>captureRenderedFrame(b,path);
const check=async stage=>{
 const value=await b.evaluate('({flight:window.__flightSim.snapshot().aircraft,visual:window.__flightSim.aircraftStats(),presentation:window.__flightSim.airportPresentation()?.visual?.aircraft,replay:window.__flightSim.replay()})');
 assert.equal(value.flight.definitionVersion,1);assert.equal(value.visual.appearance.definitionVersion,value.flight.definitionVersion);
 assert.equal(value.flight.livery,'us-airways-n106us-2009');assert.equal(value.visual.appearance.livery,value.flight.livery);assert.equal(value.visual.appearance.variant,'wingtip-fence');assert.equal(value.visual.texture.width,2048);assert(value.visual.texture.compressed);if(value.presentation)assert.deepEqual(value.presentation,value.flight);report[stage]=value;
};
try{
 await b.send('Emulation.setDeviceMetricsOverride',{width:1000,height:600,deviceScaleFactor:.5,mobile:false});await b.send('Page.navigate',{url});
 await b.waitFor('!!window.__flightSim&&!!document.querySelector("[data-stage-id=history]")',90000);
 await click('[data-stage-id=history]');await b.waitFor('document.querySelector("[data-stage-id=history]").getAttribute("aria-selected")==="true"',60000);
 await click('.enter-level');await b.waitFor('!!window.__flightSim.snapshot().historical',60000);
 await b.waitFor('!!document.querySelector(".briefing-card .primary-button")&&!document.querySelector(".briefing-card .primary-button").disabled',300000);
 await click('[data-view-mode=exterior]');await check('cover');await b.screenshot(output+'/cover.png');
 await raster(false);report.rasterSuppressedBetweenCaptures=true;
 await click('.briefing-card .primary-button');await b.waitFor('!!document.querySelector(".skip-intro")',60000);await click('.skip-intro');
 await b.waitFor('!window.__flightSim.airportPresentation()?.active&&window.__flightSim.snapshot().time>=2',60000);await check('live');
 await click('[data-history-early]');await b.waitFor('window.__flightSim.snapshot().historical.controlSource==="player"');
 await b.key('ArrowUp','ArrowUp');await b.waitFor('!!window.__flightSim.snapshot().result',120000);await b.key('ArrowUp','ArrowUp','keyUp');report.result=(await snapshot()).result;
 await b.waitFor('!!document.querySelector(".failure-skip")',60000);await click('.failure-skip');
 await b.waitFor('window.__flightSim.replay()?.count>0&&!window.__flightSim.replay().loading',180000);await check('replay');await raster(true);await b.screenshot(output+'/replay.png');
 await b.waitFor('!!document.querySelector(".history-final-practice")',60000);await click('.history-final-practice');
 await b.waitFor('window.__flightSim.snapshot().historical?.finalPractice',60000);await check('finalPractice');await finalScreenshot(output+'/final-practice.png');
 report.passed=true;
}catch(error){report.error=error.stack;report.state=await snapshot().catch(()=>null);await b.key('ArrowUp','ArrowUp','keyUp').catch(()=>{});await raster(true).catch(()=>{});await b.screenshot(output+'/failure.png').catch(()=>{});process.exitCode=1;}
report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
if(report.errors.length){report.passed=false;process.exitCode=1;}
await writeFile(output+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,errors:report.errors.length,target:b.target.id}));process.exit(process.exitCode||0);
