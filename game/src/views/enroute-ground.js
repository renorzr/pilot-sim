import * as THREE from 'three';
import land from '../airports/data/world-land.json' with {type:'json'};
import{mapLandRings,longitudeNear}from'../airports/map-projection.js';
import{airportOf,runwayOf}from'../airports/registry.js';
import{terrainConfig}from'../terrain/heightfield.js';
import{geoMove}from'../missions/route-geography.js';

// Existing self-hosted Natural Earth land, deliberately coarse at cruise range.
// This plane fills only the space OUTSIDE the detailed DEM and stays at the
// same sea-level height used by continuousCoarseSurface. No airport is moved.
function worldTexture(){
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;const c=canvas.getContext('2d');c.fillStyle='#426b79';c.fillRect(0,0,2048,1024);
 for(const ring of mapLandRings(land.rings,-180,180)){c.beginPath();ring.forEach(([lon,lat],i)=>{const x=(lon+180)/360*2048,y=(90-lat)/180*1024;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fillStyle=ring.reduce((a,p)=>a+p[1],0)/ring.length>65?'#c4c5b5':'#899b72';c.fill();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=4;
 return texture;
}
export function createEnrouteGround(scene,airport){
 let texture=null;
 const geometry=new THREE.PlaneGeometry(240000,240000,40,40);geometry.rotateX(-Math.PI/2);const material=new THREE.MeshStandardMaterial({roughness:.92}),extent=terrainConfig(airport);
 material.onBeforeCompile=shader=>{shader.uniforms.routeCoverage={value:new THREE.Vector2(extent.width/2,extent.depth/2)};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 routeXY;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nrouteXY=(modelMatrix*vec4(transformed,1.0)).xz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 routeXY; uniform vec2 routeCoverage;').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(abs(routeXY.x)<routeCoverage.x && abs(routeXY.y)<routeCoverage.y) discard;');};
 material.customProgramCacheKey=()=> 'continuous-route-ground-v1';const mesh=new THREE.Mesh(geometry,material);mesh.name='coarse-continuous-route-surface';mesh.visible=false;scene.add(mesh);let center=null;
 return{update(s){
  mesh.visible=!!s.airline?.continuous&&s.airline.arrivalMode!=='skipped'&&(Math.abs(s.x)>extent.width/2-8000||Math.abs(s.z)>extent.depth/2-8000);if(!mesh.visible)return;
  if(!texture){texture=worldTexture();material.map=texture;material.needsUpdate=true;}
  if(center&&Math.hypot(s.x-center.x,s.z-center.z)<10000)return;
  center={x:s.x,z:s.z};mesh.position.set(s.x,-airport.elevationM,s.z);const geo=s.airline.navigation.kind==='enroute'?s.airline.navigation.geo:airportOf(s).unproject(s.x,s.z),positions=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i),p=geoMove(geo,runwayOf(s).heading+Math.atan2(x,-z)*180/Math.PI,Math.hypot(x,z));uv.setXY(i,(longitudeNear(p.longitude,geo.longitude)+180)/360,(p.latitude+90)/180);}
  uv.needsUpdate=true;
 },dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();texture?.dispose();}};
}
