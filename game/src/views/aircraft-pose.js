import * as THREE from 'three';
const rotation=new THREE.Euler(0,0,0,'YXZ'),point=new THREE.Vector3();
// Authored Skyline 320 coordinates, inside the captain's front windshield.
// The flight reference is aft of the cockpit and can be submerged while afloat.
export const COCKPIT_EYE=Object.freeze({x:-.55,y:2.3,z:-13.4});
export function placeCockpitCamera(camera,s,{visualOffset=0,motion={}}={}){
 rotation.set(s.pitch,-s.yaw,-s.roll,'YXZ');
 point.set(COCKPIT_EYE.x+(motion.x||0)*4,COCKPIT_EYE.y+(motion.cameraY||0),COCKPIT_EYE.z+(motion.y||0)*2).applyEuler(rotation);
 camera.position.set(s.x+point.x,s.y+visualOffset+point.y,s.z+point.z);
 camera.rotation.set(s.pitch-.021+(motion.cameraPitch||0),-s.yaw,-s.roll+(motion.roll||0),'YXZ');
}
export function placeAircraft(group,s,anchors,heightAt){
 rotation.set(s.pitch,-s.yaw,-s.roll,'YXZ');group.rotation.copy(rotation);let offset=0;
 if(!s.airborne&&s.gearPosition>.95){const points=anchors?.main||[{x:-2.6,y:-2.8,z:2.5},{x:2.6,y:-2.8,z:2.5}];for(const p of points){point.set(p.x,p.y,p.z).applyEuler(rotation);offset=Math.max(offset,heightAt(s.x+point.x,s.z+point.z,s)+.065-(s.y+point.y));}}
 group.position.set(s.x,s.y+offset,s.z);return offset;
}
