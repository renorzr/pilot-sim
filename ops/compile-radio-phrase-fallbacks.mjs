// Cold playback uses the same phrase performance as a warm PCM assembly.
// This is encoding shared recordings, never synthesizing another sentence.
import{readFile,writeFile,mkdir,mkdtemp,rm}from'node:fs/promises';
import{execFileSync}from'node:child_process';
import{createHash}from'node:crypto';
import{tmpdir}from'node:os';
import path from'node:path';
import{phrasePCM,joinPhrasePCM}from'../game/src/comms/phrase-audio.js';
const root=new URL('../',import.meta.url),file=new URL('game/src/comms/phrase-catalogue.json',root),pack=JSON.parse(await readFile(file,'utf8')),hash=data=>createHash('sha256').update(data).digest('hex'),cache=new Map(),pcm=new Map(),temp=await mkdtemp(path.join(tmpdir(),'phrase-fallback-'));let count=0;
await mkdir(new URL('public/assets/radio/phrases/fallback/',root),{recursive:true});
try{
 for(const plan of Object.values(pack.clips)){
  if(!plan.parts.length)continue;
  const recipe=hash(JSON.stringify([plan.parts.map(id=>pack.phrases[id].sha256),plan.gapMs]));let record=cache.get(recipe);
  if(!record&&plan.fallback?.recipe===recipe){const data=await readFile(new URL('public/'+plan.fallback.file,root));if(hash(data)===plan.fallback.sha256)record=plan.fallback;}
  if(!record){
   const parts=[];for(const id of plan.parts){if(!pcm.has(id)){const p=pack.phrases[id],b=await readFile(new URL('public/'+p.file,root));if(hash(b)!==p.sha256)throw Error('Phrase identity changed');pcm.set(id,phrasePCM(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),p));}parts.push(pcm.get(id));}
   const wav=joinPhrasePCM(parts,plan.gapMs),source=path.join(temp,'source.wav'),target=path.join(temp,'result.mp3');await writeFile(source,new Uint8Array(wav));
   execFileSync('ffmpeg',['-v','error','-nostdin','-y','-threads','1','-i',source,'-ar','24000','-ac','1','-b:a','48k',target]);const data=await readFile(target),sha256=hash(data),name=`assets/radio/phrases/fallback/${sha256.slice(0,32)}.mp3`;await writeFile(new URL('public/'+name,root),data);
   const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',target],{encoding:'utf8'}));record={kind:'assembled',recipe,file:name,sha256,bytes:data.length,duration};count++;if(count%50===0)console.log('ENCODED',count);
  }
  cache.set(recipe,record);plan.fallback=record;plan.budget=Math.max(plan.budget,record.duration);
 }
 delete pack.fingerprint;pack.fingerprint=hash(JSON.stringify(pack));await writeFile(file,JSON.stringify(pack,null,2)+'\n');console.log('Complete phrase fallbacks:',cache.size,'unique,',count,'new encodes');
}finally{await rm(temp,{recursive:true,force:true});}
