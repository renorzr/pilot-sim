import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18083/',b=await connect(url,800,500),samples={};
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),audio=()=>b.evaluate('window.__flightSim.audioStats().soundscape');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),tap=async(code,key=code)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
async function choose(id){
 if(!await b.evaluate('!!document.querySelector(".level-select")'))await b.click('.level-menu-button');
 await b.evaluate(`document.querySelector('[data-level-id="${id}"]').scrollIntoView({block:'nearest'})`);
 await b.click(`[data-level-id="${id}"]`);await b.click('.enter-level');
 await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled',60000);
 await b.evaluate('document.querySelector(".flight-card .primary-button").scrollIntoView({block:"nearest"})');await b.click('.flight-card .primary-button');
}
let dragging=false;
const clamp=(v,a,c)=>Math.max(a,Math.min(c,v));
async function stick(pitch,roll){
 const r=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');
 await b.send('Input.dispatchMouseEvent',{type:dragging?'mouseMoved':'mousePressed',x:r.x+(roll+1)*r.w/2,y:r.y+(pitch+1)*r.h/2,button:'left',buttons:1,clickCount:1});dragging=true;
}
try{
 await b.waitFor('window.__flightSim&&!!document.querySelector(".level-select")',60000);
 if(url.includes('18083')){
  samples.rendered=await b.evaluate(`(async()=>{
   const {FlightSoundscape}=await import('/src/audio/soundscape.js');
   const energy=(data,from,to)=>{let sum=0;for(let i=from;i<to;i++)sum+=data[i]**2;return Math.sqrt(sum/(to-from));};
   async function render(kind){
    const c=new OfflineAudioContext(2,48000*3,48000),fx=new FlightSoundscape(c);
    const s={time:0,thrust:.6,speed:75,airborne:true,landed:false,reverse:false,throttle:.78,airData:{tas:75,groundSpeed:75},cabin:{noseAt:null},engines:[0,1].map(i=>({status:(kind==='none'||kind==='left-failed'&&i===0)?'failed':'running',spool:.6,n1:69,thrustN:30000}))};
    if(kind==='reverse'||kind==='roll'){s.airborne=false;s.landed=true;s.reverse=kind==='reverse';s.throttle=0;s.engines.forEach(e=>e.thrustN=kind==='reverse'?-20000:20000);}
    if(kind==='contact'||kind==='idle'){s.thrust=.04;s.engines.forEach(e=>{e.spool=.04;e.n1=28;});}
    fx.update(s,kind!=='paused');
    if(kind==='contact'){s.time=.02;s.touchdown={time:.02,descent:3};fx.update(s,true);}
    const result=await c.startRendering(),left=result.getChannelData(0),right=result.getChannelData(1);
    return {left:energy(left,48000,144000),right:energy(right,48000,144000),impact:energy(left,0,24000)};
   }
   const result={};for(const kind of ['both','left-failed','none','reverse','roll','contact','idle','paused'])result[kind]=await render(kind);return result;
  })()`);
  const r=samples.rendered;assert(r.both.left>r['left-failed'].left*1.4);assert(r['left-failed'].right>r.none.right*1.5);assert(r.none.left>0,'wind remains');assert(r.reverse.left>r.roll.left,'reverse roar adds energy over the same ground roll / RPM baseline');assert(r.contact.impact>r.idle.impact,'brief impact adds energy above the restored landing idle engine/wind bed');assert.equal(r.paused.left,0);console.log('Offline rendered waveform: both / one / no engines, wind, contact, reverse and pause passed',r);
 }
 await choose('engine-out');await tap('KeyT','t');
 await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.spool>.8)',15000);samples.both=await audio();
 await b.waitFor('window.__flightSim.snapshot().speed*1.94384>126',90000);await b.key('ArrowDown','ArrowDown');
 await b.waitFor('window.__flightSim.snapshot().pitch>.18',15000);await b.key('ArrowDown','ArrowDown','keyUp');
 await b.waitFor('window.__flightSim.snapshot().mission.triggered',30000);await sleep(1400);samples.single={state:await snap(),audio:await audio()};
 assert(samples.single.audio.engines[0].rms<.00001);assert(samples.single.audio.engines[1].rms>.001);console.log('Actual single-engine takeoff failure: left channel stops, right engine continues');
 await choose('dual-glide');dragging=false;await sleep(1400);samples.dualBefore=await audio();
 await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.status==="failed")',10000);await sleep(1400);samples.dual={state:await snap(),audio:await audio()};
 assert(samples.dual.audio.engines.every(e=>e.rms<.00001));assert.equal(samples.dual.audio.targets.reverseBoost,1);assert(samples.dual.audio.windRms>.0001);assert(samples.dual.audio.outputRms>.0001);
 await tap('KeyP','p');await b.waitFor('!window.__flightSim.audioStats().soundscape.audible&&window.__flightSim.audioStats().soundscape.outputRms<.00001');samples.paused=await audio();
 await tap('KeyP','p');await b.click('.sound-button');await b.waitFor('!window.__flightSim.audioStats().soundscape.audible&&window.__flightSim.audioStats().soundscape.outputRms<.00001');samples.muted=await audio();
 await b.click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.audible&&window.__flightSim.audioStats().soundscape.outputRms>.0001');console.log('Actual dual failure: both engines silent, wind remains; pause/mute/resume passed');
 await choose('short-landing');await tap('KeyI','i');await tap('KeyA','a');await tap('KeyB','b');await tap('KeyM','m');await tap('KeyM','m');
 let last=-1,reversing=false;const deadline=Date.now()+480000;
 while(Date.now()<deadline){
  const s=await snap();assert(!s.result,JSON.stringify(s.result));assert(s.playing);const ra=(s.y-2.8)*3.28084,kt=s.speed*1.94384;
  if(Math.floor(s.time/30)!==last){last=Math.floor(s.time/30);console.log('Sound landing check',Math.round(s.time),Math.round(ra),'ft',Math.round(kt),'kt');}
  if(!s.landed){
   if(ra>1050&&s.timeScale===1)await tap('KeyX','x');
   if(s.flaps<2&&s.z<14800&&kt<198)await tap('KeyF','f');if(!s.gear&&s.z<11000)await tap('KeyG','g');if(s.flaps<3&&s.z<9250&&kt<184)await tap('KeyF','f');if(s.flaps<s.landingConfig&&s.z<7400&&kt<176)await tap('KeyF','f');if(s.gearPosition>.98&&Math.abs(s.flapPosition-s.landingConfig)<.05&&!s.landingChecklistConfirmed)await tap('KeyC','c');
   if(!s.autoPilot){const target=ra<30?Math.max(.10,s.guidance.pitch):s.guidance.pitch;await stick(clamp((target-s.pitch)*8-s.pitchRate*3,-.6,.6),clamp((s.guidance.roll-s.roll)*2-s.rollRate*1.5,-.2,.2));}
   if(ra<20&&s.throttle!==0)await tap('KeyZ','z');
  }else{
   if(!reversing){samples.contact={state:s,audio:await audio()};assert.equal(samples.contact.audio.contacts.main,1);await tap('KeyV','v');reversing=true;}
   if(reversing&&(await audio()).reverseBoost>1.25&&s.cabin.noseAt!==null){
    samples.reverse={state:s,audio:await audio()};assert.equal(samples.reverse.audio.contacts.main,1);assert.equal(samples.reverse.audio.contacts.nose,1);assert(samples.reverse.audio.groundRms>.0001);await b.screenshot('qa/aircraft-sounds-reverse.png');await tap('KeyV','v');await b.waitFor('!window.__flightSim.snapshot().reverse&&window.__flightSim.audioStats().soundscape.reverseBoost<1.001');samples.stowed=await audio();console.log('Real touchdown, nose contact, roll, reverse onset and stow passed');break;
   }
  }
  await sleep(80);
 }
 assert(samples.stowed,'landing/reverse checks did not finish');
 samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);
}catch(e){samples.failure={message:e.message,state:await snap().catch(()=>null)};await b.screenshot('qa/aircraft-sounds-failure.png').catch(()=>{});throw e;}
finally{await writeFile('qa/aircraft-sounds-browser.json',JSON.stringify({url,samples},null,2));await b.close();}
