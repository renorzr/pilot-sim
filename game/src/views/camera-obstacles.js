import * as THREE from 'three';
// Keep exact static meshes for short camera rays after their render copies are
// merged. A coarse spatial grid avoids testing the whole airport every frame.
export function cameraObstacles(scene){
 const cells=new Map(),size=160;scene.updateMatrixWorld(true);
 scene.traverse(mesh=>{if(!mesh.isMesh||mesh.isInstancedMesh||Array.isArray(mesh.material))return;const box=new THREE.Box3().setFromObject(mesh),extent=box.getSize(new THREE.Vector3());if(!mesh.userData.cameraObstacle&&(extent.y<2||extent.x<.4||extent.z<.4)||mesh.name==='shared-DEM-terrain')return;
  const entry={mesh,box};for(let z=Math.floor(box.min.z/size);z<=Math.floor(box.max.z/size);z++)for(let x=Math.floor(box.min.x/size);x<=Math.floor(box.max.x/size);x++){const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(entry);}
 });
 const raycaster=new THREE.Raycaster(),direction=new THREE.Vector3(),point=new THREE.Vector3();
 return(origin,destination,{near=4}={})=>{
  direction.subVectors(destination,origin);const distance=direction.length();if(distance<1)return null;direction.normalize();raycaster.set(origin,direction);raycaster.near=near;raycaster.far=distance+2;const candidates=new Set();
  for(let z=Math.floor(Math.min(origin.z,destination.z)/size);z<=Math.floor(Math.max(origin.z,destination.z)/size);z++)for(let x=Math.floor(Math.min(origin.x,destination.x)/size);x<=Math.floor(Math.max(origin.x,destination.x)/size);x++)for(const entry of cells.get(x+':'+z)||[])candidates.add(entry);
  let closest=null;for(const entry of candidates){if(!entry.box.containsPoint(origin)&&(!raycaster.ray.intersectBox(entry.box,point)||point.distanceTo(origin)>distance+2))continue;const hits=raycaster.intersectObject(entry.mesh,false);if(hits[0]&&(!closest||hits[0].distance<closest.distance))closest={distance:hits[0].distance,top:entry.box.max.y};}return closest;
 };
}
