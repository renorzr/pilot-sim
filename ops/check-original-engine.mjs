import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18083/',b=await connect(url,640,400),samples={};
// Reference is the actual pre-effects backup. Stub only communications and the
// offline-context resume; the noise generator, routing and DSP remain verbatim.
const original=readFileSync(new URL('./fixtures/original-engine-audio.js',import.meta.url),'utf8').replace(/^import .*;\n/,'').replace('export class EngineAudio','class EngineAudio').replace("if (this.context.state === 'suspended') await this.context.resume();",'');
const reference='data:text/javascript;base64,'+Buffer.from(`export async function mount(context,state){
 const window={AudioContext:function(){return context;}};
 const Math=Object.create(globalThis.Math);let seed=320;Math.random=()=>{seed=(globalThis.Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 class CommsPlayback{resume(){}connect(){}update(){}}
 ${original}
 const audio=new EngineAudio();await audio.start();audio.update(state,true);return audio;
}`).toString('base64');
try{
 await b.waitFor('window.__flightSim&&!!document.querySelector(".level-select")',60000);
 if(url.includes('18083')){
  samples.rendered=await b.evaluate(`(async()=>{
   const {FlightSoundscape}=await import('/src/audio/soundscape.js'),{mount}=await import(${JSON.stringify(reference)});
   const rms=(data,start=48000,end=144000)=>Math.sqrt(data.slice(start,end).reduce((sum,x)=>sum+x*x,0)/(end-start));
   const state=power=>({time:0,thrust:power,speed:75,airborne:true,landed:false,reverse:false,throttle:.78,airData:{tas:75,groundSpeed:75},cabin:{noseAt:null},engines:[0,1].map(()=>({status:'running',spool:power,n1:25+power*73,thrustN:30000}))});
   async function render(power,kind){
    const c=new OfflineAudioContext(4,144000,48000),s=state(power);let fx;
    if(kind==='reference')await mount(c,s);
    else{
     const random=Math.random;let seed=320;
     Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
     try{fx=new FlightSoundscape(c);}finally{Math.random=random;}
     const bus=c.createChannelMerger(4);fx.engineGain.connect(bus,0,2);bus.connect(c.destination);
     if(kind==='single')s.engines[0].status='failed';if(kind==='dual')s.engines.forEach(e=>e.status='failed');
     if(kind==='reverse'||kind==='roll'){s.airborne=false;s.landed=true;s.reverse=kind==='reverse';s.throttle=0;s.engines.forEach(e=>e.thrustN=kind==='reverse'?-20000:20000);}
     fx.update(s,kind!=='muted');if(kind==='contact'){s.time=.02;s.touchdown={time:.02,descent:3};fx.update(s,true);}
    }
    const output=await c.startRendering(),data=output.getChannelData(0);
    const result={wave:Array.from(data),rms:rms(data),impact:rms(data,0,24000),engineRms:rms(output.getChannelData(2)),windRms:fx?fx.targets.wind:0};fx?.dispose();return result;
   }
   const comparisons=[];
   for(const power of [.04,.6,.95]){
    const old=await render(power,'reference'),current=await render(power,'normal');let maxError=0;
    for(let i=0;i<old.wave.length;i++)maxError=Math.max(maxError,Math.abs(old.wave[i]-current.wave[i]));comparisons.push({power,maxError,oldRms:old.rms,restoredRms:current.rms});
   }
   const effects={};for(const [kind,power]of [['normal',.6],['single',.6],['dual',.6],['reverse',.5],['roll',.5],['contact',.04],['idle',.04],['muted',.6]]){effects[kind]=await render(power,kind);delete effects[kind].wave;}
   return {comparisons,effects};
  })()`);
  const {comparisons,effects:e}=samples.rendered;assert(comparisons.every(x=>x.maxError<.000001),'healthy running output matches pre-effects backup sample for sample');assert(e.single.engineRms<e.normal.engineRms*.7);assert.equal(e.dual.engineRms,0);assert(e.dual.rms>0);assert(e.reverse.rms>e.roll.rms);assert(e.contact.impact>e.idle.impact);assert.equal(e.muted.rms,0);console.log('Original backup waveform restored at idle/mid/high power; failure/wind/contact/reverse/mute passed',samples.rendered);
 }
 const tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
 async function choose(id){if(!await b.evaluate('!!document.querySelector(".level-select")'))await b.click('.level-menu-button');await b.evaluate(`document.querySelector('[data-level-id="${id}"]').scrollIntoView({block:'nearest'})`);await b.click(`[data-level-id="${id}"]`);await b.click('.enter-level');await b.waitFor('!document.querySelector(".flight-card .primary-button").disabled',60000);await b.evaluate('document.querySelector(".flight-card .primary-button").scrollIntoView({block:"nearest"})');await b.click('.flight-card .primary-button');}
 await choose('takeoff');await tap('KeyT','t');await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.spool>.8)&&window.__flightSim.audioStats().soundscape.engineNoiseRms>.01',15000);samples.normal=await b.evaluate('window.__flightSim.audioStats()');
 await b.click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');await b.click('.sound-button');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms>.001');
 await choose('dual-glide');await b.waitFor('window.__flightSim.snapshot().engines.every(e=>e.status==="failed")&&window.__flightSim.audioStats().soundscape.engineNoiseRms<.00001&&window.__flightSim.audioStats().soundscape.engines.every(e=>e.rms<.00001)&&window.__flightSim.audioStats().soundscape.outputRms>.0001',20000);samples.dual=await b.evaluate('window.__flightSim.audioStats()');
 await tap('KeyP','p');await b.waitFor('window.__flightSim.audioStats().soundscape.outputRms<.00001');samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);console.log('Live original sound, mute/resume, dual failure and pause passed');
}finally{await writeFile(url.includes('18083')?'qa/original-engine-check.json':'qa/original-engine-production.json',JSON.stringify(samples,null,2));await b.close();}
