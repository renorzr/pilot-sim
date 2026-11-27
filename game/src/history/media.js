import script from './radio-script.json' with {type:'json'};
import assets from './voice-assets.json' with {type:'json'};
import crew from './crew-cast.json' with {type:'json'};
import openingScript from './opening-script.json' with {type:'json'};
import openingAssets from './opening-assets.json' with {type:'json'};
import {siteUrl} from '../urls.js';
export {script as historicalRadioScript,assets as historicalVoiceAssets};
const entries=new Map(Object.entries(script.zh).flatMap(([event,lines])=>lines.map(([role,,channel],i)=>[`us1549-${event}-${i}`,{event,role,channel}])));
openingScript.zh.forEach(([role,,channel],i)=>entries.set('us1549-opening-'+i,{event:'opening',role,channel}));
export const historicalLine=id=>entries.get(id);
export function historicalVoice(role,language,selected){
 const key=role==='pa'?'pilot':role,list=assets.cast?.[language]?.[key]||[],fixed=crew[language]?.[key];
 if(fixed)return list.includes(fixed)?fixed:null;
 return language==='en'?list[0]:list.includes(selected)?selected:null;
}
export function historicalClip(id,language='zh',selected=null){
 const line=entries.get(id);if(!line)return null;
 const voice=historicalVoice(line.role,language,selected),pack=line.event==='opening'?openingAssets:assets,item=pack.clips?.[language]?.[voice]?.[id];return item?{...item,voice}:null;
}
export function queueHistoricalOpening(s){
 const r=s.radio;r.active=null;r.pending=openingScript.zh.map(([role,text,channel],i)=>({clip:'us1549-opening-'+i,event:'historical-opening',role,text,channel,expires:s.time+60}));r.readyAt=s.time+.35;
}
export function historicalOpeningSeconds(s){const lang=s.radio.language;return Math.max(12,openingScript.zh.reduce((sum,[role],i)=>sum+(historicalClip('us1549-opening-'+i,lang,role==='tower'?s.radio.towerVoice:s.radio.pilotVoice)?.duration||0)+.8,1.1));}
export const historicalClipUrl=(id,language,selected)=>{const item=historicalClip(id,language,selected);return item?siteUrl(item.path)+'?v='+item.sha256.slice(0,16):null;};
export function historicalMediaReady(language){
 const openingReady=openingScript[language]?.every(([role,text,channel],i)=>{const voices=role==='pilot'?[crew[language].pilot]:(assets.cast[language].tower||[]).filter(v=>!Object.values(crew[language]).includes(v));return voices.every(voice=>{const c=historicalClip('us1549-opening-'+i,language,voice);return c&&c.text===text&&c.role===role&&c.channel===channel&&c.duration>0&&c.sha256?.length===64;});});
 return openingReady&&['pilot','tower','copilot'].every(role=>assets.cast?.[language]?.[role]?.length)&&Object.entries(script[language]).every(([event,lines])=>lines.every(([role,text,channel],i)=>assets.cast[language][role==='pa'?'pilot':role].every(voice=>{const c=historicalClip(`us1549-${event}-${i}`,language,voice);return c&&c.text===text&&c.role===role&&c.channel===channel&&c.duration>0&&c.sha256?.length===64;})));
}
export function assignHistoricalCast(r,preferences={}){
 r.pilotVoice=crew.zh.pilot;r.copilotVoice=crew.zh.copilot;
 const choices=(assets.cast?.zh?.tower||[]).filter(v=>v!==r.pilotVoice&&v!==r.copilotVoice),selected=preferences.towerVoice||r.towerVoice;
 r.towerVoice=choices.includes(selected)?selected:choices[Math.min(choices.length-1,Math.floor(Math.random()*choices.length))];
 r.towerVoices={...r.towerVoices,us1549:r.towerVoice};return r;
}
export async function preloadHistoricalSpeech(s,{fetchFn=globalThis.fetch}={}){
 if(!s.historical||!fetchFn)return;const language=s.radio.language,urls=[];
 for(const[id,line]of entries){const selected=line.role==='tower'?s.radio.towerVoice:line.role==='copilot'?s.radio.copilotVoice:s.radio.pilotVoice,url=historicalClipUrl(id,language,selected);if(url)urls.push(url);}
 let next=0;await Promise.all(Array.from({length:3},async()=>{while(next<urls.length){const url=urls[next++];try{const r=await fetchFn(url,{cache:'force-cache'});if(r.ok)await r.arrayBuffer();}catch{}}}));
}
