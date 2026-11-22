import {LEVELS,ALL_MISSIONS,getLevel,starsFor} from './catalog.js';
const KEY='pilot-sim.levels.v1';
export function normalizeProgress(value){
 const levels={};
 for(const l of ALL_MISSIONS){const entry=value?.levels?.[l.id];if(entry&&(entry.revision??1)>=(l.revision??1)&&Number.isFinite(entry.bestScore)&&entry.bestScore>=0&&entry.bestScore<=100)levels[l.id]={bestScore:Math.round(entry.bestScore),stars:starsFor(Math.round(entry.bestScore)),revision:l.revision??1};}
 return {version:2,levels};
}
export function loadProgress(storage){try{return normalizeProgress(JSON.parse(storage.getItem(KEY)));}catch{return normalizeProgress(null);}}
export function saveProgress(storage,progress){try{storage.setItem(KEY,JSON.stringify(normalizeProgress(progress)));return true;}catch{return false;}}
export const recommendedLevel=progress=>LEVELS.find(l=>!progress.levels[l.id])||LEVELS[0];
export function recordResult(progress,s){
 if(!getLevel(s.levelId)||!s.result?.success||!s.result.levelCleared||s.mission?.practice||!Number.isFinite(s.result.score))return progress;
 const previous=progress.levels[s.levelId]?.bestScore??-1,score=Math.max(previous,Math.round(s.result.score));
 if(score===previous)return progress;
 return normalizeProgress({...progress,levels:{...progress.levels,[s.levelId]:{bestScore:score,revision:getLevel(s.levelId).revision??1}}});
}
