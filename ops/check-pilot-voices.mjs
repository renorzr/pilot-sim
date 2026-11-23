import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import script from '../game/src/comms/script.json' with {type:'json'};
import {RADIO_PACKS} from '../game/src/comms/radio-packs.js';
import pack from '../game/src/comms/pilot-voices.json' with {type:'json'};

const expected={};
for(const[prefix,lines]of[['',script],...Object.entries(RADIO_PACKS).map(([name,p])=>[name+'-',p.zh])]){
 for(const[event,dialogue]of Object.entries(lines))for(const[index,[role,text]]of dialogue.entries())if(['pilot','tower'].includes(role))expected[prefix+event+'-'+index]={role,text};
}
assert.equal(pack.schema,2);
assert.deepEqual(Object.keys(pack.voices),['e','g','h','j','xiaoxiao']);
const signals=JSON.parse(await readFile(new URL('./assets/pilot-voices/manifest.json',import.meta.url),'utf8'));
for(const[id,voice]of Object.entries(pack.voices)){
 assert.equal(signals[id].referenceId,voice.referenceId,'Emergency signal must use the selected pilot');
 for(const signal of Object.values(signals[id].signals)){
  assert.equal(signal.groups,3);assert(signal.duration>0&&signal.duration<2.5);
  const bytes=await readFile(new URL('./assets/pilot-voices/'+signal.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),signal.sha256);
 }
 assert.deepEqual(voice.roles,['pilot','tower']);
 assert.deepEqual(Object.keys(voice.clips).sort(),Object.keys(expected).sort(),'Radio catalogue is stale; regenerate both roles for every selected voice');
 for(const[clip,item]of Object.entries(voice.clips)){
  assert.equal(item.text,expected[clip].text,id+': '+clip+' script changed');assert.equal(item.role,expected[clip].role);assert(item.duration>.2&&item.duration<35);
  assert(/^[a-z0-9-]+\.mp3$/.test(item.file));const bytes=await readFile(new URL('../public/assets/radio/pilots/'+id+'/'+item.file,import.meta.url));
  assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
 }
}
for(const name of['radio-effects.js','radio-presets.js']){
 const source=await readFile(new URL('../game/src/comms/'+name,import.meta.url));
 const audition=await readFile(new URL('../public/assets/pilot-voices/'+name,import.meta.url));
 assert(source.equals(audition),'The game and audition must use the same '+name);
}
console.log('Chinese radio: E / G / H / J / Xiaoxiao; '+Object.keys(expected).length+' pilot/tower lines per voice; all audio hashes and shared VHF presets verified.');
