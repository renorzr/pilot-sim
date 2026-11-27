// Add reviewed recipes using existing phrase IDs. New combinations need no new
// whole-sentence recording: build a complete fallback from the same phrase PCM.
import{readFile,writeFile,mkdir,rename}from'node:fs/promises';
import{createHash}from'node:crypto';
import{execFileSync}from'node:child_process';
import{tmpdir}from'node:os';
import{mkdtemp,rm}from'node:fs/promises';
import path from'node:path';
import assert from'node:assert/strict';
import{phrasePCM,joinPhrasePCM}from'../game/src/comms/phrase-audio.js';
const input=process.argv[2];if(!input)throw Error('Usage: node ops/compose-radio-phrase-recipes.mjs recipes.json');
const file=new URL('../game/src/comms/phrase-catalogue.json',import.meta.url),catalogue=JSON.parse(await readFile(file,'utf8')),recipes=JSON.parse(await readFile(input,'utf8'));
assert(Array.isArray(recipes)&&recipes.length>0);const temp=await mkdtemp(path.join(tmpdir(),'radio-recipe-'));
const digest=value=>createHash('sha256').update(value).digest('hex');
const normalize=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
try{
 for(const recipe of recipes){
  const{clip,language,actor,role,text,group,parts}=recipe;assert(/^[a-z0-9-]+$/.test(clip));assert(['pilot','tower'].includes(role));assert(language==='zh'?['e','g','h','j','xiaoxiao'].includes(actor):language==='en'&&actor===(role==='pilot'?'guy':'aria'));
  assert(parts.length>=2);const records=parts.map(id=>{const p=catalogue.phrases[id];assert(p&&p.actor===actor&&p.role===role&&p.language===language);return p;});assert.equal(normalize(records.map(p=>p.text).join('')),normalize(text));
  const pcm=await Promise.all(records.map(async p=>{const bytes=await readFile(new URL('../public/'+p.file,import.meta.url));assert.equal(digest(bytes),p.sha256);return phrasePCM(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),p);}));
  const gapMs=recipe.gapMs??(language==='zh'?90:70);assert(gapMs>=0&&gapMs<=300);const wav=joinPhrasePCM(pcm,gapMs),duration=(wav.byteLength-44)/48000,source=path.join(temp,'source.wav'),target=path.join(temp,'fallback.mp3');await writeFile(source,new Uint8Array(wav));
  execFileSync('ffmpeg',['-v','error','-nostdin','-y','-i',source,'-ar','24000','-ac','1','-b:a','48k',target]);const bytes=await readFile(target),sha256=digest(bytes),name=`assets/radio/phrases/fallback/${language}-${actor}-${clip}-${sha256.slice(0,16)}.mp3`,url=new URL('../public/'+name,import.meta.url);await mkdir(new URL('./',url),{recursive:true});await writeFile(url,bytes);
  const measured=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',target],{encoding:'utf8'}));
  catalogue.clips[`${language}:${actor}:${clip}`]={text,role,language,actor,group,parts,gapMs,duration,budget:Math.max(duration,measured),source:{kind:'assembled',file:name,sha256,duration:measured}};
 }
 delete catalogue.fingerprint;catalogue.fingerprint=digest(JSON.stringify(catalogue));await writeFile(new URL('./phrase-catalogue.json.next',file),JSON.stringify(catalogue,null,2)+'\n');await rename(new URL('./phrase-catalogue.json.next',file),file);console.log('Composed',recipes.length,'recipes and complete fallbacks from shared phrases');
}finally{await rm(temp,{recursive:true,force:true});}
