import test from'node:test';import assert from'node:assert/strict';
import{createFlight,restoreCheckpoint}from'../src/flight.js';
import{historicalClip,assignHistoricalCast}from'../src/history/media.js';
import{setRadioLanguage}from'../src/comms/radio.js';
import{createHistoricalRescue,advanceHistoricalPresentation}from'../src/history/presentation.js';
import{finishAirportPresentation}from'../src/views/airport-presentation.js';
import{rescueLine,switchRescueLanguage,preloadRescueAudio}from'../src/history/rescue-media.js';
import{t}from'../src/i18n/index.js';
// Presentation-only fixtures, not manufactured flight/browser evidence.
function successful(outcome='controlled'){
 const s=createFlight(null,{levelId:'history-us1549',historical:{practice:true,finalApproach:true}});s.water={phase:'complete',fatal:null,firstImpact:{time:1},waterSpeed:1};s.result={success:true,physicalSuccess:true,levelCleared:false,waterOutcome:outcome,score:70};return s;
}
test('historical captain and first officer ignore random/preferences and retain identities across retries/languages',()=>{
 for(const pilotVoice of['e','g','h','j','xiaoxiao'])for(const copilotVoice of['e','g','h','j','xiaoxiao']){
  const s=createFlight(null,{levelId:'history-us1549',historical:{pilotVoice,copilotVoice}});assert.equal(s.radio.pilotVoice,'h');assert.equal(s.radio.copilotVoice,'g');assert(!['h','g'].includes(s.radio.towerVoice));
  assignHistoricalCast(s.radio,{pilotVoice,copilotVoice,towerVoice:pilotVoice});assert.equal(s.radio.pilotVoice,'h');assert.equal(s.radio.copilotVoice,'g');assert(!['h','g'].includes(s.radio.towerVoice));
  for(const lang of['en','zh']){setRadioLanguage(s,lang);assert.equal(s.radio.pilotVoice,'h');assert.equal(s.radio.copilotVoice,'g');assert.equal(historicalClip('us1549-commit-0',lang,pilotVoice).voice,lang==='en'?'guy':'h');assert.equal(historicalClip('us1549-commit-1',lang,copilotVoice).voice,lang==='en'?'andrew':'g');}
  const retry=restoreCheckpoint(s);assert.equal(retry.radio.pilotVoice,'h');assert.equal(retry.radio.copilotVoice,'g');
 }
});
test('successful rescue picks actual damage outcome, distinct full voices and a complete sub-twenty-second timeline',()=>{
 for(const outcome of['controlled','damaged-survival']){
  const s=successful(outcome),before=structuredClone(s),p=createHistoricalRescue(s);assert(p.duration>=17&&p.duration<20);assert.equal(p.outcome,outcome==='controlled'?'controlled':'damaged');assert.equal(new Set(p.asset.events.slice(1,4).map(e=>e.voice)).size,3);assert.equal(p.asset.events.at(-1).voice,'g');assert.equal(p.visual.radio.active,null);assert.deepEqual(p.visual.radio.pending,[]);assert.deepEqual(s,before);
  if(outcome!=='controlled')assert(p.asset.events.find(e=>e.id==='field').text.includes('损伤'));
 }
 const bad=successful();bad.water.fatal='capsize';assert.equal(createHistoricalRescue(bad),null);bad.water.fatal=null;bad.result.physicalSuccess=false;assert.equal(createHistoricalRescue(bad),null);
});
test('media clock aligns rescue captions while physics/result remain frozen and pause/skip stop its clock',()=>{
 const s=successful(),before=structuredClone(s),p=createHistoricalRescue(s),cue=p.asset.events.find(e=>e.id==='dispatch');advanceHistoricalPresentation(p,.01,true,{media:{ready:true,playing:true,elapsed:cue.at+.1}});assert.equal(p.elapsed,cue.at+.1);assert.equal(rescueLine(p).id,'dispatch');assert.equal(p.visual.time,s.time+p.elapsed);
 const paused=p.elapsed;advanceHistoricalPresentation(p,.5,false,{media:{ready:true,playing:true,elapsed:paused+1}});assert.equal(p.elapsed,paused);assert.deepEqual(s,before);finishAirportPresentation(p);assert(!p.active);assert.deepEqual(s,before);
});
test('muted, unavailable or stalled media cannot trap a rescue and language switching restarts only the current cue',()=>{
 for(const media of[{bypass:true},{ready:false},{ready:true,playing:true,elapsed:1}]){const p=createHistoricalRescue(successful());for(let i=0;i<70;i++)advanceHistoricalPresentation(p,.5,true,{media});assert(!p.active);}
 const p=createHistoricalRescue(successful()),cue=p.asset.events.find(e=>e.id==='dispatch');p.elapsed=cue.at+.4;p.started=true;assert(switchRescueLanguage(p,'en'));assert.equal(p.elapsed,p.asset.events.find(e=>e.id==='dispatch').at);assert.equal(rescueLine(p).voice,'guy');assert(switchRescueLanguage(p,'zh'));assert.equal(rescueLine(p).voice,'yunxi');
 for(const e of p.asset.events)assert(!/\p{Script=Han}/u.test(t(e.text,'en')),e.text);
});
test('preloading fetches only this controllers two outcomes and tolerates denied storage/network',async()=>{
 const s=successful(),urls=[];await preloadRescueAudio(s,{fetchFn:async(url,options)=>{urls.push(url);assert.equal(options.cache,'force-cache');throw Error('offline');}});assert.equal(urls.length,2);assert(urls.every(url=>url.includes('zh-mix-'+s.radio.towerVoice+'.')));
});
