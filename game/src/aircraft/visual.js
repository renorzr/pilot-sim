import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {siteUrl} from '../urls.js';

export const AIRCRAFT_ASSET=siteUrl('assets/aircraft/skyline-320.glb?v=belly-white-3');
export const AIRCRAFT_CONTACTS=Object.freeze({
 main:[{x:-2.85,y:-2.8,z:2.5},{x:-2.35,y:-2.8,z:2.5},{x:2.35,y:-2.8,z:2.5},{x:2.85,y:-2.8,z:2.5}],
 nose:[{x:-.24,y:-2.8,z:-12.3},{x:.24,y:-2.8,z:-12.3}],
 wing:[{x:-17.9,y:2.28,z:6},{x:17.9,y:2.28,z:6}],
});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const flapAngle=p=>{const values=[0,.12,.28,.43,.61],i=Math.min(3,Math.floor(clamp(p,0,4))),f=clamp(p,0,4)-i;return values[i]+(values[i+1]-values[i])*f;};
const moving=/^(MainGear_[LR]|MainWheels_[LR]|MainDoor_[LR]|NoseGear|NoseSteering|NoseWheels|NoseDoor_[LR]|Flap_[LR]_[01]|Slat_[LR]|Aileron_[LR]|Spoiler_[LR]_[012]|Elevator_[LR]|Rudder|Fan_[LR]|Reverse_[LR]|Beacon_(top|bottom)|Strobe_[LR]|Landing_[LR])$/;
// Preserve authored UVs, tangents and colours. Different attribute layouts or
// storage formats need separate batches, even when they share a material.
const attributeLayout=geometry=>JSON.stringify(Object.keys(geometry.attributes).sort().map(name=>{
 const a=geometry.attributes[name];return[name,a.itemSize,a.normalized,a.array.constructor.name,a.gpuType];
}));

// The caller owns world position/attitude and camera state. This module reads
// flight state and changes only the authored visual joints inside the model.
export function createAircraftVisual({THREE,scene}){
 const group=new THREE.Group();group.name='Player-aircraft';group.add(scene);
 const named=new Map(),sourceGeometries=new Set(),materials=new Set();scene.updateMatrixWorld(true);
 scene.traverse(o=>{if(o.name)named.set(o.name,o);if(o.geometry)sourceGeometries.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){materials.add(m);m.side=THREE.DoubleSide;m.envMapIntensity=.8;}});
 const airframe=named.get('Airframe')||scene,animated=new Set([...named.values()].filter(o=>moving.test(o.name))),batches=new Map();
 scene.traverse(o=>{
  if(!o.isMesh||Array.isArray(o.material))return;
  let owner=o;while(owner&&!animated.has(owner)&&owner!==airframe)owner=owner.parent;owner??=airframe;
  const key=owner.uuid+':'+o.material.uuid+':'+attributeLayout(o.geometry);if(!batches.has(key))batches.set(key,{owner,material:o.material,meshes:[]});batches.get(key).meshes.push(o);
 });
 for(const {owner,material,meshes}of batches.values()){
  if(meshes.length<2)continue;
  const inverse=owner.matrixWorld.clone().invert(),parts=meshes.map(m=>{const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(inverse.clone().multiply(m.matrixWorld));if(!g.attributes.normal)g.computeVertexNormals();return g;});
  const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());if(!geometry)throw new Error('Aircraft material batch failed');
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Aircraft-batch-'+owner.name+'-'+material.name;mesh.castShadow=true;mesh.receiveShadow=true;owner.add(mesh);meshes.forEach(m=>m.removeFromParent());sourceGeometries.add(geometry);
 }
 group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 const get=name=>named.get(name),set=(name,axis,value)=>{const o=get(name);if(o)o.rotation[axis]=value;},phase={L:0,R:0,wheel:0};let previousTime=null;
 const lamps=[...named.values()].filter(o=>/^(Beacon_|Strobe_|Landing_)/.test(o.name));
 let currentSummary={};
 function update(s,dt=0){
  const time=Number.isFinite(s.time)?s.time:0,elapsed=dt<=0||previousTime===null||time<previousTime||time-previousTime>1?0:clamp(time-previousTime,0,.25);previousTime=time;
  const gear=clamp(s.gearPosition??(s.gear?1:0)),retracted=1-gear,door=Math.sin(Math.PI*gear),flaps=clamp(s.flapPosition??s.flaps??0,0,4),flap=flapAngle(flaps),spoiler=clamp(Number(s.spoilersDeployed)||0),pitch=clamp(s.autoPilot?(s.controls?.pitchCommand??0)/.09:(s.stickPitch??0),-1,1),roll=clamp(s.autoPilot?(s.controls?.rollCommand??0)/.36:(s.stickRoll??0),-1,1),rudder=clamp(s.controls?.rudderApplied??s.controls?.rudder??0,-1,1),steer=clamp(s.ground?.steering??rudder,-1,1);
  for(const[label,side]of[['L',-1],['R',1]]){
   set('MainGear_'+label,'z',-side*retracted*1.66);const main=get('MainGear_'+label);if(main)main.visible=gear>.005;
   set('MainDoor_'+label,'z',side*(door*1.20+gear*.06));set('NoseDoor_'+label,'z',side*(door*1.25+gear*.06));
   for(let i=0;i<2;i++){set(`Flap_${label}_${i}`,'x',flap);const o=get(`Flap_${label}_${i}`);if(o){o.position.y=(o.userData.restY??=o.position.y)-flaps*.018;o.position.z=(o.userData.restZ??=o.position.z)+flaps*.045;}}
   const slat=get('Slat_'+label),fraction=clamp(flaps);if(slat){slat.position.y=(slat.userData.restY??=slat.position.y)-fraction*.08;slat.position.z=(slat.userData.restZ??=slat.position.z)-fraction*.16;slat.rotation.x=-fraction*.14;}
   set('Aileron_'+label,'x',-side*roll*.28);set('Elevator_'+label,'x',-pitch*.35);
   for(let i=0;i<3;i++)set(`Spoiler_${label}_${i}`,'x',-spoiler*.95);
   const e=s.engines?.[side<0?0:1],spool=clamp(e?.spool??0),n1=clamp(e?.n1??(e?.status==='running'?25+spool*73:0),0,100),rate=n1/100*115;phase[label]=(phase[label]+elapsed*rate)% (Math.PI*2);set('Fan_'+label,'z',phase[label]);
   const rev=get('Reverse_'+label),open=s.reverse&&s.landed&&s.throttle<.025&&e?.status==='running'&&e.thrustN<0?clamp(spool/.5):0;if(rev)rev.position.z=(rev.userData.restZ??=rev.position.z)+open*.5;
  }
  set('NoseGear','x',retracted*1.74);if(get('NoseGear'))get('NoseGear').visible=gear>.005;set('NoseSteering','y',-steer*.56);set('Rudder','y',rudder*.38);
  const gs=s.airData?.groundSpeed??Math.hypot(s.velocity?.x??0,s.velocity?.z??0);phase.wheel=(phase.wheel+elapsed*Math.max(0,gs)/.65)%(Math.PI*2);for(const label of['L','R'])set('MainWheels_'+label,'x',phase.wheel);set('NoseWheels','x',phase.wheel*.65/.4);
  for(const o of lamps){if(o.name.startsWith('Beacon_'))o.visible=time%1.1<.13;else if(o.name.startsWith('Strobe_')){const p=time%1.25;o.visible=p<.045||p>.11&&p<.155;}else o.visible=gear>.1||(!s.airborne&&(s.throttle??0)>.15);}
  currentSummary={gearPosition:gear,flapPosition:flaps,spoilersDeployed:spoiler,noseSteering:steer,engines:(s.engines||[]).map(e=>({status:e.status,spool:e.spool,n1:e.n1})),fanAngles:{L:phase.L,R:phase.R},time,surfaces:{pitch,roll,rudder}};
  group.updateMatrixWorld(true);
 }
 function stats(){let triangles=0,draws=0;group.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;if(o.visible)draws++;}});const box=new THREE.Box3().setFromObject(group);return{triangles,draws,materials:materials.size,bounds:{min:box.min.toArray(),max:box.max.toArray()},joints:[...animated].map(o=>o.name),...currentSummary};}
 function dispose(){sourceGeometries.forEach(g=>g.dispose());materials.forEach(m=>{for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();});group.removeFromParent();}
 return{group,update,dispose,stats,anchors:AIRCRAFT_CONTACTS};
}

export async function loadAircraftVisual({THREE,loadingManager}){
 const loader=new GLTFLoader(loadingManager),gltf=await loader.loadAsync(AIRCRAFT_ASSET);return createAircraftVisual({THREE,scene:gltf.scene});
}
