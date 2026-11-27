import assets from './rescue-assets.json' with {type:'json'};
import {siteUrl} from '../urls.js';
const rank=e=>e.profile==='intercom'?100:e.profile==='dispatch'?80:e.profile==='responder'?70:e.profile==='field'?60:40;
export function rescueLine(p){return p?.asset?.events.filter(e=>p.elapsed>=e.at&&p.elapsed<e.at+e.duration).sort((a,b)=>rank(b)-rank(a))[0]||null;}
export function createRescueMedia(s){
 const language=s.radio.language||'zh',tower=language==='en'?'aria':s.radio.towerVoice,outcome=s.result.waterOutcome==='damaged-survival'?'damaged':'controlled',key=tower+'.'+outcome,asset=assets.mixes[language]?.[key];
 if(!asset)return null;
 return{id:`rescue:${s.time}:${key}`,key,asset,language,towerVoice:s.radio.towerVoice,outcome,src:siteUrl(asset.path)+'?v='+asset.sha256.slice(0,16),duration:asset.duration,started:false,preparing:0,elapsed:0,languageChanges:0};
}
export function advanceRescueMedia(p,step,media){
 if(!media){p.started=true;p.elapsed=Math.min(p.duration,p.elapsed+step);return;}
 if(!p.started){p.preparing+=step;if(!media.ready&&!media.bypass&&p.preparing<2)return;p.started=true;}
 if(media.ended)p.elapsed=p.duration;
 else if(!media.bypass&&!p.mediaBypass&&media.playing&&Number.isFinite(media.elapsed)){
  p.mediaStall=media.elapsed>(p.lastMediaElapsed??-1)+.002?0:(p.mediaStall||0)+step;p.lastMediaElapsed=media.elapsed;
  if(p.mediaStall>=2){p.mediaBypass=true;p.elapsed=Math.min(p.duration,p.elapsed+step);}else p.elapsed=Math.max(p.elapsed,Math.min(p.duration,media.elapsed));
 }else p.elapsed=Math.min(p.duration,p.elapsed+step);
}
export function switchRescueLanguage(p,language,media={}){
 if(!p?.active||p.kind!=='history-rescue'||p.language===language)return false;
 if(Number.isFinite(media.elapsed))p.elapsed=Math.max(p.elapsed,Math.min(p.duration,media.elapsed));
 const current=rescueLine(p),key=(language==='en'?'aria':p.towerVoice)+'.'+p.outcome,asset=assets.mixes[language]?.[key];if(!asset)return false;
 const next=current&&asset.events.find(e=>e.id===current.id),elapsed=next?next.at:Math.min(asset.duration,p.elapsed/p.duration*asset.duration);
 Object.assign(p,{key,language,asset,duration:asset.duration,src:siteUrl(asset.path)+'?v='+asset.sha256.slice(0,16),elapsed,started:false,preparing:0,mediaBypass:false,lastMediaElapsed:null,mediaStall:0});p.id+=':'+language+':'+(++p.languageChanges);return true;
}
export async function preloadRescueAudio(s,{fetchFn=globalThis.fetch}={}){
 if(!s.historical||!fetchFn)return;const language=s.radio.language||'zh',tower=language==='en'?'aria':s.radio.towerVoice;
 await Promise.all(['controlled','damaged'].map(async outcome=>{const item=assets.mixes[language]?.[tower+'.'+outcome];if(!item)return;try{const r=await fetchFn(siteUrl(item.path)+'?v='+item.sha256.slice(0,16),{cache:'force-cache'});if(r.ok)await r.arrayBuffer();}catch{}}));
}
