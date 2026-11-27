// Real input events only. Software-GPU draw calls are suppressed between captures;
// flight integration, controls, recording, failures and resource loads run normally.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
import {captureRenderedFrame} from './lib/capture-rendered-frame.mjs';
const url=process.argv[2]||'http://127.0.0.1:18111/',out=process.env.PILOT_QA_OUTPUT||'qa/a380/browser';
await mkdir(out,{recursive:true});
const b=await connect('about:blank',1000,600),report={url},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),audio=()=>b.evaluate('window.__flightSim.audioStats().soundscape');
const click=async selector=>{await b.evaluate('document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"nearest"})');await b.click(selector);};
const tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
const raster=on=>b.evaluate(`(()=>{if(!window.__a380Raster){const s=window.__a380Raster={on:true},p=WebGL2RenderingContext.prototype;for(const k of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const original=p[k];p[k]=function(...a){if(s.on)return original.apply(this,a);};}}window.__a380Raster.on=${!!on};})()`);
let dragging=false;
async function stick(pitch,roll){
 const r=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');
 await b.send('Input.dispatchMouseEvent',{type:dragging?'mouseMoved':'mousePressed',x:r.x+(roll+1)*r.w/2,y:r.y+(pitch+1)*r.h/2,button:'left',buttons:1,clickCount:1});dragging=true;
}
async function release(){if(dragging){await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:500,y:340,button:'left',buttons:0,clickCount:1});dragging=false;}}
async function capture(name){await raster(true);await captureRenderedFrame(b,out+'/'+name+'.png');await raster(false);}
async function menu(){
 await release();
 if(await b.evaluate('!!document.querySelector(".level-select")'))return;
 if(await b.evaluate('!!document.querySelector(".level-menu-button")'))await click('.level-menu-button');
 else{if(!await b.evaluate('!!document.querySelector(".level-result")'))await tap('Tab','Tab');await b.waitFor('!!document.querySelector(".level-result")');await click(await b.evaluate('document.querySelector(".back-to-levels")?".back-to-levels":".next-level"'));}
 await b.waitFor('!!document.querySelector(".level-select")');
}
async function choose(id){
 await menu();await click('[data-stage-id=training]');await click('[data-level-id="'+id+'"]');await click('.enter-level');dragging=false;
}
async function ready(){await b.waitFor('!!document.querySelector(".briefing-card .primary-button")&&!document.querySelector(".briefing-card .primary-button").disabled&&window.__flightSim.aircraftStats()?.appearance.model==="a380"&&window.__flightSim.aircraftStats()?.engines?.length===4',120000);}
const clamp=(v,a,c)=>Math.max(a,Math.min(c,v));
try{
 await b.send('Emulation.setDeviceMetricsOverride',{width:1000,height:600,deviceScaleFactor:.5,mobile:false});await b.send('Page.navigate',{url});
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".level-select")&&!!window.__flightSim.aircraftStats()',120000);
 await click('[data-stage-id=training]');await capture('menu');
 await b.send('Fetch.enable',{patterns:[{urlPattern:'*skyline-380-uv1.glb*',requestStage:'Request'}]});await choose('a380-engine-out');
 let request;const deadline=Date.now()+30000;
 while(!request&&Date.now()<deadline){request=b.events.find(e=>e.method==='Fetch.requestPaused'&&e.params.request.url.includes('skyline-380'));if(!request)await sleep(100);}
 assert(request,'A380 model request intercepted');await sleep(800);
 report.loading=await b.evaluate('({disabled:document.querySelector(".briefing-card .primary-button").disabled,time:window.__flightSim.snapshot().time,model:window.__flightSim.snapshot().aircraft.model})');assert(report.loading.disabled);assert.equal(report.loading.time,0);assert.equal(report.loading.model,'a380');
 await b.send('Fetch.continueRequest',{requestId:request.params.requestId});await b.send('Fetch.disable');await ready();
 report.asset=await b.evaluate('window.__flightSim.aircraftStats()');assert.equal(report.asset.engines.length,4);assert.equal(report.asset.texture.width,2048);assert(report.asset.texture.compressed);assert.equal(report.asset.appearance.definitionVersion,1);
 await click('.briefing-card .primary-button');await click('[data-view-mode=exterior]');
 await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:170,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:750,y:170,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:750,y:170,button:'left',buttons:0,clickCount:1});
 await tap('KeyP','p');await capture('exterior');await click('[data-view-mode=cockpit]');await tap('KeyP','p');await tap('KeyT','t');
 await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.spool>.9)&&window.__flightSim.audioStats().soundscape.engines.every(e=>e.rms>.0001)',30000);report.fourEngineAudio=await audio();
 await b.waitFor('window.__flightSim.snapshot().speed*1.94384>=150',150000);await b.key('ArrowDown','ArrowDown');await b.waitFor('window.__flightSim.snapshot().pitch>=.17',15000);await b.key('ArrowDown','ArrowDown','keyUp');
 await b.waitFor('window.__flightSim.snapshot().airborne&&window.__flightSim.snapshot().verticalSpeed>.5',30000);await tap('KeyG','g');
 await b.waitFor('window.__flightSim.snapshot().mission.triggered',40000);await tap('KeyC','c');
 await b.waitFor('window.__flightSim.audioStats().soundscape.engines[0].rms<.00001&&window.__flightSim.audioStats().soundscape.engines.slice(1).every(e=>e.rms>.0001)',15000);
 report.failure={state:await snap(),audio:await audio()};assert.equal(report.failure.state.engines[0].thrustN,0);assert(report.failure.state.engines.slice(1).every(e=>e.status==='running'));
 await click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');await click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms>.0001');
 await tap('KeyP','p');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');await capture('four-engine-cockpit');await tap('KeyP','p');
 const climbDeadline=Date.now()+160000;
 while(Date.now()<climbDeadline){const s=await snap();if(s.result)break;await stick(clamp((s.guidance.pitch-s.pitch)*10-s.pitchRate*3,-.7,.7),clamp(-s.roll*8-s.rollRate*3,-.7,.7));await sleep(100);}
 await release();report.climb=await snap();assert(report.climb.result?.levelCleared,JSON.stringify(report.climb.result));
 await b.waitFor('window.__flightSim.replay()?.count>0&&!window.__flightSim.replay().loading',120000);report.replay=await b.evaluate('({replay:window.__flightSim.replay(),visual:window.__flightSim.aircraftStats()})');assert.equal(report.replay.visual.engines.length,4);assert.equal(report.replay.visual.appearance.model,'a380');await capture('replay');
 await tap('KeyK','k');await b.waitFor('window.__flightSim.snapshot().mission.practice&&window.__flightSim.snapshot().aircraft.model==="a380"');report.retry=await snap();assert.equal(report.retry.engines.length,4);assert.equal(report.retry.engines[0].status,'failed');assert.equal(report.retry.aircraft.definitionVersion,1);
 await choose('a380-landing');await ready();await click('.briefing-card .primary-button');await tap('KeyI','i');await tap('KeyA','a');await tap('KeyB','b');await tap('KeyM','m');await tap('KeyM','m');
 let checked=false,reversed=false,accelerated=false,landed=false;const landingDeadline=Date.now()+450000;
 while(Date.now()<landingDeadline){
  const s=await snap();if(s.result){report.landing=s;break;}const ra=(s.y-6)*3.28084,kt=s.speed*1.94384;
  if(!s.landed){
   if(!accelerated&&ra>1200){await tap('KeyX','x');accelerated=true;}
   if(s.flaps<1&&s.z<21000&&kt<255)await tap('KeyF','f');
   if(s.flaps<2&&s.z<18000&&kt<215)await tap('KeyF','f');
   if(!s.gear&&s.z<14000)await tap('KeyG','g');
   if(s.flaps<3&&s.z<13000&&kt<190)await tap('KeyF','f');
   if(s.flaps<4&&s.z<11000&&kt<178)await tap('KeyF','f');
   if(!checked&&s.gearPosition>.98&&Math.abs(s.flapPosition-4)<.05){await tap('KeyC','c');checked=true;}
   if(!s.autoPilot){const pitch=ra<30?Math.max(s.guidance.pitch,.1):s.guidance.pitch;await stick(clamp((pitch-s.pitch)*10-s.pitchRate*3,-.7,.7),clamp((s.guidance.roll-s.roll)*8-s.rollRate*3,-.7,.7));}
   if(ra<20&&s.throttle>0)await tap('KeyZ','z');
  }else{
   if(!landed){landed=true;await release();await b.key('Space',' ');}
   if(!reversed){await tap('KeyV','v');reversed=true;}
   if(!report.reverse&&s.engines[1].thrustN<0&&s.engines[2].thrustN<0){report.reverse={state:s,audio:await audio()};assert(s.engines[0].thrustN>=0&&s.engines[3].thrustN>=0);}
  }
  await sleep(80);
 }
 await release();await b.key('Space',' ','keyUp');assert(report.landing?.result?.levelCleared,JSON.stringify(report.landing?.result));assert(report.reverse);assert(report.landing.gates.every(g=>g.passed));assert(report.landing.touchdown.descent<6.5);
 await b.waitFor('window.__flightSim.replay()?.count>0&&!window.__flightSim.replay().loading',120000);await capture('landing-result');
 await menu();if(await b.evaluate('document.documentElement.lang!=="en"'))await click('.language-switch');await b.waitFor('document.documentElement.lang==="en"');await b.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:.5,mobile:false});await click('[data-stage-id=training]');await capture('english-landscape');
 await choose('takeoff');await b.waitFor('!!document.querySelector(".briefing-card .primary-button")&&!document.querySelector(".briefing-card .primary-button").disabled&&window.__flightSim.aircraftStats()?.appearance.model==="a320"',120000);report.switchBack=(await snap()).aircraft;assert.equal(report.switchBack.model,'a320');
 report.passed=true;
}catch(error){report.error=error.stack;report.state=await snap().catch(()=>null);await release().catch(()=>{});await b.key('ArrowDown','ArrowDown','keyUp').catch(()=>{});await b.key('Space',' ','keyUp').catch(()=>{});await b.send('Fetch.disable').catch(()=>{});await raster(true).catch(()=>{});await b.screenshot(out+'/failure.png').catch(()=>{});process.exitCode=1;}
report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');if(report.errors.length){report.passed=false;process.exitCode=1;}
await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,errors:report.errors.length}));await b.close();process.exit(process.exitCode||0);
