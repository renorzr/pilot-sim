import english from './en.json' with {type:'json'};
import chineseRadio from '../comms/script.json' with {type:'json'};
import englishRadio from '../comms/script.en.json' with {type:'json'};
const dictionary={...english};
for(const [key,lines]of Object.entries(chineseRadio))lines.forEach(([,text],i)=>{dictionary[text]=englishRadio[key][i][1];});
const han=/\p{Script=Han}/u,escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=Object.entries(dictionary).filter(([key])=>/\{\d+\}/.test(key)).sort((a,b)=>b[0].replace(/\{\d+\}/g,'').length-a[0].replace(/\{\d+\}/g,'').length).map(([key,value])=>({
 expression:new RegExp('^'+key.split(/\{\d+\}/).map(escape).join('(.*?)')+'$'),value,
}));
const fragments=Object.entries(dictionary).filter(([key])=>!key.includes('{')).sort((a,b)=>b[0].length-a[0].length);
const missing=new Set(),listeners=new Set();
let language='zh';try{if(globalThis.localStorage?.getItem('pilot-sim.language')==='en')language='en';}catch{}
export const getLanguage=()=>language;
export const subscribeLanguage=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
function documentLanguage(){if(typeof document==='undefined')return;document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'Skyline · Flight Experience':'云际 · 飞行体验';document.querySelector('meta[name="description"]')?.setAttribute('content',language==='en'?'Take the cockpit seat and experience airliner takeoffs and landings.':'坐进驾驶舱，体验客机起飞与降落。');}
documentLanguage();
export function setLanguage(next){
 if(!['en','zh'].includes(next)||next===language)return;
 language=next;try{globalThis.localStorage?.setItem('pilot-sim.language',language);}catch{}
 documentLanguage();listeners.forEach(listener=>listener());
}
export const missingTranslations=()=>[...missing];
export function t(value,locale=language,depth=0){
 if(typeof value!=='string'||locale!=='en'||!han.test(value))return value;
 const source=value.trim(),leading=value.match(/^\s*/)[0],trailing=value.match(/\s*$/)[0];
 if(dictionary[source]!==undefined)return leading+dictionary[source]+trailing;
 if(depth<6)for(const pattern of patterns){const match=source.match(pattern.expression);if(match)return leading+pattern.value.replace(/\{(\d+)\}/g,(_,i)=>t(match[Number(i)+1],locale,depth+1))+trailing;}
 // Joined status fragments share the same catalog as complete messages.
 let result=source;for(const [key,translated]of fragments){if(result.includes(key))result=result.split(key).join(translated);if(!han.test(result))break;}
 if(han.test(result))missing.add(source);
 return leading+result+trailing;
}
export function localizeProps(props){
 if(!props)return props;
 const localized={...props};
 const child=value=>typeof value==='string'?t(value):Array.isArray(value)?value.map(child):value;
 if('children'in localized)localized.children=child(localized.children);
 for(const key of ['title','aria-label','aria-valuetext','alt','placeholder'])if(typeof localized[key]==='string')localized[key]=t(localized[key]);
 return localized;
}
