import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import catalogue from'../game/src/comms/phrase-catalogue.json'with{type:'json'};
import scriptZH from'../game/src/comms/script.json'with{type:'json'};
import scriptEN from'../game/src/comms/script.en.json'with{type:'json'};
import{RADIO_PACKS}from'../game/src/comms/radio-packs.js';
const excluded=new Set(['engine','dual','engine-stable','flaps','distress-wind','distress-terrain','distress-stall','distress-cancel']);
const normalize=t=>t.toLowerCase().replaceAll('两','二').replaceAll('〇','零').replace(/[^\p{L}\p{N}]/gu,'');
assert.equal(catalogue.schema,1);assert.equal(catalogue.sampleRate,24000);assert.match(catalogue.fingerprint,/^[a-f0-9]{64}$/);
const checked=new Set();
async function verify(file,sha,bytes){
 const key=file+':'+sha;if(checked.has(key))return;checked.add(key);
 const data=await readFile(new URL('../public/'+file,import.meta.url));assert.equal(createHash('sha256').update(data).digest('hex'),sha,file);if(bytes)assert.equal(data.length,bytes);return data;
}
for(const[key,p]of Object.entries(catalogue.phrases)){
 assert.match(key,/^[a-f0-9]{24}$/);const data=await verify(p.file,p.sha256,p.bytes);assert(data);assert.equal(data.readUInt32LE(24),24000);assert.equal(data.readUInt16LE(22),1);assert.equal(data.readUInt16LE(34),16);assert.equal(data.readUInt32LE(40),p.frames*2);assert.equal(data.length,44+p.frames*2);assert.equal(p.duration,p.frames/24000);assert(p.peak<1&&p.rms>.001);await verify(p.source.file,p.source.sha256);
}
let total=0,assembled=0;const groups={};
for(const language of['zh','en'])for(const[prefix,script]of[['',language==='zh'?scriptZH:scriptEN],...Object.entries(RADIO_PACKS).map(([id,p])=>[id+'-',p[language]])])for(const[event,lines]of Object.entries(script))for(const[n,[role,text]]of lines.entries()){
 if(!['pilot','tower'].includes(role))continue;
 const clip=prefix+event+'-'+n;
 for(const actor of language==='zh'?['e','g','h','j','xiaoxiao']:[role==='pilot'?'guy':'aria']){
  const key=`${language}:${actor}:${clip}`,p=catalogue.clips[key];
  if(excluded.has(event)){assert.equal(p,undefined);continue;}
  assert(p,key);total++;assert.equal(p.text,text,key);assert.equal(p.role,role);assert.equal(p.actor,actor);assert.equal(p.language,language);await verify(p.source.file,p.source.sha256);
  assert(p.budget>=p.duration&&p.budget>=p.source.duration);assert(p.budget<35);
  if(p.fallback){assert.equal(p.fallback.kind,'assembled');assert(p.budget>=p.fallback.duration);assert.equal(p.fallback.recipe,createHash('sha256').update(JSON.stringify([p.parts.map(id=>catalogue.phrases[id].sha256),p.gapMs])).digest('hex'));await verify(p.fallback.file,p.fallback.sha256,p.fallback.bytes);}
  groups[p.group]??={total:0,assembled:0};groups[p.group].total++;
  if(!p.parts.length)continue;assembled++;groups[p.group].assembled++;let duration=(p.parts.length-1)*p.gapMs/1000;
  const parts=p.parts.map(id=>{const part=catalogue.phrases[id];assert(part,key+': '+id);assert.equal(part.actor,actor);assert.equal(part.role,role);assert.equal(part.language,language);duration+=part.duration;return part.text;});assert.equal(normalize(parts.join('')),normalize(text),key);assert(Math.abs(duration-p.duration)<1e-8,key);
 }
}
assert.equal(Object.keys(catalogue.clips).length,total);assert(assembled/total>.8,'Routine speech phrase coverage dropped');
console.log(JSON.stringify({routineClips:total,assembled,uniquePhrases:Object.keys(catalogue.phrases).length,verifiedFiles:checked.size,groups}));
