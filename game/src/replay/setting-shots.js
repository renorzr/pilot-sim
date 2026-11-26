import {aircraftFocus,aircraftPoint,clamp,projected,viewBasis,smooth} from './shot-geometry.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const center=s=>aircraftFocus('aircraft',s);
export function targetPoints(poi){const [x,y,z]=poi.position,h=poi.subjectHeight||poi.height,polygon=poi.subjectPolygon||poi.polygons?.[0],r=Math.min(poi.width??poi.radius*2,poi.depth??poi.radius*2)/2;if(polygon?.length)return [[x,y,z],[x,(poi.baseY||0)+h*.85,z],...Array.from({length:4},(_,i)=>{const p=polygon[Math.floor(i*polygon.length/4)];return [p[0],(poi.baseY||0)+h*.65,p[1]];})];return [[x,y,z],[x,y+h*.4,z],[x-r,y,z],[x+r,y,z],[x,y,z+r]];}
// The camera sees both the aircraft subject and an explicit architectural
// subject. A mounted-at label alone never contributes a setting score.
function compose(position,subject,radius,setting,settingRadius,{minFov=38,maxFov=70,weight=.52}={}){
 const a=unit(subject.map((v,i)=>v-position[i])),b=unit(setting.map((v,i)=>v-position[i])),f=unit(a.map((v,i)=>v*weight+b[i]*(1-weight))),target=add(position,f.map(v=>v*1000));
 const pose={position,target,fov:50},basis=viewBasis(pose);let need=0;
 for(const [p,r]of [[subject,radius],[setting,settingRadius]]){const delta=p.map((v,i)=>v-position[i]),depth=delta.reduce((n,v,i)=>n+v*basis.forward.getComponent(i),0);if(depth<=.1){need=100;continue;}const x=Math.abs(delta.reduce((n,v,i)=>n+v*basis.right.getComponent(i),0))/1.6,y=Math.abs(delta.reduce((n,v,i)=>n+v*basis.vertical.getComponent(i),0));need=Math.max(need,(x+r/1.6)/depth,(y+r)/depth);}
 return {...pose,fov:clamp(2*Math.atan(need/.83)*180/Math.PI,minFov,maxFov)};
}
function candidates(clip,samples,env,ground=false){
 if(!samples.some(s=>s.airborne))return[];const targets=clip.poi?[clip.poi]:env.landmarks||[];
 return targets.map(landmark=>({landmark,d:Math.min(...samples.map(s=>Math.hypot(s.x-landmark.position[0],s.z-landmark.position[2])))})).filter(({landmark:l,d})=>d<(ground?2200:8500)&&(ground||l.kind!=='building')).sort((a,b)=>a.d/(a.landmark.importance||.5)-b.d/(b.landmark.importance||.5)).slice(0,clip.poi?1:2).flatMap(({landmark})=>[-1,1].flatMap(side=>[-1,1].map(along=>({landmark,side,along,kind:'setting'}))));
}
export const settingCandidates=candidates;
export function settingSidePose(s,shot,env,close=false){
 if(!close&&shot.framing==='telephoto')return settingLongPose(s,shot,env);
 const l=shot.landmark||shot.terminal,side=shot.side||1,along=shot.along||1,subject=close?aircraftPoint(s,[side*2.1,.8,-3],shot.visualOffset):center(s),position=aircraftPoint(s,close?[side*12,3.4,along*9]:[side*85,12,along*25],shot.visualOffset),radius=close?3:19;
 const pose=compose(position,subject,radius,l.position,Math.min(l.radius||40,l.height*.8),{minFov:close?44:38,maxFov:close?72:66,weight:close?.6:.52});
 return {...pose,subject,subjectRadius:radius,part:close?'airframe':'aircraft',phase:close?'setting-shoulder':'setting-side',allowCrop:close,near:close?.18:.7,cameraClearance:close?.5:2.5,minSeparation:close?1.5:42,setting:{id:l.id,sourceIds:l.sourceIds||[l.id],points:targetPoints(l),focus:l.position,radius:Math.min(l.radius||40,l.height*.8),minRadius:.018,kind:l.kind},background:l.position,backgroundRadius:Math.min(l.radius||40,l.height*.8)};
}
function settingLongPose(s,shot,env){
 const l=shot.landmark,a=shot.anchor||s,dx=a.x-l.position[0],dz=a.z-l.position[2],n=Math.hypot(dx,dz)||1,d=[dx/n,dz/n],back=clamp((l.radius||60)*12,2200,4500),side=(shot.side||1)*Math.min(250,(l.radius||60)*3),x=l.position[0]-d[0]*back-d[1]*side,z=l.position[2]-d[1]*back+d[0]*side,position=[x,env.heightAt(x,z)+Math.max(70,l.height*1.2),z],subject=center(s),radius=Math.min(l.radius||40,l.height*.8),pose=compose(position,subject,19,l.position,radius,{minFov:2,maxFov:32,weight:.5});
 return {...pose,subject,subjectRadius:19,part:'aircraft',phase:'setting-side-long',near:.7,minSubjectSize:.065,requireSideView:true,setting:{id:l.id,sourceIds:l.sourceIds||[l.id],points:targetPoints(l),focus:l.position,radius,minRadius:.018,kind:l.kind},background:l.position,backgroundRadius:radius};
}
export function groundVantage(anchor,l,side=1,along=1,heightAt=()=>0){
 const dx=anchor.x-l.position[0],dz=anchor.z-l.position[2],n=Math.hypot(dx,dz)||1,d=[dx/n,dz/n],t=[-d[1]*side,d[0]*side],polygons=l.polygons||[[[l.position[0]-(l.radius||30),l.position[2]-(l.radius||30)],[l.position[0]+(l.radius||30),l.position[2]+(l.radius||30)]]];
 const vertices=(l.facades||polygons.map(points=>({points,baseY:l.baseY,height:l.height}))).flatMap(wall=>wall.points.map(p=>({p,wall}))),chosen=vertices.reduce((best,v)=>((v.p[0]-l.position[0])*(d[0]+t[0]*.35)+(v.p[1]-l.position[2])*(d[1]+t[1]*.35))>((best.p[0]-l.position[0])*(d[0]+t[0]*.35)+(best.p[1]-l.position[2])*(d[1]+t[1]*.35))?v:best,vertices[0]),v=chosen.p,wall=chosen.wall;
 let back=along<0?30:60,lateral=along<0?35:65,x,z;const bounds=[Math.min(...wall.points.map(p=>p[0])),Math.max(...wall.points.map(p=>p[0])),Math.min(...wall.points.map(p=>p[1])),Math.max(...wall.points.map(p=>p[1]))];
 for(let i=0;i<20;i++){x=v[0]+t[0]*lateral-d[0]*back;z=v[1]+t[1]*lateral-d[1]*back;if(x<bounds[0]-3||x>bounds[1]+3||z<bounds[2]-3||z>bounds[3]+3)break;lateral+=12;back+=6;}
 const base=heightAt(x,z);
 const focus=[v[0],wall.baseY+wall.height*.63,v[1]],r=clamp(wall.height*.17,3,14),points=[[v[0],wall.baseY+2,v[1]],[v[0],wall.baseY+wall.height*.5,v[1]],[v[0],wall.baseY+wall.height*.9,v[1]],[v[0]-t[0]*r,wall.baseY+wall.height*.65,v[1]-t[1]*r]];
 return {position:[x,base+2.2,z],focus,radius:r,points};
}
export function settingGroundPose(s,shot,env){
 const l=shot.landmark||shot.terminal,a=shot.anchor||s,v=shot.vantage||groundVantage(a,l,shot.side,shot.along,env.heightAt),subject=center(s),pose=compose(v.position,subject,19,v.focus,v.radius,{minFov:42,maxFov:78,weight:.58});
 return {...pose,subject,subjectRadius:19,part:'aircraft',phase:'setting-ground',near:.3,cameraClearance:1.5,minSeparation:42,groundObserver:true,setting:{id:l.id,sourceIds:l.sourceIds||[l.id],points:v.points,focus:v.focus,radius:v.radius,minRadius:.035,kind:l.kind},background:v.focus,backgroundRadius:v.radius};
}
// Fixed lens pointed at the zenith. Pick an actual roof edge and stay outside
// its footprint; the horizontal up vector avoids a singular vertical lookAt.
export function zenithVantage(anchor,l,side=1,heightAt=()=>0){
 const walls=l.roofEdges||l.facades||((l.polygons||[]).map(points=>({points,baseY:l.baseY||0,height:l.height}))),edges=[];
 for(const wall of walls)for(let i=0;i<wall.points.length;i++){
  const p=wall.points[i],q=wall.points[(i+1)%wall.points.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(len<3)continue;
  const u=clamp(((anchor.x-p[0])*dx+(anchor.z-p[1])*dz)/(len*len),.15,.85),v=[p[0]+u*dx,p[1]+u*dz],centroid=wall.points.reduce((a,p)=>[a[0]+p[0]/wall.points.length,a[1]+p[1]/wall.points.length],[0,0]);let outward=[-dz/len,dx/len];if((v[0]-centroid[0])*outward[0]+(v[1]-centroid[1])*outward[1]<0)outward=outward.map(v=>-v);
  const roof=(wall.baseY||0)+wall.height,ground=heightAt(v[0],v[1]),offset=Math.max(3,(roof-ground-2.2)*.49),x=v[0]+outward[0]*offset,z=v[1]+outward[1]*offset,position=[x,heightAt(x,z)+2.2,z],focus=[v[0],roof,v[1]],r=Math.min(len*.1,Math.max(2,wall.height*.15));
  edges.push({position,focus,radius:r,up:[-outward[0],0,-outward[1]],points:[focus,[v[0]+dx/len*r,roof,v[1]+dz/len*r],[v[0]-dx/len*r,roof,v[1]-dz/len*r]],d:Math.hypot(anchor.x-x,anchor.z-z)});
 }
 return edges.sort((a,b)=>a.d-b.d)[side<0?1:0]||edges[0];
}
export function zenithCandidates(clip,states,env){
 return settingCandidates(clip,states,env,true).filter(c=>c.along===1).flatMap(c=>{
  const before=states.findLast(s=>s.time<=clip.time)||states[0],after=states.find(s=>s.time>=clip.time)||states.at(-1),u=clamp((clip.time-before.time)/(after.time-before.time||1)),anchor={x:before.x+(after.x-before.x)*u,z:before.z+(after.z-before.z)*u},vantage=zenithVantage(anchor,c.landmark,c.side,env.heightAt);if(!vantage)return[];
  let best=null;for(let i=1;i<states.length;i++){const a=states[i-1],b=states[i],dx=b.x-a.x,dz=b.z-a.z,u=clamp(((vantage.position[0]-a.x)*dx+(vantage.position[2]-a.z)*dz)/(dx*dx+dz*dz||1)),x=a.x+dx*u,z=a.z+dz*u,y=a.y+(b.y-a.y)*u,time=a.time+(b.time-a.time)*u,d=Math.hypot(x-vantage.position[0],z-vantage.position[2]);if(!best||d<best.d)best={time,d,y,dx,dz};}
  if(!best||best.d>Math.min(35,(best.y-vantage.position[1])*Math.tan(34*Math.PI/180)*1.6*.14)||best.y<vantage.focus[1]+8||best.y-vantage.position[1]>140)return[];
  // Rotate the opening around the vertical sight line: incoming motion is
  // screen-down, so the aircraft enters at the top before crossing the centre.
  vantage.up=unit([-best.dx,0,-best.dz]);
  const entryTrack=states.map(({time,x,y,z,pitch,yaw,roll})=>({time,x,y,z,pitch,yaw,roll})),entryTime=zenithEntryTime(entryTrack,vantage),followTime=zenithCenterTime(entryTrack,vantage),start=entryTime-1,end=Math.min(clip.end,followTime+1.8);if(!Number.isFinite(entryTime)||!Number.isFinite(followTime)||followTime<=entryTime||start<clip.start||end-followTime<1.2)return[];
  return[{...c,vantage,entryTime,followTime,entryTrack,window:{start,end,time:followTime}}];
 });
}
// Sparse silhouette points from the authored aircraft bounds. A prefix search
// and bisection locate first entry, rather than guessing from closest approach.
const silhouette=[[0,0,-16.5],[0,2,21.07],[0,8.96,17],[-17.9,2.28,6],[17.9,2.28,6],[-5.95,1.73,17.4],[5.95,1.73,17.4],[-1.8,-1,-10],[1.8,-1,-10],[-1.8,3,8],[1.8,3,8],[-5.35,-2.1,-5.1],[5.35,-2.1,-5.1]];
const verticalPose=v=>({position:v.position,target:[v.position[0],v.position[1]+100,v.position[2]],up:v.up,fov:68});
export function zenithAircraftVisible(s,v,aspect=1.6){const p=verticalPose(v),points=silhouette.map(q=>projected(aircraftPoint(s,q),p,aspect)).filter(q=>q.depth>.3);return points.length>0&&Math.min(...points.map(q=>q.x))<=1&&Math.max(...points.map(q=>q.x))>=-1&&Math.min(...points.map(q=>q.y))<=1&&Math.max(...points.map(q=>q.y))>=-1;}
function between(a,b,u){const s={};for(const k of['time','x','y','z','pitch','yaw','roll']){let d=(b[k]||0)-(a[k]||0);if(['pitch','yaw','roll'].includes(k))d=Math.atan2(Math.sin(d),Math.cos(d));s[k]=(a[k]||0)+d*u;}return s;}
export function zenithEntryTime(states,v,aspect=1.6){
 for(let i=0;i<states.length;i++)if(zenithAircraftVisible(states[i],v,aspect)){if(!i)return states[0].time;let lo=0,hi=1;for(let n=0;n<14;n++){const u=(lo+hi)/2;if(zenithAircraftVisible(between(states[i-1],states[i],u),v,aspect))hi=u;else lo=u;}return states[i-1].time+(states[i].time-states[i-1].time)*hi;}return null;
}
export function zenithCenterTime(states,v){
 const y=s=>projected(center(s),verticalPose(v)).y;
 for(let i=1;i<states.length;i++)if(y(states[i-1])>=0&&y(states[i])<=0){let lo=0,hi=1;for(let n=0;n<18;n++){const u=(lo+hi)/2;if(y(between(states[i-1],states[i],u))>0)lo=u;else hi=u;}return states[i-1].time+(states[i].time-states[i-1].time)*(lo+hi)/2;}return null;
}
const entryCache=new WeakMap();
function entryFor(shot,v,aspect){if(!shot.entryTrack)return shot.entryTime??Infinity;let cached=entryCache.get(v);if(!cached){cached=new Map();entryCache.set(v,cached);}if(!cached.has(aspect)){if(cached.size>=4)cached.delete(cached.keys().next().value);cached.set(aspect,zenithEntryTime(shot.entryTrack,v,aspect)??shot.entryTime);}return cached.get(aspect);}
export function settingZenithPose(s,shot,env){
 const l=shot.landmark,v=shot.vantage||zenithVantage(shot.anchor||s,l,shot.side,env.heightAt),position=v.position,subject=center(s),entryTime=entryFor(shot,v,env.aspect||1.6),followTime=shot.followTime??entryTime,tracking=s.time>followTime,blend=smooth((s.time-followTime)/.32),direction=unit(subject.map((n,i)=>n-position[i])),aim=unit(direction.map((n,i)=>n*blend+(i===1?1-blend:0))),target=add(position,aim.map(n=>n*100)),establishing=s.time<entryTime;
 return{position,target,up:v.up,attitudeAttached:false,fixed:!tracking,fixedPosition:true,tracking,establishing,entryTime,followTime,fov:68,subject,subjectRadius:19,allowCrop:true,partialPass:true,minSubjectSize:.12,part:'aircraft',phase:tracking?'setting-zenith-follow':establishing?'setting-zenith':'setting-zenith-arriving',near:.3,cameraClearance:1.5,minSeparation:12,groundObserver:true,constraintOrigin:establishing?target:undefined,setting:tracking?null:{id:l.id,sourceIds:l.sourceIds||[l.id],points:v.points,focus:v.focus,radius:v.radius,minRadius:.025,kind:l.kind}};
}
export function settingPairPose(s,shot,env){const cut=clamp((shot.eventOffset??shot.duration/2),shot.duration*.32,shot.duration*.68);return shot.elapsed<cut?settingSidePose(s,shot,env,true):settingGroundPose(s,shot,env);}
export function settingVisible(pose,aspect=1.6,basis=viewBasis(pose)){if(!pose.setting)return true;const points=pose.setting.points.map(p=>projected(p,pose,aspect,basis)),focus=projected(pose.setting.focus,pose,aspect,basis),r=pose.setting.radius/(Math.max(1,focus.depth)*Math.tan(pose.fov*Math.PI/360));return points.filter(p=>p.depth>.5&&Math.abs(p.x)<1.03&&Math.abs(p.y)<1.03).length>=2&&focus.depth>.5&&r>=pose.setting.minRadius&&Math.abs(focus.x)<1.12&&Math.abs(focus.y)<1.12;}
