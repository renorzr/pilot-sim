import * as THREE from 'three';
import {surfaceHeight}from '../terrain/heightfield.js';
import {sampleCruiseCamera}from './cruise-camera-track.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class FlightCameraRig{
 constructor(camera,{heightAt=surfaceHeight,obstruction=()=>null}={}){this.camera=camera;this.heightAt=heightAt;this.obstruction=obstruction;this.position=new THREE.Vector3();this.target=new THREE.Vector3();this.initialized=false;this.lastReset=-1;this.lastPose=null;this.adjusted=false;this.mode='cockpit';this.look=new THREE.Vector3();this.lastOrigin=new THREE.Vector3();}
 constrain(origin,desired,s){
  const result=desired.clone();
  // Sample the shared physical terrain along the camera sight line. Only the
  // observer moves; no camera correction enters the aircraft state.
  for(let i=2;i<=16;i++){const t=i/16,x=origin.x+(result.x-origin.x)*t,z=origin.z+(result.z-origin.z)*t,h=this.heightAt(x,z,s)+2.5;if(origin.y+(result.y-origin.y)*t<h){result.y=Math.max(result.y,origin.y+(h-origin.y)/t);this.adjusted=true;}}
  const hit=this.obstruction(origin,result);
  if(hit){const length=origin.distanceTo(result),safe=hit.distance-3;
   if(safe>=42)result.lerpVectors(origin,result,safe/length);
   else{const t=Math.max(.08,hit.distance/Math.max(1,length));result.y=Math.max(result.y,origin.y+(hit.top+4-origin.y)/t);}
   this.adjusted=true;
  }
  const ground=this.heightAt(result.x,result.z,s)+2.5;if(result.y<ground){result.y=ground;this.adjusted=true;}return result;
 }
 update(s,view,dt,{motion={},cinematic=false,cinematicTime=null,cruise=null,airport,visualOffset=0}={}){
  this.adjusted=false;const camera=this.camera,previous=camera.position.clone(),oldQuaternion=camera.quaternion.clone();this.mode=cruise?'cruise-'+cruise.phase:cinematic?'intro':view.mode;
  if(cruise){
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
   camera.clearViewOffset();camera.fov=36;camera.position.set(s.x+(motion.x||0)*4,s.y+(motion.cameraY||0),s.z+(motion.y||0)*2);camera.rotation.set(s.pitch-.021+(motion.cameraPitch||0),-s.yaw,-s.roll+(motion.roll||0),'YXZ');this.initialized=false;
  }else{
   camera.fov=43;camera.setViewOffset(camera.aspect*1000,1000,camera.aspect*40,70,camera.aspect*1000,1000);const origin=new THREE.Vector3(s.x,s.y+visualOffset+1.1,s.z),angle=-s.yaw+view.azimuth,elevation=view.elevation,radius=view.distance;
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
 stats(){return{mode:this.mode,position:this.camera.position.toArray(),target:this.target.toArray(),aircraftDistance:this.mode.startsWith('cruise-')?this.camera.position.distanceTo(this.target):this.lastPose?this.camera.position.distanceTo(new THREE.Vector3(this.lastPose.x,this.lastPose.y+1.1,this.lastPose.z)):0,obstacleAdjusted:this.adjusted,fov:this.camera.fov};}
}
