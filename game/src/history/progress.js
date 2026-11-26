// Historical modes and scenario revisions never overwrite training records.
const KEY='pilot-sim.history.us1549.v1';
export function normalizeHistoricalProgress(value){
 const records={};if(value?.version===1&&value.records&&!Array.isArray(value.records))for(const[key,r]of Object.entries(value.records)){
  if(!/^history-us1549:(guided|challenge):\d+$/.test(key)||!r||!['guided','challenge'].includes(r.mode)||!Number.isInteger(r.revision)||r.revision<1||!Number.isFinite(r.bestScore)||r.bestScore<0||r.bestScore>100||key!==`history-us1549:${r.mode}:${r.revision}`)continue;
  records[key]={bestScore:Math.round(r.bestScore),mode:r.mode,revision:r.revision};
 }return{version:1,records};
}
export function loadHistoricalProgress(storage){try{return normalizeHistoricalProgress(JSON.parse(storage?.getItem(KEY)));}catch{return normalizeHistoricalProgress(null);}}
export function recordHistoricalResult(progress,s){
 const h=s.historical,r=s.result;if(!h||!r?.levelCleared||!r.physicalSuccess||h.earlyTakeover||s.mission.practice||!['guided','challenge'].includes(h.mode)||!Number.isFinite(r.score))return progress;
 const key=h.id+':'+h.mode+':'+h.revision,score=Math.round(Math.max(0,Math.min(100,r.score))),old=progress.records[key];
 if(old&&old.bestScore>=score)return progress;return{version:1,records:{...progress.records,[key]:{bestScore:score,mode:h.mode,revision:h.revision}}};
}
export function saveHistoricalProgress(storage,progress){try{storage?.setItem(KEY,JSON.stringify(progress));return!!storage;}catch{return false;}}
