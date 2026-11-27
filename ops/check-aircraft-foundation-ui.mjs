// Real controls and live audio verify the existing model after foundation migration.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18109/',output=process.env.PILOT_QA_OUTPUT||'qa/aircraft-foundation/browser';
await mkdir(output,{recursive:true});
const b=await connect('about:blank',1000,600),report={url};
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),audio=()=>b.evaluate('window.__flightSim.audioStats().soundscape');
const tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
const click=async selector=>{await b.evaluate('document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"nearest"})');await b.click(selector);};
const raster=on=>b.evaluate(`(()=>{if(!window.__foundationRaster){const s=window.__foundationRaster={on:true},p=WebGL2RenderingContext.prototype;for(const k of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const f=p[k];p[k]=function(...a){if(s.on)return f.apply(this,a);};}}window.__foundationRaster.on=${!!on};})()`);
async function choose(id){
 if(!await b.evaluate('!!document.querySelector(".level-select")'))await click('.level-menu-button');
 await click('[data-level-id="'+id+'"]');await click('.enter-level');
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',120000);
 await click('.flight-card .primary-button');
}
try{
 await b.send('Emulation.setDeviceMetricsOverride',{width:1000,height:600,deviceScaleFactor:.5,mobile:false});await b.send('Page.navigate',{url});
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".level-select")',90000);
 await choose('engine-out');
 const start=await snap();assert.equal(start.aircraft.definitionVersion,1);assert.equal(start.engines.length,2);assert.equal(start.aircraft.livery,'yunji');report.initial=start.aircraft;
 await b.screenshot(output+'/cockpit.png');await raster(false);
 await tap('KeyT','t');await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.spool>.8)&&window.__flightSim.audioStats().soundscape.outputRms>.001',20000);report.normalAudio=await audio();
 await b.waitFor('window.__flightSim.snapshot().speed*1.94384>126',120000);
 await b.key('ArrowDown','ArrowDown');await b.waitFor('window.__flightSim.snapshot().pitch>.18',20000);await b.key('ArrowDown','ArrowDown','keyUp');
 await b.waitFor('window.__flightSim.snapshot().mission.triggered&&window.__flightSim.snapshot().stickPitch===0',30000);
 await b.waitFor('window.__flightSim.audioStats().soundscape.engines[0].rms<.00001&&window.__flightSim.audioStats().soundscape.engines[1].rms>.001',15000);
 report.engineOut={state:await snap(),audio:await audio(),visual:await b.evaluate('window.__flightSim.aircraftStats()')};
 assert(report.engineOut.state.airborne);assert(report.engineOut.state.pitch>.05,'released stick does not level the aircraft');assert.equal(report.engineOut.state.engines[0].thrustN,0);
 await tap('KeyP','p');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');await raster(true);await b.screenshot(output+'/engine-out.png');
 await tap('KeyK','k');await b.waitFor('window.__flightSim.recording().attempts===2&&window.__flightSim.snapshot().mission.practice');assert.deepEqual((await snap()).aircraft,start.aircraft);report.retry=(await snap()).aircraft;
 await choose('dual-glide');await raster(false);
 await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.status==="failed")&&window.__flightSim.audioStats().soundscape.engines.every(e=>e.rms<.00001)&&window.__flightSim.audioStats().soundscape.outputRms>.0001',30000);report.dualAudio=await audio();
 await click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');await click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms>.0001');
 await tap('KeyP','p');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');await raster(true);
 await click('.language-switch');await b.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:.5,mobile:false});await b.screenshot(output+'/english-landscape.png');
 report.passed=true;
}catch(error){report.error=error.stack;report.state=await snap().catch(()=>null);await b.key('ArrowDown','ArrowDown','keyUp').catch(()=>{});await raster(true).catch(()=>{});await b.screenshot(output+'/failure.png').catch(()=>{});process.exitCode=1;}
report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
if(report.errors.length){report.passed=false;process.exitCode=1;}
await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,errors:report.errors.length}));await b.close();process.exit(process.exitCode||0);
