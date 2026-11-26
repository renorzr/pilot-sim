import * as THREE from 'three';
import {sampleRoadPath} from './road-data.js';
import {createPolygonMask} from './polygon-mask.js';
import {surfaceDepth,groundPaint} from './ground-layers.js';

const point=(x,y,z)=>({x,y,z});
function triangle(out,a,b,c,up=false){
 if(up&&(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)<0)[b,c]=[c,b];
 out.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
}
function quad(out,a,b,c,d,up=false){triangle(out,a,b,c,up);triangle(out,c,b,d,up);}
function block(out,x,y,z,w,h,d){
 const p=[point(x-w/2,y,z-d/2),point(x+w/2,y,z-d/2),point(x-w/2,y+h,z-d/2),point(x+w/2,y+h,z-d/2),point(x-w/2,y,z+d/2),point(x+w/2,y,z+d/2),point(x-w/2,y+h,z+d/2),point(x+w/2,y+h,z+d/2)];
 for(const[a,b,c,d]of[[0,1,2,3],[5,4,7,6],[4,0,6,2],[1,5,3,7],[2,3,6,7],[4,5,0,1]])quad(out,p[a],p[b],p[c],p[d]);
}
export function* prepareRoadSurfaces(graph,heightAt){
 const ground=[],decks=[],concrete=[],paint=[],distance=[],tints=[],obstacles=[];let faces=0;
 const groundMask=createPolygonMask(graph.source.ground.map(rings=>({outer:rings[0].map(([x,z])=>({x,z})),holes:rings.slice(1).map(r=>r.map(([x,z])=>({x,z})))})));
 // Split only at the actual 250m terrain triangle boundaries. Uniform dense
 // subdivision wastes faces on long thin roads and still cuts through slopes.
 function clip(poly,nx,nz,limit){
  const out=[];for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const a=poly[j],b=poly[i],da=a.x*nx+a.z*nz-limit,db=b.x*nx+b.z*nz-limit;
   if((da<=0)!==(db<=0)){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}if(db<=0)out.push(b);
  }return out;
 }
 function emit(poly){for(let j=1;j<poly.length-1;j++){const [a,b,c]=[poly[0],poly[j],poly[j+1]];if(Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))<1e-7)continue;triangle(ground,point(a.x,heightAt(a.x,a.z)+.055,a.z),point(b.x,heightAt(b.x,b.z)+.055,b.z),point(c.x,heightAt(c.x,c.z)+.055,c.z),true);faces++;}}
 function groundTriangle(a,b,c){
  for(let x=Math.floor(Math.min(a.x,b.x,c.x)/250)*250;x<=Math.max(a.x,b.x,c.x);x+=250)for(let z=Math.floor(Math.min(a.z,b.z,c.z)/250)*250;z<=Math.max(a.z,b.z,c.z);z+=250){
   let p=clip([a,b,c],-1,0,-x);p=clip(p,1,0,x+250);p=clip(p,0,-1,-z);p=clip(p,0,1,z+250);if(p.length<3)continue;
   emit(clip(p,1,1,x+z+250));emit(clip(p,-1,-1,-x-z-250));
  }
 }
 for(const rings of graph.source.ground){
  const open=ring=>ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
  const r=rings.map(open),contour=r[0].map(([x,z])=>new THREE.Vector2(x,-z)),holes=r.slice(1).map(h=>h.map(([x,z])=>new THREE.Vector2(x,-z))),points=r.flat().map(([x,z])=>({x,z}));
  for(const f of THREE.ShapeUtils.triangulateShape(contour,holes))groundTriangle(points[f[0]],points[f[1]],points[f[2]]);
  yield{completed:faces,total:0};
 }
 const a={},b={};
 function edge(p,offset,raise=0,drape=false){const x=p.x-p.tz*offset,z=p.z+p.tx*offset;return point(x,p.y+raise+(drape?heightAt(x,z)-heightAt(p.x,p.z):0),z);}
 function collision(id,a,b,width,base,top,kind='bridge'){
  const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.1)return;
  obstacles.push({id,kind,name:'道路高架',cx:(a.x+b.x)/2,cz:(a.z+b.z)/2,angle:Math.atan2(b.z-a.z,b.x-a.x),width:length,depth:width,baseY:base,topY:top});
 }
 for(const r of graph.roads){
  if(r.tunnel)continue;
  const p=r.path,n=Math.max(1,Math.ceil(p.length/12)),width=r.width/2;
  if(r.raised)for(let j=0;j<n;j++){
   sampleRoadPath(p,p.length*j/n,a);sampleRoadPath(p,p.length*(j+1)/n,b);
   const al=edge(a,-width),ar=edge(a,width),bl=edge(b,-width),br=edge(b,width);
   quad(decks,al,ar,bl,br,true);
   quad(concrete,al,point(al.x,al.y-.45,al.z),bl,point(bl.x,bl.y-.45,bl.z));quad(concrete,ar,br,point(ar.x,ar.y-.45,ar.z),point(br.x,br.y-.45,br.z));
   const raised=Math.max(a.y-heightAt(a.x,a.z),b.y-heightAt(b.x,b.z));
   if(raised>.3)collision(r.id+'/deck/'+j,a,b,r.width,Math.min(a.y,b.y)-.45,Math.max(a.y,b.y));
   if(raised>1.6)for(const side of [-1,1]){
    const u=edge(a,side*(width-.15),.55),v=edge(b,side*(width-.15),.55);
    const nx=(v.z-u.z)/Math.max(.001,Math.hypot(v.x-u.x,v.z-u.z))*.12,nz=-(v.x-u.x)/Math.max(.001,Math.hypot(v.x-u.x,v.z-u.z))*.12;
    quad(concrete,point(u.x-nx,u.y,u.z-nz),point(u.x+nx,u.y,u.z+nz),point(v.x-nx,v.y,v.z-nz),point(v.x+nx,v.y,v.z+nz),true);
    quad(concrete,u,v,point(u.x,u.y+.3,u.z),point(v.x,v.y+.3,v.z));
    collision(r.id+'/rail/'+j+'/'+side,u,v,.24,Math.min(u.y,v.y),Math.max(u.y,v.y)+.3);
   }
  }
  if(r.bridge)for(let d=20;d<p.length;d+=42){
   sampleRoadPath(p,d,a);const y=heightAt(a.x,a.z),h=a.y-y-.45;if(h<2||groundMask(a.x,a.z))continue;
   block(concrete,a.x,y,a.z,1.2,h,1.2);obstacles.push({id:r.id+'/pier/'+d,kind:'bridge',name:'道路高架桥墩',cx:a.x,cz:a.z,angle:0,width:1.2,depth:1.2,baseY:y,topY:y+h});
  }
  if(!['motorway','trunk','primary','secondary','tertiary', 'motorway_link','trunk_link'].includes(r.kind))continue;
  const marks=[],hand=graph.hand||1;
  if(!r.oneway)marks.push({offset:0,solid:true,color:hand<0?[.85,.85,.8]:[.95,.76,.35]});
  if(r.oneway){for(let i=1;i<r.forward;i++)marks.push({offset:(i-r.forward/2)*3.25,color:[.85,.85,.8]});}
  else{for(let i=1;i<r.forward;i++)marks.push({offset:hand*i*3.25,color:[.85,.85,.8]});for(let i=1;i<r.backward;i++)marks.push({offset:-hand*i*3.25,color:[.85,.85,.8]});}
  if(['motorway','trunk'].includes(r.kind))for(const s of [-1,1])marks.push({offset:s*(width-.5),solid:true,color:[.82,.82,.76]});
  const trim=Math.min(8,r.width*.65,p.length*.2),length=p.length-2*trim,steps=Math.max(1,Math.ceil(length/12));
  for(const m of marks)for(let j=0;j<steps;j++){
   const s=trim+length*j/steps,t=trim+length*(j+1)/steps;sampleRoadPath(p,s,a);sampleRoadPath(p,t,b);
   const al=edge(a,m.offset-.065,.012,!r.raised),ar=edge(a,m.offset+.065,.012,!r.raised),bl=edge(b,m.offset-.065,.012,!r.raised),br=edge(b,m.offset+.065,.012,!r.raised);
   quad(paint,al,ar,bl,br,true);distance.push(...(m.solid?[-1,-1,-1,-1,-1,-1]:[s,s,t,t,s,t]));for(let k=0;k<6;k++)tints.push(...m.color);
  }
  if(r.index%256===0)yield{completed:r.index,total:graph.roads.length};
 }
 return{arrays:{roadGround:new Float32Array(ground),roadDecks:new Float32Array(decks),roadConcrete:new Float32Array(concrete),roadPaint:new Float32Array(paint),roadPaintDistance:new Float32Array(distance),roadPaintTint:new Float32Array(tints)},obstacles};
}
function fadeMaterial(material,near,far,{marking=false}={}){
 material.onBeforeCompile=shader=>{
  shader.vertexShader='varying float roadViewDistance;'+(marking?'attribute float roadDistance;varying float roadDash;':'')+'\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nroadViewDistance=length(mvPosition.xyz);'+(marking?'roadDash=roadDistance;':''));
  shader.fragmentShader='varying float roadViewDistance;'+(marking?'varying float roadDash;':'')+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>\ndiffuseColor.a*=1.-smoothstep(${near.toFixed(1)},${far.toFixed(1)},roadViewDistance);`+(marking?'if(roadDash>=0.&&mod(roadDash,10.)>3.)discard;':''));
 };
 material.customProgramCacheKey=()=>`road-distance-v1-${near}-${far}-${marking}`;return material;
}
export function createRoadMeshes(root,arrays){
 const materials={
  roadGround:fadeMaterial(new THREE.MeshStandardMaterial({color:'#6c6c67',roughness:1,transparent:true,opacity:.57,depthWrite:false,...surfaceDepth(2)}),1600,4600),
  roadDecks:new THREE.MeshStandardMaterial({color:'#686b68',roughness:.95,side:THREE.DoubleSide}),
  roadConcrete:new THREE.MeshStandardMaterial({color:'#a6a49b',roughness:.94,side:THREE.DoubleSide}),
  roadPaint:fadeMaterial(groundPaint(new THREE.MeshBasicMaterial({color:'#ffffff',vertexColors:true,transparent:true,opacity:.7,depthWrite:false})),800,2300,{marking:true}),
 },meshes=[];let triangles=0,bytes=0;
 for(const key of Object.keys(materials)){
  const p=arrays[key];if(!(p instanceof Float32Array)||p.length%9||!p.every(Number.isFinite))throw Error('Invalid prepared road surface');
  // Static district batches let the renderer reject roads behind the camera,
  // while retaining every prepared district for later camera reversals.
  const tiles=new Map();for(let i=0;i<p.length;i+=9){const id=Math.floor((p[i]+p[i+3]+p[i+6])/4500)+':'+Math.floor((p[i+2]+p[i+5]+p[i+8])/4500);if(!tiles.has(id))tiles.set(id,[]);tiles.get(id).push(i);}
  for(const[id,indices]of tiles){
   const positions=new Float32Array(indices.length*9),dash=key==='roadPaint'?new Float32Array(indices.length*3):null,tint=key==='roadPaint'?new Float32Array(indices.length*9):null;
   for(let j=0;j<indices.length;j++){const i=indices[j];positions.set(p.subarray(i,i+9),j*9);if(dash){dash.set(arrays.roadPaintDistance.subarray(i/3,i/3+3),j*3);tint.set(arrays.roadPaintTint.subarray(i,i+9),j*9);}}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.computeVertexNormals();g.computeBoundingSphere();
   if(dash){g.setAttribute('roadDistance',new THREE.BufferAttribute(dash,1));g.setAttribute('color',new THREE.BufferAttribute(tint,3));}
   const mesh=new THREE.Mesh(g,materials[key]);mesh.name='traffic/'+key+'/'+id;mesh.castShadow=false;mesh.receiveShadow=key!=='roadPaint';mesh.renderOrder=key==='roadPaint'?7:key==='roadGround'?1:0;root.add(mesh);meshes.push(mesh);triangles+=positions.length/9;bytes+=Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0);
  }
 }
 return{meshes,triangles,bytes,dispose(){for(const mesh of meshes){mesh.geometry.dispose();mesh.removeFromParent();}for(const material of Object.values(materials))material.dispose();}};
}
