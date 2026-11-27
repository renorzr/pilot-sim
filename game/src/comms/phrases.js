import catalogue from './phrase-catalogue.json' with {type:'json'};
import {siteUrl} from '../urls.js';

export const RADIO_PHRASE_VERSION=catalogue.fingerprint;
export const RADIO_PHRASES=catalogue.phrases;
export const RADIO_PHRASE_CLIPS=catalogue.clips;
export function radioPhrasePlan(clip,language='zh',voice=null){
 const actors=language==='zh'?[voice]:['guy','aria'];
 for(const actor of actors){const key=`${language}:${actor}:${clip}`,plan=catalogue.clips[key];if(plan)return{...plan,key:`${catalogue.fingerprint}:${key}`};}
 return null;
}
export const phraseSourceUrl=plan=>siteUrl(`${plan.source.file}?v=${plan.source.sha256.slice(0,16)}`);
export function radioPhrasePrefetch(s){
 const r=s.radio;if(!r)return[];
 const language=r.language||'zh',groups=new Set([s.airportId||'training','ground',...(s.airline?['airline']:[])]);
 return Object.entries(catalogue.clips).filter(([,p])=>p.language===language&&groups.has(p.group)&&(language==='en'||p.actor===(p.role==='pilot'?r.pilotVoice:r.towerVoice))).map(([key,p])=>({...p,key:`${catalogue.fingerprint}:${key}`}));
}
