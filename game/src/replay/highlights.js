import {scanLandmarkWindows} from './landmark-discovery.js';
import {createShotDirector,shotStyle} from './shot-director.js';
const labels={takeoff:'抬轮离地',touchdown:'主轮接地','water-contact':'首次入水',afloat:'稳定漂浮',turn:'航迹转弯',fault:'异常处置',goaround:'复飞爬升',final:'最后进近',parked:'停靠机位',complete:'任务收尾',failure:'任务结束前',start:'飞行片段'};
const priority={failure:100,touchdown:95,takeoff:90,goaround:85,fault:80,final:80,turn:60,complete:30,start:10};
const now=()=>globalThis.performance?.now?.()??Date.now();
const hash=s=>{let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
function normalize(c,id){return{...c,id,recordedDuration:c.end-c.start,duration:Math.max(3,c.end-c.start),eventOffset:c.time-c.start,shot:['takeoff','touchdown'].includes(c.type)?'ground':['final','failure'].includes(c.type)?'tower':'air'};}
function eventCandidates(recording){
 const path=recording.replaySegments?.()??recording.segments.filter(s=>s.attempt===recording.attempt),segments=path.filter(s=>s.count>1&&s.end>s.start),candidates=[];
 for(const seg of segments){
  const source=recording.events.filter(e=>e.segment===seg.id&&e.time>=seg.start&&e.time<=seg.end),events=source.filter(e=>e.type!=='parked'&&(e.type!=='complete'||recording.sample(seg.id,e.time)?.airborne));
  if(!source.length){const a=recording.sample(seg.id,seg.start),b=recording.sample(seg.id,seg.end);if(a.airborne||b.airborne||Math.hypot(a.x-b.x,a.z-b.z)>50)events.push({type:'start',segment:seg.id,time:(seg.start+seg.end)/2});}
  for(const event of events){
   const before=event.type==='failure'?7:event.type==='takeoff'?2:5,after=event.type==='touchdown'?3:event.type==='takeoff'?6:4;let start=Math.max(seg.start,event.time-before),end=Math.min(seg.end,event.time+after);
   if(end-start<6){start=Math.max(seg.start,end-8);end=Math.min(seg.end,start+8);}
   candidates.push({...event,start,end,airportId:seg.airportId,label:labels[event.type],priority:event.type==='turn'&&seg.airportId===segments[0]?.airportId?77:priority[event.type]||10});
  }
 }
 return candidates.map(normalize);
}
function cameraClip(clip,camera){const c={...clip,camera,...(camera.family==='setting'&&camera.landmark?{poi:camera.landmark}:{})};if(camera.window){const {start,end,time}=camera.window;Object.assign(c,{start,end,time,duration:end-start,recordedDuration:end-start,eventOffset:time-start});}return c;}
const overlaps=(a,b)=>a.segment===b.segment&&Math.min(a.end,b.end)-Math.max(a.start,b.start)>.45*Math.min(a.end-a.start,b.end-b.start);
function selectScored(pool,engine,{seed,limit=6}={}){
 const options=[];
 for(const [index,c]of pool.entries()){
  let usable=engine.options(index).filter(p=>c.type!=='landmark'||p.family==='setting');
  if(c.type==='failure'){const wide=usable.filter(p=>p.family==='ground'||p.family==='air');if(wide.length)usable=wide;}
  for(const camera of usable)options.push({...cameraClip(c,camera),candidateIndex:index});
  if(!usable.length&&c.type!=='landmark'&&!c.discovered)options.push({...cameraClip(c,engine.plan(index)),candidateIndex:index,fallback:true});
 }
 const selected=[],origin=pool[0]?.airportId;
 const coverage=c=>({failure:6,'water-contact':5,afloat:4,touchdown:5,takeoff:4,goaround:3,fault:3,final:2}[c.type]||(c.type==='turn'&&c.airportId===origin?1:0));
 const key=c=>c.type+':'+c.airportId;
 function eligible(c){return!selected.some(p=>overlaps(p,c))&&!selected.some(p=>c.type!=='landmark'&&key(p)===key(c))&&(!c.poi||selected.filter(p=>p.airportId===c.airportId&&p.poi?.id===c.poi.id).length<2)&&!selected.some(p=>c.poi&&p.poi?.id===c.poi.id&&p.airportId===c.airportId&&shotStyle(p.camera)===shotStyle(c.camera));}
 function quality(c){
  let same=0,family=0,airport=false,subject=false;
  for(const p of selected){if(shotStyle(p.camera)===shotStyle(c.camera))same++;if(p.camera.family===c.camera.family)family++;if(p.airportId===c.airportId)airport=true;if(c.poi&&p.poi?.id===c.poi.id&&p.airportId===c.airportId)subject=true;}
  return(c.camera.score??40)+(c.actionQuality||0)*3+(airport?0:4)+(same?0:4)-same*9-family*1.5-(subject?7:0)-(c.fallback?20:0)+hash(seed+':'+c.segment+':'+c.start+':'+shotStyle(c.camera))%1000/2000;
 }
 const hasMeaningful=options.some(c=>c.type!=='start'&&!c.fallback);
 function best(candidates){let best=null,score=-Infinity;for(const c of candidates){if(c.type==='start'&&hasMeaningful||!eligible(c))continue;const q=quality(c);if(q>score||q===score&&c.time>best.time){best=c;score=q;}}return best;}
 // Coverage is applied only after every window and its camera options have
 // completed geometric scoring. Within a milestone, the best view wins.
 const groups=new Map();for(const c of options)if(coverage(c))groups.set(key(c),Math.max(groups.get(key(c))||0,coverage(c)));
 for(const [group]of [...groups].sort((a,b)=>b[1]-a[1])){const c=best(options.filter(p=>key(p)===group));if(c)selected.push(c);if(selected.length===limit)break;}
 while(selected.length<limit){const c=best(options);if(!c)break;selected.push(c);}
 return selected.sort((a,b)=>a.segment-b.segment||a.start-b.start).map((c,id)=>({...c,id}));
}
export function createReplay(recording,{airportId=null,directorOptions={},background=false,preferFailure=false}={}){
 const replay={recording,clips:[],index:0,startIndex:0,elapsed:0,paused:false,planning:true,backgroundPlanning:background,loading:true,settling:false,readyKey:null,fade:0,cycles:0};
 const pool=eventCandidates(recording),discovery={},scanner=scanLandmarkWindows(recording,{contextFor:directorOptions.contextFor,includeActions:true,stats:discovery});let timer=null,disposed=false,phase='discovery',engine=null,scanMs=0,selectionMs=0,batches=0,maxBatchMs=0,finishedAt=null,candidateReports=[],selectedReports=[];
 const seed=directorOptions.seed??recording.seed,startedAt=now();
 function finish(){
  const started=now();replay.clips=selectScored(pool,engine,{seed});const failure=preferFailure?replay.clips.findIndex(c=>c.type==='failure'&&(!airportId||c.airportId===airportId)):-1;replay.index=failure>=0?failure:Math.max(0,replay.clips.findIndex(c=>c.airportId===airportId));replay.startIndex=replay.index;replay.planning=false;phase='ready';
  candidateReports=engine.stats().reports.map(r=>({...r,event:pool[r.index].type,time:pool[r.index].time,airportId:pool[r.index].airportId,poiId:pool[r.index].poi?.id}));selectedReports=replay.clips.map((c,index)=>({...candidateReports[c.candidateIndex],index,candidateIndex:c.candidateIndex,selected:c.camera.template,framing:c.camera.framing,score:c.camera.score??null,fallback:!!c.fallback}));selectionMs+=now()-started;finishedAt=now();
 }
 function step({budgetMs=2,maxSamples=256}={}){
  if(disposed||phase==='ready')return;const start=now();batches++;
  if(phase==='discovery'){
   let count=0;while(count++<maxSamples&&now()-start<budgetMs){const next=scanner.next();if(next.done){engine=createShotDirector(recording,pool,{...directorOptions,deferSelection:true});phase='scoring';break;}if(next.value){const c=next.value;if(c.type==='turn'&&c.airportId===pool[0]?.airportId)c.priority=77;pool.push(normalize(c,pool.length));}}
   scanMs+=now()-start;
  }
  if(phase==='scoring'){
   engine.step({budgetMs:Math.max(0,budgetMs-(now()-start)),maxSamples});if(engine.progress().plannedClips===pool.length)finish();
  }
  maxBatchMs=Math.max(maxBatchMs,now()-start);
 }
 replay.director={
  dispose(){disposed=true;if(timer!==null)clearTimeout(timer);timer=null;scanner.return();},
  ensure:index=>replay.clips[index]?.camera??null,
  step,
  complete(){if(disposed)return this.stats();if(timer!==null){clearTimeout(timer);timer=null;}while(phase==='discovery')step({budgetMs:Infinity,maxSamples:100000});if(phase==='scoring'){engine.complete();finish();}return this.stats();},
  stats(){const progress=engine?.progress()||{plannedClips:0,totalClips:pool.length,samplesEvaluated:0,planningMs:0};return{seed,phase,plannedClips:replay.planning?0:replay.clips.length,totalClips:replay.clips.length,plannedCandidates:progress.plannedClips,candidateCount:pool.length,samplesEvaluated:progress.samplesEvaluated,planningMs:scanMs+progress.planningMs+selectionMs,batches,maxBatchMs,wallMs:(finishedAt??now())-startedAt,discovery:{...discovery},reports:selectedReports,candidateReports:phase==='ready'?candidateReports:engine?.stats().reports||[]};}
 };
 if(background){const run=()=>{timer=null;if(disposed||phase==='ready')return;step();if(phase!=='ready')timer=setTimeout(run,0);};timer=setTimeout(run,0);}
 return replay;
}
// Synchronous utility for offline exports and tests. Live playback uses the
// same planner in bounded frame batches through prepareReplayScenery.
export function buildHighlights(recording,{contextFor,...directorOptions}={}){const replay=createReplay(recording,{directorOptions:{...directorOptions,contextFor}});replay.director.complete();return replay.clips;}
export function replayClip(replay){return replay?.clips[replay.index]??null;}
export function changeReplayClip(replay,direction){if(replay?.planning||!replay?.clips.length)return;replay.index=(replay.index+direction+replay.clips.length)%replay.clips.length;replay.elapsed=0;replay.fade=0;replay.loading=true;replay.readyKey=null;replay.settling=false;}
export function advanceReplay(replay,dt,{ready=true,visible=true}={}){
 if(!replay||replay.planning||!visible||!ready||replay.loading||!replay.clips.length)return;
 const step=Math.max(0,Math.min(.5,dt));replay.fade=Math.min(1,replay.fade+step);if(replay.paused)return;
 replay.elapsed+=step;
 if(replay.elapsed>=replayClip(replay).duration){if((replay.index+1)%replay.clips.length===replay.startIndex)replay.cycles++;changeReplayClip(replay,1);}
}
export function replayFrame(replay){
 const clip=replayClip(replay);if(!clip)return null;
 const time=clip.start+Math.min(clip.recordedDuration,replay.elapsed),state=replay.recording.sample(clip.segment,time),anchor=replay.recording.sample(clip.segment,Math.max(clip.start,Math.min(clip.end,clip.time)));
 const fade=.4,opacity=replay.loading?1:Math.max(0,1-replay.fade/fade,1-(clip.duration-replay.elapsed)/fade);
 return{state,shot:{...clip.camera,session:replay.recording.seed,selectionKey:clip.segment+':'+clip.start,kind:clip.camera?.kind??clip.shot,fallbackKind:clip.shot,anchor,elapsed:replay.elapsed,duration:clip.duration,eventOffset:clip.eventOffset,index:clip.id},opacity,clip};
}
export function replayStatus(replay){const clip=replayClip(replay);return replay?{index:replay.index,count:replay.clips.length,planning:!!replay.planning,airportId:clip?.airportId,shotTemplate:clip?.camera?.template??null,label:clip?.label||'飞行片段',elapsed:replay.elapsed,duration:clip?.duration||0,paused:replay.paused,loading:replay.loading,cycles:replay.cycles}:null;}
