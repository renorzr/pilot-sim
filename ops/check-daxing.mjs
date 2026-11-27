import {chooseAirportPractice} from './airport-selection.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18083/',mode=process.argv[3]||'smoke';
if(mode==='takeoff'){process.argv[2]=url;await import('./check-ground.mjs');process.exit(0);}
const b=await connect(url,mode==='smoke'?1280:800,mode==='smoke'?800:500),samples={};
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),clamp=(n,a,z)=>Math.max(a,Math.min(z,n));
const tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
async function choose(id){
 if(!await b.evaluate('!!document.querySelector(".level-select")'))await b.click('.level-menu-button');
 await chooseAirportPractice(b,id);
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',60000);
}
async function noChinese(){const han=await b.evaluate('document.body.innerText.split("\\n").filter(s=>/\\p{Script=Han}/u.test(s))');assert.deepEqual(han,[]);assert.deepEqual(await b.evaluate('window.__flightSim.missingTranslations()'),[]);}
let box,drag=false;
async function stick(pitch,roll){
 box??=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');
 await b.send('Input.dispatchMouseEvent',{type:drag?'mouseMoved':'mousePressed',x:box.x+(roll+1)*box.w/2,y:box.y+(pitch+1)*box.h/2,button:'left',buttons:1,clickCount:1});drag=true;
}
try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',60000);
 if(mode==='smoke'){
  await b.click('[data-stage-id="history"]');assert(await b.evaluate('!!document.querySelector("[data-level-id=history-us1549]")'));await b.screenshot('qa/daxing-history.png');
  await b.click('[data-stage-id="airline"]');assert.equal(await b.evaluate('document.querySelectorAll("[data-level-id]").length'),2);await b.screenshot('qa/daxing-menu.png');
  for(const id of['daxing-takeoff','daxing-landing']){await choose(id);samples[id]={state:await snap(),stats:await b.evaluate('window.__flightSim.stats()')};assert.equal(samples[id].state.airportId,'daxing');assert(samples[id].stats.calls<80);}
  await b.screenshot('qa/daxing-briefing.png');
  if(await b.evaluate('document.documentElement.lang!=="en"'))await b.click('.language-switch');await noChinese();await b.screenshot('qa/daxing-briefing-en.png');
  await tap('KeyH','h');await b.waitFor('!!document.querySelector(".help-panel")');await noChinese();await b.click('.close-help');await b.click('.level-menu-button');await noChinese();await b.click('[data-stage-id="history"]');await noChinese();await b.click('[data-stage-id="training"]');assert.equal(await b.evaluate('document.querySelectorAll("[data-level-id]").length'),13);await noChinese();
  await b.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});await b.click('[data-stage-id="airline"]');await noChinese();await b.screenshot('qa/daxing-mobile.png');
  await b.click('[data-stage-id="history"]');await noChinese();await b.screenshot('qa/daxing-history-mobile.png');
 }else{
  await choose(mode==='takeoff'?'daxing-takeoff':'daxing-landing');if(await b.evaluate('document.documentElement.lang!=="zh-CN"'))await b.click('.language-switch');
  samples.initial=await snap();await b.evaluate('document.querySelector(".flight-card .primary-button").scrollIntoView({block:"nearest"})');await b.click('.flight-card .primary-button');
  if(mode==='takeoff')await tap('KeyT','t');
  else{await tap('KeyI','i');await tap('KeyA','a');await tap('KeyB','b');await tap('KeyM','m');await tap('KeyM','m');await tap('KeyX','x');}
  let braking=false,lastLog=-1,closeup=false,radioSeen=false;
  const deadline=Date.now()+540000;
  while(Date.now()<deadline){
   const s=await snap();if(s.result)break;assert(s.playing);
   const ra=(s.y-2.8)*3.28084,kt=s.speed*1.94384;
   if(Math.floor(s.time/30)!==lastLog){lastLog=Math.floor(s.time/30);console.log(mode,Math.round(s.time),'s',Math.round(ra),'ft',Math.round(kt),'kt',Math.round(s.z),'m');}
   if(s.radio.active?.clip.startsWith('daxing-')){radioSeen=true;samples.radio=await b.evaluate('window.__flightSim.audioStats()');}
   if(mode==='takeoff'){
    if(s.airborne&&s.verticalSpeed>.5&&s.gear)await tap('KeyG','g');
    if(kt>=125)await stick(clamp((.22-s.pitch)*8-s.pitchRate*3,-.5,.5),clamp(-s.roll*5,-.4,.4));
   }else{
    if(s.flaps===0&&s.z<19500&&kt<228)await tap('KeyF','f');
    if(s.flaps===1&&s.z<14800&&kt<198)await tap('KeyF','f');
    if(!s.gear&&s.z<11000)await tap('KeyG','g');
    if(s.flaps<3&&s.z<9250&&kt<184)await tap('KeyF','f');
    if(s.flaps<s.landingConfig&&s.z<7400&&kt<176)await tap('KeyF','f');
    if(s.gearPosition>.98&&Math.abs(s.flapPosition-s.landingConfig)<.05&&!s.landingChecklistConfirmed)await tap('KeyC','c');
    if(!closeup&&s.z<3200){closeup=true;await b.click('[aria-label="显示或隐藏飞行流程"]');await b.screenshot('qa/daxing-final.png');}
    if(s.landed){if(!braking){await b.key('Space',' ');braking=true;}await stick(0,clamp(-s.x*.03-s.velocity.x*.12-Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw))*.5,-.4,.4));}
    else if(!s.autoPilot){const pitch=ra<30?Math.max(.10,s.guidance.pitch):s.guidance.pitch;await stick(clamp((pitch-s.pitch)*8-s.pitchRate*3,-.6,.6),clamp((s.guidance.roll-s.roll)*2-s.rollRate*1.5,-.2,.2));}
    if(ra<20&&s.throttle!==0)await tap('KeyZ','z');
   }
   await sleep(80);
  }
  samples.finished=await snap();assert(samples.finished.result?.levelCleared,JSON.stringify(samples.finished.result));assert(radioSeen);assert(!samples.finished.terrain.events.some(e=>e.level>0));
  await b.screenshot(`qa/daxing-${mode}-result.png`);
 }
 samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);console.log('Daxing',mode,'passed');
}catch(e){samples.failure={message:e.message,state:await snap().catch(()=>null),events:b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error')};await b.screenshot(`qa/daxing-${mode}-failure.png`).catch(()=>{});throw e;}
finally{await writeFile(`qa/daxing-${mode}-browser.json`,JSON.stringify(samples,null,2));await b.close();}
