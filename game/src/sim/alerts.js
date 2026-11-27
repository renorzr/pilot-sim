// Aural acknowledgement never changes engine status or system capability.
// Electronic cues are a game abstraction, not an aircraft-type ECAM trainer.
export const ALERT_REPEAT_SECONDS=5.7;
export function updateFlightAlerts(s){
 const a=s.alerts??={sequence:0,revision:0,items:[]},wanted=[];
 const failed=(s.engines||[]).filter(e=>e.status==='failed');
 if(failed.length>0&&failed.length===s.engines.length)wanted.push({key:'dual-engine',label:'ALL ENG FAIL',level:'warning',repeat:ALERT_REPEAT_SECONDS});
 else for(const e of failed)wanted.push({key:'engine-'+e.id,label:`ENG ${e.id+1} FAIL`,level:'caution',repeat:0});
 const f=s.mission?.fault;
 if(f?.active&&!['engine','dual'].includes(f.type))wanted.push({key:'system-'+f.type,label:s.mission.alert?.split(' · ')[0]||f.type.toUpperCase(),level:'caution',repeat:0});
 const keys=new Set(wanted.map(v=>v.key));
 const retained=a.items.filter(v=>keys.has(v.key));if(retained.length!==a.items.length){a.items=retained;a.revision++;}
 for(const v of wanted)if(!a.items.some(p=>p.key===v.key)){a.items.push({...v,id:++a.sequence,started:s.time,acknowledged:false});a.revision++;}
 return a;
}
export function acknowledgeAlerts(s){
 const pending=s.alerts?.items.filter(v=>!v.acknowledged)||[];
 for(const v of pending){v.acknowledged=true;v.acknowledgedAt=s.time;}
 if(pending.length)s.alerts.revision++;
 return pending.length>0;
}
