import assert from 'node:assert/strict';
import{writeFile,readFile}from'node:fs/promises';
import{connect}from'./cdp.mjs';
import{groundTarget,departureOf,entryPoints}from'../game/src/missions/ground.js';
import{canSkipCruise}from'../game/src/missions/airline.js';
const verificationStarted=Date.now();
const url=process.argv[2]||'http://127.0.0.1:18090/',cutMode=process.argv[3]||'manual',viewMode=process.argv[4]||'exterior',existingTarget=process.argv[5]||null,origin=process.argv[6]||'changi',b=await connect(url,existingTarget?480:800,existingTarget?300:500,existingTarget),report={cutMode,viewMode},sleep=ms=>new Promise(r=>setTimeout(r,ms)),clamp=(n,a,z)=>Math.max(a,Math.min(z,n));
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
async function click(selector){await b.evaluate('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"nearest"})');await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const p=await b.evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await sleep(150);await b.click(selector);}
let drag=false,box,lastThrottle=-1,braking=false;
async function release(){if(drag){await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+box.w/2,y:box.y+box.h/2,button:'left',buttons:0,clickCount:1});drag=false;}}
async function stick(pitch,roll){box=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');await b.send('Input.dispatchMouseEvent',{type:drag?'mouseMoved':'mousePressed',x:box.x+(roll+1)*box.w/2,y:box.y+(pitch+1)*box.h/2,button:'left',buttons:1,clickCount:1});drag=true;}
async function throttle(value){const pct=Math.round(clamp(value,0,.18)*100);if(pct===lastThrottle)return;await release();const r=await b.evaluate('(()=>{const r=document.querySelector("#throttle").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,thumb:document.querySelector(".stage").dataset.activeView!=="cockpit"?15:document.querySelector(".stage").getBoundingClientRect().width*.0175}})()');const x=r.x+r.w/2,y=r.y+r.thumb/2+(r.h-r.thumb)*(1-pct/18);await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});lastThrottle=pct;}
async function brake(on){if(on===braking)return;await b.key('Space',' ',on?'keyDown':'keyUp');braking=on;}
try{
 await b.send('Network.enable');await b.send('Fetch.enable',{patterns:[{urlPattern:'*assets/cities/daxing/imagery-v1.json*',requestStage:'Request'}]});
 if(!existingTarget){
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',90000);
 if(await b.evaluate('document.documentElement.lang!=="en"'))await click('.language-switch');
 await b.send('Emulation.setDeviceMetricsOverride',{width:800,height:500,deviceScaleFactor:.5,mobile:false});
 await click('[data-stage-id="airline"]');const airportCodes={changi:'SIN',kansai:'KIX',lax:'LAX',jfk:'JFK',xiaoshan:'HGH',daxing:'PKX'};for(const id of[origin,'daxing']){const index=await b.evaluate('[...document.querySelectorAll(".airport-choice-buttons button")].findIndex(b=>b.textContent.startsWith('+JSON.stringify(airportCodes[id])+'))');assert(index>=0);await click('.airport-choice-buttons button:nth-child('+(index+1)+')');}assert.equal(await b.evaluate('document.querySelector(".route-endpoint:nth-of-type(3) strong")?.textContent'),'PKX');await click('.enter-flight');
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',300000);await click('[data-view-mode="'+viewMode+'"]');await b.send('Emulation.setDeviceMetricsOverride',{width:480,height:300,deviceScaleFactor:.5,mobile:false});await click('.flight-card .primary-button');
 await b.waitFor('window.__flightSim.snapshot().ground.stage==="taxi"',180000);await click('.skip-taxi');await b.waitFor('window.__flightSim.snapshot().ground.stage==="holding"',60000);
 await b.send('Emulation.setDeviceMetricsOverride',{width:480,height:300,deviceScaleFactor:.5,mobile:false});
 if(viewMode==='exterior'){
  const p=await b.evaluate('(()=>{for(let y=60;y<260;y+=10)for(let x=20;x<450;x+=10)if(document.elementFromPoint(x,y)?.classList.contains("external-camera-input"))return{x,y};})()');assert(p);
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+83,y:p.y+15,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+83,y:p.y+15,button:'left',buttons:0,clickCount:1});
 }
 }
 await b.evaluate(`(()=>{if(window.__cruiseQA)return;window.__cruiseQA={frames:[],before:null,done:false};let last=-1;function sample(){const api=window.__flightSim,q=window.__cruiseQA;if(api){const s=api.snapshot(),t=api.cruiseTransition(),v=api.viewStats();if(t&&t.elapsed-last>.1){last=t.elapsed;const c=document.querySelector('.cruise-cutscene');q.frames.push({transition:t,camera:v,airportId:s.airportId,time:s.time,previewStarted:s.airline?.previewStarted,position:[s.x,s.y,s.z],velocity:s.velocity,attitude:[s.pitch,s.yaw,s.roll],mass:s.weight,engines:s.engines.map(e=>[e.status,e.health,e.spool]),gear:s.gearPosition,flaps:s.flapPosition,playing:s.playing,rate:s.timeScale,levelId:s.levelId,ready:api.prefetch(),worlds:document.querySelectorAll('.airport-world').length,colour:c?getComputedStyle(c).backgroundColor:null,dialogue:document.querySelector('.cruise-radio')?.innerText,audio:api.audioStats()});}else if(!t){if(q.frames.length)q.done=true;else q.before={camera:v,airportId:s.airportId,position:[s.x,s.y,s.z]};}}requestAnimationFrame(sample);}requestAnimationFrame(sample);})()`);
 await b.send('Emulation.setDeviceMetricsOverride',{width:480,height:300,deviceScaleFactor:.5,mobile:false});
 if(!await b.evaluate('window.__flightSim.snapshot().playing'))await tap('KeyP','p');
 await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:240,y:150,button:'left',buttons:0,clickCount:1});
 await b.evaluate('window.addEventListener("pointerdown",e=>window.__qaMouseId=e.pointerId,{once:true,capture:true})');
 const stickPoint=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
 await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...stickPoint,button:'left',buttons:1,clickCount:1});
 const pointerId=await b.evaluate('window.__qaMouseId');
 assert(await b.evaluate('document.querySelector(".stick-pad").hasPointerCapture('+pointerId+')'),'The real pointer must be captured by the visible virtual stick');
 await b.evaluate('('+await readFile(new URL('./cruise-ui-pilot.js',import.meta.url),'utf8')+')('+JSON.stringify(cutMode)+','+pointerId+','+JSON.stringify({departure:departureOf(origin),entryPoints:entryPoints(origin)})+')');
 console.log('Browser UI controller engaged through the virtual stick, throttle and fast-forward controls');
 let heldFast=false,fastPoint=null,eligibleAt=null,transitionSeen=false,abuse=false,releasedNetwork=false,blackAt=0,lastStage='',lastLog=-1,bellyShot=false;
 const deadline=Date.now()+900000;
 while(Date.now()<deadline){
  const s=await snap(),t=await b.evaluate('window.__flightSim.cruiseTransition()');assert(!s.result,JSON.stringify(s.result));
  const pausedRequests=b.events.filter(e=>e.method==='Fetch.requestPaused');if(pausedRequests.length&&!report.prefetch){report.prefetch={state:s,prepared:await b.evaluate('window.__flightSim.prefetch()')};assert.equal(s.airportId,origin);assert(report.prefetch.prepared?.airportId==='daxing');console.log('Destination request started before handoff',Math.round(s.time));}
  if(t){
   transitionSeen=true;
   if(!bellyShot&&!t.committed&&t.elapsed>=7.9&&t.elapsed<8.6){bellyShot=true;await b.screenshot('qa/cruise-'+cutMode+'-belly.png');}
   if(t.phase!==lastStage){lastStage=t.phase;console.log('Transition',t.phase,Math.round(t.elapsed*10)/10);}
   if(!abuse&&!t.committed){
    abuse=true;const before=await snap(),selection=await b.evaluate('window.__flightSim.viewStats().selection');
    for(const[code,key]of[['KeyP','p'],['Escape','Escape'],['KeyR','r'],['KeyH','h'],['KeyK','k'],['Digit1','1'],['Digit2','2'],['KeyG','g'],['KeyF','f'],['KeyA','a'],['KeyX','x'],['KeyW','w'],['ArrowUp','ArrowUp']])await tap(code,key);
    await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:220,y:150,deltaX:0,deltaY:-500});await b.click('.level-menu-button');
    const after=await snap();assert.equal(after.levelId,before.levelId);assert.equal(after.time,before.time);assert.deepEqual([after.x,after.y,after.z],[before.x,before.y,before.z]);assert.equal(after.gear,before.gear);assert.equal(after.autoPilot,before.autoPilot);assert.deepEqual(await b.evaluate('window.__flightSim.viewStats().selection'),selection);assert(!await b.evaluate('!!document.querySelector(".level-select")'));report.inputShield=true;
   }
   if(t.phase==='black'&&t.committed){
    blackAt||=Date.now();assert.equal(t.opacity,1);assert.equal(s.airportId,'daxing');assert.equal(s.time,s.airline.previewStarted);
    if(Date.now()-blackAt>1500&&!releasedNetwork){report.blackHold={durationMs:Date.now()-blackAt,state:s};await b.screenshot('qa/cruise-'+cutMode+'-black.png');for(const e of pausedRequests)await b.send('Fetch.continueRequest',{requestId:e.params.requestId});releasedNetwork=true;console.log('Released deliberately slow destination request');}
   }
   await sleep(80);continue;
  }
  if(transitionSeen){report.arrival=await snap();assert.equal(report.arrival.airportId,'daxing');assert.equal(report.arrival.airline.cruiseSkipMode,cutMode==='manual'?'manual':'automatic');assert.equal(await b.evaluate('window.__flightSim.viewStats().selection.mode'),viewMode);assert.equal(await b.evaluate('window.__flightSim.viewStats().mode'),'intro');await b.screenshot('qa/cruise-'+cutMode+'-arrival.png');break;}
  if(await b.evaluate('window.__uiCruisePilot?.active')){
   if(s.autoPilot&&!heldFast){await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:240,y:150,button:'left',buttons:0,clickCount:1});fastPoint=await b.evaluate('(()=>{const r=document.querySelector(".fast-forward-button").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...fastPoint,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:fastPoint.x,y:fastPoint.y-55,button:'left',buttons:1});heldFast=true;}
   if(Math.floor(s.time/30)!==lastLog){lastLog=Math.floor(s.time/30);console.log('Flight',Math.round(s.time),Math.round((s.y-2.8)*3.28084),'ft',Math.round(s.speed*1.94384),'kt',s.ground?.stage);}
   await sleep(150);continue;
  }
  const g=s.ground,ra=(s.y-2.8)*3.28084,kt=s.speed*1.94384;
  if(g&&!g.takeoffCleared){
   if(g.stage==='lineup'){
    const d=departureOf(s),target=groundTarget(s),distance=Math.hypot(d.lineup.x-s.x,d.lineup.z-s.z),speed=s.airData.groundSpeed,desired=distance<12?0:Math.atan2(target.x-s.x,-(target.z-s.z)),error=Math.atan2(Math.sin(desired-s.yaw),Math.cos(desired-s.yaw)),speedTarget=Math.min(6/1.94384,Math.sqrt(Math.max(0,distance-4)*.65)),demand=(.25+speed*.006+clamp((speedTarget-speed)*.65,-1,1))*s.weight*1000/Math.max(s.propulsion.availableThrustN,1);
    await throttle(demand);await brake(distance<8||speed>speedTarget+.8);await stick(0,clamp(error*1.9-s.yawRate*1.2,-.85,.85));
   }else{await release();await brake(true);}
  }else{
   await brake(false);
   if(!s.airborne){if(s.throttle<.9)await tap('KeyT','t');await stick(kt>=125&&s.pitch<.2?1:0,clamp(-s.x*.035-s.velocity.x*.12-s.yaw*.8,-.5,.5));}
   else{
    if(s.verticalSpeed>.5&&s.gear)await tap('KeyG','g');if(ra>500&&s.throttle>.845)await tap('KeyL','l');
    if(ra>200&&!s.autoPilot){await release();await tap('KeyA','a');}else if(!s.autoPilot)await stick(clamp((s.guidance.pitch-s.pitch)*8-s.pitchRate*3,-.5,.5),clamp((s.guidance.roll-s.roll)*3-s.rollRate*2,-.4,.4));
    if(!heldFast&&s.autoPilot&&ra>1100){await release();fastPoint=await b.evaluate('(()=>{const r=document.querySelector(".fast-forward-button").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...fastPoint,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:fastPoint.x,y:fastPoint.y-70,button:'left',buttons:1});heldFast=true;}
    if(cutMode==='manual'&&canSkipCruise(s)){eligibleAt||=Date.now();if(Date.now()-eligibleAt>1000){await release();if(heldFast)await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...fastPoint,button:'left',buttons:0,clickCount:1});await click('.skip-cruise');}}
   }
  }
  if(Math.floor(s.time/30)!==lastLog){lastLog=Math.floor(s.time/30);console.log('Flight',Math.round(s.time),Math.round(ra),'ft',Math.round(kt),'kt');}
  await sleep(80);
 }
 assert(report.arrival&&report.prefetch&&report.blackHold&&report.inputShield,'The complete physical flight/transition must finish');
 report.trace=await b.evaluate('window.__cruiseQA');const frames=report.trace.frames,source=frames.filter(f=>!f.transition.committed),moving=source.filter(f=>f.transition.elapsed>1&&f.transition.elapsed<8.5);assert(moving.length>5);
 const first=source[0];for(const f of source){assert.equal(f.time,first.time);assert.deepEqual(f.position,first.position);assert.equal(f.rate,1);assert.equal(f.levelId,first.levelId);assert.deepEqual(f.camera.selection,first.camera.selection);}
 assert(source.some(f=>f.transition.elapsed>8&&f.transition.elapsed<9.5&&f.camera.position[1]<f.camera.target[1]-35));
 for(const f of source){
  const target=f.position.map((v,i)=>v+f.velocity[['x','y','z'][i]]*f.transition.elapsed);
  assert(Math.hypot(...target.map((v,i)=>v-f.camera.target[i]))<1e-6);
  assert(f.camera.distance>=84-1e-6&&f.camera.distance<=115+1e-6);assert.equal(f.camera.fov,42);
  assert.deepEqual(f.attitude,first.attitude);assert.equal(f.mass,first.mass);assert.deepEqual(f.engines,first.engines);assert.equal(f.gear,first.gear);assert.equal(f.flaps,first.flaps);
 }
 assert(source.find(f=>f.transition.phase==='black')?.transition.elapsed<10.1,'B must reach black within10 seconds, independently of speech or destination loading');
 for(const f of source)assert.equal(f.audio.radioPlaybackRate,1,'Transition radio must stay at normal speed');
 assert(frames.some(f=>f.dialogue?.includes('request climb')));assert(frames.some(f=>f.dialogue?.includes('Climb to flight level')));assert(frames.some(f=>f.audio.radioSrc?.includes('airline-cruise-climb-0')));assert(frames.some(f=>f.audio.radioSrc?.includes('airline-cruise-climb-1')));assert(frames.some(f=>f.audio.radioSrc?.includes('airline-cruise-climb-2')));
 for(const f of frames.filter(f=>f.transition.committed&&f.transition.phase==='black')){assert.equal(f.transition.opacity,1);assert.equal(f.time,f.previewStarted);assert(['rgb(0, 0, 0)','rgba(0, 0, 0, 1)'].includes(f.colour));}
 if(viewMode==='exterior')assert.deepEqual(first.camera.selection,report.trace.before.camera.selection);
 assert.deepEqual(await b.evaluate('window.__flightSim.missingTranslations()'),[]);assert.deepEqual(await b.evaluate('document.body.innerText.split("\\n").filter(x=>/\\p{Script=Han}/u.test(x))'),[]);
 // Log.enable replays historical page diagnostics when resuming a UI retry.
 // Keep every error from this run, including current network failures.
 report.startedAt=verificationStarted;
 report.errors=b.events.filter(e=>{
  const timestamp=e.method==='Log.entryAdded'?e.params.entry.timestamp:e.params.timestamp;
  return(timestamp===undefined||timestamp>=verificationStarted)&&(e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');
 });assert.deepEqual(report.errors,[]);report.passed=true;console.log('Cruise transition browser passed',cutMode,viewMode,frames.length,'samples');
}catch(e){report.failure=e.message;await b.screenshot('qa/cruise-'+cutMode+'-failure.png').catch(()=>{});throw e;}
finally{report.targetId=b.target.id;await writeFile('qa/cruise-'+cutMode+'-browser.json',JSON.stringify(report,null,2));if(report.passed)await b.close();else{console.log('Retained the test page for actual UI retry',b.target.id);process.exit(1);}}
