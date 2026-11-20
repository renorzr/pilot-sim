import voiceVersion from '../game/src/comms/voice-version.json' with {type:'json'};
import assert from'node:assert/strict';import{writeFile}from'node:fs/promises';import{connect}from'./cdp.mjs';
const url=process.argv[2]||'https://flight.awsdev.renorzr.top/',b=await connect(url,1000,625),samples={};const snap=()=>b.evaluate('window.__flightSim.snapshot()'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),tap=async(code,key=code)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
async function choose(id){if(!await b.evaluate('!!document.querySelector(".level-select")'))await b.click('.level-menu-button');await b.evaluate(`document.querySelector('[data-level-id="${id}"]').scrollIntoView({block:'nearest'})`);await b.click(`[data-level-id="${id}"]`);await b.click('.enter-level');await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled',60000);await b.evaluate('document.querySelector(".flight-card .primary-button").scrollIntoView({block:"nearest"})');await b.click('.flight-card .primary-button');}
try{
 await b.waitFor('window.__flightSim&&!!document.querySelector(".level-select")',60000);
 for(const [id,clip,level,pattern]of[['dual-glide','dual-0','distress','MAYDAY, MAYDAY, MAYDAY.'],['flap-jam','flaps-0','urgency','PAN PAN, PAN PAN, PAN PAN.']]){
  await choose(id);
  if(id==='flap-jam'){
   await tap('KeyI','i');await tap('KeyA','a');await tap('KeyF','f');const end=Date.now()+90000;
   while(Date.now()<end){const s=await snap();assert(!s.result);if(s.mission.triggered)break;if(s.flaps<2&&s.speed*1.94384<198)await tap('KeyF','f');if(s.flaps<3&&s.speed*1.94384<184)await tap('KeyF','f');await sleep(200);}
  }
  await b.waitFor(`window.__flightSim.snapshot().radio.active?.clip==="${clip}"`,90000);
  await b.waitFor(`window.__flightSim.audioStats().radioSrc.includes("${clip}")&&!window.__flightSim.audioStats().radioPaused&&window.__flightSim.audioStats().radioTime>window.__flightSim.audioStats().radioDuration*.7&&window.__flightSim.audioStats().radioSignalRms>.0001`,30000);
  const s=await snap();assert((await b.evaluate('window.__flightSim.audioStats()')).radioSrc.includes(voiceVersion.fingerprint));assert.equal(s.radio.active.clip,clip);assert(s.radio.active.text.startsWith(pattern));assert.equal(s.radio.active.emergency,level);assert(await b.evaluate(`!!document.querySelector('.radio-caption.${level}')`));if(id==='dual-glide')assert(s.engines.every(e=>e.status==='failed'&&e.thrustN===0));else assert(s.systems.flapsJammed&&s.flapPosition===2);
  samples[id]={time:s.time,text:s.radio.active.text,emergency:s.radio.emergency,audio:await b.evaluate('window.__flightSim.audioStats()')};await tap('KeyP','p');await b.screenshot(`qa/radio-phraseology-${level}.png`);const p=await b.evaluate('window.__flightSim.audioStats()');await sleep(400);assert(p.radioPaused);assert(Math.abs(p.radioTime-(await b.evaluate('window.__flightSim.audioStats()')).radioTime)<.05);await tap('KeyP','p');await b.waitFor('!window.__flightSim.audioStats().radioPaused');await b.click('.sound-button');await b.waitFor('window.__flightSim.audioStats().radioPaused&&window.__flightSim.audioStats().carrierGain===0');await b.click('.sound-button');await tap('KeyP','p');console.log('Real',id,'fault, triple declaration audio, severity caption, DSP, pause/resume/mute passed');
 }
 samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);
}catch(e){samples.failure={message:e.message,state:await snap().catch(()=>null)};await b.screenshot('qa/radio-phraseology-failure.png').catch(()=>{});throw e;}finally{await writeFile('qa/radio-phraseology-browser.json',JSON.stringify({url,samples},null,2));await b.close();}
