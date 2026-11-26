import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),script=JSON.parse(await readFile(resolve(root,'game/src/history/radio-script.json'))),assets=JSON.parse(await readFile(resolve(root,'game/src/history/voice-assets.json'))),cast=JSON.parse(await readFile(resolve(root,'game/src/comms/pilot-voices.json')));
assert.deepEqual(Object.keys(script.zh),Object.keys(script.en));let count=0,total=0;
for(const language of['zh','en']){
 const voices=assets.cast[language];assert(voices);
 for(const role of['pilot','tower','copilot'])assert(voices[role]?.length);
 if(language==='zh')for(const role of['pilot','tower','copilot'])assert.deepEqual(voices[role],Object.keys(cast.voices));
 else{assert.deepEqual(voices.pilot,['guy']);assert.deepEqual(voices.tower,['aria']);assert.deepEqual(voices.copilot,['andrew']);}
 for(const[event,lines]of Object.entries(script[language])){
  assert.equal(lines.length,script.zh[event].length);
  for(const[i,[role,text,channel]]of lines.entries()){
   assert.equal(role,script.zh[event][i][0]);assert.equal(channel,script.zh[event][i][2]);assert(['vhf','intercom','pa'].includes(channel));
   if(event==='mayday')assert.equal((text.match(/MAYDAY/g)||[]).length,3);
   for(const voice of voices[role==='pa'?'pilot':role]){
    const id=`us1549-${event}-${i}`,item=assets.clips[language]?.[voice]?.[id];assert(item,`${language}/${voice}/${id}`);assert.equal(item.text,text);assert.equal(item.role,role);assert.equal(item.channel,channel);assert(item.path.startsWith(`assets/radio/us1549/${language}/${voice}/`));assert(!item.path.includes('..'));assert(item.duration>.3&&item.duration<22);
    assert.equal(item.provider,language==='zh'&&voice!=='xiaoxiao'?'s2.1-pro-free':'edge-tts');
    const path=resolve(root,'public',item.path),data=await readFile(path);assert.equal(data.byteLength,item.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);
    if(process.argv.includes('--audio')){const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=sample_rate,channels,codec_name','-of','json',path]));assert.equal(probe.streams[0].codec_name,'mp3');assert.equal(probe.streams[0].sample_rate,'24000');assert.equal(probe.streams[0].channels,1);assert(Math.abs(Number(probe.format.duration)-item.duration)<.025);}
    count++;total+=item.bytes;
   }
  }
 }
}
const source=JSON.parse(await readFile(resolve(root,'public/assets/maps/us1549-source.json')));assert.equal(source.event,'US Airways Flight 1549');
console.log(`US1549: ${count} original bilingual recordings, five approved Chinese voices, Guy/Aria/Andrew, roles/channels/text/hashes${process.argv.includes('--audio')?'/measured audio':''} verified; ${(total/1048576).toFixed(2)} MiB.`);
