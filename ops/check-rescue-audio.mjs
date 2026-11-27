import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import assets from'../game/src/history/rescue-assets.json'with{type:'json'};
import script from'../game/src/history/rescue-script.json'with{type:'json'};
import actors from'../game/src/failure/cast.json'with{type:'json'};
import crew from'../game/src/history/crew-cast.json'with{type:'json'};
import historical from'../game/src/history/voice-assets.json'with{type:'json'};
let bytes=0;const checked=new Set();
async function verify(item){assert(item.duration>0&&item.duration<20);const data=await readFile(new URL('../public/'+item.path,import.meta.url));assert.equal(data.length,item.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);if(!checked.has(item.path)){checked.add(item.path);bytes+=data.length;}}
for(const lang of['zh','en']){
 for(const[id,line]of Object.entries(script)){const item=assets.speech[lang][id];await verify(item);assert.equal(item.text,line[lang]);assert.equal(item.role,line.role);assert.equal(item.voice,actors[lang][line.speaker].id);assert.equal(item.referenceId,actors[lang][line.speaker].voice);}
 const towers=historical.cast[lang].tower.filter(v=>!Object.values(crew[lang]).includes(v));assert.equal(Object.keys(assets.mixes[lang]).length,towers.length*2);
 for(const tower of towers)for(const outcome of['controlled','damaged']){
  const item=assets.mixes[lang][tower+'.'+outcome];await verify(item);assert(item.duration>=17&&item.duration<20);assert.equal(item.outcome,outcome);assert.deepEqual(item.events.map(e=>e.id),['tower','field','dispatch','response','closing']);
  assert.equal(item.events[0].voice,tower);assert.equal(item.events.at(-1).voice,crew[lang].copilot);assert.equal(item.events.at(-1).profile,'intercom');
  const principal=item.events.slice(1,4);assert.equal(new Set(principal.map(e=>e.voice)).size,3);assert(principal.every(e=>e.duration>2));
  for(const e of item.events){const source=assets.sources[e.sourcePath];assert(source);await verify(source);assert.equal(source.voice,e.voice);assert.equal(source.text,e.text);assert.equal(source.sha256,e.sourceSha256);assert.equal(source.duration,e.duration);assert(e.at>=0&&e.at+e.duration<item.duration);}
  assert(principal.some((a,i)=>principal.slice(i+1).some(b=>Math.min(a.at+a.duration,b.at+b.duration)>Math.max(a.at,b.at))));
  assert(!item.events.some(e=>/confirmed down|确认坠毁|全员获救/i.test(e.text)));
 }
}
console.log(`Successful ditching rescue: 8 complete mixes, ${checked.size} verified source/mix files, fixed crew and three emergency voices; ${(bytes/1048576).toFixed(2)} MiB.`);
