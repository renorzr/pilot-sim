import assert from'node:assert/strict';import{writeFile}from'node:fs/promises';import{connect}from'./cdp.mjs';
const url=process.argv[2]||'https://renorzr.github.io/pilot-sim/',b=await connect(url,800,500),samples={};
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),tap=async(code,key=code)=>{await b.key(code,key);await b.key(code,key,'keyUp');},clamp=(v,a,c)=>Math.max(a,Math.min(c,v));let drag=false;
async function stick(pitch,roll){const r=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');await b.send('Input.dispatchMouseEvent',{type:drag?'mouseMoved':'mousePressed',x:r.x+(roll+1)*r.w/2,y:r.y+(pitch+1)*r.h/2,button:'left',buttons:1,clickCount:1});drag=true;}
try{
 await b.waitFor('window.__flightSim&&!!document.querySelector(".level-select")',60000);await b.click('[data-level-id="short-landing"]');await b.click('.enter-level');await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled',60000);await b.evaluate('document.querySelector(".flight-card .primary-button").scrollIntoView({block:"nearest"})');await b.click('.flight-card .primary-button');await tap('KeyI','i');await tap('KeyA','a');await tap('KeyB','b');await tap('KeyM','m');await tap('KeyM','m');let commanded=false,last=-1;const deadline=Date.now()+480000;
 while(Date.now()<deadline){const s=await snap();assert(!s.result,JSON.stringify(s.result));assert(s.playing);const ra=(s.y-2.8)*3.28084,kt=s.speed*1.94384;
  if(Math.floor(s.time/30)!==last){last=Math.floor(s.time/30);console.log('Approach/touch-and-go',Math.round(s.time),Math.round(ra),'ft',Math.round(kt),'kt',s.landed?'wheels':s.airborne?'air':'ground',s.goAround?'TOGA':'landing');}
  if(!commanded){
   if(ra>1050&&s.timeScale===1)await tap('KeyX','x');
   if(s.flaps<2&&s.z<14800&&kt<198)await tap('KeyF','f');if(!s.gear&&s.z<11000)await tap('KeyG','g');if(s.flaps<3&&s.z<9250&&kt<184)await tap('KeyF','f');if(s.flaps<s.landingConfig&&s.z<7400&&kt<176)await tap('KeyF','f');if(s.gearPosition>.98&&Math.abs(s.flapPosition-s.landingConfig)<.05&&!s.landingChecklistConfirmed)await tap('KeyC','c');
   if(s.landed){samples.contact=s;await b.waitFor('document.querySelector(".goaround-button").textContent.includes("触地复飞")');assert(!await b.evaluate('document.querySelector(".goaround-button").disabled'));await tap('KeyV','v');await b.waitFor('window.__flightSim.snapshot().reverse&&window.__flightSim.snapshot().spoilersDeployed');samples.reverse=await snap();await tap('KeyT','t');commanded=true;samples.commanded=await snap();assert(samples.commanded.goAround&&samples.commanded.throttle===1);assert(!samples.commanded.reverse&&!samples.commanded.spoilersDeployed&&!samples.commanded.autoBrakeActive);assert.equal(samples.commanded.result,null);if(!samples.commanded.airborne){await tap('KeyG','g');assert((await snap()).gear);}await b.screenshot('qa/touch-and-go-commanded.png');}
   else if(!s.autoPilot){const target=ra<30?Math.max(.10,s.guidance.pitch):s.guidance.pitch;await stick(clamp((target-s.pitch)*8-s.pitchRate*3,-.6,.6),clamp((s.guidance.roll-s.roll)*2-s.rollRate*1.5,-.2,.2));}
   if(!s.landed&&ra<20&&s.throttle!==0)await tap('KeyZ','z');
  }else{
   if(s.airborne&&s.verticalSpeed>.5&&ra>10&&s.gear)await tap('KeyG','g');
   if(s.airborne&&s.flaps>1&&Math.abs(s.flapPosition-s.flaps)<.05&&kt>150){await b.key('ShiftLeft','Shift');await tap('KeyF','f');await b.key('ShiftLeft','Shift','keyUp');}
   const target=s.landed?.18:s.guidance.pitch,roll=s.landed?clamp(-s.x*.03-s.velocity.x*.12-Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw))*.5,-.4,.4):clamp((s.guidance.roll-s.roll)*2-s.rollRate*1.5,-.25,.25);await stick(clamp((target-s.pitch)*8-s.pitchRate*3,-.6,.6),roll);
   if(s.airborne&&ra>250&&s.gearPosition<.02){samples.climbing=s;assert(s.goAround&&!s.landed);assert(s.touchAndGo?.liftOffAt!==null);assert(s.touchdown===null&&s.landingAttempts.length===1);assert.equal(s.result,null);await tap('KeyP','p');await b.screenshot('qa/touch-and-go-climbing.png');console.log('Real approach, touchdown/reverse, T response, wheel rotation, physical lift-off, positive climb and gear retraction passed');break;}
  }
  await sleep(80);
 }
 assert(samples.climbing,'did not complete a live touch-and-go');samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);
}catch(e){samples.failure={message:e.message,state:await snap().catch(()=>null)};await b.screenshot('qa/touch-and-go-failure.png').catch(()=>{});throw e;}finally{await writeFile('qa/touch-and-go-browser.json',JSON.stringify({url,samples},null,2));await b.close();}
