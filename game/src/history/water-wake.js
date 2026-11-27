import * as THREE from 'three';
import {FT} from '../sim/constants.js';
import {probePosition} from '../sim/water-contact.js';
import {aircraftContacts} from '../aircraft/contact-anchors.js';
import {eventWaterAt,eventWaterCurrent} from './event-world.js';
import {US1549_PROFILE as P} from './us1549-profile.js';
export const WAKE_APPROACH_HEIGHT=20/FT;
export const WAKE_LIFETIME=8;
const RATE=16,SURFACE_COUNT=1536,SPRAY_COUNT=512,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const aftOf=s=>aircraftContacts(s).water.find(p=>p.id==='belly-aft');
const fogVertex='#include <fog_pars_vertex>\n',fogFragment='#include <fog_pars_fragment>\n';
const grain=`float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fract(sin(dot(i,vec2(127.1,311.7)))*43758.5453),fract(sin(dot(i+vec2(1.,0.),vec2(127.1,311.7)))*43758.5453),f.x),mix(fract(sin(dot(i+vec2(0.,1.),vec2(127.1,311.7)))*43758.5453),fract(sin(dot(i+vec2(1.),vec2(127.1,311.7)))*43758.5453),f.x),f.y);}`;
function layer(root,count,billboard){
 const geometry=new THREE.PlaneGeometry(1,1),opacity=new Float32Array(count),seed=new Float32Array(count);
 geometry.setAttribute('wakeOpacity',new THREE.InstancedBufferAttribute(opacity,1).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('wakeSeed',new THREE.InstancedBufferAttribute(seed,1).setUsage(THREE.DynamicDrawUsage));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,fog:true,side:THREE.DoubleSide,uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{wakeTime:{value:0}}]),vertexShader:fogVertex+`attribute float wakeOpacity;attribute float wakeSeed;varying vec2 vUv;varying float vOpacity;varying float vSeed;void main(){vUv=uv;vOpacity=wakeOpacity;vSeed=wakeSeed;`+(billboard?`vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);mvPosition.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));`:`vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);`)+`gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,fragmentShader:fogFragment+`uniform float wakeTime;varying vec2 vUv;varying float vOpacity;varying float vSeed;`+grain+`void main(){vec2 q=vUv-.5;float n=noise(vUv*vec2(11.,7.)+vSeed+vec2(wakeTime*.13,0.));float fine=noise(vUv*vec2(31.,19.)+vSeed*2.);float edge=1.-smoothstep(.23,.5,length(q+vec2(n-.5,fine-.5)*.12));float a=edge*(.35+.65*n)*(.7+.3*fine)*vOpacity;if(a<.003)discard;gl_FragColor=vec4(vec3(.89,.95,.95),a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n}`});
 const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.name=billboard?'ditching-side-spray':'ditching-world-foam';mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;mesh.renderOrder=billboard?8:7;root.add(mesh);
 return{mesh,geometry,material,opacity,seed,pool:Array.from({length:count},()=>({born:-Infinity})),cursor:0,capacity:count};
}
function snapshot(s){
 const vx=s.velocity?.x??Math.sin(s.yaw)*(s.speed||0),vz=s.velocity?.z??-Math.cos(s.yaw)*(s.speed||0),speed=s.water?.waterSpeed??Math.hypot(vx,vz),a=probePosition(s,aftOf(s));
 return{time:s.time,x:a.x,z:a.z,height:s.y-P.water.levelMSL,vx,vz,speed,yaw:s.yaw,wet:!!s.water,contactAt:s.water?.firstImpact?.time??Infinity,sink:s.water?.firstImpact?.sinkMps||0};
}
function blend(a,b,time){const u=clamp((time-a.time)/(b.time-a.time||1)),p={time};for(const k of['x','z','height','vx','vz','speed','sink'])p[k]=a[k]+(b[k]-a[k])*u;p.yaw=a.yaw+Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))*u;p.contactAt=b.contactAt;p.wet=b.wet&&time>=b.contactAt;return p;}
// All positions are observation-only world-space emission anchors. No wake
// particle, surface mask or replay reconstruction can change flight/contact.
export function createWaterWake(root){
 const surface=layer(root,SURFACE_COUNT,false),spray=layer(root,SPRAY_COUNT,true),matrix=new THREE.Matrix4(),point=new THREE.Vector3(),scale=new THREE.Vector3(),identity=new THREE.Quaternion(),rotation=new THREE.Quaternion(),basis=new THREE.Matrix4(),right=new THREE.Vector3(),forward=new THREE.Vector3(),normal=new THREE.Vector3(0,1,0),waterCells=new Map();
 let previous=null,domain=null,lastBurst=-Infinity,lastTime=null,phase='none',peak=0,spread=0,oldest=0,emitted=0,rebuilds=0;
 function wetCell(x,z){
  const i=Math.floor(x/4),j=Math.floor(z/4),key=i+':'+j;if(waterCells.has(key))return waterCells.get(key);
  const wet=eventWaterAt(i*4,j*4)&&eventWaterAt((i+1)*4,j*4)&&eventWaterAt(i*4,(j+1)*4)&&eventWaterAt((i+1)*4,(j+1)*4);if(waterCells.size>=4096)waterCells.delete(waterCells.keys().next().value);waterCells.set(key,wet);return wet;
 }
 function clear(){for(const l of[surface,spray]){for(const p of l.pool)p.born=-Infinity;l.cursor=0;l.mesh.count=0;l.mesh.visible=false;}previous=null;lastBurst=-Infinity;lastTime=null;peak=spread=oldest=0;phase='none';}
 function put(l,p){Object.assign(l.pool[l.cursor],p);l.cursor=(l.cursor+1)%l.capacity;emitted++;}
 function emit(p,burst=false){
  const contact=p.wet&&p.time>=p.contactAt,speed=Math.max(0,p.speed),close=!contact&&p.height>=0&&p.height<WAKE_APPROACH_HEIGHT&&speed>30;
  if(!contact&&!close||contact&&speed<2.5||!wetCell(p.x,p.z))return;
  const length=Math.hypot(p.vx,p.vz),fx=length>1?p.vx/length:Math.sin(p.yaw),fz=length>1?p.vz/length:-Math.cos(p.yaw),rx=-fz,rz=fx,proximity=Math.sqrt(clamp(1-p.height/WAKE_APPROACH_HEIGHT)),strength=contact?clamp(speed/60):clamp((speed-30)/35),tick=Math.round(p.time*RATE),copies=burst?12:contact?3:1;
  for(const side of[-1,0,1])for(let i=0;i<copies;i++){
   const seed=tick*43+(side+1)*11+i*3+(burst?1901:0),r=hash(seed),base=contact?3.1:7.5,offset=side*base+(r-.5)*(contact?2:1),along=(hash(seed+1)-.5)*5;
   put(surface,{born:p.time,x:p.x+rx*offset+fx*along,z:p.z+rz*offset+fz*along,rx,rz,fx,fz,side,seed:r*100,life:contact?WAKE_LIFETIME:2.8,expansion:contact?1.4+speed*.055+r*2:.6+r*.35,width:contact?3.8+r*2:2.1,length:contact?6+r*3:4,growth:contact?1.5:1,opacity:contact?(side===0?.58:.7)*strength*(burst?1.15:1):.22*proximity*strength*(side===0?.45:1)});
  }
  if(contact){const count=burst?28:3;for(const side of[-1,1])for(let i=0;i<count;i++){
   const seed=tick*31+i*7+side*13+(burst?547:0),r=hash(seed);put(spray,{born:p.time,x:p.x+rx*side*3,z:p.z+rz*side*3,rx,rz,fx,fz,side,seed:r*100,life:1.3+r,expansion:3+speed*.07+r*3,vx:eventWaterCurrent.x+fx*speed*.13,vz:eventWaterCurrent.z+fz*speed*.13,lift:2.3+r*2+speed*.025+(burst?Math.min(3,p.sink*.5):0),width:2.5+r*3,height:1.8+r*2.3,opacity:(burst?.75:.5)*strength});
  }}
 }
 function feed(p){
  if(!previous){previous=p;emit(p);if(p.wet&&p.time-p.contactAt<.15&&p.contactAt!==lastBurst){emit({...p,time:p.contactAt},true);lastBurst=p.contactAt;}return;}
  if(p.time<=previous.time)return;
  if(p.wet&&p.contactAt!==lastBurst&&p.contactAt>=previous.time-1e-6&&p.contactAt<=p.time){emit({...blend(previous,p,p.contactAt),wet:true},true);lastBurst=p.contactAt;}
  for(let n=Math.floor(previous.time*RATE+1e-7)+1;n<=Math.floor(p.time*RATE+1e-7);n++)emit(blend(previous,p,n/RATE));previous=p;
 }
 function render(l,time,billboard){
  let n=0;for(const p of l.pool){const age=time-p.born;if(!Number.isFinite(p.born)||age<0||age>=p.life)continue;
   const distance=p.side*p.expansion*age,x=p.x+(billboard?p.vx:eventWaterCurrent.x)*age+p.rx*distance,z=p.z+(billboard?p.vz:eventWaterCurrent.z)*age+p.rz*distance;
   const width=billboard?p.width+age*3:p.width+age*p.growth,depth=billboard?p.height+age*2:p.length+age*1.4;
   if(!wetCell(x,z)||!billboard&&(!wetCell(x+p.rx*width*.4,z+p.rz*width*.4)||!wetCell(x-p.rx*width*.4,z-p.rz*width*.4)))continue;
   const alive=billboard?clamp((2*p.lift/9.81+.2-age)*5):1,fade=(1-age/p.life)**(billboard?1.3:1.8),alpha=p.opacity*fade*alive*Math.min(1,age/(billboard?.035:.06));if(alpha<.003)continue;
   const y=billboard?.12+Math.max(0,p.lift*age-4.905*age*age):.045+(p.seed%1)*.018;
   point.set(x,P.water.levelMSL+y,z);scale.set(width,depth,1);
   // Plane x follows the cross-wake direction, y follows the track. A spray
   // quad is camera-facing in the vertex shader; its world anchor stays put.
   if(billboard)rotation.copy(identity);else rotation.setFromRotationMatrix(basis.makeBasis(right.set(p.rx,0,p.rz),forward.set(p.fx,0,p.fz),normal));
   matrix.compose(point,rotation,scale);l.mesh.setMatrixAt(n,matrix);l.opacity[n]=alpha;l.seed[n]=p.seed;n++;peak=Math.max(peak,alpha);spread=Math.max(spread,Math.abs(distance));oldest=Math.max(oldest,age);
  }
  l.mesh.count=n;l.mesh.visible=n>0;l.material.uniforms.wakeTime.value=time;
  for(const a of[l.mesh.instanceMatrix,l.geometry.attributes.wakeOpacity,l.geometry.attributes.wakeSeed]){a.clearUpdateRanges();if(n)a.addUpdateRange(0,n*a.itemSize);a.needsUpdate=true;}
 }
 return{update(s,{sampleState=null}={}){
  const key=s.replayAudio?`replay:${s.replayAudio.segment}:${s.replayAudio.attempt}:${s.replayAudio.cycle}:${s.replayAudio.epoch}`:'live',p=snapshot(s),delta=previous?p.time-previous.time:0,jump=previous&&(delta< -1e-6||delta>1||Math.hypot(p.x-previous.x,p.z-previous.z)>Math.max(250,delta*350));
  const reset=domain!==key||jump||!previous;if(reset){clear();domain=key;if(sampleState){rebuilds++;let seen=-Infinity;for(let t=Math.floor((s.time-WAKE_LIFETIME)*RATE)/RATE;t<s.time;t+=1/RATE){const state=sampleState(t);if(state&&state.time>seen&&state.time<=s.time){feed(snapshot(state));seen=state.time;}}}}
  if(lastTime===s.time&&!reset)return;feed(p);lastTime=s.time;peak=spread=oldest=0;render(surface,s.time,false);render(spray,s.time,true);
  const emitting=p.wet&&p.speed>=2.5||!p.wet&&p.height>=0&&p.height<WAKE_APPROACH_HEIGHT&&p.speed>30&&wetCell(p.x,p.z);phase=emitting?(p.wet?'contact':'approach'):surface.mesh.count||spray.mesh.count?'dissipating':'none';
 },stats:()=>({phase,foam:surface.mesh.count,spray:spray.mesh.count,peakOpacity:peak,maxSpread:spread,oldestAge:oldest,capacity:SURFACE_COUNT+SPRAY_COUNT,bufferBytes:(SURFACE_COUNT+SPRAY_COUNT)*18*4,waterCells:waterCells.size,approachHeightFt:20,emitted,rebuilds}),dispose(){clear();waterCells.clear();for(const l of[surface,spray]){l.geometry.dispose();l.material.dispose();l.mesh.removeFromParent();}}};
}
