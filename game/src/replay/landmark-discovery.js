import {airportShotContext} from './shot-context.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const label=poi=>poi.kind==='terminal'?'航站楼掠影':poi.kind==='building'?'低空掠过':'城市地标';
function windowAt(seg,time,extra){
 const start=Math.max(seg.start,Math.min(time-4,seg.end-8)),end=Math.min(seg.end,start+8);
 return end-start>=4?{segment:seg.id,attempt:seg.attempt,airportId:seg.airportId,time,start,end,discovered:true,...extra}:null;
}
// Scan every valid source span, yielding between small metadata batches. There
// is no global pre-score top-N and no one-visit-per-landmark restriction.
export function* scanLandmarkWindows(recording,{contextFor=airportShotContext,interval=1,includeActions=false,stats={}}={}){
 Object.assign(stats,{points:0,distanceChecks:0,windows:0,actionWindows:0});
 const spans=recording.replaySegments?.()??recording.segments,seen=new Set();let checkpoint=0;
 function emit(seg,time,extra){
  const w=windowAt(seg,time,extra);if(!w)return null;
  const key=[seg.id,extra.poi?.id||extra.type,Math.round(w.start*4)].join(':');if(seen.has(key))return null;
  // Sampling only at proposed windows preserves the airborne boundary without
  // cloning a whole aircraft state for each position/landmark check.
  if(!recording.sample(seg.id,time)?.airborne)return null;
  seen.add(key);if(extra.type==='landmark')stats.windows++;else stats.actionWindows++;return w;
 }
 for(const seg of spans){
  if(seg.end-seg.start<4)continue;
  const targets=contextFor(seg.airportId).landmarks||[],runs=new Map(),actions=new Map();let previous=null;
  function flush(run){
   if(!run)return[];const times=[run.closest];if(Math.abs(run.quality.time-run.closest.time)>2)times.push(run.quality);
   return times.map(p=>emit(seg,p.time,{type:'landmark',poi:run.poi,label:label(run.poi),priority:70+p.quality*3,coarseQuality:p.quality})).filter(Boolean);
  }
  const positions=recording.positionSamples?recording.positionSamples(seg.id,interval,{start:seg.start,end:seg.end,motion:includeActions}):(function*(){for(let t=seg.start;t<=seg.end;t+=interval)yield recording.sample(seg.id,t);})();
  for(const p of positions){
   stats.points++;const a=previous||p;
   if(includeActions&&p.airborne){
    const actionsNow=[];if(Math.abs(p.roll||0)>.11)actionsNow.push(['turn',Math.abs(p.roll),'航迹转弯']);
    if(a.gearPosition>.55&&p.gearPosition<a.gearPosition-.015)actionsNow.push(['gear',a.gearPosition-p.gearPosition,'起落架动作']);
    for(const[type,quality,name]of actionsNow){const slot=Math.floor(p.time/8),key=type+':'+slot,old=actions.get(key);if(!old||quality>old.quality)actions.set(key,{time:p.time,quality,type,label:name});}
   }
   for(const poi of targets){
    stats.distanceChecks++;
    const dx=p.x-a.x,dz=p.z-a.z,u=clamp(((poi.position[0]-a.x)*dx+(poi.position[2]-a.z)*dz)/(dx*dx+dz*dz||1),0,1),x=a.x+dx*u,z=a.z+dz*u,y=a.y+(p.y-a.y)*u,d=Math.hypot(x-poi.position[0],z-poi.position[2]),height=y-(poi.baseY||0),range=poi.kind==='building'?1800:8000;
    const old=runs.get(poi.id);
    if(d>range||height<12||height>1800){for(const w of flush(old))yield w;runs.delete(poi.id);}
    else{
     const stride=d<1200&&height<250?4:8,slot=Math.floor(p.time/stride),quality=(poi.importance||.5)*.4+(1-clamp(d/range,0,1))*.35+clamp(height/(poi.kind==='building'?100:180),0,1)*.25-clamp((height-600)/1200,0,1)*.15,point={time:a.time+(p.time-a.time)*u,d,quality};
     if(!old||old.slot!==slot||old.stride!==stride){for(const w of flush(old))yield w;runs.set(poi.id,{poi,slot,stride,closest:point,quality:point});}
     else{if(d<old.closest.d)old.closest=point;if(quality>old.quality.quality)old.quality=point;}
    }
    if(++checkpoint%32===0)yield null;
   }
   previous=p;if(++checkpoint%32===0)yield null;
  }
  for(const run of runs.values())for(const w of flush(run))yield w;
  for(const action of actions.values()){const w=emit(seg,action.time,{type:action.type,label:action.label,priority:action.type==='turn'?60:75,actionScan:true,actionQuality:Math.min(1,action.quality/.5)});if(w)yield w;yield null;}
 }
}
export function discoverLandmarkWindows(recording,options={}){
 const stats={},windows=[];for(const w of scanLandmarkWindows(recording,{...options,stats}))if(w)windows.push(w);
 return{windows,stats};
}
