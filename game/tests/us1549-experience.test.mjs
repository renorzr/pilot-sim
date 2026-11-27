import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {createFlight,advanceFlight,restoreCheckpoint,setMotion,KT,RAD} from '../src/flight.js';
import {createHistoricalIntro,createHistoricalRescue,advanceHistoricalPresentation,historicalCamera} from '../src/history/presentation.js';
import {createAirportPresentation,finishAirportPresentation} from '../src/views/airport-presentation.js';
import {historicalMediaReady,historicalClip,historicalRadioScript,assignHistoricalCast} from '../src/history/media.js';
import {queueHistorical,updateHistoricalComms,historyLineValid} from '../src/history/comms.js';
import {chooseHistorical,takeHistoricalControl} from '../src/history/us1549.js';
import {setRadioLanguage,radioClipDuration,updateRadio} from '../src/comms/radio.js';
import {radioVoiceFor} from '../src/comms/pilot-voices.js';
import {ContactSounds,soundTargets} from '../src/audio/soundscape.js';
import {sampleCabinMotion} from '../src/sim/cabin-motion.js';
import {normalizeHistoricalProgress} from '../src/history/progress.js';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {createHistoricalEffects} from '../src/history/effects.js';
import {historicalObstacles} from '../src/history/obstacles.js';
import {t} from '../src/i18n/index.js';
const start=historical=>createFlight(null,{levelId:'history-us1549',historical});
const motion=s=>Object.fromEntries(['x','y','z','pitch','roll','yaw','speed','gearPosition','flapPosition'].map(k=>[k,s[k]]));
function fly(s,seconds){for(let i=0;i<seconds*100&&!s.result;i++)advanceFlight(s,{},.01);}
test('all Chinese/English channels resolve approved and distinct speakers with measured recordings',()=>{
 assert(historicalMediaReady('zh')&&historicalMediaReady('en'));
 for(const pilotVoice of['e','g','h','j','xiaoxiao']){
  const s=start({pilotVoice});assert.equal(s.radio.pilotVoice,'h');assert.equal(s.radio.copilotVoice,'g');assert.equal(new Set([s.radio.pilotVoice,s.radio.towerVoice,s.radio.copilotVoice]).size,3);
  for(const lang of['zh','en'])for(const[event,lines]of Object.entries(historicalRadioScript[lang]))for(const[i,[role,text,channel]]of lines.entries()){
   const id=`us1549-${event}-${i}`,c=historicalClip(id,lang,radioVoiceFor(s.radio,role));assert(c);assert.equal(c.text,text);assert.equal(c.channel,channel);assert.equal(radioClipDuration(id,lang,radioVoiceFor(s.radio,role)),c.duration+.2);
  }
 }
});
test('the marked intro integrates only its private normal aircraft and enters the same fault state when skipped',()=>{
 const s=start(),before=structuredClone(s),p=createAirportPresentation(s);assert.equal(p.kind,'history-intro');assert(p.visual.engines.every(e=>e.status==='running'));assert(s.engines.every(e=>e.status==='failed'));
 const initial={...p.visual.velocity};advanceHistoricalPresentation(p,.4,true);assert.notDeepEqual(p.visual.velocity,initial);const pause=structuredClone(p.visual);advanceHistoricalPresentation(p,.5,false);assert.deepEqual(p.visual,pause);
 while(p.active)advanceHistoricalPresentation(p,.17,true);assert(Math.abs(p.visual.time-2)<.02);assert.deepEqual(s,before);
 const skipped=createHistoricalIntro(s);assert(finishAirportPresentation(skipped));assert.deepEqual(s,before);assert.equal(createAirportPresentation(start({practice:true,finalApproach:true})),null);
});
test('rescue uses a separate clock and cannot change frozen results, evidence, practice flags or recorder',()=>{
 // Presentation fixture: this does not claim physical or browser flight success.
 const s=start({practice:true,finalApproach:true});s.water={phase:'complete',fatal:null,firstImpact:{time:10},waterSpeed:1};s.time=40;s.result={success:true,physicalSuccess:true,levelCleared:false,score:70};
 const r=new FlightRecording();r.observe(s);const before=structuredClone(s),stats=r.stats(),p=createHistoricalRescue(s);assert(p);for(let i=0;i<50;i++)advanceHistoricalPresentation(p,.5,true);assert(!p.active);assert(p.visual.time>s.time);assert.deepEqual(s,before);assert.deepEqual(r.stats(),stats);
 const q=createHistoricalRescue(s);finishAirportPresentation(q);assert.deepEqual(s.result,before.result);assert(s.mission.practice);s.result.success=s.result.physicalSuccess=false;assert.equal(createHistoricalRescue(s),null);
});
test('explicit handover precedes any long audio and cancels obsolete airport/command lines',()=>{
 const s=start();chooseHistorical(s,'left');fly(s,6);chooseHistorical(s,'assess');chooseHistorical(s,'river');fly(s,6);
 s.radio.active={clip:'us1549-mayday-0',historyEvent:'mayday',event:'us1549-mayday',started:s.time,until:s.time+12,priority:70};const position=motion(s);
 assert(takeHistoricalControl(s));assert.deepEqual(motion(s),position);assert.equal(s.radio.active.historyEvent,'mayday');assert.equal(s.historical.controlSource,'player');assert.equal(s.historical.strategy,'river');
 assert(!s.radio.pending.some(l=>['lga','alternatives','left','return'].includes(l.historyEvent)));
 advanceFlight(s,{pitch:1},.01);assert(s.controls.pitchCommand>0);
});
test('late configuration, brace and candidate speech are invalidated by actual state',()=>{
 const s=start({practice:true,finalApproach:true});assert(queueHistorical(s,'flaps'));s.flapPosition=3;updateHistoricalComms(s,0);assert(!s.radio.pending.some(l=>l.historyEvent==='flaps'));
 assert(queueHistorical(s,'brace'));s.water={phase:'water-run',firstImpact:{time:s.time},waterSpeed:10};updateHistoricalComms(s,.01);assert(!s.radio.pending.some(l=>l.historyEvent==='brace'));assert(!queueHistorical(s,'evacuate'));
 s.water.phase='evacuation';assert(queueHistorical(s,'evacuate'));s.water.fatal='capsize';assert(!historyLineValid(s,'evacuate'));s.result={success:false};updateHistoricalComms(s,0);assert.equal(s.radio.active,null);assert.equal(s.radio.pending.length,0);
});
test('final practice does not play a new bird strike, relight or Mayday sequence',()=>{
 const s=start({practice:true,finalApproach:true});fly(s,1);assert(!s.radio.fired['us1549:bird']);assert(!s.radio.fired['us1549:mayday']);assert.equal(s.historical.crew.birdAt,undefined);assert(!s.mission.events.some(e=>e.type==='bird-strike'));
});
test('relight completion follows actual crew steps and never restores thrust',()=>{
 const s=start();fly(s,3.2);assert.equal(s.historical.crew.relight,'attempting');fly(s,5);assert.equal(s.historical.crew.power,'apu-available');fly(s,10);assert.equal(s.historical.crew.relight,'no-thrust-recovered');assert(s.engines.every(e=>e.thrustN===0&&e.status==='failed'));
});
test('language switches retain all three actor identities, flight pose and measured remaining line lifetime',()=>{
 const s=start({pilotVoice:'g',towerVoice:'e',copilotVoice:'j'});fly(s,4);const identities=[s.radio.pilotVoice,s.radio.towerVoice,s.radio.copilotVoice],pose=motion(s);assert(s.radio.active);
 setRadioLanguage(s,'en');assert.deepEqual(motion(s),pose);assert.deepEqual([s.radio.pilotVoice,s.radio.towerVoice,s.radio.copilotVoice],identities);const c=historicalClip(s.radio.active.clip,'en',null);assert(Math.abs(s.radio.active.until-s.time-c.duration-.2)<1e-7);
 assert.deepEqual([restoreCheckpoint(s).radio.pilotVoice,restoreCheckpoint(s).radio.towerVoice,restoreCheckpoint(s).radio.copilotVoice],identities);
});
test('new command versions cannot play stale earlier instructions after a different choice',()=>{
 const s=start();chooseHistorical(s,'left');fly(s,6);assert(chooseHistorical(s,'assess'));updateHistoricalComms(s,0);assert(!s.radio.pending.some(l=>l.historyEvent==='left'));
});
test('water and bird cues have independent bounded visual/audio impulses without tyre contact',()=>{
 const s=start(),before=motion(s),sounds=new ContactSounds();sounds.update(s);fly(s,.02);assert(sounds.update(s).some(e=>e.kind==='bird'));assert.deepEqual(sounds.update(s),[]);
 s.water={phase:'water-run',waterSpeed:40,firstImpact:{time:s.time,sinkMps:3.8}};assert(sounds.update(s).some(e=>e.kind==='water'));assert.equal(s.touchdown,null);assert(soundTargets(s).water>0);const a=sampleCabinMotion(s);s.time+=.025;const b=sampleCabinMotion(s);assert(b.sources.water>0&&Math.abs(b.y)<.012);assert.notDeepEqual(a,b);assert.equal(sampleCabinMotion(s,0).y,0);
});
test('camera and water/rescue effects consume immutable recorded poses and preserve obstacle envelopes',()=>{
 const s=start({practice:true,finalApproach:true});s.water={phase:'complete',firstImpact:{time:0},waterSpeed:1,evacuationSeconds:4};const before=structuredClone(s),obstacles=structuredClone(historicalObstacles),scene=new THREE.Scene(),fx=createHistoricalEffects(scene);
 for(let i=0;i<12;i++){const p={kind:'history-rescue',elapsed:i,duration:12};fx.update(s,p);const pose=historicalCamera(s,p);assert(pose.position.every(Number.isFinite));assert(Math.hypot(pose.position[0]-s.x,pose.position[2]-s.z)>50);}
 assert.deepEqual(s,before);assert.deepEqual(historicalObstacles,obstacles);fx.dispose();assert.equal(scene.children.length,0);
});
test('historical progress rejects malformed entries and preserves mode/revision identity',()=>{
 const p=normalizeHistoricalProgress({version:1,records:{'history-us1549:guided:1':{mode:'guided',revision:1,bestScore:80},'history-us1549:challenge:1':{mode:'guided',revision:1,bestScore:90},bad:{mode:'guided',revision:1,bestScore:100},'history-us1549:guided:2':{mode:'guided',revision:2,bestScore:Infinity}}});assert.deepEqual(Object.keys(p.records),['history-us1549:guided:1']);
});
test('every original radio subtitle has English coverage and the three MAYDAY groups remain one speaker',()=>{
 for(const[event,lines]of Object.entries(historicalRadioScript.zh))for(const[i,[,text]]of lines.entries())assert.equal(t(text,'en'),historicalRadioScript.en[event][i][1]);
 for(const lang of['zh','en'])assert.equal((historicalRadioScript[lang].mayday[0][1].match(/MAYDAY/g)||[]).length,3);
});

test('early handover cancels a queued first-officer claim of flying while keeping emergency work valid',()=>{
 const s=start();queueHistorical(s,'bird');assert(takeHistoricalControl(s,{early:true}));updateHistoricalComms(s,.01);
 assert(!s.radio.pending.some(l=>l.historyEvent==='bird'));assert(s.radio.active?.historyEvent!=='bird');assert(!historyLineValid(s,'bird'));assert(historyLineValid(s,'power'));
});
