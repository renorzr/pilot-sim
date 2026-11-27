import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import script from '../game/src/comms/script.json' with {type:'json'};
import {RADIO_PACKS} from '../game/src/comms/radio-packs.js';
import pack from '../game/src/comms/pilot-voices.json' with {type:'json'};
import {radioPhrasePlan} from '../game/src/comms/phrases.js';

const expected={};
for(const[prefix,lines]of[['',script],...Object.entries(RADIO_PACKS).map(([name,p])=>[name+'-',p.zh])]){
 for(const[event,dialogue]of Object.entries(lines))for(const[index,[role,text]]of dialogue.entries())if(['pilot','tower'].includes(role))expected[prefix+event+'-'+index]={role,text};
}
assert.equal(pack.schema,3);
assert.deepEqual(Object.keys(pack.voices),['e','g','h','j','xiaoxiao']);
const signals=JSON.parse(await readFile(new URL('./assets/pilot-voices/manifest.json',import.meta.url),'utf8'));
for(const[id,voice]of Object.entries(pack.voices)){
 assert.equal(signals[id].referenceId,voice.referenceId,'Emergency signal must use the selected pilot');
 for(const signal of Object.values(signals[id].signals)){
  assert.equal(signal.groups,3);assert(signal.duration>0&&signal.duration<2.5);
  const bytes=await readFile(new URL('./assets/pilot-voices/'+signal.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),signal.sha256);
 }
 assert.deepEqual(voice.roles,['pilot','tower']);
 for(const[clip,line]of Object.entries(expected)){
  const phrase=radioPhrasePlan(clip,'zh',id);assert(voice.clips[clip]||phrase?.parts.length,'Missing approved voice performance: '+id+': '+clip);
  if(!voice.clips[clip]){assert.equal(phrase.text,line.text);assert.equal(phrase.role,line.role);assert(phrase.source?.file&&phrase.source.sha256,'Missing complete composed fallback');}
 }
 for(const[clip,item]of Object.entries(voice.clips)){
  assert.equal(item.text,expected[clip].text,id+': '+clip+' script changed');assert.equal(item.role,expected[clip].role);assert(item.duration>.2&&item.duration<35);
  assert(/^[a-z0-9-]+\.mp3$/.test(item.file));const bytes=await readFile(new URL('../public/assets/radio/pilots/'+id+'/'+item.file,import.meta.url));
  assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  if(item.role==='pilot'){
   assert(item.clean?.duration>.2&&item.clean.duration<35,'Missing unfiltered pilot recording');
   const dry=await readFile(new URL('../public/assets/radio/pilots/'+id+'/'+item.clean.file,import.meta.url));
   assert.equal(dry.length,item.clean.bytes);assert.equal(createHash('sha256').update(dry).digest('hex'),item.clean.sha256);
  }
 }
}
const englishClean=JSON.parse(await readFile(new URL('../game/src/comms/english-pilot-clean.json',import.meta.url),'utf8'));
const englishExpected={};
const englishScript=JSON.parse(await readFile(new URL('../game/src/comms/script.en.json',import.meta.url),'utf8'));
for(const[prefix,lines]of[['',englishScript],...Object.entries(RADIO_PACKS).map(([name,p])=>[name+'-',p.en])])for(const[event,dialogue]of Object.entries(lines))for(const[index,[role,text]]of dialogue.entries())if(role==='pilot')englishExpected[prefix+event+'-'+index]=text;
for(const[id,text]of Object.entries(englishExpected)){
 const phrase=radioPhrasePlan(id,'en');assert(englishClean.clips[id]||phrase?.parts.length,'Missing English pilot performance: '+id);
 if(!englishClean.clips[id]){assert.equal(phrase.text,text);assert(phrase.source?.file&&phrase.source.sha256);}
}
for(const[id,item]of Object.entries(englishClean.clips)){
 assert.equal(item.text,englishExpected[id]);assert(item.duration>.2&&item.duration<35);
 const bytes=await readFile(new URL('../public/assets/radio/en/pilots/'+item.file,import.meta.url));assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
}
console.log('Chinese radio: E / G / H / J / Xiaoxiao; '+Object.keys(expected).length+' pilot/tower lines per voice; all audio hashes and production signal sources verified.');
