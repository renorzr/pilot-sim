import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
import {LEVELS} from '../game/src/missions/catalog.js';
const url=process.argv[2]||'http://127.0.0.1:18083/',mode=process.argv[3]||'smoke';
const b=await connect(url,mode==='smoke'||mode==='radio'?1280:800,mode==='smoke'||mode==='radio'?800:500),samples={};
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tap=async(code,key=code)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
const choose=async id=>{if(!await b.evaluate('!!document.querySelector(".level-select")'))await b.click('.level-menu-button');await b.evaluate(`document.querySelector('[data-level-id="${id}"]').scrollIntoView({block:'nearest'})`);await b.click(`[data-level-id="${id}"]`);await b.click('.enter-level');await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled',30000);assert.equal((await snap()).levelId,id);};
const start=()=>b.click('.flight-card .primary-button');
let stickBox,dragging=false;
async function stick(pitch,roll){if(!stickBox)stickBox=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');const pos={x:stickBox.x+(roll+1)*stickBox.w/2,y:stickBox.y+(pitch+1)*stickBox.h/2};await b.send('Input.dispatchMouseEvent',{type:dragging?'mouseMoved':'mousePressed',...pos,button:'left',buttons:1,clickCount:1});dragging=true;}
async function release(){if(dragging)await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:stickBox.x+stickBox.w/2,y:stickBox.y+stickBox.h/2,button:'left',buttons:0,clickCount:1});dragging=false;}
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
try{
 await b.waitFor('window.__flightSim && !!document.querySelector(".level-select")',60000);assert.equal(await b.evaluate('document.querySelectorAll(".level-tile").length'),13);
 if(mode==='smoke'||mode==='radio'){
  await b.screenshot('qa/expanded-menu.png');
  for(const l of LEVELS){await choose(l.id);const s=await snap();assert(!s.playing);if(l.id==='engine-out')assert(s.route&&!s.route.inFinal);if(l.id==='crosswind')assert(s.weather.runwayFriction<.5&&s.weather.rain>0);if(l.id==='low-visibility'){assert(s.weather.visibility===550);await b.screenshot('qa/expanded-fog-brief.png');}}
  await choose('takeoff');await start();await b.waitFor('window.__flightSim.audioStats().radioDuration>0 && window.__flightSim.audioStats().played>0 && window.__flightSim.audioStats().radioTime>.1 && !window.__flightSim.audioStats().radioPaused',30000);samples.audio=await b.evaluate('window.__flightSim.audioStats()');assert(samples.audio.played>0&&!samples.audio.blocked);
  const before=await b.evaluate('window.__flightSim.audioStats().radioTime');await tap('KeyP','p');await sleep(600);const paused=await b.evaluate('window.__flightSim.audioStats()');await sleep(800);assert(Math.abs((await b.evaluate('window.__flightSim.audioStats().radioTime'))-paused.radioTime)<.05);assert(paused.radioPaused);await tap('KeyP','p');await b.waitFor(`window.__flightSim.audioStats().played>${paused.played} && !window.__flightSim.audioStats().radioPaused`,15000);samples.pause={before,paused,resumed:await b.evaluate('window.__flightSim.audioStats()')};await b.screenshot('qa/expanded-radio-tower.png');
  await b.waitFor('!!window.__flightSim.snapshot().radio.active');await b.click('.sound-button');await sleep(100);assert((await b.evaluate('window.__flightSim.audioStats()')).radioPaused);assert(await b.evaluate('!!document.querySelector(".radio-caption")'));await b.click('.sound-button');await tap('KeyP','p');
  await choose('flap-jam');await start();await tap('KeyF','f');await b.waitFor('window.__flightSim.snapshot().systems.flapsJammed');await tap('KeyC','c');await tap('KeyC','c');samples.jam=await snap();assert.equal(samples.jam.flapPosition,2);assert.equal(samples.jam.vapp,165);assert(samples.jam.landingChecklistConfirmed);assert(await b.evaluate(`document.querySelector('[aria-label="襟翼放一档"]').disabled`));await b.waitFor('window.__flightSim.snapshot().radio.active?.clip.startsWith("flaps-")');await b.screenshot('qa/expanded-flap-fault.png');await tap('KeyP','p');
  await choose('crosswind');await start();await sleep(500);await b.screenshot('qa/expanded-rain.png');await tap('KeyP','p');
  await choose('low-visibility');await start();await sleep(600);await b.screenshot('qa/expanded-fog.png');samples.panelBounds=await b.evaluate('(()=>{const p=document.querySelector(".procedure-panel").getBoundingClientRect(),f=document.querySelector(".fcu-panel").getBoundingClientRect();return{bottom:p.bottom,fcuTop:f.top};})()');assert(samples.panelBounds.bottom<=samples.panelBounds.fcuTop);assert(!(await snap()).systems.visualReferences);await tap('KeyP','p');
  console.log('13 briefings, capability UI, rain/fog and recorded radio playback/pause/mute passed');
 }else if(mode==='faults'){
  for(const id of ['athr-failure','ils-loss','dual-glide']){
   await choose(id);await start();if(id!=='dual-glide')await tap('KeyA','a');
   await b.waitFor('window.__flightSim.snapshot().mission.triggered',120000);const s=await snap();assert(s.mission.fault);
   await tap('KeyC','c');assert((await snap()).mission.acknowledged);
   if(id==='athr-failure'){
    assert(s.systems.thrustLocked&&!s.systems.autoThrustAvailable);await tap('KeyU','u');assert(!(await snap()).autoThrust);
    const target=s.systems.heldCommands.reduce((a,b)=>a+b)/2,code=target>s.throttle?'KeyW':'KeyS';await b.key(code,code==='KeyW'?'w':'s');await b.waitFor('!window.__flightSim.snapshot().systems.thrustLocked',15000);await b.key(code,code==='KeyW'?'w':'s','keyUp');assert((await snap()).mission.manualTakenOver);assert(await b.evaluate(`document.querySelector('[aria-label="自动推力 A/THR"]').disabled`));
   }else if(id==='ils-loss'){
    assert(!s.locCaptured&&!s.gsCaptured&&!s.flightDirector&&!s.autoPilot);await tap('KeyI','i');assert(!(await snap()).apprArmed);assert(await b.evaluate(`document.querySelector('[aria-label="进近预位 APPR"]').disabled`));
   }else{
    assert(s.engines.every(e=>e.status==='failed'&&e.thrustN===0));await tap('KeyA','a');await tap('KeyT','t');assert(!(await snap()).autoPilot&&!(await snap()).goAround);assert(await b.evaluate(`document.querySelector('[aria-label="自动驾驶 AP1"]').disabled`));
   }
   samples[id]=await snap();await b.screenshot(`qa/expanded-${id}-fault.png`);await tap('KeyP','p');console.log('Real event, keyboard handling and unavailable system UI:',id);
  }
 }else if(mode==='engine-out'||mode==='dual-glide'){
  const id=mode;await choose(id);await start();if(id==='engine-out')await tap('KeyT','t');
  let lastStage=-1,lastLog=-1,braking=false;const deadline=Date.now()+850000;
  while(Date.now()<deadline){
   let s=await snap();if(s.result)break;if(!s.playing)throw Error('Unexpected pause');
   const ra=(s.y-2.8)*3.28084,kt=s.speed*1.94384,route=s.route,pre=route?.active&&!route.inFinal;
   if(s.mission.fault&&!s.mission.acknowledged)await tap('KeyC','c');
   if(id==='dual-glide'&&s.mission.triggered&&s.throttle!==0)await tap('KeyZ','z');
   if(s.timeScale===1&&ra>1050&&!s.goAround)await tap('KeyX','x');
   if(route&&route.index!==lastStage){lastStage=route.index;samples['stage'+lastStage]=s;console.log('Route stage',lastStage,'sim',Math.round(s.time),'ra',Math.round(ra));await b.screenshot(`qa/expanded-engine-stage-${lastStage}.png`);}
   if(Math.floor(s.time/30)!==lastLog){lastLog=Math.floor(s.time/30);console.log('Flight',Math.round(s.time),'sec',Math.round(ra),'ft',Math.round(kt),'kt',Math.round(s.z),'m',s.autoPilot?'AP':'manual');}
   if(!s.airborne&&!s.landed){await stick(kt>=125&&s.pitch<.20?1:0,0);}
   else if(s.landed){if(!braking){await tap('KeyZ','z');await b.key('Space',' ');braking=true;}await stick(0,clamp(-s.x*.03-s.velocity.x*.12-Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw))*.5,-.5,.5));}
   else{
    if(pre){
     if(s.gear&&s.verticalSpeed>.5)await tap('KeyG','g');
     if(ra>300&&s.throttle>.85)await tap('KeyL','l');
     if(route.index>=2&&s.flaps<2)await tap('KeyF','f');
     if(route.index>=3){if(!s.gear)await tap('KeyG','g');if(s.flaps<s.landingConfig)await tap('KeyF','f');if(!s.spoilersArmed)await tap('KeyB','b');if(s.autoBrake!=='MED')await tap('KeyM','m');if(s.gearPosition>.98&&Math.abs(s.flapPosition-s.landingConfig)<.05&&!s.landingChecklistConfirmed)await tap('KeyC','c');}
     await release();if(s.mission.triggered&&ra>220&&!s.autoPilot&&Math.abs(s.stickPitch)<.02&&Math.abs(s.stickRoll)<.02)await tap('KeyA','a');
     if(!s.autoPilot&&ra<=300)await stick(clamp((.21-s.pitch)*10-s.pitchRate*3,-.7,.7),0);
    }else{
     if(id==='dual-glide'){if(s.z<3000&&!s.gear)await tap('KeyG','g');if(s.z<2000&&s.flaps<1)await tap('KeyF','f');}
     if(ra<20&&s.throttle!==0)await tap('KeyZ','z');
     if(!s.autoPilot){const pitch=ra<(id==='dual-glide'?80:30)?Math.max(.10,s.guidance.pitch):s.guidance.pitch;await stick(clamp((pitch-s.pitch)*10-s.pitchRate*3,-.7,.7),clamp((s.guidance.roll-s.roll)*8-s.rollRate*3,-.7,.7));}
    }
   }
   await sleep(90);
  }
  await release();if(braking)await b.key('Space',' ','keyUp');samples.finished=await snap();await b.screenshot(`qa/expanded-${id}-result.png`);assert(samples.finished.result?.levelCleared,JSON.stringify(samples.finished.result));assert(samples.finished.engines.every((e,i)=>i===1&&id==='engine-out'?e.status==='running':e.status==='failed'&&e.thrustN===0));if(id==='engine-out')assert.deepEqual(samples.finished.route.visited,[0,1,2,3]);console.log('Continuous flight complete:',samples.finished.result);
 }
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Log.entryAdded'&&e.params.entry.level==='error'));assert.deepEqual(errors,[]);samples.errors=errors;
}catch(e){samples.error={message:e.message,state:await snap().catch(()=>null),events:b.events.filter(e=>e.method==='Runtime.exceptionThrown')};await b.screenshot(`qa/expanded-${mode}-failure.png`).catch(()=>{});throw e;}finally{await writeFile(`qa/expanded-${mode}.json`,JSON.stringify({url,samples},null,2));await b.close();}
