import {buildKansaiScenery} from './kansai-scene.js';
import {buildJfkScenery} from './jfk-scene.js';
import {buildLaxScenery} from './lax-scene.js';
import * as THREE from 'three';
import {GROUND_LAYERS as G,surfaceDepth,groundPaint,orderGroundPaint} from './ground-layers.js';
import {runwayFootprints,clipGroundTriangle}from './ground-footprints.js';
import departure from './data/daxing-departure.json' with {type:'json'};
import {DAXING,projectDaxing} from './registry.js';
import {buildXiaoshanScenery} from './xiaoshan-scene.js';
import {buildChangiScenery} from './changi-scene.js';
import {terrainConfig,terrainHeight,vertexHeight} from '../terrain/heightfield.js';
import {buildDaxingScenery} from './daxing-scene.js';

// All map geometry is built locally from the bundled, attributed data pack.
// Pavement/airport grading is shared with the contact and GPWS heightfield.
export function buildRealAirportWorld({scene,asphalt,grass,mat,airport=DAXING,departurePlan=departure}){
 const group=new THREE.Group();group.name=airport.ident;scene.add(group);
 const height=(x,z)=>terrainHeight(x,z,airport.id),config=terrainConfig(airport.id),project=airport.project||projectDaxing;
 const geometry=new THREE.PlaneGeometry(config.width,config.depth,config.columns,config.rows);geometry.rotateX(-Math.PI/2);
 const vertices=geometry.attributes.position,colors=[],color=new THREE.Color();
 const features=airport.data.osm.features,cover=new Uint8Array(vertices.count),fieldShade=new Float32Array(vertices.count);
 const local=coords=>coords.map(([lon,lat])=>project(lon,lat));
 const inside=(x,z,p)=>{let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
 // Rasterize real OSM land-use polygons into terrain colours once. This avoids
 // floating, flat field decals crossing the real DEM and adds no draw calls.
 for(const [index,feature]of features.entries()){
  const tags=feature.tags||{},kind=['farmland','farmyard','orchard'].includes(tags.landuse)?1:['forest','grass','meadow','recreation_ground'].includes(tags.landuse)||tags.natural==='wood'?2:['residential','commercial','retail'].includes(tags.landuse)?3:['industrial','construction'].includes(tags.landuse)?4:0;
  if(!kind||feature.geometry.length<3)continue;
  const p=local(feature.geometry),minX=Math.max(0,Math.ceil((Math.min(...p.map(v=>v.x))+config.width/2)/250)),maxX=Math.min(config.columns,Math.floor((Math.max(...p.map(v=>v.x))+config.width/2)/250)),minZ=Math.max(0,Math.ceil((Math.min(...p.map(v=>v.z))+config.depth/2)/250)),maxZ=Math.min(config.rows,Math.floor((Math.max(...p.map(v=>v.z))+config.depth/2)/250));
  for(let j=minZ;j<=maxZ;j++)for(let i=minX;i<=maxX;i++){const k=j*(config.columns+1)+i,x=-config.width/2+i*250,z=-config.depth/2+j*250;if(inside(x,z,p)){cover[k]=kind;fieldShade[k]=Math.sin(index*12.9898)*.06;}}
 }
 for(let i=0;i<vertices.count;i++){
  const x=vertices.getX(i),z=vertices.getZ(i),y=vertexHeight(x,z,airport.id);vertices.setY(i,y);
  // PlaneGeometry rows run north-to-south after its rotation; the land raster
  // above uses increasing local z, matching the physics grid indexing.
  const j=Math.round((z+config.depth/2)/250),column=Math.round((x+config.width/2)/250),k=j*(config.columns+1)+column;
  color.set(['#a2a68b','#a5a07a','#7f9470','#b1afa2','#a6a69d'][cover[k]]).multiplyScalar(1+fieldShade[k]);colors.push(color.r,color.g,color.b);
 }
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 const terrain=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:grass,vertexColors:true,roughness:1,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:4}));terrain.name='shared-DEM-terrain';group.add(terrain);
 const layer=surfaceDepth;
 const pavement=mat('#5e6464',{map:asphalt,...layer(4)}),taxi=mat('#777c78',layer(3)),road=mat('#838680',layer(2)),minorRoad=mat('#9d9b8e',layer(2)),water=mat(airport.id==='lax'?'#446c82':'#728e8c',{roughness:.3,metalness:.12,...layer(1)});
 const white=groundPaint(new THREE.MeshBasicMaterial({color:'#e6e5d9'}),11),yellow=groundPaint(new THREE.MeshBasicMaterial({color:'#d1b35a'}));
 const runwayMat=mat('#747b7b',{map:asphalt,...layer(5)});
 const reservedRunways=runwayFootprints(airport);
 const strip=(points,width,material,offset=.08)=>{
  const positions=[];
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.z-a.z);if(len<.01)continue;
   const nx=-(b.z-a.z)/len*width/2,nz=(b.x-a.x)/len*width/2;
   const corners=[[a.x+nx,a.z+nz],[a.x-nx,a.z-nz],[b.x+nx,b.z+nz],[b.x-nx,b.z-nz]];
   const vertices=corners.map(([x,z])=>({x,y:height(x,z)+offset,z}));
   for(const indices of[[0,2,1],[1,2,3]])for(const triangle of clipGroundTriangle(indices.map(j=>vertices[j]),reservedRunways))for(const p of triangle)positions.push(p.x,p.y,p.z);
  }
  if(!positions.length)return;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.name='source-ground-strip';group.add(mesh);
 };
 const polygon=(points,material,offset=.1,holes=[],flatY=null)=>{
  const open=ring=>ring.length>1&&Math.hypot(ring[0].x-ring.at(-1).x,ring[0].z-ring.at(-1).z)<.01?ring.slice(0,-1):ring;
  points=open(points);holes=holes.map(open).filter(r=>r.length>=3);
  if(points.length<3)return;
  const contour=points.map(p=>new THREE.Vector2(p.x,-p.z)),indices=THREE.ShapeUtils.triangulateShape(contour,holes.map(r=>r.map(p=>new THREE.Vector2(p.x,-p.z)))),allPoints=[...points,...holes.flat()],positions=[];
  for(const triangle of indices)for(const j of triangle){const p=allPoints[j];positions.push(p.x,(flatY??height(p.x,p.z))+offset,p.z);}
  if(!positions.length)return;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);if(flatY!==null)mesh.name='sea-surface';group.add(mesh);
 };
 for(const feature of features){
  const tags=feature.tags||{},coordinates=feature.geometry;if(!Array.isArray(coordinates)||coordinates.length<2)continue;
  const points=local(coordinates);
  if(tags.aeroway==='taxiway'){strip(points,Number(tags.width)||23,taxi,G.taxi);strip(points,.35,yellow,G.paint);}
  else if(tags.aeroway==='taxilane')strip(points,.35,yellow,G.paint);
  else if(tags.highway){if(['lax','changi','jfk'].includes(airport.id))continue;const major=['motorway','trunk','primary'].includes(tags.highway),width=Number(tags.width)||(['motorway','trunk'].includes(tags.highway)?22:major?14:['secondary','tertiary'].includes(tags.highway)?9:5);strip(points,width,major?road:minorRoad,G.road);}
  else if(tags.waterway){if(!['xiaoshan','changi','jfk'].includes(airport.id))strip(points,Number(tags.width)||(['river','canal'].includes(tags.waterway)?24:7),water,.13);}
  else if(tags.natural==='water'||tags.water||tags.landuse==='reservoir'){if(airport.id!=='xiaoshan'&&(!['changi','jfk'].includes(airport.id)||tags.water==='sea'))polygon(points,water,.15,(feature.holes||[]).map(local),tags.water==='sea'?-airport.elevationM:null);}
 }
 function rectangle(x,z,width,length,material,angle=0,y=.22){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,length),material);mesh.rotation.set(-Math.PI/2,0,angle);mesh.position.set(x,y,z);group.add(mesh);return mesh;
 }
 const lightWhite=new THREE.MeshBasicMaterial({color:'#fff3cc'}),lightGreen=new THREE.MeshBasicMaterial({color:'#74e0a6'}),lightRed=new THREE.MeshBasicMaterial({color:'#ef7566'}),lightGeo=new THREE.SphereGeometry(.65,5,4);
 const lamp=(x,z,material,y=.75)=>{const m=new THREE.Mesh(lightGeo,material);m.position.set(x,y,z);group.add(m);};
 function paintedNumber(label,x,z,angle){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=320;
  const c=canvas.getContext('2d');c.fillStyle='#e8e6dc';c.textAlign='center';c.font='bold 175px sans-serif';c.fillText(label.slice(0,2),128,172);c.font='bold 85px sans-serif';c.fillText(label.slice(2),128,269);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  rectangle(x,z,20,43,groundPaint(new THREE.MeshBasicMaterial({map:texture,transparent:true}),12),angle,G.label);
 }
 for(const runway of airport.data.runways){
  const first=runway.ends[0],last=runway.ends[1],a=project(first.longitude,first.latitude),b=project(last.longitude,last.latitude);
  const len=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/len,dz=(b.z-a.z)/len,angle=Math.atan2(dx,-dz),active=first.id===airport.runway.id||last.id===airport.runway.id;
  const p=(along,cross=0)=>({x:a.x+dx*along-dz*cross,z:a.z+dz*along+dx*cross});
  const center=p(len/2),w=runway.widthM;
  // A shoulder ring leaves the runway itself open. Two overlapping full
  // rectangles lose their centimetre separation at aerial-camera distances.
  const outer=[p(-40,-w/2-9),p(len+40,-w/2-9),p(len+40,w/2+9),p(-40,w/2+9)],inner=[p(0,-w/2),p(len,-w/2),p(len,w/2),p(0,w/2)],shoulderPositions=[],shoulderUvs=[];
  for(let i=0;i<4;i++){const j=(i+1)%4,quad=[outer[i],outer[j],inner[j],inner[i]];for(const k of[0,2,1,0,3,2]){const q=quad[k];shoulderPositions.push(q.x,G.shoulder,q.z);const along=(q.x-center.x)*dx+(q.z-center.z)*dz,cross=-(q.x-center.x)*dz+(q.z-center.z)*dx;shoulderUvs.push(cross/(w+18)+.5,.5-along/(len+80));}}
  const shoulderGeometry=new THREE.BufferGeometry();shoulderGeometry.setAttribute('position',new THREE.Float32BufferAttribute(shoulderPositions,3));shoulderGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(shoulderUvs,2));shoulderGeometry.computeVertexNormals();const shoulder=new THREE.Mesh(shoulderGeometry,pavement);shoulder.name='source-runway-shoulder';group.add(shoulder);
  rectangle(center.x,center.z,w,len,active?runwayMat:pavement,-angle,G.runway);
  for(const cross of[-w/2+1.5,w/2-1.5]){const q=p(len/2,cross);rectangle(q.x,q.z,.7,len-50,white,-angle,G.paint);}
  for(let along=160;along<len-150;along+=65){const q=p(along);rectangle(q.x,q.z,1.2,30,white,-angle,G.paint);}
  for(const end of[0,1]){
   const from=end?len:0,sign=end?-1:1,label=runway.ends[end].id,number=p(from+sign*130);
   paintedNumber(label,number.x,number.z,-angle+(end?Math.PI:0));
   for(let cross=-w/2+7;cross<w/2-4;cross+=6){if(Math.abs(cross)<4)continue;const q=p(from+sign*32,cross);rectangle(q.x,q.z,3.4,36,white,-angle,G.paint);}
   for(const cross of[-w*.31,w*.31]){const q=p(from+sign*310,cross);rectangle(q.x,q.z,6,45,white,-angle,G.paint);}
  }
  for(let along=0;along<=len;along+=60)for(const cross of[-w/2-3,w/2+3]){const q=p(along,cross);lamp(q.x,q.z,lightWhite);}
 }
 // Only the selected runway is operational; other source runways are scenery.
 for(let x=-airport.runway.width/2+4;x<=airport.runway.width/2-4;x+=4.3){lamp(x,3,lightGreen);lamp(x,-airport.runway.length,lightRed);}
 for(let z=60;z<=720;z+=60)for(const x of[-4,0,4])lamp(x,z,lightWhite,1.4);
 // Synthetic game holding markings; the route itself follows source taxiways.
 const holdX=departurePlan.hold.x-Math.sign(departurePlan.hold.x)*20,holdZ=departurePlan.hold.z;
 for(const dx of[-.7,.7])strip([{x:holdX+dx,z:holdZ-10},{x:holdX+dx,z:holdZ+10}],.35,yellow,G.paint);
 const signCanvas=document.createElement('canvas');signCanvas.width=256;signCanvas.height=96;const signContext=signCanvas.getContext('2d');signContext.fillStyle='#8c2c28';signContext.fillRect(0,0,256,96);signContext.fillStyle='#fff2da';signContext.textAlign='center';signContext.font='bold 60px sans-serif';signContext.fillText(airport.runway.id,128,70);
 const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.PlaneGeometry(4,1.5),new THREE.MeshBasicMaterial({map:signTexture,side:THREE.DoubleSide}));sign.name='runway-holding-sign';sign.rotation.y=Math.sign(holdX)*Math.PI/2;sign.position.set(holdX,1.2,holdZ+15);group.add(sign);
 const papi=[];
 for(let i=0;i<4;i++){
  const box=new THREE.Mesh(new THREE.BoxGeometry(1.5,.6,1.2),pavement);box.position.set(-55-i*5,.5,-300);group.add(box);
  const light=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.4),new THREE.MeshBasicMaterial({color:i<2?'#ff5544':'#fff5ce'}));light.position.set(-55-i*5,.8,-299.3);group.add(light);papi.push(light);
 }
 const sceneryBuilders={daxing:buildDaxingScenery,xiaoshan:buildXiaoshanScenery,changi:buildChangiScenery,kansai:buildKansaiScenery,jfk:buildJfkScenery,lax:buildLaxScenery};
 const customScenery=sceneryBuilders[airport.id]({THREE,group,project,terrainHeight:height,features});
 const excludedFeatures=new Set([...(customScenery?.excludeFeatureIds||[]),...(airport.id==='changi'?['way/744520551','way/547383951','way/744653030','way/173010406']:[])]);
 // Low-cost building blocks follow actual OSM footprints. Missing heights
 // receive a documented visual estimate rather than a claim of survey detail.
 const cityAirportBoundary=['xiaoshan','jfk'].includes(airport.id)?features.filter(f=>f.tags?.aeroway==='aerodrome').map(f=>local(f.geometry)):null;
 const buildings=features.filter(f=>f.tags?.building&&!['tower','control_tower','jet_bridge'].includes(f.tags.aeroway)&&f.tags.aeroway!=='terminal'&&f.tags.building!=='terminal'&&!excludedFeatures.has(f.id)&&f.geometry.length>=3).slice(0,900);
 const buildingMaterials=[mat('#b8b5a5'),mat('#c6c4b9'),mat('#a4a9a3')],unit=new THREE.BoxGeometry(1,1,1);
 for(const [i,f]of buildings.entries()){
  const p=local(f.geometry),minX=Math.min(...p.map(v=>v.x)),maxX=Math.max(...p.map(v=>v.x)),minZ=Math.min(...p.map(v=>v.z)),maxZ=Math.max(...p.map(v=>v.z));
  if(maxX-minX>350||maxZ-minZ>350)continue;
  const x=(minX+maxX)/2,z=(minZ+maxZ)/2;if(cityAirportBoundary&&!cityAirportBoundary.some(r=>inside(x,z,r)))continue;const h=Math.min(60,parseFloat(f.tags.height)||Number(f.tags['building:levels'])*3.2||8);
  const m=new THREE.Mesh(unit,buildingMaterials[i%3]);m.scale.set(Math.max(3,maxX-minX),h,Math.max(3,maxZ-minZ));m.position.set(x,height(x,z)+h/2,z);group.add(m);
 }
 orderGroundPaint(group);
 return{runwayMat,papi,terrain};
}
