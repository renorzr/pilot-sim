import * as THREE from 'three';
import {isSeaLevelWater} from '../airports/water-surfaces.js';
// Both scene variants triangulate the very same bank/island faces. The only
// vertical transform is the scene's MSL datum; masks and contact use these faces.
export function buildRegionalWater({root,airport,material,name='sea-surface',surfaceOffset=0}){
 for(const f of airport.data.osm.features.filter(isSeaLevelWater)){
  const ring=coords=>coords.map(q=>{const p=airport.project(...q);return new THREE.Vector2(p.x,-p.z);}),outer=ring(f.geometry),holes=(f.holes||[]).map(ring),triangles=THREE.ShapeUtils.triangulateShape(outer,holes),all=[...outer,...holes.flat()],vertices=[];
  for(const tri of triangles)for(const n of tri)vertices.push(all[n].x,-airport.elevationM+surfaceOffset,-all[n].y);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.name=name;root.add(mesh);
 }
}
