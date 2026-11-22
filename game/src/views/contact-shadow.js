import * as THREE from 'three';
import {surfaceHeight}from '../terrain/heightfield.js';
export function createContactShadow(scene){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');c.translate(256,256);c.scale(10,10);c.fillStyle='#000';c.shadowColor='#000';c.shadowBlur=14;
 c.beginPath();c.ellipse(0,2.25,2.2,18.8,0,0,Math.PI*2);c.fill();
 c.beginPath();for(const[i,p]of[[-2,-5],[-17.9,4],[-17.9,6],[-2,2],[2,2],[17.9,6],[17.9,4],[2,-5]].entries())i?c.lineTo(...p):c.moveTo(...p);c.closePath();c.fill();
 c.beginPath();for(const[i,p]of[[-1,12],[-6.5,17],[-6.5,18],[6.5,18],[6.5,17],[1,12]].entries())i?c.lineTo(...p):c.moveTo(...p);c.closePath();c.fill();
 const texture=new THREE.CanvasTexture(canvas),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.25,depthWrite:false,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-10,side:THREE.DoubleSide});
 const geometry=new THREE.PlaneGeometry(51.2,51.2,12,12);geometry.rotateX(-Math.PI/2);const original=geometry.attributes.position.array.slice(),mesh=new THREE.Mesh(geometry,material);mesh.name='aircraft-contact-shadow';mesh.renderOrder=13;mesh.frustumCulled=false;scene.add(mesh);
 return{update(s,visible){const ground=surfaceHeight(s.x,s.z,s),height=Math.max(0,s.y-2.8-ground);mesh.visible=visible&&!s.impact&&height<120;if(!mesh.visible)return;material.opacity=.25*Math.max(0,1-height/120);const p=geometry.attributes.position,co=Math.cos(s.yaw),si=Math.sin(s.yaw),scale=1+height*.002,ox=s.x+height*.5,oz=s.z-height*.375;for(let i=0;i<p.count;i++){const x=original[i*3]*scale,z=original[i*3+2]*scale,wx=ox+x*co-z*si,wz=oz+x*si+z*co;p.setXYZ(i,wx,surfaceHeight(wx,wz,s)+.085,wz);}p.needsUpdate=true;},dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();texture.dispose();}};
}
