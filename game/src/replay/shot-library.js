import {settingCandidates,settingSidePose,settingGroundPose,settingPairPose,zenithCandidates,settingZenithPose} from './setting-shots.js';
import {aircraftFocus,aircraftPoint,aircraftVector,clamp,smooth} from './shot-geometry.js';
import {aircraftDefinition} from '../aircraft/registry.js';
const registry=new Map();
export function registerShotTemplate(template){if(!template.id||!template.family||!Number.isFinite(template.interest)||!Number.isFinite(template.cost)||typeof template.pose!=='function'||typeof template.candidates!=='function')throw Error('Invalid replay shot template');if(registry.has(template.id))throw Error('Duplicate replay shot template');registry.set(template.id,template);return()=>registry.delete(template.id);}
export const shotTemplates=()=>[...registry.values()];
export const shotTemplate=id=>registry.get(id);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),add=(a,b)=>a.map((v,i)=>v+b[i]);
const lens=(radius,range,fraction=.4,min=4,max=50)=>clamp(2*Math.atan(radius/(Math.max(1,range)*fraction))*180/Math.PI,min,max);
function basic(s,shot,env){
 const a=shot.anchor||s,side=shot.side||1,u=smooth(shot.elapsed/Math.max(.1,shot.duration)),yaw=a.yaw||0,right=[Math.cos(yaw),Math.sin(yaw)],back=[-Math.sin(yaw),Math.cos(yaw)],target=aircraftFocus('aircraft',s),scale=aircraftDefinition(s).visual.cameraScale??1;let position;
 if(shot.kind==='ground'){const x=a.x+right[0]*145*side+back[0]*30,z=a.z+right[1]*145*side+back[1]*30;position=[x,env.heightAt(x,z,s)+5,z];}
 else if(shot.kind==='tower'){const x=a.x+right[0]*245*side+back[0]*110,z=a.z+right[1]*245*side+back[1]*110;position=[x,Math.max(env.heightAt(x,z,s)+35,a.y-30),z];}
 else{const angle=(.85+u*.35)*side,radius=(105+u*35)*scale,heading=-s.yaw+angle;position=[s.x+Math.sin(heading)*radius,s.y+(32+u*12)*scale,s.z+Math.cos(heading)*radius];}
 return{position,target,subject:target,subjectRadius:19*scale,part:'aircraft',phase:shot.kind,fov:lens(19*scale,distance(position,target),.36,5,43),near:.7};
}
export function legacyShotPose(s,shot,env){return basic(s,shot,env);}
for(const [id,kind,family]of[['runway-side','ground','ground'],['airport-observer','tower','ground'],['air-follow','air','air']])registerShotTemplate({id,family,part:'aircraft',interest:kind==='air'?.73:.72,cost:.1,candidates:()=>[-1,1].map(side=>({kind,side})),pose:basic});
for(const [id,nose,leading]of[['wheel-close',false,false],['nose-wheel-close',true,false],['nose-wheel-front',true,true]])registerShotTemplate({id,family:'detail',part:'wheel',interest:nose?.98:.99,cost:.08,
 candidates:(clip,samples)=>['takeoff','gear'].includes(clip.type)&&samples.some(s=>s.airborne&&(s.gearPosition??0)>.2)?[-1,1].map(side=>({side,kind:'wheel'})):[],
 pose(s,shot,env){
  if((s.gearPosition??0)<.55||shot.elapsed>5.7)return{...basic(s,{...shot,kind:'air'},env),phase:'wheel-wide'};
  const subject=aircraftFocus(nose?'nose-wheel':'main-tyre',s,shot.side,shot.visualOffset),target=nose?subject:add(subject,aircraftVector(s,[shot.side*1.15,0,0])),position=add(target,aircraftVector(s,nose?[0,.03,leading?-2.8:2.8]:[0,.03,-12]));
  return{position,target,subject,subjectRadius:nose?.5:.65,part:'wheel',phase:nose?leading?'nose-wheel-front':'nose-wheel':'wheel',up:aircraftVector(s,[0,1,0]),attitudeAttached:true,fov:nose?25:8.2,maxAspect:nose?undefined:1.6,near:.06,cameraClearance:.12,minSeparation:1.2};
 }});
for(const leading of[false,true])registerShotTemplate({id:leading?'tail-bank-front':'tail-bank',family:'detail',part:'tail',interest:.99,cost:.08,
 candidates:(clip,samples)=>['turn','goaround'].includes(clip.type)&&samples.some(s=>s.airborne&&Math.abs(s.roll)>.11)?(leading?[1]:[-1,1]).map(side=>({side,kind:'tail'})):[],
 pose(s,shot){const subject=aircraftFocus('tail',s,shot.side,shot.visualOffset),position=add(subject,aircraftVector(s,leading?[shot.side*4,1.8,-14]:[shot.side*9,1,18]));return{position,target:subject,subject,subjectRadius:5.7,part:'tail',phase:leading?'tail-front':'tail',up:aircraftVector(s,[0,1,0]),fov:43,near:.25};}
});
// All architectural subjects, including terminals, use these same recipes.
for(const [id,pose,interest,ground]of[
 ['landmark-side',(s,t,e)=>settingSidePose(s,t,e,false),.98,false],
 ['landmark-shoulder',(s,t,e)=>settingSidePose(s,t,e,true),1,false],
 ['landmark-ground',settingGroundPose,1,true],
 ['landmark-pair',settingPairPose,.99,true],
])registerShotTemplate({id,family:'setting',part:id==='landmark-shoulder'?'airframe':'aircraft',interest,cost:.25,candidates:(clip,states,env)=>{const c=settingCandidates(clip,states,env,ground);return id==='landmark-side'?[...c.map(v=>({...v,framing:'near'})),...c.filter(v=>v.along===1&&states.every(s=>s.y>(v.landmark.baseY||0)+90)).map(v=>({...v,framing:'telephoto'}))].filter(v=>!clip.framing||clip.framing===v.framing):c;},pose});
registerShotTemplate({id:'landmark-zenith',family:'setting',part:'aircraft',interest:1,cost:.25,candidates:zenithCandidates,pose:settingZenithPose});
// Read-only compatibility for already exported manifests; never new candidates.
registerShotTemplate({id:'terminal-pair',family:'setting',interest:.9,cost:.25,candidates:()=>[],pose:settingPairPose});
registerShotTemplate({id:'landmark-pass',family:'setting',interest:.9,cost:.25,candidates:()=>[],pose:(s,t,e)=>settingSidePose(s,t,e,false)});
export function libraryShotPose(s,shot,{heightAt=()=>0,panel=false,aspect=1.6}={}){const env={heightAt,aspect},template=shotTemplate(shot.template);const pose=template?template.pose(s,shot,env):basic(s,shot,env);return{...pose,fov:pose.maxAspect&&aspect>pose.maxAspect?2*Math.atan(Math.tan(pose.fov*Math.PI/360)*pose.maxAspect/aspect)*180/Math.PI:pose.fov,panel};}
