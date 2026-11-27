// Browser evidence through real buttons and a captured virtual stick. The
// read-only snapshot feeds a test pilot; no poses, velocities or results are set.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {connect} from './cdp.mjs';
import {installHistoricalUiPilot} from './us1549-ui-pilot.mjs';
import {eventRunways} from '../game/src/history/event-world.js';
import {KT,RAD} from '../game/src/sim/constants.js';
const url=process.argv[2]||'http://127.0.0.1:18097/',mode=process.argv[3]||'full',existing=process.argv[4]||null,language=process.env.PILOT_QA_LANG||'en',output=process.env.PILOT_QA_OUTPUT||'qa/us1549-m3';
const isReturn=mode==='return'||mode==='return-formal';
const b=await connect(url,800,500,existing),report={mode,target:b.target.id,startedAt:new Date().toISOString()};
await mkdir(output,{recursive:true});
const checkRescue=process.env.PILOT_QA_CHECK_RESCUE==='1';
if(checkRescue){await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.__qaAudioContexts=[];const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){const result=connect.call(this,destination,...args),context=this.context;if(destination===context.destination){if(!context.__qaCapture){context.__qaCapture=context.createMediaStreamDestination();window.__qaAudioContexts.push(context);}connect.call(this,context.__qaCapture);}return result;};})()`});await b.send('Page.navigate',{url});}
const snapshot=()=>b.evaluate('window.__flightSim.snapshot()'),tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
async function click(selector){await b.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest'})`);await b.click(selector);}
async function overhead(){
 const p=await b.evaluate('(()=>{for(let y=85;y<270;y+=20)for(let x=220;x<490;x+=20)if(document.elementFromPoint(x,y)?.classList.contains("external-camera-input"))return{x,y};})()');assert(p,'Orbit area');
 await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y+230,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y+230,button:'left',buttons:0,clickCount:1});
}
async function capturePilot(options={}){
 await b.evaluate('window.addEventListener("pointerdown",e=>window.__us1549Pointer=e.pointerId,{capture:true,once:true})');
 const p=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
 await b.evaluate('('+installHistoricalUiPilot.toString()+')('+JSON.stringify(options)+')');
 return p;
}
try{
 await b.send('Emulation.setDeviceMetricsOverride',{width:800,height:500,deviceScaleFactor:.35,mobile:false});
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',60000);
 if(await b.evaluate('document.documentElement.lang!=='+JSON.stringify(language==='zh'?'zh-CN':'en')))await click('.language-switch');
 await click('[data-stage-id=history]');await click('[data-level-id=history-us1549]');await click('.enter-level');
 await b.waitFor('document.querySelector(".briefing-card .primary-button")&&!document.querySelector(".briefing-card .primary-button").disabled',300000);
 if(mode==='practice'){await click(language==='zh'?'[aria-label="历史关卡模式"] button:last-child':'[aria-label="Historical mission mode"] button:last-child');await b.waitFor('window.__flightSim.snapshot().historical.finalPractice');}
 await click('[data-view-mode=exterior]');
 report.initialHistoryProgress=await b.evaluate('localStorage.getItem("pilot-sim.history.us1549.v1")');
 const seed=await snapshot();report.seed={time:seed.time,x:seed.x,y:seed.y,z:seed.z,voices:[seed.radio.pilotVoice,seed.radio.towerVoice,seed.radio.copilotVoice]};
 assert.equal(seed.radio.pilotVoice,'h');assert.equal(seed.radio.copilotVoice,'g');assert(!['h','g'].includes(seed.radio.towerVoice));
 await click('.briefing-card .primary-button');
 if(mode!=='practice'){
  await b.waitFor('document.querySelector(".historical-presentation")&&window.__flightSim.airportPresentation()?.elapsed>.25',60000);
  assert.equal((await snapshot()).time,0);assert.equal((await b.evaluate('window.__flightSim.recording()')).frames,0);
  await click('.history-presentation-pause');await b.waitFor('!window.__flightSim.snapshot().playing');const p=await b.evaluate('window.__flightSim.airportPresentation().elapsed');await new Promise(r=>setTimeout(r,250));assert.equal(await b.evaluate('window.__flightSim.airportPresentation().elapsed'),p);
  await click('.history-presentation-pause');await click('.skip-intro');
 }
 await b.waitFor('window.__flightSim.snapshot().playing&&!document.querySelector(".historical-presentation")',30000);
 await tap('KeyP','p');await b.waitFor('!window.__flightSim.snapshot().playing');await overhead();await tap('KeyP','p');
 // Software-GPU endurance mode suppresses raster draw calls only. The full
 // source world, obstacle index, physics, UI and real control events stay live.
 // Presentation and result captures always restore ordinary rendering.
 if(process.env.PILOT_QA_NO_RASTER==='1'){report.rasterSuppressedDuringFlight=true;await b.evaluate(`(()=>{if(window.__us1549Raster){window.__us1549Raster.suppressed=true;return;}const p=WebGL2RenderingContext.prototype;window.__us1549Raster={originals:{},suppressed:true};for(const k of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){window.__us1549Raster.originals[k]=p[k];p[k]=function(...args){if(!window.__us1549Raster.suppressed)return window.__us1549Raster.originals[k].apply(this,args);};}})()`);}
 await b.evaluate(`window.__us1549Audio={} ;window.__us1549AudioTimer=setInterval(()=>{const s=window.__flightSim.snapshot(),a=window.__flightSim.audioStats(),l=s.radio.active;if(l&&a.radioTime>.15&&a.radioSignalRms>0.00001)window.__us1549Audio[l.role+':'+a.radioPreset]={role:l.role,channel:l.channel,src:a.radioSrc,time:a.radioTime,preset:a.radioPreset,rms:a.radioSignalRms,rate:a.radioPlaybackRate};},200)`);
 if(mode==='full'){
  await b.waitFor('window.__flightSim.snapshot().time>=10&&!!document.querySelector("[data-history-option=left]")',180000);await click('[data-history-option=left]');
  await b.waitFor('window.__flightSim.snapshot().time>=22&&!!document.querySelector("[data-history-option=assess]")',180000);await click('[data-history-option=assess]');
  await b.waitFor('window.__flightSim.snapshot().time>=35&&!!document.querySelector("[data-history-option=river]")',180000);await click('[data-history-option=river]');
  await b.waitFor('window.__flightSim.snapshot().time>=105&&!!document.querySelector("[data-history-option=ditch]")',360000);await click('[data-history-option=ditch]');
  report.handover=await snapshot();assert.equal(report.handover.historical.controlSource,'player');assert(report.handover.historical.handedOverHeight>800&&report.handover.historical.handedOverHeight<1200);await tap('KeyF','f');
 }
 if(mode==='return-formal'){
  await click('[data-history-option=return]');await b.waitFor('!!document.querySelector("[data-history-option=return]")&&window.__flightSim.snapshot().historical.node==="lga"',60000);await click('[data-history-option=return]');await b.waitFor('!!document.querySelector("[data-history-option=land]")',60000);await click('[data-history-option=land]');report.returnStart=await snapshot();assert(!report.returnStart.mission.practice);assert.equal(report.returnStart.historical.manualTarget,'LGA-22');
 }
 if(mode==='return'){
  await click('[data-history-early]');await b.waitFor('window.__flightSim.snapshot().historical.controlSource==="player"');
  await b.evaluate(`(()=>{const e=document.querySelector('[data-history-target]');e.value='LGA-22';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await b.waitFor('window.__flightSim.snapshot().historical.manualTarget==="LGA-22"');
  report.returnStart=await snapshot();assert(report.returnStart.mission.practice);assert(report.returnStart.time<10);
 }
 if(process.env.PILOT_QA_CHECK_ENTRY_GUIDE==='1'){
  report.initialGuide=await b.evaluate('({phase:document.querySelector(".ditching-guide")?.dataset.entryPhase,rows:document.querySelectorAll("[data-entry-metric]").length,text:document.querySelector(".ditching-guide")?.innerText})');
  assert.equal(report.initialGuide.rows,8);assert.equal(report.initialGuide.phase,'approach');
  await b.evaluate('window.__entryGuideSamples=[];window.__entryGuideTimer=setInterval(()=>{const e=document.querySelector(".ditching-guide");if(e){const s=window.__flightSim.snapshot();window.__entryGuideSamples.push({time:s.time,phase:e.dataset.entryPhase,ias:document.querySelector("[data-entry-metric=ias] .entry-current")?.textContent,actualIas:s.speed,height:s.y});}},250)');
 }
 const runway=isReturn?eventRunways.find(r=>r.airport==='LGA'&&r.id==='22'):null,pointer=await capturePilot({runway});
 if(!isReturn){await b.waitFor('!!window.__flightSim.snapshot().water||!!window.__flightSim.snapshot().result',360000);report.entry=await snapshot();assert(report.entry.water,JSON.stringify(report.entry.result));}
 if(process.env.PILOT_QA_CHECK_ENTRY_GUIDE==='1'){
  await b.waitFor('window.__flightSim.snapshot().water?.elapsed>=3&&!window.__flightSim.snapshot().result',60000);await tap('KeyP','p');await b.waitFor('!window.__flightSim.snapshot().playing');
  report.contactGuide=await b.evaluate('({phase:document.querySelector(".ditching-guide")?.dataset.entryPhase,rows:Object.fromEntries([...document.querySelectorAll("[data-entry-metric]")].map(e=>[e.dataset.entryMetric,e.querySelector(".entry-current").textContent])),samples:window.__entryGuideSamples})');
  const contact=(await snapshot()).water.firstImpact;assert.equal(report.contactGuide.phase,'contact');assert.equal(report.contactGuide.rows.ias,(contact.ias*KT).toFixed(1));assert.equal(report.contactGuide.rows.sink,contact.sinkMps.toFixed(1));assert.equal(report.contactGuide.rows.pitch,(contact.pitch/RAD).toFixed(1));assert(report.contactGuide.samples.some(s=>s.phase==='entry'));assert(report.contactGuide.samples.some(s=>s.phase==='approach'));assert.equal(report.contactGuide.samples.filter(s=>s.phase==='contact').at(-1).ias,report.contactGuide.rows.ias);
  await b.evaluate('if(window.__us1549Raster)window.__us1549Raster.suppressed=false');await b.screenshot(output+'/practice-guide-contact.png');await b.evaluate('if(window.__us1549Raster)window.__us1549Raster.suppressed=true');await tap('KeyP','p');
 }
 if(process.env.PILOT_QA_CHECK_COCKPIT==='1'){
  await b.waitFor('window.__flightSim.snapshot().water?.elapsed>=6&&!window.__flightSim.snapshot().result',90000);await tap('KeyP','p');await b.waitFor('!window.__flightSim.snapshot().playing');
  await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...pointer,button:'left',buttons:0,clickCount:1});
  const before=await snapshot(),pose=s=>[s.x,s.y,s.z,s.pitch,s.roll,s.yaw];
  await b.evaluate('if(window.__us1549Raster)window.__us1549Raster.suppressed=false');
  await click('[data-view-mode=cockpit]');await b.waitFor('window.__flightSim.viewStats().mode==="cockpit"');
  report.waterCockpit={camera:await b.evaluate('window.__flightSim.viewStats()'),aircraft:await b.evaluate('window.__flightSim.aircraftStats()'),flight:await snapshot()};
  assert(report.waterCockpit.flight.y<before.water.level,'Regression requires the physical reference below water');assert(report.waterCockpit.camera.position[1]>before.water.level,'Healthy floating cockpit eye must remain above water');assert.deepEqual(pose(report.waterCockpit.flight),pose(before));
  await b.evaluate('if(window.__us1549Raster)window.__us1549Raster.suppressed=false');await b.screenshot(output+'/water-cockpit.png');
  await click('[data-view-mode=exterior]');await b.waitFor('window.__flightSim.viewStats().mode==="exterior"');
  const p=await b.evaluate('(()=>{for(let y=85;y<270;y+=20)for(let x=300;x<490;x+=20)if(document.elementFromPoint(x,y)?.classList.contains("external-camera-input"))return{x,y};})()');assert(p);
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:2});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:2});
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x-220,y:p.y,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x-220,y:p.y,button:'left',buttons:0,clickCount:1});
  report.waterExterior={camera:await b.evaluate('window.__flightSim.viewStats()'),flight:await snapshot()};assert.deepEqual(pose(report.waterExterior.flight),pose(before));await b.screenshot(output+'/water-exterior.png');
  await b.evaluate('if(window.__us1549Raster)window.__us1549Raster.suppressed=true');await tap('KeyP','p');
 }
 await b.waitFor('!!window.__flightSim.snapshot().result',240000);report.result=await snapshot();assert(report.result.result.physicalSuccess,JSON.stringify(report.result.result));assert.equal(report.result.result.levelCleared,mode==='full');
 await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...pointer,button:'left',buttons:0,clickCount:1});
 if(!isReturn){
 await b.waitFor('!!document.querySelector(".historical-presentation")&&window.__flightSim.airportPresentation().kind==="history-rescue"',30000);
 if(await b.evaluate('!!window.__us1549Raster')){report.rasterSuppressedDuringFlight=true;await b.evaluate('window.__us1549Raster.suppressed=false');}
 const frozen=await snapshot();
 if(checkRescue){
  await b.evaluate(`(()=>{const c=window.__qaAudioContexts[0],rec=new MediaRecorder(c.__qaCapture.stream,{mimeType:'audio/webm;codecs=opus'}),chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.start(200);window.__stopRescueRecording=()=>new Promise(resolve=>{rec.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'audio/webm'}));};rec.stop();});window.__rescueSamples=[];window.__rescueTimer=setInterval(()=>{const api=window.__flightSim;window.__rescueSamples.push({media:api.audioStats().rescue,time:api.snapshot().time,p:api.airportPresentation()?.elapsed,caption:document.querySelector('.radio-caption')?.innerText});},80);})()`);
  await b.waitFor('window.__flightSim.audioStats().rescue.rms>.001&&window.__flightSim.audioStats().rescue.activeVoices.some(v=>v.profile==="dispatch")',30000);
 }
 await click('.history-presentation-pause');await b.waitFor('!window.__flightSim.snapshot().playing');const rescueTime=await b.evaluate('window.__flightSim.airportPresentation().elapsed'),audioTime=await b.evaluate('window.__flightSim.audioStats().rescue.elapsed');await new Promise(r=>setTimeout(r,250));assert.equal(await b.evaluate('window.__flightSim.airportPresentation().elapsed'),rescueTime);assert.equal(await b.evaluate('window.__flightSim.audioStats().rescue.elapsed'),audioTime);assert.equal((await snapshot()).time,frozen.time);assert.deepEqual((await snapshot()).result,frozen.result);
 await b.screenshot(output+'/'+mode+'-rescue.png');
 if(checkRescue){
  const key=await b.evaluate('window.__flightSim.airportPresentation().key');await click('.language-switch');await b.waitFor('window.__flightSim.airportPresentation().key!=='+JSON.stringify(key));assert(!await b.evaluate('window.__flightSim.snapshot().playing'));await click('.language-switch');await b.waitFor('window.__flightSim.airportPresentation().key==='+JSON.stringify(key));
  await click('.history-presentation-pause');await b.waitFor('!window.__flightSim.airportPresentation().active',40000);report.rescueSamples=await b.evaluate('window.__rescueSamples');await b.evaluate('clearInterval(window.__rescueTimer)');const audio=await b.evaluate('window.__stopRescueRecording()');await writeFile(output+'/'+mode+'-rescue-audio.webm',Buffer.from(audio,'base64'));
  for(const profile of['field','dispatch','responder','intercom'])assert(report.rescueSamples.some(s=>s.media.rms>.001&&s.media.activeVoices.some(v=>v.profile===profile)),profile+' audio missing');assert(report.rescueSamples.every(s=>s.time===frozen.time));assert(report.rescueSamples.filter(s=>s.media.rms>.001).every(s=>s.media.rate===1));report.rescueAudio=await b.evaluate('window.__flightSim.audioStats().rescue');assert.equal(report.rescueAudio.id,null);report.rescueVerified=true;
 }else{await click('.skip-intro');assert.equal(await b.evaluate('window.__flightSim.audioStats().rescue.id'),null);}
 }
 await b.waitFor('!!document.querySelector(".history-result")&&!!window.__flightSim.replay()',30000);
 report.language=language;report.audio=await b.evaluate('window.__us1549Audio');report.recording=await b.evaluate('window.__flightSim.recording()');report.pilot=await b.evaluate('window.__us1549Pilot.samples');report.progress=await b.evaluate('({history:localStorage.getItem("pilot-sim.history.us1549.v1"),normal:localStorage.getItem("pilot-sim.levels.v1")})');
 assert(report.recording.sealed);if(isReturn){assert.equal(report.result.historical.alternate.runway,'22');assert(report.recording.events.some(e=>e.type==='touchdown'));}else{assert(report.recording.events.some(e=>e.type==='water-contact'));assert(report.recording.events.some(e=>e.type==='afloat'));}assert(report.recording.segments.every(s=>s.start>=0));
 assert(report.audio['copilot:dry'],'Actual dry first officer playback');assert(Object.values(report.audio).every(a=>a.rate===1));
 if(mode!=='full')assert.equal(report.progress.history,report.initialHistoryProgress,'Practice must not overwrite formal progress');
 if(mode==='full'){assert(report.audio['pilot:vhf'],'Actual exterior captain VHF playback');assert(report.progress.history?.includes('guided'));assert(!report.progress.normal?.includes('history-us1549'));}
 await b.evaluate('if(window.__us1549Raster)window.__us1549Raster.suppressed=false');await b.waitFor('!window.__flightSim.replay().loading',90000);if(!await b.evaluate('window.__flightSim.replay().paused'))await click('.replay-pause');await new Promise(r=>setTimeout(r,600));
 await b.screenshot(output+'/'+mode+'-result.png');report.passed=true;console.log('PASS',mode,JSON.stringify({time:report.result.time,result:report.result.result,audio:Object.keys(report.audio)}));
}catch(e){report.error=e.stack;report.failedState=await snapshot().catch(()=>null);console.error(e);process.exitCode=1;}
report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');if(report.errors.length){report.passed=false;console.error(JSON.stringify(report.errors).slice(0,1600));process.exitCode=1;}
await writeFile(output+'/'+mode+'-browser.json',JSON.stringify(report,null,2));console.log('TARGET',b.target.id);process.exit(process.exitCode||0);
