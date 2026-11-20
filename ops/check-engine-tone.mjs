import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18083/',b=await connect(url,640,400),samples={};
const baseline='data:text/javascript;base64,'+Buffer.from(await readFile(new URL('./fixtures/engine-before-harmonic-rebalance.js',import.meta.url),'utf8')).toString('base64');
try{
 await b.waitFor('window.__flightSim&&!!document.querySelector(".level-select")',60000);
 samples.renders=await b.evaluate(`(async()=>{
  const {FlightSoundscape:Current}=await import('/src/audio/soundscape.js');
  const {FlightSoundscape:Before}=await import(${JSON.stringify(baseline)});
  const result={};
  for(const [name,Engine,power,kind] of [['before',Before,.6,'normal'],['after',Current,.6,'normal'],['idle',Current,.04,'normal'],['takeoff',Current,1,'normal'],['single',Current,.6,'single'],['silent',Current,.6,'dual'],['muted',Current,.6,'muted'],['reverse',Current,.5,'reverse'],['roll',Current,.5,'roll'],['contact',Current,.04,'contact']]){
   const c=new OfflineAudioContext(2,48000*3,48000),fx=new Engine(c);
   const s={time:0,speed:75,airborne:true,landed:false,reverse:false,throttle:.78,airData:{tas:75,groundSpeed:75},cabin:{noseAt:null},engines:[0,1].map(i=>({status:kind==='dual'||kind==='single'&&i===0?'failed':'running',spool:power,n1:25+power*73,thrustN:30000}))};
   if(kind==='reverse'||kind==='roll'){s.airborne=false;s.landed=true;s.throttle=0;s.reverse=kind==='reverse';s.engines.forEach(e=>e.thrustN=kind==='reverse'?-18000:18000);}
   fx.update(s,kind!=='muted');if(kind==='contact'){s.time=.02;s.touchdown={time:.02,descent:3};fx.update(s,true);}
   const rendered=await c.startRendering(),left=rendered.getChannelData(0),right=rendered.getChannelData(1);
   const rms=(data,start=48000,end=144000)=>Math.sqrt(data.slice(start,end).reduce((sum,v)=>sum+v*v,0)/(end-start));
   result[name]={left:rms(left),right:rms(right),impact:rms(left,0,24000),peak:Math.max(...left.map(Math.abs).subarray(0,48000)),spectrum:Array.from(left.slice(48000,64384))};
   if(name==='before'||name==='after'){
    const length=left.length,buffer=new ArrayBuffer(44+length*4),view=new DataView(buffer),str=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
    str(0,'RIFF');view.setUint32(4,36+length*4,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length*4,true);
    for(let i=0;i<length;i++){view.setInt16(44+i*4,Math.max(-1,Math.min(1,left[i]))*32767,true);view.setInt16(46+i*4,Math.max(-1,Math.min(1,right[i]))*32767,true);}
    let binary='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));result[name].wav=btoa(binary);
   }
   fx.dispose();
  }
  return result;
 })()`);
 for(const [name,r]of Object.entries(samples.renders)){if(r.wav){await writeFile(`qa/engine-tone-${name}.wav`,Buffer.from(r.wav,'base64'));delete r.wav;}}
 const r=samples.renders;assert(r.after.left>r.before.left*2,'running sound is substantially stronger than the rejected mix');assert(r.takeoff.left>r.idle.left*1.4);assert(r.after.left>r.silent.left*3,'engines dominate wind');assert(r.single.right>r.single.left*1.4,'failed-side tonal layers are removed');assert.equal(r.muted.left,0);assert(r.reverse.left>r.roll.left,'reverse contributes real acoustic energy');assert(r.contact.impact>r.idle.impact*1.25);assert(Object.values(r).every(x=>x.peak<.9),'headroom remains');
 console.log('Rendered engine tone, volume, power response, single/double failure, reverse, contact and mute passed',Object.fromEntries(Object.entries(r).map(([k,v])=>[k,{left:v.left,right:v.right,impact:v.impact,peak:v.peak}])));
 if(!process.argv.includes('--render-only')){
 // Live UI controls, independent of the offline acoustic fixtures.
 const tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
 await b.click('[data-level-id="takeoff"]');await b.click('.enter-level');await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled',60000);await b.evaluate('document.querySelector(".flight-card .primary-button").scrollIntoView({block:"nearest"})');await b.click('.flight-card .primary-button');
 await tap('KeyT','t');await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.spool>.85)&&window.__flightSim.audioStats().soundscape.engines.every(e=>e.rms>.025)',15000);samples.liveHigh=await b.evaluate('window.__flightSim.audioStats()');
 await tap('KeyZ','z');await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.spool<.05)',15000);samples.liveIdle=await b.evaluate('window.__flightSim.audioStats()');assert(samples.liveHigh.soundscape.engines[0].rms>samples.liveIdle.soundscape.engines[0].rms*1.4);
 await b.click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');await b.click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms>.001');await tap('KeyP','p');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');
 samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);console.log('Live TOGA/IDLE, mute/resume and pause passed');
 }
}finally{await writeFile('qa/engine-tone-check.json',JSON.stringify(samples,null,2));await b.close();}
