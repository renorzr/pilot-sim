import * as THREE from 'three';
import {aircraftDefinition} from '../aircraft/registry.js';
import {surfaceHeight}from '../terrain/heightfield.js';
import {aircraftSelfBlocked} from '../replay/shot-geometry.js';
import {settingVisible} from '../replay/setting-shots.js';
import {replayCameraPose} from '../replay/replay-camera.js';
import {sampleCruiseCamera}from './cruise-camera-track.js';
import {historicalCamera} from '../history/presentation.js';
import {placeCockpitCamera} from './aircraft-pose.js';
import {rotateFlightVector} from '../missions/route-geography.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class FlightCameraRig{
 constructor(camera,{heightAt=surfaceHeight,obstruction=()=>null}={}){this.camera=camera;this.heightAt=heightAt;this.obstruction=obstruction;this.position=new THREE.Vector3();this.target=new THREE.Vector3();this.initialized=false;this.failedReplayShots=new Set();this.replaySession=null;this.lastReset=-1;this.lastPose=null;this.adjusted=false;this.mode='cockpit';this.look=new THREE.Vector3();this.lastOrigin=new THREE.Vector3();}
 relativePose(){if(this.mode!=='exterior'||!this.lastPose)return null;const p=new THREE.Vector3(this.lastPose.x,this.lastPose.y,this.lastPose.z),vector=v=>({x:v.x,y:v.y,z:v.z});return{offset:vector(this.camera.position.clone().sub(p)),target:vector(this.target.clone().sub(p)),fov:this.camera.fov};}
 seedRelative(pose,state,angle,view){if(!pose)return;const offset=rotateFlightVector(pose.offset,angle),target=rotateFlightVector(pose.target,angle);this.position.set(state.x+offset.x,state.y+offset.y,state.z+offset.z);this.target.set(state.x+target.x,state.y+target.y,state.z+target.z);this.camera.position.copy(this.position);this.camera.fov=pose.fov;this.camera.up.set(0,1,0);this.camera.lookAt(this.target);this.lastOrigin.set(state.x,state.y+1.1,state.z);this.lastPose={x:state.x,y:state.y,z:state.z,time:state.time,airportId:state.airportId};this.lastReset=view.resetSerial;this.initialized=true;}
 constrain(origin,desired,s,{clearance=2.5,minSeparation=42,segmented=false}={}){
  const result=desired.clone();
  // Sample the shared physical terrain along the camera sight line. Only the
  // observer moves; no camera correction enters the aircraft state.
  for(let i=2;i<=16;i++){const t=i/16,x=origin.x+(result.x-origin.x)*t,z=origin.z+(result.z-origin.z)*t,h=this.heightAt(x,z,s)+clearance;if(origin.y+(result.y-origin.y)*t<h){result.y=Math.max(result.y,origin.y+(h-origin.y)/t);this.adjusted=true;}}
  const hit=this.obstruction(origin,result,{near:minSeparation<10?.15:4,segmented});
  if(hit){const length=origin.distanceTo(result),safe=hit.distance-3;
   if(safe>=minSeparation)result.lerpVectors(origin,result,safe/length);
   else{const t=Math.max(.08,hit.distance/Math.max(1,length));result.y=Math.max(result.y,origin.y+(hit.top+4-origin.y)/t);}
   this.adjusted=true;
  }
  const ground=this.heightAt(result.x,result.z,s)+clearance;if(result.y<ground){result.y=ground;this.adjusted=true;}return result;
 }
 update(s,view,dt,{motion={},cinematic=false,cinematicTime=null,cruise=null,replay=null,history=null,airport,visualOffset=0}={}){
  this.adjusted=false;this.replayShot=null;const camera=this.camera,previous=camera.position.clone(),oldQuaternion=camera.quaternion.clone();this.mode=replay?'replay-'+replay.kind:cruise?'cruise-'+cruise.phase:cinematic?'intro':view.mode;
  camera.near=.7;if(!replay){camera.up.set(0,1,0);this.failedReplayShots.clear();}else if(this.replaySession!==replay.session){this.failedReplayShots.clear();this.replaySession=replay.session;}
  if(replay){
   const shot={...replay,visualOffset},key=[replay.selectionKey,replay.index,replay.template,replay.side,replay.terminal?.id,replay.landmark?.id,replay.anchor?.time].join(':');
   let pose=replayCameraPose(s,shot,{heightAt:this.heightAt,panel:replay.panel,aspect:camera.aspect}),desired=new THREE.Vector3(...pose.position),subject=new THREE.Vector3(...pose.subject),close=['wheel','tail','airframe'].includes(pose.part);
   this.position.copy(this.constrain(pose.constraintOrigin?new THREE.Vector3(...pose.constraintOrigin):subject,desired,s,{clearance:pose.cameraClearance??(close?.18:2.5),minSeparation:pose.minSeparation??(close?1.5:42),segmented:true}));
   if(this.failedReplayShots.has(key)||this.position.distanceTo(desired)>((pose.fixed||pose.fixedPosition)?.01:Math.max(close?2:35,desired.distanceTo(subject)*.12))||aircraftSelfBlocked(s,pose.position,pose.subject,pose.part)||pose.setting&&!settingVisible({...pose,position:this.position.toArray()},camera.aspect)){
    this.failedReplayShots.add(key);if(this.failedReplayShots.size>32)this.failedReplayShots.delete(this.failedReplayShots.values().next().value);pose=replayCameraPose(s,{...shot,template:'air-follow',kind:'air'},{heightAt:this.heightAt,panel:replay.panel,aspect:camera.aspect});this.position.copy(this.constrain(new THREE.Vector3(...pose.subject),new THREE.Vector3(...pose.position),s,{segmented:true}));
   }
   camera.clearViewOffset();camera.fov=pose.fov;camera.near=pose.near??.7;this.target.set(...pose.target);camera.position.copy(this.position);
   camera.up.set(...(pose.up||[0,1,0]));camera.lookAt(this.target);
   this.replayShot={template:this.failedReplayShots.has(key)?'air-follow':replay.template,part:pose.part,phase:pose.phase,rollAttached:pose.attitudeAttached??!!pose.up,fixed:!!pose.fixed,fixedPosition:!!pose.fixedPosition,tracking:!!pose.tracking,establishing:!!pose.establishing,entryTime:pose.entryTime,followTime:pose.followTime,fallback:this.failedReplayShots.has(key)};
   // Keep the scene to the right of the open result card without moving the shot.
   if(replay.panel)camera.setViewOffset(camera.aspect*1000,1000,-camera.aspect*170,0,camera.aspect*1000,1000);
   this.initialized=false;
  }
  else if(history){
   const pose=historicalCamera(s,history),origin=new THREE.Vector3(s.x,s.y+1,s.z);
   camera.clearViewOffset();camera.fov=pose.fov;this.target.set(...pose.target);this.position.copy(this.constrain(origin,new THREE.Vector3(...pose.position),s));camera.position.copy(this.position);camera.up.set(0,1,0);camera.lookAt(this.target);this.mode=history.kind;this.initialized=false;
  }
  else if(cruise){
   const shot=sampleCruiseCamera(cruise.elapsed),origin=new THREE.Vector3(s.x,s.y+visualOffset,s.z);
   const offset=new THREE.Vector3(...shot.offset).applyAxisAngle(new THREE.Vector3(0,1,0),-s.yaw);
   camera.clearViewOffset();camera.fov=shot.fov;this.target.copy(origin);
   this.position.copy(this.constrain(origin,origin.clone().add(offset),s));camera.position.copy(this.position);
   camera.up.set(0,1,0);camera.lookAt(this.target);camera.rotateZ(shot.roll);
   // The opening intentionally cuts overhead; never inherit a stale orbit or
   // smooth from its old world pose. Saved player view settings stay untouched.
   this.initialized=false;
  }
  else if(cinematic&&airport?.data){camera.clearViewOffset();const center=airport.viewCenter,u=clamp((cinematicTime??(s.time-(s.airline?.previewStarted??0)))/10,0,1),angle=.55+u*.45;camera.fov=36;camera.position.set(center.x+Math.sin(angle)*2100,1250-u*350,center.z+Math.cos(angle)*2100);this.target.set(center.x,25,center.z);camera.lookAt(this.target);this.initialized=false;}
  else if(view.mode==='cockpit'){
   camera.clearViewOffset();camera.fov=36;placeCockpitCamera(camera,s,{motion,visualOffset});this.initialized=false;
  }else{
   camera.fov=43;camera.setViewOffset(camera.aspect*1000,1000,camera.aspect*40,70,camera.aspect*1000,1000);const origin=new THREE.Vector3(s.x,s.y+visualOffset+1.1,s.z),angle=-s.yaw+view.azimuth,elevation=view.elevation,radius=view.distance*(aircraftDefinition(s).visual.cameraScale??1);
   const desired=new THREE.Vector3(origin.x+Math.sin(angle)*Math.cos(elevation)*radius,origin.y+Math.sin(elevation)*radius,origin.z+Math.cos(angle)*Math.cos(elevation)*radius),safe=this.constrain(origin,desired,s);
   const teleported=!this.lastPose||Math.hypot(s.x-this.lastPose.x,s.y-this.lastPose.y,s.z-this.lastPose.z)>1000||this.lastPose.airportId!==s.airportId||s.time<this.lastPose.time;
   if(!this.initialized||view.resetSerial!==this.lastReset||teleported){this.position.copy(safe);this.target.copy(origin);this.initialized=true;}
   else{const alpha=1-Math.exp(-clamp(dt,0,.1)/.09);this.position.add(origin.clone().sub(this.lastOrigin));this.position.lerp(safe,alpha);this.target.copy(origin);}
   // Follow translation immediately so high speed/low FPS cannot make the
   // aircraft drift out of frame. Smooth only the observer's relative offset.
   const separation=this.position.clone().sub(origin);if(separation.length()<42){if(separation.lengthSq()<.001)separation.copy(safe).sub(origin);this.position.copy(origin).add(separation.setLength(42));}this.lastOrigin.copy(origin);
   this.position.copy(this.constrain(this.target,this.position,s));camera.position.copy(this.position);camera.up.set(0,1,0);camera.lookAt(this.target);this.lastReset=view.resetSerial;
  }
  camera.updateProjectionMatrix();this.lastPose={x:s.x,y:s.y,z:s.z,time:s.time,airportId:s.airportId};
  return previous.distanceToSquared(camera.position)>1e-8||1-Math.abs(oldQuaternion.dot(camera.quaternion))>1e-10;
 }
 stats(){return{replayShot:this.replayShot,mode:this.mode,position:this.camera.position.toArray(),target:this.target.toArray(),aircraftDistance:this.mode.startsWith('cruise-')?this.camera.position.distanceTo(this.target):this.lastPose?this.camera.position.distanceTo(new THREE.Vector3(this.lastPose.x,this.lastPose.y+1.1,this.lastPose.z)):0,obstacleAdjusted:this.adjusted,fov:this.camera.fov};}
}
