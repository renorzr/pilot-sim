import {settingVisible} from './setting-shots.js';
import {shotTemplates,shotTemplate,libraryShotPose} from './shot-library.js';
import {airportShotContext} from './shot-context.js';
import {aircraftSelfBlocked,clamp,projected,rayObstacle,viewBasis} from './shot-geometry.js';
export const shotStyle=shot=>shot.template+':'+(shot.framing||'');
export const SHOT_WEIGHTS=Object.freeze({action:25,visibility:20,composition:20,setting:15,motion:10,light:5,cost:5});
const now=()=>globalThis.performance?.now?.()??Date.now();
const hash=s=>{let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function* evaluate(candidate,states,clip,anchor,env){
 const template=shotTemplate(candidate.template);let composition=0,setting=0,light=0,valid=0,angular=0,last=null,closeFrames=0,occluded=0,entry=null;const reasons={};
 for(let i=0;i<states.length;i++){
  const s=states[i],elapsed=clip.duration*i/(states.length-1),shot={...candidate,anchor,elapsed,duration:clip.duration},pose=libraryShotPose(s,shot,env),basis=viewBasis(pose),p=pose.subject,q=projected(p,pose,1.6,basis),range=dist(pose.position,p),tan=Math.tan(pose.fov*Math.PI/360),size=pose.subjectRadius/(Math.max(1,range)*tan*1.6),terrain=env.heightAt(pose.position[0],pose.position[2]);
  let reason=null;
  if(![...pose.position,...pose.target,pose.fov].every(Number.isFinite))reason='invalid-pose';
  else if(pose.position[1]<terrain+.18)reason='camera-below-ground';
  else if(range>Math.min(22000,(s.weather?.visibility||42000)*.8))reason='visibility-range';
  else if(!pose.establishing&&(q.depth<=.5||Math.abs(q.x)>(pose.partialPass?1+size:pose.allowCrop?1:1.1)||Math.abs(q.y)>(pose.partialPass?1+size*1.6:1.02)||size<Math.max(.022,pose.minSubjectSize||0)||size>(pose.allowCrop?1.3:.82)))reason='framing';
  else if(pose.requireSideView&&Math.abs((pose.position[0]-p[0])*Math.sin(s.yaw)-(pose.position[2]-p[2])*Math.cos(s.yaw))/Math.max(1,Math.hypot(pose.position[0]-p[0],pose.position[2]-p[2]))>.8)reason='not-side-view';
  else if(pose.setting&&!settingVisible(pose,1.6,basis))reason='setting-not-visible';
  else if(!pose.establishing&&pose.groundObserver&&(size<.055||Math.atan2(p[1]-pose.position[1],Math.hypot(p[0]-pose.position[0],p[2]-pose.position[2]))<.12||range>1800))reason='not-low-flyby';
  else if(aircraftSelfBlocked(s,pose.position,p,pose.part))reason='aircraft-occlusion';
  const rayTarget=pose.establishing?pose.target:p;
  if(!reason){
   for(let j=1;j<=5;j++){const u=j/6,x=rayTarget[0]+(pose.position[0]-rayTarget[0])*u,z=rayTarget[2]+(pose.position[2]-rayTarget[2])*u,y=rayTarget[1]+(pose.position[1]-rayTarget[1])*u;if(y<env.heightAt(x,z)+.12){reason='terrain-occlusion';break;}}
  }
  if(!reason)for(const box of env.occluders?.(pose.position,rayTarget)??env.obstacles??[]){if(rayObstacle(pose.position,rayTarget,box)){reason='building-occlusion';break;}}
  if(reason){occluded++;reasons[reason]=(reasons[reason]||0)+1;yield null;if(occluded>states.length*.16)return{candidate,score:0,rejected:true,reason:'visibility-or-obstruction',reasons,evaluatedFrames:i+1,earlyRejected:true,validRatio:valid/(i+1),validRatioUpperBound:1-occluded/states.length};continue;}
  if(pose.setting&&!reason){let visible=0;for(const point of pose.setting.points){const q=projected(point,pose,1.6,basis);if(q.depth<=.5||Math.abs(q.x)>1.05||Math.abs(q.y)>1.05)continue;const own=new Set([pose.setting.id,...pose.setting.sourceIds]);let blocked=false;for(const box of env.occluders?.(pose.position,point)??env.obstacles??[]){if(!own.has(box.id)&&rayObstacle(pose.position,point,box)){blocked=true;break;}}if(!blocked)visible++;}if(visible<2){occluded++;reasons['setting-occlusion']=(reasons['setting-occlusion']||0)+1;yield null;continue;}}
  if(pose.part==='wheel'||pose.part==='tail')closeFrames++;
  const ideal=pose.part==='wheel'?.25:pose.part==='tail'?.4:pose.allowCrop?.35:pose.groundObserver?.12:.23;const framing=pose.establishing?.8:clamp(1-Math.abs(size-ideal)/(.3+ideal));
  let context=pose.part==='wheel'?.88:pose.part==='tail'?.83:.52;
  if(pose.setting)context=1;
  if(pose.background&&!pose.setting){const b=projected(pose.background,pose,1.6,basis),radius=(pose.backgroundRadius||20)/(Math.max(1,b.depth)*tan*1.6);if(b.depth<1||Math.abs(b.x)>1.15||Math.abs(b.y)>1.1||radius<.012){yield null;occluded++;reasons['background-framing']=(reasons['background-framing']||0)+1;continue;}context=1;}
  composition+=framing;setting+=context;
  const forward=basis.forward;entry??=forward.toArray();if(last?.phase===pose.phase){const step=clip.duration/(states.length-1),angle=Math.acos(clamp(last.forward.dot(forward),-1,1));angular=Math.max(angular,angle/step);}
  last={forward,phase:pose.phase};light+=clamp(.85-(s.weather?.overcast||0)*.15-range/(s.weather?.visibility||42000)*.3);valid++;yield null;
 }
 const ratio=valid/states.length;if(ratio<.84)return{candidate,score:0,rejected:true,reason:'visibility-or-obstruction',reasons,validRatio:ratio};
 if(['wheel-close','nose-wheel-close','nose-wheel-front','tail-bank','tail-bank-front'].includes(candidate.template)&&closeFrames<states.length*.35)return{candidate,score:0,rejected:true,reason:'part-not-visible',validRatio:ratio};
 const parts={action:template.interest*(.85+.15*(candidate.landmark?.importance??1)),visibility:ratio,composition:composition/Math.max(1,valid),setting:setting/Math.max(1,valid),motion:clamp(1-angular/1.4),light:light/Math.max(1,valid),cost:1-template.cost};
 return{candidate,entryForward:entry,exitForward:last?.forward.toArray(),score:Object.entries(SHOT_WEIGHTS).reduce((n,[k,w])=>n+parts[k]*w,0),parts,validRatio:ratio,rejected:false};
}
export function createShotDirector(recording,clips,{seed=recording.seed??hash(recording.segments.map(s=>s.airportId+':'+s.end).join('|')),contextFor=airportShotContext,sampleCount=10,deferSelection=false,templateIds=null}={}){
 const jobs=new Map(),reports=new Map(),plans=new Map(),options=new Map();let samplesEvaluated=0,totalMs=0,cursor=0;
 function job(index){
  if(jobs.has(index))return jobs.get(index);const clip=clips[index],env=contextFor(clip.airportId),anchor=recording.sample(clip.segment,Math.max(clip.start,Math.min(clip.end,clip.time))),states=Array.from({length:sampleCount},(_,i)=>recording.sample(clip.segment,clip.start+Math.min(clip.recordedDuration,clip.duration*i/(sampleCount-1))));
  const candidates=shotTemplates().filter(t=>(!templateIds||templateIds.includes(t.id))&&(!clip.allowedTemplates||clip.allowedTemplates.includes(t.id))&&(!deferSelection||clip.type!=='landmark'||t.family==='setting')).flatMap(t=>t.candidates(clip,states,env).map((c,i)=>({...c,template:t.id,family:t.family,variant:i}))).sort((a,b)=>shotTemplate(b.template).interest-shotTemplate(a.template).interest),state={clip,env,states,anchor,candidates,index:0,iterator:null,results:[]};jobs.set(index,state);return state;
 }
 function finish(index,j){
  const previous=deferSelection?null:plans.get(index-1),used=deferSelection?[]:[...plans.values()],eligible=j.results.filter(r=>!r.rejected&&r.score>=65).map(r=>{
   const repeated=p=>p.family===r.candidate.family&&(p.family!=='setting'||p.template===r.candidate.template);
   const repetition=used.filter(repeated).length*4+(previous&&repeated(previous)?5:0)+used.filter(p=>p.template===r.candidate.template).length*2;
   const nearby=previous&&clips[index-1].airportId===j.clip.airportId&&j.clip.start-clips[index-1].end<30;
   const dot=nearby&&previous.exitForward&&r.entryForward?r.entryForward.reduce((n,v,i)=>n+v*previous.exitForward[i],0):1,continuity=dot<-.5?2:0;
   return{...r,adjusted:r.score-repetition-continuity,repetition,continuity};
  }).sort((a,b)=>b.adjusted-a.adjusted);
  const best=eligible[0],band=best?eligible.filter(r=>r.adjusted>=best.adjusted-4):[],choice=band.length?band[hash(seed+':'+j.clip.segment+':'+j.clip.start)%band.length]:null;
  const fallback={template:j.clip.shot==='ground'?'runway-side':j.clip.shot==='tower'?'airport-observer':'air-follow',kind:j.clip.shot,side:1,family:j.clip.shot==='air'?'air':'ground'};
  const plan=choice?{...choice.candidate,score:choice.score,entryForward:choice.entryForward,exitForward:choice.exitForward}:fallback;if(deferSelection){const perStyle=new Map();for(const result of eligible){const id=shotStyle(result.candidate);if(!perStyle.has(id))perStyle.set(id,{...result.candidate,score:result.score,entryForward:result.entryForward,exitForward:result.exitForward});}options.set(index,[...perStyle.values()]);}if(!deferSelection&&plan.window){const {start,end,time}=plan.window;Object.assign(j.clip,{start,end,time,duration:end-start,recordedDuration:end-start,eventOffset:time-start});}plans.set(index,plan);if(!deferSelection)j.clip.camera=plan;if(!deferSelection&&j.clip.type==='landmark'&&plan.family!=='setting')j.clip.label='飞行掠影';reports.set(index,{selected:plan.template,score:choice?.score??null,fallback:!choice,adjustments:choice?{repetition:choice.repetition,continuity:choice.continuity}:null,candidates:j.results.map(({candidate,...rest})=>({...rest,template:candidate.template,side:candidate.side}))});jobs.delete(index);return plan;
 }
 function work(index,budgetMs=1.5,maxSamples=24){
  if(!clips[index])return null;if(plans.has(index))return plans.get(index);const started=now(),j=job(index);let count=0;
  while(j.index<j.candidates.length&&count<maxSamples&&now()-started<budgetMs){
   if(!j.iterator){const c=j.candidates[j.index],window=c.window,clip=window?{...j.clip,...window,duration:window.end-window.start}:j.clip,states=window?Array.from({length:sampleCount},(_,i)=>recording.sample(j.clip.segment,window.start+(window.end-window.start)*i/(sampleCount-1))):j.states;j.iterator=evaluate(c,states,clip,j.anchor,j.env);}
   const step=j.iterator.next();if(step.done){j.results.push(step.value);j.iterator=null;j.index++;}else{count++;samplesEvaluated++;}
  }
  totalMs+=now()-started;
  if(j.index===j.candidates.length)return finish(index,j);return null;
 }
 return{
  ensure(index){return work(index,3,60);},
  step({budgetMs=1.5,maxSamples=24,startIndex=cursor}={}){const start=now();let remaining=maxSamples;for(let n=0;n<clips.length&&remaining>0&&now()-start<budgetMs;n++){const i=(startIndex+n)%clips.length;if(!plans.has(i)){const before=samplesEvaluated;work(i,Math.max(0,budgetMs-(now()-start)),remaining);remaining-=samplesEvaluated-before;if(!plans.has(i)){cursor=i;break;}cursor=(i+1)%Math.max(1,clips.length);}}},
  progress:()=>({plannedClips:plans.size,totalClips:clips.length,samplesEvaluated,planningMs:totalMs}),
  options:index=>options.get(index)||[],
  plan:index=>plans.get(index)||null,
  complete(){for(let i=0;i<clips.length;i++)while(!plans.has(i))work(i,Infinity,100000);return this.stats();},
  stats(){return{seed,samplesEvaluated,planningMs:totalMs,plannedClips:plans.size,totalClips:clips.length,reports:[...reports].sort((a,b)=>a[0]-b[0]).map(([index,r])=>({index,...r}))};}
 };
}
