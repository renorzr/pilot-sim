import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import{RADIO_PACKS}from'../game/src/comms/radio-packs.js';
import voices from'../game/src/comms/pilot-voices.json'with{type:'json'};
import cleanEnglish from'../game/src/comms/english-pilot-clean.json'with{type:'json'};
import zh from'../game/src/comms/script.json'with{type:'json'};
import en from'../game/src/comms/script.en.json'with{type:'json'};
import durations from'../game/src/comms/durations.en.json'with{type:'json'};
const protectedEvents=new Set(['engine','dual','engine-stable','flaps','distress-wind','distress-terrain','distress-stall','distress-cancel']);
const output=[];
for(const language of['zh','en'])for(const[prefix,script,pack]of[['',language==='zh'?zh:en,null],...Object.entries(RADIO_PACKS).map(([id,p])=>[id+'-',p[language],p])])for(const[event,lines]of Object.entries(script)){
 if(protectedEvents.has(event))continue;
 for(const[index,[role,text]]of lines.entries()){
  if(!['pilot','tower'].includes(role))continue;
  const clip=prefix+event+'-'+index;
  for(const actor of language==='zh'?Object.keys(voices.voices):[role==='pilot'?'guy':'aria']){
   let file,duration;
   if(language==='zh'){
    const record=voices.voices[actor].clips[clip],source=role==='pilot'?record.clean:record;if(!source)throw Error('Missing approved source '+actor+':'+clip);
    file='assets/radio/pilots/'+actor+'/'+source.file;duration=source.duration;
   }else if(role==='pilot'){
    const source=cleanEnglish.clips[clip];file='assets/radio/en/pilots/'+source.file;duration=source.duration;
   }else{file='assets/radio/en/'+clip+'.mp3';duration=pack?.durations.en[clip]??durations[clip];}
   const bytes=await readFile(new URL('../public/'+file,import.meta.url));
   output.push({clip,group:prefix?prefix.slice(0,-1):'training',language,actor,role,text,file,duration,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
 }
}
await mkdir('qa/radio-production',{recursive:true});await writeFile('qa/radio-production/sources.json',JSON.stringify(output,null,2)+'\n');console.log('Exported',output.length,'routine speech sources; emergencies and historical performances excluded');
