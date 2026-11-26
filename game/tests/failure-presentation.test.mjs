import test from'node:test';import assert from'node:assert/strict';
import{createFlight}from'../src/flight.js';
import{failureKind,createFailurePrelude,advanceFailurePrelude,finishFailurePrelude,pauseFailurePrelude,failureStatus,switchFailureLanguage}from'../src/failure/presentation.js';
import assets from'../src/failure/voice-assets.json'with{type:'json'};
import{t}from'../src/i18n/index.js';
const start=()=>createFlight(null,{levelId:'history-us1549'});
// Classification fixtures are not flight evidence. Browser tests fly through
// real controls to their own recorded impact and fixed result.
function failed(kind='water',language='zh',voice='g'){const s=start();s.radio.language=language;s.radio.towerVoice=voice;s.result={success:false,physicalSuccess:false,title:'本次失败'};if(kind==='water'){s.water={fatal:'不可生存的入水冲击'};s.impact={type:'water',time:s.time};}else if(kind==='land')s.impact={type:'building',time:s.time};else if(kind==='runway')s.impact={type:'runway',time:s.time};return s;}
const advance=(p,seconds,options={})=>{for(let n=0;n<seconds*100;n++)advanceFailurePrelude(p,.01,{replayReady:true,media:{bypass:true},...options});};
test('incident classification uses contact evidence and separates safe/procedural failure from crashes',()=>{
 for(const kind of['water','land','runway','procedural'])assert.equal(failureKind(failed(kind)),kind);
 const s=failed('water');s.result.physicalSuccess=true;assert.equal(failureKind(s),'procedural');s.result.success=true;assert.equal(failureKind(s),null);assert.equal(createFailurePrelude(s),null);
 const a=failed('procedural');a.result.title='滑行超速';a.airborne=false;assert.equal(failureKind(a),'procedural');a.result.title='冲出跑道';assert.equal(failureKind(a),'runway');
});
test('every approved controller, language and real accident category resolves a complete pre-rendered mix',()=>{
 for(const language of['zh','en'])for(const voice of['e','g','h','j','xiaoxiao'])for(const kind of['land','water','runway'])for(const repeat of[0,1]){
  const s=failed(kind,language,voice),before=structuredClone(s),p=createFailurePrelude(s,{repeat,seed:127});assert(p);assert.equal(p.asset.kind,kind);assert.equal(p.asset.events[0].voice,language==='en'?'aria':voice);assert(p.asset.events.some(e=>e.profile==='confirmation'));assert(p.asset.voices.length>=2);assert.deepEqual(s,before);
 }
 assert.equal(Object.keys(assets.mixes.zh).length+Object.keys(assets.mixes.en).length,148);
});
test('normal-paced overlapping voices lead into a final confirmation and shorten on repeat',()=>{
 for(const kind of['land','water','runway']){
  const s=failed(kind),p=createFailurePrelude(s,{seed:1}),short=createFailurePrelude(s,{seed:1,repeat:1}),final=p.asset.events.at(-1);assert(short.asset.duration<p.asset.duration);assert(p.asset.events.some((a,i)=>p.asset.events.slice(i+1).some(b=>a.voice!==b.voice&&Math.min(a.at+a.duration,b.at+b.duration)>Math.max(a.at,b.at))));assert(final.at>p.asset.duration*.45);assert(p.asset.revealAt>final.at&&p.asset.revealAt<final.at+final.duration);assert(final.at+final.duration<p.asset.duration);
 }
});
test('incident dialogue gives field, dispatch and responding units full distinct parts under twenty seconds',()=>{
 for(const lang of['zh','en'])for(const[key,mix]of Object.entries(assets.mixes[lang])){
  if(mix.kind==='procedural')continue;
  const dispatch=mix.events.find(e=>e.profile==='dispatch'),response=mix.events.find(e=>e.profile==='responder'),final=mix.events.at(-1);
  assert(dispatch.duration>2&&response.duration>1.5);assert.equal(new Set([dispatch.voice,response.voice,final.voice]).size,3);
  assert(dispatch.at<response.at&&response.at<final.at);assert(mix.duration<20);
  if(key.endsWith('.long')){assert(mix.duration>=15);assert(mix.events.some(e=>e.profile==='field'));}
 }
});
test('black presentation freezes physics/results and its own clock on pause, blur and portrait',()=>{
 const s=failed(),before=structuredClone(s),p=createFailurePrelude(s);advance(p,2);assert(p.elapsed>1);assert.equal(p.opacity,1);const elapsed=p.elapsed;pauseFailurePrelude(p);advance(p,4);assert.equal(p.elapsed,elapsed);p.paused=false;advance(p,4,{visible:false});assert.equal(p.elapsed,elapsed);advance(p,1);assert(p.elapsed>elapsed);assert.deepEqual(s,before);
});
test('media clock keeps spoken cadence and caption alignment through a slow rendering frame',()=>{
 const p=createFailurePrelude(failed());advanceFailurePrelude(p,.01,{media:{ready:true},replayReady:true});const final=p.asset.events.at(-1);advanceFailurePrelude(p,.02,{media:{playing:true,elapsed:final.at+.2},replayReady:true});assert.equal(p.elapsed,final.at+.2);const status=failureStatus(p);assert(status.line.confirmation);assert.equal(status.line.text,final.text);assert.equal(p.opacity,1);assert(!p.paused);
});
test('scene readiness gates the reveal without looping the report, and skip is immediate',()=>{
 const p=createFailurePrelude(failed());advance(p,20,{replayReady:false});assert(p.active&&p.waiting&&p.opacity===1);const time=p.elapsed;advance(p,2,{replayReady:false});assert.equal(p.elapsed,time);advance(p,.45);assert(p.opacity>0&&p.opacity<1);advance(p,1);assert(!p.active&&p.opacity===0);
 const q=createFailurePrelude(failed());advance(q,1);finishFailurePrelude(q);assert(!q.active&&q.skipped&&q.opacity===0);advance(q,2);assert.equal(q.elapsed,q.asset.duration);
});
test('a missing media stream cannot trap mute or unsupported playback behind black',()=>{
 const p=createFailurePrelude(failed());advance(p,30,{media:{ready:false}});assert(!p.active);const stalled=createFailurePrelude(failed());advance(stalled,30,{media:{ready:true,playing:true,elapsed:1}});assert(!stalled.active&&stalled.mediaBypass);const q=createFailurePrelude(failed('procedural'));assert(q.asset.events.every(e=>e.role==='instructor'));assert(q.asset.duration<4);advance(q,5);assert(!q.active);
});
test('language changes restart only the current transmission, preserving variant, cast and reveal progress',()=>{
 const p=createFailurePrelude(failed('water','zh','h'),{seed:11});const confirmation=p.asset.events.at(-1);p.started=true;p.elapsed=confirmation.at+.7;p.revealElapsed=.3;p.opacity=.74;const oldKey=p.key;
 assert(switchFailureLanguage(p,'en',{elapsed:p.elapsed}));assert.equal(p.language,'en');assert.equal(p.key.split('.')[3],oldKey.split('.')[3]);assert.equal(p.asset.events[0].voice,'aria');assert.equal(p.elapsed,p.asset.events.at(-1).at);assert.equal(p.revealElapsed,.3);assert.equal(p.opacity,.74);assert.equal(p.languageChanges,1);assert(switchFailureLanguage(p,'zh'));assert.equal(p.asset.events[0].voice,'h');
});
test('dispatch subtitles take priority during overlap and language switching restarts that dispatch line',()=>{
 const p=createFailurePrelude(failed('water','zh','h'),{seed:11}),dispatch=p.asset.events.find(e=>e.profile==='dispatch');p.started=true;p.elapsed=dispatch.at+.1;
 assert.equal(failureStatus(p).line.role,'dispatch');assert.equal(failureStatus(p).line.voice,'yunxi');
 assert(switchFailureLanguage(p,'en'));const next=p.asset.events.find(e=>e.id===dispatch.id);assert.equal(p.elapsed,next.at);assert.equal(failureStatus(p).line.voice,'guy');assert.equal(failureStatus(p).line.role,'dispatch');
});
test('primary captions keep only one speaker and all speech/roles have English coverage',()=>{
 for(const kind of['land','water','runway','procedural']){
  const p=createFailurePrelude(failed(kind));for(const e of p.asset.events){p.elapsed=e.at+.05;const line=failureStatus(p).line;if(line)assert(!/\p{Script=Han}/u.test(t(line.text,'en')),line.text);}
 }
 for(const label of['空管','应急调度','警方现场单位','水上巡逻','救援单位','教员','事故声音演出字幕','训练结束','稍后 · 应急频道','应急无线电','事故声音演出','事故复盘','任务复盘','声音已暂停','无线电通话','声音序章进度','进入回放','继续声音','暂停声音'])assert(!/\p{Script=Han}/u.test(t(label,'en')),label);
});
