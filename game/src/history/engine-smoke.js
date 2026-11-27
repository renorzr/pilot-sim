import * as THREE from 'three';
import {aircraftDefinition} from '../aircraft/registry.js';
const COUNT=80,clamp=x=>Math.max(0,Math.min(1,x));
export function createEngineSmoke(root){
 const geometry=new THREE.PlaneGeometry(1,1),alpha=new Float32Array(COUNT);geometry.setAttribute('puffAlpha',new THREE.InstancedBufferAttribute(alpha,1));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{},vertexShader:`attribute float puffAlpha;varying vec2 vUv;varying float vAlpha;void main(){vUv=uv;vAlpha=puffAlpha;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*center;}`,fragmentShader:`varying vec2 vUv;varying float vAlpha;void main(){vec2 q=vUv-.5;float a=(1.-smoothstep(.12,.5,length(q)))*vAlpha;float grain=.85+.15*sin(vUv.x*19.+sin(vUv.y*13.));gl_FragColor=vec4(vec3(.26,.28,.29),a*grain);}`});
 const mesh=new THREE.InstancedMesh(geometry,material,COUNT);mesh.name='bird-ingestion-engine-smoke';mesh.frustumCulled=false;root.add(mesh);
 const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Euler(0,0,0,'YXZ'),identity=new THREE.Quaternion();let peak=0,visible=0;
 return{update(s,age){
  const engines=aircraftDefinition(s).geometry.engineEffects;
  peak=0;visible=0;mesh.visible=Number.isFinite(age)&&age>=0&&age<35&&!s.water;if(!mesh.visible)return;
  rotation.set(s.pitch,-s.yaw,-s.roll,'YXZ');const decay=Math.exp(-age/12),speed=Math.max(35,s.airData?.tas||s.speed||100);
  for(let i=0;i<COUNT;i++){
   const engineIndex=i%engines.length,e=s.engines?.[engineIndex],anchor=engines[engineIndex],u=(i/engines.length)%(COUNT/engines.length)/(COUNT/engines.length),life=1.6,particleAge=((age+u*life)%life),born=age-particleAge,valid=born>=0&&e?.status==='failed'&&e.damageCause==='bird-ingestion';
   const opacity=valid?.17*decay*(1-particleAge/life)*Math.min(1,particleAge/.07):0;alpha[i]=opacity;peak=Math.max(peak,opacity);if(opacity>.001)visible++;
   point.set(anchor.x,anchor.y+.25,anchor.z+2.5).applyEuler(rotation);const trail=particleAge*speed*.32;
   point.add(new THREE.Vector3(s.x-Math.sin(s.yaw)*trail+Math.sin(i*2.3+born)*particleAge*.7,s.y+particleAge*1.1,s.z+Math.cos(s.yaw)*trail+Math.cos(i*1.7)*particleAge*.6));
   const size=.65+particleAge*2.1;matrix.compose(point,identity,scale.setScalar(size));mesh.setMatrixAt(i,matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;geometry.attributes.puffAlpha.needsUpdate=true;
 },stats:()=>({visible:mesh.visible,puffs:visible,opacity:peak,capacity:COUNT}),dispose(){geometry.dispose();material.dispose();mesh.removeFromParent();}};
}
