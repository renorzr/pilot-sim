import script from './radio-script.json' with {type:'json'};
import assets from './voice-assets.json' with {type:'json'};
import {siteUrl} from '../urls.js';
export {script as historicalRadioScript,assets as historicalVoiceAssets};
const entries=new Map(Object.entries(script.zh).flatMap(([event,lines])=>lines.map(([role,,channel],i)=>[`us1549-${event}-${i}`,{event,role,channel}])));
export const historicalLine=id=>entries.get(id);
export function historicalVoice(role,language,selected){
 const list=assets.cast?.[language]?.[role==='pa'?'pilot':role]||[];
 return language==='en'?list[0]:list.includes(selected)?selected:null;
}
export function historicalClip(id,language='zh',selected=null){
 const line=entries.get(id);if(!line)return null;
 const voice=historicalVoice(line.role,language,selected),item=assets.clips?.[language]?.[voice]?.[id];return item?{...item,voice}:null;
}
export const historicalClipUrl=(id,language,selected)=>{const item=historicalClip(id,language,selected);return item?siteUrl(item.path)+'?v='+item.sha256.slice(0,16):null;};
export function historicalMediaReady(language){
 return ['pilot','tower','copilot'].every(role=>assets.cast?.[language]?.[role]?.length)&&Object.entries(script[language]).every(([event,lines])=>lines.every(([role,text,channel],i)=>assets.cast[language][role==='pa'?'pilot':role].every(voice=>{const c=historicalClip(`us1549-${event}-${i}`,language,voice);return c&&c.text===text&&c.role===role&&c.channel===channel&&c.duration>0&&c.sha256?.length===64;})));
}
export function assignHistoricalCast(r,preferences={}){
 const defaults=['e','g','h','j','xiaoxiao'],cast=assets.cast?.zh||{},list=role=>cast[role]?.length?cast[role]:defaults;
 r.pilotVoice=list('pilot').includes(preferences.pilotVoice)?preferences.pilotVoice:list('pilot').includes(r.pilotVoice)?r.pilotVoice:list('pilot')[0];
 r.towerVoice=list('tower').find(v=>v===(preferences.towerVoice||r.towerVoice)&&v!==r.pilotVoice)||list('tower').find(v=>v!==r.pilotVoice);
 r.copilotVoice=list('copilot').find(v=>v===preferences.copilotVoice&&v!==r.pilotVoice&&v!==r.towerVoice)||list('copilot').find(v=>v!==r.pilotVoice&&v!==r.towerVoice);
 r.towerVoices={...r.towerVoices,us1549:r.towerVoice};return r;
}
export async function preloadHistoricalSpeech(s,{fetchFn=globalThis.fetch}={}){
 if(!s.historical||!fetchFn)return;const language=s.radio.language,urls=[];
 for(const[id,line]of entries){const selected=line.role==='tower'?s.radio.towerVoice:line.role==='copilot'?s.radio.copilotVoice:s.radio.pilotVoice,url=historicalClipUrl(id,language,selected);if(url)urls.push(url);}
 let next=0;await Promise.all(Array.from({length:3},async()=>{while(next<urls.length){const url=urls[next++];try{const r=await fetchFn(url,{cache:'force-cache'});if(r.ok)await r.arrayBuffer();}catch{}}}));
}
