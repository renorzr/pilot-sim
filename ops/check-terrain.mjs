import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';import{connect}from'./cdp.mjs';import{trimAlpha}from'../game/src/sim/aerodynamics.js';
const url=process.argv[2]||'http://127.0.0.1:18083/',mode=process.argv[3]||'flight',b=await connect(url,mode==='smoke'?1280:800,mode==='smoke'?800:500),samples={};
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),tap=async(code,key=code)=>{await b.key(code,key);await b.key(code,key,'keyUp');},sleep=ms=>new Promise(r=>setTimeout(r,ms)),clamp=(x,a,c)=>Math.max(a,Math.min(c,x));
let box,drag=false;async function stick(pitch,roll){box??=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');await b.send('Input.dispatchMouseEvent',{type:drag?'mouseMoved':'mousePressed',x:box.x+(roll+1)*box.w/2,y:box.y+(pitch+1)*box.h/2,buttons:1,button:'left',clickCount:1});drag=true;}
try{
 await b.waitFor('window.__flightSim && !!document.querySelector(".level-select")',60000);await b.evaluate('document.querySelector("[data-level-id=circuit]").scrollIntoView({block:"nearest"})');await b.click('[data-level-id=circuit]');await b.click('.enter-level');await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled');await b.click('.flight-card .primary-button');
 await b.waitFor('window.__flightSim.audioStats().played>0 && window.__flightSim.audioStats().radioSignalRms>.0001 && window.__flightSim.audioStats().carrierGain>.001 && window.__flightSim.audioStats().pttClicks>0',30000);samples.audio=await b.evaluate('window.__flightSim.audioStats()');assert(samples.audio.radioEffect&&samples.audio.carrierGain>.001&&samples.audio.pttClicks>0);await b.screenshot('qa/terrain-radio-effect.png');
 await tap('KeyP','p');await sleep(300);samples.paused=await b.evaluate('window.__flightSim.audioStats()');assert.equal(samples.paused.carrierGain,0);assert(samples.paused.radioPaused);const frozen=await snap();await sleep(500);assert.equal((await snap()).time,frozen.time);await tap('KeyP','p');await b.waitFor('window.__flightSim.audioStats().carrierGain>.001');samples.resumed=await b.evaluate('window.__flightSim.audioStats()');await b.click('.sound-button');await sleep(150);assert.equal((await b.evaluate('window.__flightSim.audioStats()')).carrierGain,0);assert(await b.evaluate('!!document.querySelector(".radio-caption")'));await b.click('.sound-button');
 if(mode==='flight'){
  await tap('KeyT','t');let band=-1,armed=false,caution=false,warning=false,routeReminder=false;const deadline=Date.now()+600000;
  while(Date.now()<deadline){
   const s=await snap();if(s.result){samples.finished=s;break;}assert(s.playing);const ra=(s.y-2.8)*3.28084,kt=s.speed*1.94384;
   const next=Math.floor(s.time/15);if(next!==band){band=next;console.log('Intentional off-route flight',Math.round(s.time),'s',Math.round(ra),'ft',Math.round(s.x),Math.round(s.z),s.terrain.level,s.atc.deviation?.type);}
   if(!s.airborne){await stick(kt>=125&&s.pitch<.2?1:0,0);}
   else{
    if(s.gear&&s.verticalSpeed>.5&&ra>30)await tap('KeyG','g');if(ra>300&&s.throttle>.85)await tap('KeyL','l');
    // Deliberately disregard NAV and hold 1500 ft toward the land-side hills,
    // using only real sidestick inputs. No debug/state setters are used.
    const vs=clamp((2.8+1500/3.28084-s.y)*.15,-3,7),pitch=ra<400?.21:clamp(trimAlpha(s)+Math.atan2(vs,s.airData.horizontal)+(vs-s.verticalSpeed)*.009,-.15,.23);
    const targetYaw=ra>850?Math.PI/2:0,roll=clamp(Math.atan2(Math.sin(targetYaw-s.yaw),Math.cos(targetYaw-s.yaw))*2,-.4,.4);
    await stick(clamp((pitch-s.pitch)*10-s.pitchRate*3,-.7,.7),clamp((roll-s.roll)*8-s.rollRate*3,-.7,.7));
   }
   if(!routeReminder&&s.atc.violations.some(v=>v.type==='route')){routeReminder=true;samples.routeReminder=s;await b.screenshot('qa/terrain-atc-route-reminder.png');}
   if(!caution&&s.terrain.level===1){caution=true;samples.caution=s;await b.screenshot('qa/terrain-caution.png');}
   if(!warning&&s.terrain.level===2){warning=true;samples.warning=s;await sleep(200);samples.warningAudio=await b.evaluate('window.__flightSim.audioStats()');await b.screenshot('qa/terrain-pull-up.png');}
   await sleep(80);
  }
  const s=await snap();samples.finished=s;assert(s.result&&!s.result.success);assert.equal(s.result.title,'撞击地形');assert(s.impact);assert(caution&&warning);assert(routeReminder||s.atc.violations.some(v=>v.type==='terrain'));assert(samples.warning.time<s.time-3);await b.screenshot('qa/terrain-collision.png');const time=s.time;await sleep(1000);assert.equal((await snap()).time,time);assert(!(await snap()).playing);console.log('Real browser inputs: ATC response, TERRAIN, PULL UP, physical impact and frozen result passed');
 }else{await tap('KeyP','p');assert(!(await snap()).playing);console.log('Production radio DSP, signal, PTT, pause, mute, captions and clearance UI passed');}
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(errors,[]);samples.errors=errors;
}catch(e){samples.failure={message:e.message,audio:await b.evaluate('window.__flightSim.audioStats()').catch(()=>null),state:await snap().catch(()=>null),events:b.events.filter(e=>e.method==='Runtime.exceptionThrown')};await b.screenshot('qa/terrain-browser-failure.png').catch(()=>{});throw e;}finally{await writeFile(`qa/terrain-browser-${mode}.json`,JSON.stringify({url,samples},null,2));await b.close();}
