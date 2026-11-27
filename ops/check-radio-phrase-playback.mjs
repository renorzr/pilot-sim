// Media fixtures, separate from native-flight evidence. Exercise production
// playback/assembly with every airport, approved actor and both languages.
import assert from'node:assert/strict';
import{mkdir,readFile,writeFile,symlink}from'node:fs/promises';
import{fileURLToPath}from'node:url';
import{build}from'../game/node_modules/esbuild/lib/main.js';
import{connect}from'./cdp.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=new URL('../qa/radio-production/harness/',import.meta.url);await mkdir(directory,{recursive:true});
await symlink(fileURLToPath(new URL('../public/assets/',import.meta.url)),new URL('assets',directory),'dir').catch(e=>{if(e.code!=='EEXIST')throw e;});
const fixtures=[];
for(const airport of['lga','jfk','lax','daxing','xiaoshan','changi','kansai'])for(const language of['zh','en'])for(const actor of language==='zh'?['e','g','h','j','xiaoxiao']:[null])for(const role of['pilot','tower'])fixtures.push({airport,language,actor,role,clip:`${airport}-${role==='pilot'?'preparation-0':'takeoff-0'}`});
// Daxing's runway messages are in the shared ground/base pack.
for(const f of fixtures)if(f.airport==='daxing'&&f.role==='pilot')f.clip='ground-preparation-0';
if(process.env.PILOT_RADIO_QA_CONTINUE==='1'){fixtures.length=0;for(const language of ['zh','en'])for(const actor of language==='zh'?['e','g','h','j','xiaoxiao']:[null])for(const role of ['pilot','tower'])fixtures.push({airport:'lga',language,actor,role,clip:`airline-enroute-continue-${role==='tower'?0:1}`});}
const js=`import {CommsPlayback} from '${root}game/src/comms/playback.js';import{radioPhrasePlan}from'${root}game/src/comms/phrases.js';
const fixtures=${JSON.stringify(fixtures)},p=new CommsPlayback();let context,s=null,sequence=0,running=true,muted=false,exterior=false;
const select=document.querySelector('#fixture');fixtures.forEach((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=[f.airport,f.language,f.actor||'English',f.role].join(' · ');select.append(o);});
document.querySelector('#start').onclick=async()=>{if(!context){context=new AudioContext();p.connect(context);}await context.resume();s=null;p.reset();const f=fixtures[Number(select.value)],other=f.actor==='e'?'h':'e';const next={airportId:f.airport,time:10,radio:{language:f.language,pilotVoice:f.role==='pilot'?f.actor:other,towerVoice:f.role==='tower'?f.actor:other,pending:[],active:{id:++sequence,clip:f.clip,role:f.role,started:10}}};const plan=radioPhrasePlan(f.clip,f.language,f.actor);if(plan?.parts.length)await p.phrases.prepare(plan);s=next;running=true;muted=false;p.update(s,running,muted,1,{exterior});};
document.querySelector('#view').onclick=()=>exterior=!exterior;document.querySelector('#pause').onclick=()=>running=!running;document.querySelector('#mute').onclick=()=>muted=!muted;document.querySelector('#reset').onclick=()=>{s=null;p.reset();};
setInterval(()=>{if(s)p.update(s,running,muted,1,{exterior});document.querySelector('#stats').textContent=JSON.stringify(p.stats(),null,2);},20);
window.__radioQA={fixtures,stats:()=>p.stats(),state:()=>s};`;
const compiled=await build({stdin:{contents:js,resolveDir:root,sourcefile:'radio-media-fixtures.js'},bundle:true,write:false,format:'esm',target:'es2022',plugins:[{name:'strip-query',setup(b){b.onResolve({filter:/\?v=/},args=>({path:fileURLToPath(new URL(args.path.split('?')[0],`file://${args.resolveDir}/`))}));}}]});await writeFile(new URL('player.js',directory),compiled.outputFiles[0].contents);
await writeFile(new URL('index.html',directory),'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Media QA fixtures</title><label>Fixture <select id="fixture"></select></label><button id="start">Start fixture</button><button id="view">Camera audio treatment</button><button id="pause">Pause/resume</button><button id="mute">Mute/unmute</button><button id="reset">Reset</button><pre id="stats"></pre><script type="module" src="player.js"></script>');
const b=await connect(process.argv[2]||'http://127.0.0.1:18107/',1100,720),results=[];
try{
 await b.waitFor('window.__radioQA');
 for(let i=0;i<fixtures.length;i++){
  await b.evaluate(`document.querySelector('#fixture').value=${JSON.stringify(String(i))}`);await b.click('#start');await b.waitFor(`window.__radioQA.state()?.radio.active.id===${i+1}&&window.__radioQA.stats().radioTime>.12&&!window.__radioQA.stats().radioPaused`,30000);
  let peak=0;for(let n=0;n<5;n++){peak=Math.max(peak,await b.evaluate('window.__radioQA.stats().radioSignalRms'));await new Promise(r=>setTimeout(r,65));}
  const stats=await b.evaluate('window.__radioQA.stats()');assert(peak>.0001,JSON.stringify(fixtures[i]));assert.equal(stats.radioPlaybackRate,1);assert.equal(stats.blocked,false);assert.equal(stats.radioPhraseCache.failures,0);assert(stats.radioPhraseCache.pcmBytes<=16*1024*1024);assert(stats.radioPhraseCache.joinedBytes<=16*1024*1024);
  assert(['phrases','phrases-file','shared-whole'].includes(stats.radioAssembly));if(stats.radioAssembly==='phrases')assert(stats.radioSrc.startsWith('blob:'));
  results.push({...fixtures[i],assembly:stats.radioAssembly,time:stats.radioTime,duration:stats.radioDuration,rms:peak,cache:stats.radioPhraseCache});
  if(i%12===0){
   const src=stats.radioSrc,time=stats.radioTime;await b.click('#view');await new Promise(r=>setTimeout(r,100));let next=await b.evaluate('window.__radioQA.stats()');assert.equal(next.radioSrc,src);assert(next.radioTime>time);await b.click('#view');
   await b.click('#pause');await new Promise(r=>setTimeout(r,70));next=await b.evaluate('window.__radioQA.stats()');assert(next.radioPaused);assert.equal(next.carrierGain,0);await b.click('#pause');await b.waitFor('!window.__radioQA.stats().radioPaused');
   await b.click('#mute');await new Promise(r=>setTimeout(r,70));assert((await b.evaluate('window.__radioQA.stats()')).radioPaused);await b.click('#mute');
  }
 }
 await b.click('#reset');await new Promise(r=>setTimeout(r,150));assert((await b.evaluate('window.__radioQA.stats()')).radioPaused);assert.equal((await b.evaluate('window.__radioQA.stats()')).carrierGain,0);
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.equal(errors.length,0,JSON.stringify(errors));await writeFile(process.env.PILOT_RADIO_QA_CONTINUE==='1'?'qa/continuous-flight/new-phrase-media.json':'qa/radio-production/media.json',JSON.stringify({fixtureEvidence:true,results,errors},null,2));console.log('PASS',results.length,'native media playbacks: approved Chinese voices, English, live DSP, pause/mute and bounded caches');
}finally{await b.close();}
