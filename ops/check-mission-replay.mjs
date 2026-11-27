import {chooseAirportPractice} from './airport-selection.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18094/',level=process.argv[3]||'takeoff',existing=process.argv[4]&&process.argv[4]!=='-'?process.argv[4]:null,failure=process.argv[5]==='failure',started=Date.now(),b=await connect(url,1100,680,existing),report={url,level,failureScenario:failure};
const wait=ms=>new Promise(r=>setTimeout(r,ms)),tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
const snapshot=()=>b.evaluate('window.__flightSim.snapshot()');
const realAirport=level.endsWith('-landing')&&level!=='short-landing';
async function click(selector){await b.evaluate('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"nearest"})');await b.click(selector);}
async function attribution(){return b.evaluate('(()=>{const e=document.querySelector(".airport-attribution");if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {height:r.height,width:r.width,top:r.top,bottom:r.bottom,cssTop:s.top,text:e.textContent};})()');}
async function cut(selector){
 // Software WebGL can spend seconds drawing a frame. Check the loader against
 // actual replay frames and canvas residency rather than CDP round-trip time.
 const start=await b.evaluate('(()=>{const q=window.__replayLoadQA;q.canvas=document.querySelector(".airport-world canvas");return q.frames.length;})()'),started=Date.now();
 await b.click(selector);await b.waitFor('!window.__flightSim.replay().loading',30000);
 const observation=await b.evaluate('(()=>{const q=window.__replayLoadQA,f=q.frames.slice('+start+');return {frames:f.length,loadingFrames:f.filter(r=>r.loading).length,sameCanvas:q.canvas===document.querySelector(".airport-world canvas"),worlds:document.querySelectorAll(".airport-world").length};})()');
 observation.elapsedMs=Date.now()-started;assert(observation.sameCanvas);assert.equal(observation.worlds,1);assert(observation.loadingFrames<=1,'Resident cut waited through several replay frames');return observation;
}

try{
 await b.send('Emulation.setDeviceMetricsOverride',realAirport?{width:800,height:500,deviceScaleFactor:.35,mobile:false}:{width:1100,height:680,deviceScaleFactor:.6,mobile:false});
 if(!existing){
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',60000);
 if(realAirport)await chooseAirportPractice(b,level);else{await click('[data-stage-id="training"]');await click('[data-level-id="'+level+'"]');await click('.enter-level');}
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',300000);
 if(realAirport)await click('[data-view-mode="exterior"]');
 await b.click('.flight-card .primary-button');
 if(realAirport){
  await b.waitFor('!!document.querySelector(".skip-intro")',10000);await click('.skip-intro');
  // A real overhead orbit limits the visible city footprint on software GPUs.
  const p=await b.evaluate('(()=>{for(let y=90;y<350;y+=20)for(let x=260;x<730;x+=20)if(document.elementFromPoint(x,y)?.classList.contains("external-camera-input"))return{x,y};})()');
  if(p){await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y+230,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y+230,button:'left',buttons:0,clickCount:1});}
 }
 // Observe the real aircraft and move the visible virtual stick with a genuine
 // captured pointer. This helper never assigns flight state or completed results.
 const box=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
 await b.evaluate('window.addEventListener("pointerdown",e=>window.__replayPointerId=e.pointerId,{capture:true,once:true})');
 await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...box,button:'left',buttons:1,clickCount:1});
 await b.evaluate(`(()=>{const failure=${failure},held=new Set(),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const key=(code,on)=>{if(on===held.has(code))return;on?held.add(code):held.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));},tap=code=>{key(code,true);key(code,false);};
 window.__replayPilot={active:true};function tick(){const s=window.__flightSim.snapshot();if(!window.__replayPilot.active||s.result){window.__replayPilot.active=false;for(const code of held)key(code,false);return;}
 if(s.playing){let p=0;if(failure)p=-1;else if(!s.airborne){if(s.throttle<.9)tap('KeyT');p=s.speed*1.94384>=125&&s.pitch<.2?1:0;}else{if(s.gear&&s.verticalSpeed>.5)tap('KeyG');p=clamp((.22-s.pitch)*8-s.pitchRate*3,-.5,.5);}
 const e=document.querySelector('.stick-pad'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.__replayPointerId,pointerType:'mouse',clientX:r.x+r.width/2,clientY:r.y+(p+1)*r.height/2,buttons:1,bubbles:true}));}
 requestAnimationFrame(tick);}requestAnimationFrame(tick);})()`);
 console.log('Real '+level+' UI flight engaged');
 }else{
  await b.waitFor('!!window.__flightSim.snapshot().result',600000);
  if(await b.evaluate('document.documentElement.lang!=="zh-CN"'))await b.click('.language-switch');
  if(await b.evaluate('window.__flightSim.replay()?.paused'))await b.click('.replay-pause');
  if(!await b.evaluate('!!document.querySelector(".level-result")'))await b.click('.replay-panel-toggle');
  console.log('Continuing the retained actual UI flight result');
 }
 await b.evaluate('window.__replayLoadQA={samples:[],frames:[],start:null};(()=>{function tick(){const r=window.__flightSim?.replay(),q=window.__replayLoadQA;if(r){q.frames.push({time:performance.now(),loading:r.loading,index:r.index});if(q.frames.length>1000)q.frames.shift();if(r.loading&&q.start===null)q.start=performance.now();if(!r.loading&&q.start!==null){q.samples.push(performance.now()-q.start);q.start=null;}}requestAnimationFrame(tick);}requestAnimationFrame(tick);})()');
 await b.waitFor('!!window.__flightSim.snapshot().result',realAirport?600000:240000);report.result=await snapshot();assert.equal(report.result.result.success,!failure,JSON.stringify(report.result.result));
 await b.waitFor('!!document.querySelector(".result-active .level-result")&&window.__flightSim.replay()?.elapsed>.8',60000);
 report.recording=await b.evaluate('window.__flightSim.recording()');report.replay=await b.evaluate('window.__flightSim.replay()');assert(report.recording.frames>(failure?100:400));assert(report.recording.events.some(e=>e.type===(failure?'failure':'takeoff')));assert(report.recording.sealed);assert(report.replay.count>=(failure?1:2));
 report.director=await b.evaluate('window.__flightSim.replayDirector()');assert(report.director.plannedClips>0);assert(report.director.reports.some(r=>r.candidates.length>1));report.initialShot=await b.evaluate('window.__flightSim.viewStats().replayShot');
 report.sound=await b.evaluate('window.__flightSim.audioStats().soundscape');assert(report.sound?.audible);
 assert(!await b.evaluate('!!document.querySelector(".cockpit-rig,.external-instruments,.cockpit-footer,.touch-controls,.view-selector")'));
 assert(!await b.evaluate('/全程回放|Full.flight replay/.test(document.body.innerText)'));
 report.attribution=await attribution();if(realAirport){assert(report.attribution);assert(report.attribution.height<40,'Source credit stretched to '+report.attribution.height+'px');}
 await b.screenshot('qa/replay-results-open.png');
 await b.click('.close-result');assert(!await b.evaluate('!!document.querySelector(".level-result")'));await b.screenshot('qa/replay-results-hidden.png');
 await tap('Tab','Tab');assert(await b.evaluate('!!document.querySelector(".level-result")'));
 await b.click('.replay-pause');const paused=await b.evaluate('window.__flightSim.replay()');await wait(700);assert.equal((await b.evaluate('window.__flightSim.replay()')).elapsed,paused.elapsed);assert((await b.evaluate('window.__flightSim.replay()')).paused);
 report.cutObservations=[await cut('.replay-next')];assert.equal((await b.evaluate('window.__flightSim.replay()')).elapsed,0);
 report.cutObservations.push(await cut('.replay-previous'));await b.click('.replay-pause');await b.waitFor('window.__flightSim.replay().elapsed>.8',30000);
 const physical=await snapshot();assert.deepEqual(physical,report.result);assert.equal((await b.evaluate('window.__flightSim.recording()')).frames,report.recording.frames);
 await tap('Escape','Escape');assert(await b.evaluate('!!document.querySelector(".level-select")'));const before=await b.evaluate('window.__flightSim.replay()');await wait(600);assert.equal((await b.evaluate('window.__flightSim.replay()')).elapsed,before.elapsed);
 await tap('Escape','Escape');await b.waitFor('!!document.querySelector(".replay-footer")',10000);
 await b.click('.language-switch');await b.waitFor('document.documentElement.lang==="en"',10000);assert.deepEqual(await b.evaluate('document.body.innerText.split("\\n").filter(x=>/\\p{Script=Han}/u.test(x))'),[]);report.missingTranslations=await b.evaluate('window.__flightSim.missingTranslations()');assert.deepEqual(report.missingTranslations,[]);await b.screenshot('qa/replay-results-en.png');
 await b.send('Emulation.setDeviceMetricsOverride',{width:740,height:390,deviceScaleFactor:1,mobile:false});await wait(500);report.smallAttribution=await attribution();if(realAirport)assert(report.smallAttribution.height<40);await b.screenshot('qa/replay-results-small.png');
 report.bounds=await b.evaluate('(()=>{const q=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};return {panel:q(".level-result"),footer:q(".replay-footer"),stage:q(".stage")}})()');assert(report.bounds.panel.bottom<=report.bounds.footer.y+2);assert(report.bounds.footer.right<=740);
 await b.click('.language-switch');await b.click('.replay-panel-toggle');
 const cycle=(await b.evaluate('window.__flightSim.replay()')).cycles;await b.waitFor('window.__flightSim.replay().cycles>'+cycle,120000);report.loop=await b.evaluate('window.__flightSim.replay()');const completedDirector=await b.evaluate('window.__flightSim.replayDirector()');assert.equal(completedDirector.reports.find(r=>r.index===report.director.reports[0].index).selected,report.director.reports[0].selected);report.completedDirector=completedDirector;report.loadingSamplesMs=await b.evaluate('window.__replayLoadQA.samples');assert(report.cutObservations.every(c=>c.loadingFrames<=1));
 if(failure){await b.click('.replay-panel-toggle');await b.click('.level-result .primary-button');await b.waitFor('!window.__flightSim.snapshot().result&&!window.__flightSim.replay()',10000);assert.equal((await b.evaluate('window.__flightSim.recording()')).attempts,2);assert((await b.evaluate('window.__flightSim.recording()')).frames>=report.recording.frames);await tap('KeyP','p');}
 await tap('KeyR','r');await b.waitFor('!window.__flightSim.snapshot().result&&!window.__flightSim.replay()',10000);assert.equal((await b.evaluate('window.__flightSim.recording()')).attempts,1);assert((await b.evaluate('window.__flightSim.recording()')).frames<50);
 report.errors=b.events.filter(e=>(e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')&&(e.params.timestamp??e.params.entry?.timestamp??started)>=started);assert.deepEqual(report.errors,[]);report.passed=true;console.log('Actual mission replay UI passed',JSON.stringify({frames:report.recording.frames,bytes:report.recording.bytes,clips:report.replay.count}));
}catch(error){report.failure=error.stack;await b.screenshot('qa/replay-browser-failure.png').catch(()=>{});throw error;}
finally{report.target=b.target.id;await writeFile('qa/replay-'+(failure?'failure-':'')+'browser.json',JSON.stringify(report,null,2));if(report.passed)await b.close();else console.log('Retained browser target',b.target.id);}
