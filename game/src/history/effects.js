import * as THREE from 'three';
import {eventWaterAt} from './event-world.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
// These observation meshes never enter contact geometry or the recorded flight.
export function createHistoricalEffects(scene){
 const root=new THREE.Group();root.name='historical-presentation-effects';scene.add(root);
 const white=new THREE.MeshBasicMaterial({color:'#e1e9e7',transparent:true,opacity:.5,depthWrite:false}),foam=new THREE.InstancedMesh(new THREE.CircleGeometry(1,10),white,64),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);root.add(foam);foam.frustumCulled=false;
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.65,.15,.18,-.18,0,.3,0,0,0,.65,.15,.18,.18,0,.3],3));geo.computeVertexNormals();
 const birds=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({color:'#343b3f',side:THREE.DoubleSide}),18);birds.frustumCulled=false;root.add(birds);
 const hull=new THREE.MeshStandardMaterial({color:'#d9ddd7',roughness:.8}),blue=new THREE.MeshStandardMaterial({color:'#375a6b',roughness:.55}),yellow=new THREE.MeshStandardMaterial({color:'#e1b76e',roughness:.85}),boats=[],rafts=[];
 function box(g,w,h,d,mat,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);}
 for(let i=0;i<2;i++){const g=new THREE.Group();g.name='presentation-rescue-boat-'+i;box(g,5,1.2,13,hull,0,.8,0);box(g,3.8,2.5,6,hull,0,2.5,0);box(g,3.9,.8,5.3,blue,0,3.2,-.1);box(g,.15,3,.15,hull,0,5,1);root.add(g);boats.push(g);}
 for(const side of[-1,1]){const g=new THREE.Group(),ring=new THREE.Mesh(new THREE.TorusGeometry(2.3,.4,6,20),yellow);ring.rotation.x=-Math.PI/2;g.add(ring);box(g,3.8,.15,3.8,hull,0,0,0);root.add(g);rafts.push({g,side});}
 return{update(s,history){
  const w=s.water,t=s.time,age=w?.firstImpact?t-w.firstImpact.time:Infinity;foam.visible=!!w;birds.visible=!s.presentationKind&&s.historical?.crew?.birdAt!=null&&t-s.historical.crew.birdAt<1.4;
  if(foam.visible){const speed=w.waterSpeed||0,splash=Math.exp(-Math.max(0,age)*1.5),back={x:-Math.sin(s.yaw),z:Math.cos(s.yaw)},right={x:Math.cos(s.yaw),z:Math.sin(s.yaw)};white.opacity=clamp(.07+speed/100+splash*.6,0,.7);
   for(let i=0;i<64;i++){const u=i/63,side=i%2?1:-1,spread=(1-u)*12+splash*5,trail=u*Math.min(100,speed*2+18),size=(.5+u*1.5)*(1+speed/40+splash*2);matrix.compose(new THREE.Vector3(s.x+back.x*trail+right.x*side*spread,.08+Math.sin(t*9+i)*splash*.12,s.z+back.z*trail+right.z*side*spread),rotation,new THREE.Vector3(size,size*.55,1));foam.setMatrixAt(i,matrix);}foam.instanceMatrix.needsUpdate=true;
  }
  if(birds.visible){const a=t-s.historical.crew.birdAt;for(let i=0;i<18;i++){const f=10+i*3-a*100,r=(i%6-2.5)*3;matrix.compose(new THREE.Vector3(s.x+Math.sin(s.yaw)*f+Math.cos(s.yaw)*r,s.y+2+i%3+Math.sin(a*20+i)*.4,s.z-Math.cos(s.yaw)*f+Math.sin(s.yaw)*r),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-s.yaw),new THREE.Vector3(1,1,1));birds.setMatrixAt(i,matrix);}birds.instanceMatrix.needsUpdate=true;}
  const rescue=history?.kind==='history-rescue';for(const[i,g]of boats.entries()){g.visible=rescue;if(!rescue)continue;const u=clamp(history.elapsed/history.duration),side=i?1:-1;let dx=Math.cos(s.yaw)*side*(72-u*35),dz=Math.sin(s.yaw)*side*(72-u*35)+12*(i?1:-1);for(let j=0;j<5&&!eventWaterAt(s.x+dx,s.z+dz);j++){dx*=.7;dz*=.7;}g.position.set(s.x+dx,.03,s.z+dz);g.rotation.y=-s.yaw+side*Math.PI/2;}
  for(const{g,side}of rafts){g.visible=!!w&&['evacuation','complete'].includes(w.phase);if(g.visible){const dx=side*7,dz=-10;g.position.set(s.x+dx*Math.cos(s.yaw)-dz*Math.sin(s.yaw),.25,s.z+dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw));g.scale.setScalar(clamp((rescue?history.elapsed:w.evacuationSeconds||0)/3,.1,1));}}
 },dispose(){root.traverse(o=>o.geometry?.dispose());for(const m of[white,birds.material,hull,blue,yellow])m.dispose();root.removeFromParent();}};
}
