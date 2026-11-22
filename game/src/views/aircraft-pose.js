import * as THREE from 'three';
const rotation=new THREE.Euler(0,0,0,'YXZ'),point=new THREE.Vector3();
export function placeAircraft(group,s,anchors,heightAt){
 rotation.set(s.pitch,-s.yaw,-s.roll,'YXZ');group.rotation.copy(rotation);let offset=0;
 if(!s.airborne&&s.gearPosition>.95){const points=anchors?.main||[{x:-2.6,y:-2.8,z:2.5},{x:2.6,y:-2.8,z:2.5}];for(const p of points){point.set(p.x,p.y,p.z).applyEuler(rotation);offset=Math.max(offset,heightAt(s.x+point.x,s.z+point.z,s)+.065-(s.y+point.y));}}
 group.position.set(s.x,s.y+offset,s.z);return offset;
}
