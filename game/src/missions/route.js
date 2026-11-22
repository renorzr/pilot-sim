import {FT,RAD,RUNWAY,clamp} from '../sim/constants.js';
const points=[{x:0,z:-5200,alt:1500,name:'一边 · 起飞爬升'},{x:-4200,z:-5200,alt:1500,name:'二边 · 侧风边'},{x:-4200,z:7000,alt:1500,name:'三边 · 下风边'},{x:0,z:7000,alt:1250,name:'四边 · 基地边'},{x:0,z:0,alt:50,name:'五边 · 最后进近'}];
export function createRoute(){return{active:true,index:0,points:structuredClone(points),origin:{x:0,z:-130},visited:[],inFinal:false,targetAltitude:1500,crossTrack:0};}
export function createRecoveryRoute(s){
 const south=Math.min(s.z-1800,-6000),r=createRoute(),far=s.scenario==='full'?14000:10000,baseAlt=s.scenario==='full'?1500:1750;
 r.recovery=true;r.origin={x:s.x,z:s.z};
 r.points=[{x:-4200,z:south,alt:3000,name:'复飞 · 左转海侧'},
 {x:-6500,z:south,alt:2500,name:'海侧 · 下降准备'},
 {x:-6500,z:far,alt:2200,name:'三边 · 返场下风'},
 {x:0,z:far,alt:baseAlt,name:'四边 · 返场截获'},
 {x:0,z:0,alt:50,name:'五边 · 再次进近'}];
 if(s.airportId!=='training')r.points.forEach(p=>{p.name=p.name.replaceAll('海侧','左侧');});
 return r;
}
export function routeTarget(s){
 const r=s.route,b=r.points[r.index],a=r.index?r.points[r.index-1]:r.origin,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
 const along=((s.x-a.x)*dx+(s.z-a.z)*dz)/(length*length),cross=((s.x-a.x)*dz-(s.z-a.z)*dx)/length;
 const lookahead=clamp(s.airData.groundSpeed*14,900,1600),t=clamp(along+lookahead/length,0,1);
 const target={x:a.x+dx*t,z:a.z+dz*t};
 r.crossTrack=cross;r.targetAltitude=Math.max(r.inFinal?(15.24+Math.tan(3*RAD)*Math.max(s.z,0))*FT:b.alt,s.atc?.terrainFloorFt||0);
 return{track:r.inFinal?-Math.atan2(s.x,Math.max(s.z*.35,600)):Math.atan2(target.x-s.x,-(target.z-s.z)),altitude:r.targetAltitude,along,cross,distance:Math.hypot(s.x-b.x,s.z-b.z)};
}
export function advanceRoute(s,{emit,checkpoint,radio}){
 const r=s.route;if(!r?.active||s.goAround||s.landed)return;
 const t=routeTarget(s);if(r.inFinal)return;
 if(t.distance>1450||t.along<.6||(r.index===0&&((s.y-RUNWAY.ground)*FT<1100||!s.airborne)))return;
 r.visited.push(r.index);r.index++;r.inFinal=r.index===4;
 if(r.inFinal){s.mode='landing';if(s.scenario==='full')s.selectedAltitude=r.points[r.index-1].alt;s.previousRA=(s.y-RUNWAY.ground)*FT;s.gates=[];s.unstableSeconds=0;s.spokenHeights=[];s.apprArmed=false;s.locCaptured=s.gsCaptured=s.gsCaptureEligible=false;if(!s.systems.ils.localizer){s.autoPilot=false;s.flightDirector=false;}}
 else s.mode='enroute';
 s.phase=['departure','crosswind','downwind','base','final'][r.index];
 emit(s,`进入${r.points[r.index].name} · 按航线指引飞行`,'','info');
 if(!r.recovery||r.inFinal)radio(s,['departure','crosswind','downwind','base','final'][r.index]);checkpoint(s,r.points[r.index].name);
}
export function routeSpeed(s){
 if(s.route.index<=1)return 175;
 if(s.route.index===2)return s.flaps>=2?160:175;
 if(s.route.index===3)return s.flaps>=3?s.vapp:160;
 return s.vapp;
}
