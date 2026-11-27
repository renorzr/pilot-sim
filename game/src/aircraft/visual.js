import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {siteUrl} from '../urls.js';
import {AIRCRAFT_CONTACTS,aircraftContacts} from './contact-anchors.js';
import {resolveAircraft,aircraftResources,aircraftTextureSize} from './catalog.js';
import {aircraftDefinition,DEFAULT_DEFINITION} from './registry.js';
import {createAircraftRig,rigNodeNames} from './rig.js';
export {AIRCRAFT_CONTACTS};

export const AIRCRAFT_ASSET=siteUrl(DEFAULT_DEFINITION.visual.assetVersions['1'].path);
// Preserve authored UVs, tangents and colours. Different attribute layouts or
// storage formats need separate batches, even when they share a material.
const attributeLayout=geometry=>JSON.stringify(Object.keys(geometry.attributes).sort().map(name=>{
 const a=geometry.attributes[name];return[name,a.itemSize,a.normalized,a.array.constructor.name,a.gpuType];
}));

// The caller owns world position/attitude and camera state. This module reads
// flight state and changes only the authored visual joints inside the model.
export function createAircraftVisual({THREE,scene,appearance,paint=null}){
 const identity=resolveAircraft(appearance),definition=aircraftDefinition(identity),asset=definition.visual.assetVersions[String(identity.assetVersion)];
 const group=new THREE.Group();group.name='Player-aircraft';group.add(scene);
 const named=new Map(),sourceGeometries=new Set(),materials=new Set();scene.updateMatrixWorld(true);
 scene.traverse(o=>{if(o.name)named.set(o.name,o);if(o.geometry)sourceGeometries.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){materials.add(m);m.side=THREE.DoubleSide;m.envMapIntensity=.8;if(m.name===asset.paintMaterial&&paint){if(!o.geometry?.attributes.uv)throw new Error('Aircraft paint surface has no UVs: '+o.name);m.map=paint;m.color.set(0xffffff);m.needsUpdate=true;}}});
 for(const [kind,variant]of Object.entries(definition.visual.variants))for(const name of variant.nodes){const node=named.get(name);if(node){node.visible=identity.variant===kind;if(!node.visible){const hidden=[];node.traverse(o=>{if(o.isMesh)hidden.push(o);});hidden.forEach(o=>o.removeFromParent());}}}
 // Only the selected static variant enters the shared airframe batch.
 const jointNames=new Set(rigNodeNames(definition).flatMap(name=>[name,name.replaceAll(' ','_')]));
 const airframe=named.get('Airframe')||scene,animated=new Set([...named.values()].filter(o=>jointNames.has(o.name))),batches=new Map();
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
 const get=name=>named.get(name)||named.get(name.replaceAll(' ','_')),rig=createAircraftRig(get,definition);
 let currentSummary={};
 function update(s,dt=0){currentSummary=rig.update(s,dt);group.updateMatrixWorld(true);}
 function stats(){let triangles=0,draws=0;const box=new THREE.Box3();scene.traverseVisible(o=>{if(o.isMesh){triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;draws++;box.expandByObject(o);}});return{appearance:{...identity},texture:paint?{width:paint.image?.width,height:paint.image?.height,compressed:!!paint.isCompressedTexture,mipLevels:paint.mipmaps?.length,gpuBytes:paint.mipmaps?.reduce((n,m)=>n+(m.data?.byteLength||0),0)}:null,triangles,draws,materials:materials.size,bounds:{min:box.min.toArray(),max:box.max.toArray()},joints:[...animated].map(o=>o.name),...currentSummary};}
 let released=false;
 function dispose(){if(released)return;released=true;sourceGeometries.forEach(g=>g.dispose());const textures=new Set();if(paint)textures.add(paint);materials.forEach(m=>{for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();});textures.forEach(t=>t.dispose());group.removeFromParent();}
 return{group,update,dispose,stats,appearance:identity,detailParts:part=>(definition.visual.details[part==='wheel'?'wheel':'tail']||[]).map(get).filter(Boolean),anchors:aircraftContacts(identity)};
}

export async function loadAircraftVisual({THREE,loadingManager,renderer,appearance,textureSize=aircraftTextureSize(renderer)}){
 const resource=aircraftResources(appearance,textureSize),loader=new GLTFLoader(loadingManager),ktx=new KTX2Loader(loadingManager);let scene,paint;
 const ticket='aircraft-ready:'+resource.paint.url;loadingManager?.itemStart(ticket);
 try{
  if(!renderer)throw new Error('A renderer is required for aircraft texture capability detection');
  ktx.setTranscoderPath(resource.transcoder).setWorkerLimit(1).detectSupport(renderer);
  // Settle both requests before releasing anything: a failed request must not
  // leak its successful sibling's geometry/texture or worker.
  const results=await Promise.allSettled([loader.loadAsync(resource.model),ktx.loadAsync(resource.paint.url)]);
  if(results[0].status==='fulfilled')scene=results[0].value.scene;
  if(results[1].status==='fulfilled')paint=results[1].value;
  for(const result of results)if(result.status==='rejected')throw result.reason;
  if(scene.getObjectByName(resource.asset.root)?.userData.uvLayout!==resource.appearance.uvLayout)throw new Error('Aircraft model and paint UV layouts do not match');
  paint.colorSpace=THREE.SRGBColorSpace;paint.flipY=false;paint.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  return createAircraftVisual({THREE,scene,appearance:resource.appearance,paint});
 }catch(error){
  const geometries=new Set(),materials=new Set();scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());paint?.dispose();throw error;
 }finally{ktx.dispose();loadingManager?.itemEnd(ticket);}
}
