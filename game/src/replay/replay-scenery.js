import {replayFrame} from './highlights.js';
const options=(frame,panel)=>({view:{mode:'exterior'},replay:{...frame.shot,panel},dt:0});
const key=clip=>`${clip.segment}:${clip.id}:${clip.start}`;
// Base airport readiness includes the overview, aircraft and compact city models.
// Optional imagery/nearby detail keeps streaming; a replay cut must never wait
// for every request spawned by an unrelated camera or a previous shot.
export function prepareReplayScenery(worlds,replay,panel){
 if(!replay)return;
 if(!replay.planning||!replay.backgroundPlanning)replay.director?.step({startIndex:replay.clips.length?(replay.index+1)%replay.clips.length:0});
 if(replay.planning){replay.loading=true;return;}
 if(!replay.clips.length){replay.loading=false;return;}
 replay.director?.ensure(replay.index);
 const frame=replayFrame(replay);if(!frame)return;
 if(worlds.current()?.id!==frame.state.airportId)worlds.useAirport(frame.state.airportId,{retainPrevious:true});
 worlds.prepareReplayFrame(frame.state,options(frame,panel),key(frame.clip));
 replay.loading=!worlds.ready();
 // Start the next distinct airport early, including when several consecutive
 // clips use this airport. The two-world cache also holds it on later loops.
 const next=Array.from({length:replay.clips.length-1},(_,i)=>replay.clips[(replay.index+i+1)%replay.clips.length]).find(c=>c.airportId!==frame.state.airportId);
 if(next){
  worlds.prefetch(next.airportId);
  const nextFrame=replayFrame({...replay,index:next.id,elapsed:0});
  worlds.prepareReplayFrame(nextFrame.state,options(nextFrame,panel),key(next));
 }
}
