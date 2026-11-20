// Real browser input check of a correcting final: separate lateral stability
// advisories from false terrain alarms. Full level-5 flights run in model QA.
import assert from'node:assert/strict';import{writeFile}from'node:fs/promises';import{connect}from'./cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18083/',b=await connect(url,800,500),samples={};const snap=()=>b.evaluate('window.__flightSim.snapshot()'),clamp=(x,a,c)=>Math.max(a,Math.min(c,x));let box,drag=false;
async function stick(pitch,roll){box??=await b.evaluate('(()=>{const r=document.querySelector(".stick-pad").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');await b.send('Input.dispatchMouseEvent',{type:drag?'mouseMoved':'mousePressed',x:box.x+(roll+1)*box.w/2,y:box.y+(pitch+1)*box.h/2,button:'left',buttons:1,clickCount:1});drag=true;}
try{
 await b.waitFor('window.__flightSim && !!document.querySelector(".level-select")',60000);await b.evaluate('document.querySelector("[data-level-id=short-landing]").scrollIntoView({block:"nearest"})');await b.click('[data-level-id=short-landing]');await b.click('.enter-level');await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled');await b.click('.flight-card .primary-button');const deadline=Date.now()+120000;
 while(Date.now()<deadline){const s=await snap();assert(!s.result);assert(s.playing);assert.equal(s.terrain.level,0,JSON.stringify(s.terrain));assert.equal(s.atc.terrainFloorFt,0);
  const pitch=s.guidance.pitch,roll=clamp(((s.time<12?160:0)-s.x)*.005-s.velocity.x*.06,-.15,.15);
  await stick(clamp((pitch-s.pitch)*10-s.pitchRate*3,-.7,.7),clamp((roll-s.roll)*1.8-s.rollRate*1.5,-.2,.2));
  if(s.x>90&&s.velocity.x<0){samples.correcting=s;break;}await new Promise(r=>setTimeout(r,80));
 }
 assert(samples.correcting);await b.key('KeyP','p');await b.key('KeyP','p','keyUp');samples.final=await snap();await b.screenshot('qa/final-terrain-correction.png');assert.equal(await b.evaluate('!!document.querySelector(".terrain-alert")'),false);
 samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);console.log('Correcting browser final passed:',JSON.stringify({x:samples.correcting.x,z:samples.correcting.z,ft:(samples.correcting.y-2.8)*3.28084,terrain:samples.correcting.terrain.level}));
}catch(e){samples.failure={message:e.message,state:await snap().catch(()=>null)};await b.screenshot('qa/final-terrain-failure.png').catch(()=>{});throw e;}finally{await writeFile('qa/final-terrain-browser.json',JSON.stringify({url,samples},null,2));await b.close();}
