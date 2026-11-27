import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import script from'../game/src/history/opening-script.json'with{type:'json'};import assets from'../game/src/history/opening-assets.json'with{type:'json'};
let count=0;for(const lang of['zh','en'])for(const[voice,clips]of Object.entries(assets.clips[lang]))for(const[id,item]of Object.entries(clips)){
 const i=Number(id.at(-1)),[role,text,channel]=script[lang][i];assert.equal(item.role,role);assert.equal(item.text,text);assert.equal(item.channel,channel);assert.equal(item.voice,voice);assert(item.duration>.5&&item.duration<10);assert(item.path.startsWith('assets/radio/us1549/opening/'));
 const data=await readFile(new URL('../public/'+item.path,import.meta.url));assert.equal(data.length,item.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);
 if(lang==='zh'){assert.equal(item.provider,'approved-same-actor-excerpts');for(const source of item.sources){assert(source.path.includes('/'+voice+'/'));const bytes=await readFile(new URL('../public/'+source.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);assert(source.range[0]>=0&&source.range[1]>source.range[0]);}}
 count++;
}assert.equal(count,6);console.log('Historical opening: six complete same-actor Chinese/English normal calls, approved source ranges and content hashes verified.');
