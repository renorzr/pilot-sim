import assert from 'node:assert/strict';
import {writeFile}from 'node:fs/promises';
import {connect}from './cdp.mjs';
import {groundTarget,DEPARTURE}from '../game/src/missions/ground.js';
const b=await connect(process.argv[2]||'http://127.0.0.1:18083/',800,500),samples={},sleep=ms=>new Promise(r=>setTimeout(r,ms)),clamp=(n,a,z)=>Math.max(a,Math.min(z,n));
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
let drag=false,box,lastThrottle=-1,braking=false;
async function release(){if(drag){await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+box.w/2,y:box.y+box.h/2,button:'left',buttons:0,clickCount:1});drag=false;}}
async function stick(pitch,roll){box??=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');await b.send('Input.dispatchMouseEvent',{type:drag?'mouseMoved':'mousePressed',x:box.x+(roll+1)*box.w/2,y:box.y+(pitch+1)*box.h/2,button:'left',buttons:1,clickCount:1});drag=true;}
async function throttle(value){const pct=Math.round(clamp(value,0,.18)*100);if(pct===lastThrottle)return;await release();const r=await b.evaluate('(()=>{const r=document.querySelector("#throttle").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,thumb:document.querySelector(".stage").getBoundingClientRect().width*.0175}})()');const x=r.x+r.w/2,y=r.y+r.thumb/2+(r.h-r.thumb)*(1-pct/18);await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});lastThrottle=pct;}
async function brake(on){if(on===braking)return;await b.key('Space',' ',on?'keyDown':'keyUp');braking=on;}
async function english(){if(await b.evaluate('document.documentElement.lang!=="en"'))await b.click('.language-switch');assert.deepEqual(await b.evaluate('document.body.innerText.split("\\n").filter(s=>/\\p{Script=Han}/u.test(s))'),[]);assert.deepEqual(await b.evaluate('window.__flightSim.missingTranslations()'),[]);}
try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',60000);await b.click('[data-stage-id="airline"]');await b.click('[data-airline-mode="practice"]');await b.click('[data-level-id="daxing-takeoff"]');await b.evaluate('document.querySelector(".enter-level").scrollIntoView({block:"nearest"})');await b.click('.enter-level');await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',60000);await b.evaluate('document.querySelector(".flight-card .primary-button").scrollIntoView({block:"nearest"})');await b.click('.flight-card .primary-button');
 await b.waitFor('window.__flightSim.snapshot().time>2');await tap('KeyP','p');samples.intro=await snap();await b.screenshot('qa/ground-intro.png');await english();await b.screenshot('qa/ground-intro-en.png');await b.click('.skip-intro');await tap('KeyP','p');
 await b.waitFor('window.__flightSim.snapshot().ground.stage==="taxi"',60000);await tap('KeyP','p');await english();await b.screenshot('qa/ground-taxi-en.png');samples.taxi=await snap();assert(!samples.taxi.ground.entryCleared);await tap('KeyT','t');assert.equal((await snap()).throttle,0);
 await b.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});await b.screenshot('qa/ground-mobile.png');await b.send('Emulation.setDeviceMetricsOverride',{width:480,height:300,deviceScaleFactor:1,mobile:false});box=null;
 await tap('KeyP','p');await b.click('.skip-taxi');await b.waitFor('window.__flightSim.snapshot().ground.stage==="holding"',30000);samples.hold=await snap();assert(samples.hold.x<-100&&!samples.hold.ground.entryCleared&&!samples.hold.ground.takeoffCleared);await english();await b.screenshot('qa/ground-hold-en.png');
 let lastStage='',lastLog=-1,seenRadio=false;const deadline=Date.now()+300000;
 while(Date.now()<deadline){const s=await snap();if(s.result)break;assert(s.playing);const g=s.ground;
  if(lastStage!==g.stage){lastStage=g.stage;console.log(g.stage,s.time.toFixed(1),s.x.toFixed(1),s.z.toFixed(1));samples[g.stage]=s;await english();}
  if(s.radio.active?.clip.startsWith('ground-')){samples.audio=await b.evaluate('window.__flightSim.audioStats()');seenRadio=true;}
  if(g.stage==='lineup'){
   for(const [x,id]of[[-35,'runway-edge'],[-10,'runway-center']])if(s.x>x&&!samples[id]){samples[id]=s;await b.screenshot(`qa/ground-${id}.png`);}
   const target=groundTarget(s),distance=Math.hypot(DEPARTURE.lineup.x-s.x,DEPARTURE.lineup.z-s.z),speed=s.airData.groundSpeed;
   const desired=distance<12?0:Math.atan2(target.x-s.x,-(target.z-s.z)),error=Math.atan2(Math.sin(desired-s.yaw),Math.cos(desired-s.yaw));
   const speedTarget=Math.min(6/1.94384,Math.sqrt(Math.max(0,distance-4)*.65)),demand=(.25+speed*.006+clamp((speedTarget-speed)*.65,-1,1))*s.weight*1000/Math.max(s.propulsion.availableThrustN,1);
   await throttle(demand);await brake(distance<8||speed>speedTarget+.8);await stick(0,clamp(error*1.9-s.yawRate*1.2,-.85,.85));
  }else if(!g.takeoffCleared){await release();await brake(true);}
  else{
   await brake(false);if(s.throttle<.9)await tap('KeyT','t');
   if(s.airborne&&s.verticalSpeed>.5&&s.gear)await tap('KeyG','g');
   if(s.airborne)await stick(clamp((.22-s.pitch)*8-s.pitchRate*3,-.5,.5),clamp(-s.roll*5,-.4,.4));
   else await stick(s.speed*1.94384>=125&&s.pitch<.2?1:0,clamp(-s.x*.035-s.velocity.x*.12-s.yaw*.8,-.5,.5));
  }
  if(Math.floor(s.time/20)!==lastLog){lastLog=Math.floor(s.time/20);console.log('progress',Math.round(s.time),s.x.toFixed(1),s.z.toFixed(1),(s.airData.groundSpeed*1.94384).toFixed(1),'kt',Math.round(s.throttle*100)+'%');}
  await sleep(100);
 }
 samples.final=await snap();assert(samples.final.result?.levelCleared,JSON.stringify({result:samples.final.result,ground:samples.final.ground,x:samples.final.x,z:samples.final.z}));assert(samples.final.ground.manualEntryDistance>200);assert(seenRadio);await b.screenshot('qa/ground-takeoff-result.png');await english();
 samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);console.log('Ground departure browser passed');
}catch(e){samples.failure={message:e.message,state:await snap().catch(()=>null)};await b.screenshot('qa/ground-failure.png').catch(()=>{});throw e;}
finally{await release().catch(()=>{});await brake(false).catch(()=>{});await writeFile('qa/ground-browser.json',JSON.stringify(samples,null,2));await b.close();}
