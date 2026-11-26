import assets from './voice-assets.json' with {type:'json'};
import {siteUrl} from '../urls.js';
const hash=value=>{let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const transmissionRank=e=>e.profile==='confirmation'?100:e.role==='instructor'?80:e.profile==='dispatch'?75:e.profile==='responder'?65:e.profile==='field'?60:e.role==='tower'?40:10;
export function failureKind(s){
 if(!s.result||s.result.success)return null;
 if(s.result.physicalSuccess)return 'procedural';
 if(s.water?.fatal||s.impact?.type==='water')return 'water';
 if(s.impact?.type==='runway'||s.historical?.alternate||s.historical?.runwayContact||s.touchdown&&(s.touchdown.descent>=6.5||s.touchdown.gearPosition<.98||/接地|起落架|抬头/.test(s.result.title))||!s.airborne&&/冲出跑道|滑出跑道/.test(s.result.title))return 'runway';
 if(s.impact)return s.airborne?'land':'runway';
 return 'procedural';
}
export function failureMixKey(s,{repeat=0,seed=0}={}){
 const kind=failureKind(s);if(!kind)return null;
 const variant=hash(seed+':'+s.levelId+':'+s.time)%2?'b':'a';if(kind==='procedural')return kind+'.'+variant;
 const lang=s.radio?.language||'zh',tower=lang==='en'?'aria':s.radio?.towerVoice;
 return [kind,s.historical?'history':'generic',tower,variant,repeat?'short':'long'].join('.');
}
export function createFailurePrelude(s,{repeat=0,seed=0}={}){
 const key=failureMixKey(s,{repeat,seed});if(!key)return null;
 const language=s.radio?.language||'zh',asset=assets.mixes?.[language]?.[key];
 // Invalid/unavailable cast data must never substitute a different speaker.
 if(!asset)return null;
 return{id:`${seed}:${s.levelId}:${s.time}:${repeat}`,key,kind:asset.kind,language,towerVoice:s.radio?.towerVoice,asset,src:siteUrl(asset.path)+'?v='+asset.sha256.slice(0,16),active:true,paused:false,started:false,elapsed:0,preparing:0,revealElapsed:0,opacity:1,waiting:false,skipped:false,languageChanges:0};
}
export function advanceFailurePrelude(p,dt,{visible=true,replayReady=false,media={}}={}){
 if(!p?.active||p.paused||!visible)return;
 const step=clamp(Number.isFinite(dt)?dt:0,0,.5);
 if(!p.started){
  p.preparing+=step;
  if(!media.ready&&!media.bypass&&p.preparing<2)return;
  p.started=true;
 }
 if(media.ended)p.elapsed=p.asset.duration;
 else if(!media.bypass&&!p.mediaBypass&&media.playing&&Number.isFinite(media.elapsed)){
  p.mediaStall=media.elapsed>(p.lastMediaElapsed??-1)+.002?0:(p.mediaStall||0)+step;p.lastMediaElapsed=media.elapsed;
  if(p.mediaStall>=2){p.mediaBypass=true;p.elapsed=Math.min(p.asset.duration,p.elapsed+step);}else p.elapsed=Math.max(p.elapsed,Math.min(p.asset.duration,media.elapsed));
 }else p.elapsed=Math.min(p.asset.duration,p.elapsed+step);
 if(p.elapsed>=p.asset.revealAt&&replayReady)p.revealElapsed=Math.min(.9,p.revealElapsed+step);
 const u=clamp(p.revealElapsed/.9);p.opacity=1-u*u*(3-2*u);
 p.waiting=p.elapsed>=p.asset.duration&&!replayReady;
 if(p.elapsed>=p.asset.duration&&p.revealElapsed>=.9){p.active=false;p.opacity=0;}
}
export function finishFailurePrelude(p){if(!p)return;p.active=false;p.skipped=true;p.elapsed=p.asset.duration;p.revealElapsed=.9;p.opacity=0;p.waiting=false;}
export function pauseFailurePrelude(p,media={}){if(!p?.active)return;if(Number.isFinite(media.elapsed))p.elapsed=Math.max(p.elapsed,Math.min(p.asset.duration,media.elapsed));p.paused=true;}
export function switchFailureLanguage(p,language,media={}){
 if(!p?.active||p.language===language)return false;
 if(Number.isFinite(media.elapsed))p.elapsed=Math.max(p.elapsed,Math.min(p.asset.duration,media.elapsed));
 const current=p.asset.events.filter(e=>p.elapsed>=e.at&&p.elapsed<e.at+e.duration&&e.role!=='background').sort((a,b)=>transmissionRank(b)-transmissionRank(a))[0];
 const parts=p.key.split('.');if(p.kind!=='procedural')parts[2]=language==='en'?'aria':p.towerVoice;
 const key=parts.join('.'),asset=assets.mixes?.[language]?.[key];if(!asset)return false;
 const next=current&&asset.events.find(e=>e.id===current.id),elapsed=next?next.at:Math.min(asset.duration,p.elapsed/p.asset.duration*asset.duration);
 Object.assign(p,{key,language,asset,src:siteUrl(asset.path)+'?v='+asset.sha256.slice(0,16),elapsed,started:false,preparing:0,waiting:false,mediaStall:0,lastMediaElapsed:null,mediaBypass:false});p.id+=':'+language+':'+(++p.languageChanges);return true;
}
export function failureStatus(p){
 if(!p)return null;
 const candidates=p.asset.events.filter(e=>p.elapsed>=e.at&&p.elapsed<e.at+e.duration&&e.role!=='background');
 const line=candidates.sort((a,b)=>transmissionRank(b)-transmissionRank(a))[0]||null;
 return{id:p.id,key:p.key,kind:p.kind,active:p.active,paused:p.paused,started:p.started,elapsed:p.elapsed,duration:p.asset.duration,opacity:p.opacity,revealing:p.revealElapsed>0,waiting:p.waiting,mediaBypass:!!p.mediaBypass,short:p.key.endsWith('.short'),line:line?{role:line.role,text:line.text,voice:line.voice,confirmation:line.profile==='confirmation'}:null};
}
export async function preloadFailureAudio(s,{fetchFn=globalThis.fetch}={}){
 if(!fetchFn)return;const lang=s.radio?.language||'zh',tower=lang==='en'?'aria':s.radio?.towerVoice,context=s.historical?'history':'generic';
 const paths=Object.entries(assets.mixes?.[lang]||{}).filter(([key])=>key.startsWith('procedural.')||key.includes(`.${context}.${tower}.`)).map(([,item])=>siteUrl(item.path)+'?v='+item.sha256.slice(0,16));
 let i=0;await Promise.all(Array.from({length:2},async()=>{while(i<paths.length){try{const r=await fetchFn(paths[i++],{cache:'force-cache'});if(r.ok)await r.arrayBuffer();}catch{}}}));
}
