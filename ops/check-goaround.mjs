import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18083/';
const b=await connect(url,1024,640),snap=()=>b.evaluate('window.__flightSim.snapshot()');
const tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
const retract=async()=>{await b.key('ShiftLeft','Shift');await tap('KeyF','f');await b.key('ShiftLeft','Shift','keyUp');};
const samples={};
try{
 await b.waitFor('window.__flightSim && !document.querySelector(".primary-button").disabled',30000);
 await b.click('.scenario-choice button:nth-child(2)');
 await b.click('.flight-card .primary-button');await tap('KeyA','a');await tap('KeyT','t');
 samples.initiated=await snap();assert(samples.initiated.goAround&&!samples.initiated.locCaptured&&!samples.initiated.gsCaptured&&!samples.initiated.result);
 await retract();await b.waitFor('window.__flightSim.snapshot().verticalSpeed>1',20000);await tap('KeyG','g');
 let stage=-1;const deadline=Date.now()+360000;
 while(Date.now()<deadline){
  const s=await snap();if(s.result)break;
  const ra=(s.y-2.8)*3.28084,band=Math.floor(ra/500);
  if(band!==stage){stage=band;console.log('Go-around climbing:',Math.round(ra),'ft; target',s.selectedAltitude);}
  if(s.flaps>1&&Math.abs(s.flapPosition-s.flaps)<.05&&s.speed*1.94384>150)await retract();
  if(ra>s.goAroundStartAltitude+300&&s.throttle>.8)await tap('KeyL','l');
  await new Promise(r=>setTimeout(r,200));
 }
 samples.finished=await snap();assert.equal(samples.finished.result?.title,'复飞成功');
 assert((samples.finished.y-2.8)*3.28084>=samples.finished.selectedAltitude-30);
 assert(samples.finished.gearPosition<.02&&samples.finished.flapPosition<=1.05);
 await b.screenshot('qa/a320-goaround-result.png');
 await b.click('.result-card .primary-button');
 const retried=await snap();assert.equal(retried.result,null);assert.equal(retried.stickPitch,0);assert.equal(retried.stickRoll,0);assert(retried.goAround);
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Log.entryAdded'&&e.params.entry.level==='error'));assert.deepEqual(errors,[]);
 await writeFile('qa/a320-goaround-check.json',JSON.stringify({url,viewport:{width:1024,height:640},samples,errors},null,2));
 console.log('Go-around, target altitude and phase retry passed:',samples.finished.result);
}finally{await writeFile('qa/a320-goaround-progress.json',JSON.stringify({url,samples},null,2));await b.close();}
