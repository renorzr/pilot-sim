import * as THREE from 'three';
import {terrainConfig,vertexHeight} from '../terrain/heightfield.js';
import {eventRunwayStrips} from './event-world.js';
import {historicalObstacles} from './obstacles.js';
// This builder has no runway at the NYC frame origin and never draws JFK's
// terminals as LGA. River polygons are the same source as eventWaterAt().
export function buildHistoricalWorld({scene,airport,grass}){
 const root=new THREE.Group();root.name='NYC-2009-event';scene.add(root);
 const c=terrainConfig(airport.id),geo=new THREE.PlaneGeometry(c.width,c.depth,c.columns,c.rows);geo.rotateX(-Math.PI/2);
 const positions=geo.attributes.position;for(let i=0;i<positions.count;i++)positions.setY(i,vertexHeight(positions.getX(i),positions.getZ(i),airport.id));geo.computeVertexNormals();
 const terrain=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:grass,color:'#a5a89c',roughness:1}));terrain.name='shared-DEM-terrain';root.add(terrain);
 const water=new THREE.MeshStandardMaterial({color:'#526b77',roughness:.38,metalness:.16,side:THREE.DoubleSide});
 for(const f of airport.data.osm.features.filter(f=>f.tags?.water==='sea')){
  const ring=coords=>coords.map(q=>{const p=airport.project(...q);return new THREE.Vector2(p.x,-p.z);}),outer=ring(f.geometry),holes=(f.holes||[]).map(ring),all=[...outer,...holes.flat()],triangles=THREE.ShapeUtils.triangulateShape(outer,holes),v=[];
  for(const tri of triangles)for(const n of tri)v.push(all[n].x,0,-all[n].y);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();const m=new THREE.Mesh(g,water);m.name='source-Hudson-and-NYC-water';root.add(m);
 }
 const runwayMat=new THREE.MeshStandardMaterial({color:'#62686b',roughness:.93});
 for(const r of eventRunwayStrips){
  const m=new THREE.Mesh(new THREE.BoxGeometry(r.widthM,.2,r.length),runwayMat);m.rotation.y=-r.heading;m.position.set((r.a.x+r.b.x)/2,r.elevationM-.1,(r.a.z+r.b.z)/2);m.name=r.airport+'-runway-'+r.id;root.add(m);
  const stripeMat=new THREE.MeshBasicMaterial({color:'#d5d9d2'});for(let d=80;d<r.length-50;d+=80){const u=d/r.length,line=new THREE.Mesh(new THREE.PlaneGeometry(1.1,28),stripeMat);line.rotation.set(-Math.PI/2,0,r.heading);line.position.set(r.a.x+(r.b.x-r.a.x)*u,r.elevationM+.015,r.a.z+(r.b.z-r.a.z)*u);root.add(line);}
 }
 const bridge=new THREE.MeshStandardMaterial({color:'#92999a',roughness:.72}),ship=new THREE.MeshStandardMaterial({color:'#d8dcdb',roughness:.8});
 for(const o of historicalObstacles){const mesh=new THREE.Mesh(new THREE.BoxGeometry(o.width,o.height,o.depth),o.kind==='ship'?ship:bridge);mesh.position.set(o.cx,o.baseY+o.height/2,o.cz);mesh.rotation.y=-o.angle;mesh.name=o.id;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
 return{terrain,runwayMat,papi:[]};
}
