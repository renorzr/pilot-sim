import test from 'node:test';import assert from 'node:assert/strict';
import {createFlight,advanceFlight,confirmAction} from '../src/flight.js';
import {updateFlightAlerts,acknowledgeAlerts} from '../src/sim/alerts.js';
import {audibleAlert,alertWave,AlertAudio} from '../src/audio/alerts.js';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {CommsPlayback} from '../src/comms/playback.js';
import {advanceReplay,changeReplayClip} from '../src/replay/highlights.js';
const flight=()=>createFlight(null,{levelId:'history-us1549'});
test('bird observation waits for human reaction and engine rollback; Mayday and power follow',()=>{
 const s=flight();for(let i=0;i<350;i++)advanceFlight(s,{},.01);assert.equal(s.radio.active,null);assert(!s.radio.fired['us1549:bird']);
 for(let i=0;i<25;i++)advanceFlight(s,{},.01);assert.equal(s.radio.active?.historyEvent,'bird');assert(!s.radio.fired['us1549:mayday']);
 while(s.time<13)advanceFlight(s,{},.01);const lines=[...s.radio.history,s.radio.active].filter(Boolean).map(l=>l.historyEvent);assert.equal(lines[0],'bird');assert(lines.includes('mayday'));assert(s.historical.crew.power==='apu-available');
 const manual=createFlight(null,{levelId:'history-us1549',historical:{practice:true}});for(let i=0;i<1000;i++)advanceFlight(manual,{},.01);assert(manual.radio.fired['us1549:mayday']);
});
test('ordinary failed engines chime, deliberate shutdown does not, acknowledgement preserves faults and escalation re-arms',()=>{
 const s={time:1,engines:[{id:0,status:'off'},{id:1,status:'running'}]};updateFlightAlerts(s);assert.equal(s.alerts.items.length,0);
 s.engines[0].status='failed';updateFlightAlerts(s);assert.equal(audibleAlert(s).item.level,'caution');s.time=2;assert.equal(audibleAlert(s),null);
 s.engines[1].status='failed';updateFlightAlerts(s);assert.equal(audibleAlert(s).item.key,'dual-engine');s.time=7.8;assert(audibleAlert(s));acknowledgeAlerts(s);assert.equal(audibleAlert(s),null);assert(s.engines.every(e=>e.status==='failed'));
 s.engines[1].status='running';updateFlightAlerts(s);assert(audibleAlert(s));s.result={success:false};assert.equal(audibleAlert(s),null);
});
test('C silences a historical alert without checklist side effects or engine recovery',()=>{
 const s=flight();advanceFlight(s,{},.01);assert(audibleAlert(s));const checklist=s.landingChecklistConfirmed;confirmAction(s);assert.equal(audibleAlert(s),null);assert.equal(s.landingChecklistConfirmed,checklist);assert(s.engines.every(e=>e.status==='failed'));
});
test('recording restores original speaker/language, acknowledged alerts and engine causes by segment and time',()=>{
 const r=new FlightRecording(),s=flight();s.time=1;updateFlightAlerts(s);s.radio.active={id:1,clip:'us1549-mayday-0',role:'pilot',started:.5};r.observe(s);
 s.time=2;s.radio.language='en';r.observe(s);s.time=3;acknowledgeAlerts(s);r.observe(s);s.time=4;s.radio.active=null;r.observe(s);
 assert.equal(r.sample(0,1.5).radio.language,'zh');assert.equal(r.sample(0,2.5).radio.language,'en');assert.equal(r.sample(0,1.5).radio.copilotVoice,'g');assert(!r.sample(0,2.5).alerts.items[0].acknowledged);assert(r.sample(0,3.2).alerts.items[0].acknowledged);assert.equal(r.sample(0,4).radio.active,null);assert.equal(r.sample(0,2).engines[0].damageCause,'bird-ingestion');
 const retry=structuredClone(s);retry.time=1.5;retry.radio.language='zh';retry.radio.active=null;r.retry(retry);r.observe(retry);retry.time=2;r.observe(retry);assert.equal(r.sample(1,1.8).radio.active,null);assert.equal(r.sample(0,2).radio.language,'en');
});
class Media{constructor(){this.paused=true;this.ended=false;this.currentTime=0;this.duration=10;this.readyState=4;this.src='';}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}get currentSrc(){return this.src;}}
test('replay seeks once into speech, preserves continuous camera cuts, pauses, and seeks on reverse/loop/segment changes',async()=>{
 globalThis.Audio=Media;const p=new CommsPlayback(),s={time:3,replayAudio:{segment:0,attempt:1,cycle:0,epoch:0},radio:{language:'zh',pilotVoice:'h',active:{id:3,clip:'us1549-mayday-0',role:'pilot',started:1}}};
 p.update(s,true,false,1,{replay:true,exterior:true});assert.equal(p.radio.currentTime,2);await new Promise(r=>setImmediate(r));p.radio.currentTime=2.1;s.time=3.1;p.update(s,true,false,1,{replay:true});assert.equal(p.radio.currentTime,2.1);p.update(s,false,false,1,{replay:true});assert(p.radio.paused);p.update(s,true,false,1,{replay:true});assert.equal(p.radio.currentTime,2.1);
 s.time=2;p.update(s,true,false,1,{replay:true});assert.equal(p.radio.currentTime,1);s.replayAudio.cycle++;p.radio.currentTime=6;p.update(s,true,false,1,{replay:true});assert.equal(p.radio.currentTime,1);s.replayAudio.segment++;p.radio.currentTime=6;p.update(s,true,false,1,{replay:true});assert.equal(p.radio.currentTime,1);s.time=2.1;s.replayAudio.epoch++;p.radio.currentTime=8;p.update(s,true,false,1,{replay:true});assert(Math.abs(p.radio.currentTime-1.1)<1e-8);p.dispose();
 const r={clips:[{segment:0,start:0,end:2,duration:2},{segment:0,start:2,end:4,duration:2},{segment:0,start:4.1,end:6.1,duration:2}],index:0,startIndex:0,elapsed:1.99,fade:1,cycles:0,audioEpoch:0,loading:false};advanceReplay(r,.02);assert.equal(r.audioEpoch,0);r.loading=false;r.elapsed=1.99;advanceReplay(r,.02);assert.equal(r.audioEpoch,1);changeReplayClip(r,-1);assert.equal(r.audioEpoch,2);
});
test('electronic cue is bounded, pauses, resumes at recorded time and stops on acknowledgement',()=>{
 const w=alertWave();assert(w.data.every(Number.isFinite));assert(w.data.some(v=>Math.abs(v)>.2));assert(w.duration<1);
 const sources=[],node=()=>({gain:{value:0},connect(){},disconnect(){}}),context={createGain:node,createBuffer:(n,l)=>({getChannelData:()=>new Float32Array(l)}),createBufferSource:()=>{const v={...node(),playbackRate:{value:1},start(_,offset){this.offset=offset;},stop(){this.onended?.();}};sources.push(v);return v;}};
 const a=new AlertAudio(context,node()),s={time:1,engines:[{id:0,status:'failed'},{id:1,status:'failed'}]};updateFlightAlerts(s);a.update(s,true);a.update(s,true);assert.equal(sources.length,1);a.update(s,false);s.time=1.2;a.update(s,true);assert(Math.abs(sources[1].offset-.2)<1e-8);acknowledgeAlerts(s);a.update(s,true);assert(!a.stats().active);a.dispose();
});
