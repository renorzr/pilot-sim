import assert from'node:assert/strict';
import{readFile,stat}from'node:fs/promises';
import{createHash}from'node:crypto';
import script from'../game/src/failure/script.json'with{type:'json'};
import assets from'../game/src/failure/voice-assets.json'with{type:'json'};
import cast from'../game/src/failure/cast.json'with{type:'json'};
const approved=new Set(['e','g','h','j','xiaoxiao','guy','aria','andrew',...Object.values(cast).flatMap(roles=>Object.values(roles).map(p=>p.id))]),checked=new Set(),sources=new Map();let bytes=0;
async function verify(item){assert(item&&item.duration>0&&item.duration<20&&item.sha256?.length===64);assert(item.path.startsWith('assets/radio/failure/'));if(checked.has(item.path))return;const path=new URL('../public/'+item.path,import.meta.url),data=await readFile(path);assert.equal(data.length,item.bytes,item.path);assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256,item.path);assert(approved.has(item.voice)||Array.isArray(item.voices));checked.add(item.path);bytes+=data.length;}
for(const lang of['zh','en']){
 for(const[id,line]of Object.entries(script)){const item=assets.speech[lang][id],speaker=cast[lang][line.speaker||(line.role==='instructor'?'instructor':'field')];await verify(item);assert.equal(item.text,line[lang]);assert.equal(item.role,line.role);assert.equal(item.voice,speaker.id);assert.equal(item.referenceId,speaker.voice);sources.set(item.path,item);}
 for(const[voice,items]of Object.entries(assets.excerpts[lang]))for(const item of Object.values(items)){assert(approved.has(voice));await verify(item);assert(item.ranges.length);const source=await readFile(new URL('../public/'+item.sourcePath,import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),item.sourceSha256);sources.set(item.path,item);}
 for(const[key,mix]of Object.entries(assets.mixes[lang])){
  await verify(mix);assert(mix.revealAt<mix.duration&&mix.revealAt>=0);assert(mix.voices.every(v=>approved.has(v)));assert(mix.events.every(e=>e.at>=0&&e.at+e.duration<=mix.duration+.06));
  for(const e of mix.events){await stat(new URL('../public/'+e.sourcePath,import.meta.url));const source=sources.get(e.sourcePath);assert(source,e.sourcePath);assert.equal(e.voice,source.voice);assert.equal(e.duration,source.duration);assert.equal(e.text,source.text);}
  if(mix.kind==='procedural'){assert.equal(mix.events.length,1);assert.equal(mix.events[0].role,'instructor');}
  else{const last=mix.events.at(-1),dispatch=mix.events.find(e=>e.profile==='dispatch'),response=mix.events.find(e=>e.profile==='responder');assert.equal(last.profile,'confirmation');assert(last.at>=2);assert(dispatch?.duration>2&&response?.duration>1.5,'Full dispatch and response required');assert.equal(dispatch.voice,cast[lang].dispatch.id);assert.equal(response.voice,cast[lang].responder.id);assert.equal(new Set([last.voice,dispatch.voice,response.voice]).size,3,'Three distinct principal speakers required');assert(mix.voices.length>=3);if(key.endsWith('.long')){assert(mix.duration>=15&&mix.duration<20);assert(mix.events.some((a,i)=>mix.events.slice(i+1).some(b=>a.voice!==b.voice&&Math.min(a.at+a.duration,b.at+b.duration)>Math.max(a.at,b.at))),'Real different-voice overlap required');}}
 }
}
assert.equal(Object.keys(assets.mixes.zh).length,122);assert.equal(Object.keys(assets.mixes.en).length,26);
console.log(`Failure audio: ${checked.size} content-addressed files, 148 normally paced mixes, approved identities, captions, overlap and hashes verified; ${(bytes/1048576).toFixed(2)} MiB.`);
