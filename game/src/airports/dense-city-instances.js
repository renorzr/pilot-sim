import * as THREE from 'three';
import {channels,facadeColor}from './city-colours.js';

const templates=new Map();
// One set of CPU vertex arrays per architectural style. Each spatial batch
// owns its BufferAttribute wrappers, so releasing GPU buffers never invalidates
// another batch's VAO. No per-building matrices or vertex arrays are allocated.
export function cityTemplate(style='flat'){
 if(templates.has(style))return templates.get(style);
 const p=[],n=[],s=[],lift=[],indices=[];
 function face(points,roof=false){const a=new THREE.Vector3(...points[0]),b=new THREE.Vector3(...points[1]),c=new THREE.Vector3(...points[2]),normal=b.sub(a).cross(c.sub(a)).normalize(),start=p.length/3;for(let i=0;i<points.length;i++){const[x,y,z]=points[i];p.push(x,Math.min(y,1),z);lift.push(Math.max(0,y-1));n.push(...normal);s.push(i===1||i===2?1:0,i>=2?1:0,roof?3:0);}for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);}
 const a=[-.5,1,-.5],b=[-.5,1,.5],c=[.5,1,.5],d=[.5,1,-.5];
 face([[-.5,0,-.5],[-.5,0,.5],b,a]);face([[-.5,0,.5],[.5,0,.5],c,b]);face([[.5,0,.5],[.5,0,-.5],d,c]);face([[.5,0,-.5],[-.5,0,-.5],a,d]);
 if(style==='hip'){const left=[-.25,2,0],right=[.25,2,0];face([a,b,left],true);face([b,c,right,left],true);face([c,d,right],true);face([d,a,left,right],true);}
 else if(style==='gable'){const left=[-.5,2,0],right=[.5,2,0];face([a,b,left]);face([c,d,right]);face([b,c,right,left],true);face([d,a,left,right],true);}
 else face([a,b,c,d],true);
 const template={position:new Float32Array(p),normal:new Float32Array(n),citySurface:new Float32Array(s),roofLift:new Float32Array(lift),index:new Uint16Array(indices)};templates.set(style,template);return template;
}
export function buildingFrame(b){
 if(b.frame)return b.frame;
 const r=b.rings[0];let longest=0,angle=0;
 for(let i=0,j=r.length-2;i<r.length;j=i,i+=2){const dx=r[i]-r[j],dz=r[i+1]-r[j+1],d=dx*dx+dz*dz;if(d>longest){longest=d;angle=Math.atan2(dz,dx);}}
 const co=Math.cos(angle),si=Math.sin(angle);let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,area=0;
 for(let i=0,j=r.length-2;i<r.length;j=i,i+=2){const x=r[i]*co+r[i+1]*si,z=-r[i]*si+r[i+1]*co;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);area+=r[j]*r[i+1]-r[i]*r[j+1];}
 const x=(minX+maxX)/2,z=(minZ+maxZ)/2,width=maxX-minX,depth=maxZ-minZ;
 return{x:x*co-z*si,z:x*si+z*co,width,depth,angle,fill:Math.min(1,Math.abs(area)/2/Math.max(.01,width*depth))};
}
function repeatedHome(b,f){return b.kind==='home'&&b.height<20&&Math.max(f.width,f.depth)<65&&f.fill>=.76&&(b.ringCount??b.rings.length)===1;}
const kindOf=b=>b.kind==='home'?0:b.kind==='industrial'?1:2;
export function createCityInstances(data,tile,lod,material){
 const origin={x:(tile.minX+tile.maxX)/2,z:(tile.minZ+tile.maxZ)/2},batches=new Map(),exceptions=[],districts=new Map();let represented=0;
 function add(b,f,style='flat'){
  if(!batches.has(style))batches.set(style,[]);batches.get(style).push({b,f});represented+=b.sourceCount||1;
 }
 function* sourceIndices(){for(const t of tile.members||[tile])for(let i=t.start;i<t.start+t.count;i++)yield i;}
 for(const i of sourceIndices()){
  const b=data.building(i,false);if(b.height<=0)continue;const f=buildingFrame(b);
  if(lod===1){
   if(repeatedHome(b,f)){const styles=data.manifest?.architecture?.homeRoofStyles;add(b,f,b.height>=13?'flat':styles?.length?styles[b.seed%styles.length]:b.seed%5===0?'flat':b.seed%3===0?'gable':'hip');}
   else if((b.ringCount??b.rings.length)===1&&f.fill>.93&&b.height<(data.manifest?.architecture?.flatTemplateMaxHeight??35)&&Math.max(f.width,f.depth)<150)add(b,f);
   else exceptions.push(i);
  }else if((b.height>35||Math.max(f.width,f.depth)>150)&&f.fill<.93){exceptions.push(i);}
  else if(lod===2&&b.height<20&&Math.max(f.width,f.depth)<70){
   // At >12 km individual low homes are subpixel. A source-derived district
   // proxy preserves aggregate coverage/colour/height, with no invented streets
   // or additional buildings in parks/oceans. Tall buildings remain individual.
   const key=Math.floor(b.cx/100)+':'+Math.floor(b.cz/100)+':'+kindOf(b);let q=districts.get(key);
   if(!q){q={...b,sourceCount:0,minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity,weight:0,y:0,heightSum:0,roof:[0,0,0],wall:[0,0,0]};districts.set(key,q);}
   const weight=Math.max(1,f.width*f.depth*f.fill);q.sourceCount++;q.minX=Math.min(q.minX,b.minX);q.maxX=Math.max(q.maxX,b.maxX);q.minZ=Math.min(q.minZ,b.minZ);q.maxZ=Math.max(q.maxZ,b.maxZ);q.weight+=weight;q.y+=b.baseY*weight;q.heightSum+=b.height*weight;
   for(let k=0;k<3;k++){q.roof[k]+=(b.roofColor>>>(16-k*8)&255)*weight;q.wall[k]+=(b.wallColor>>>(16-k*8)&255)*weight;}
  }else add(b,f);
 }
 for(const q of districts.values()){
  q.cx=(q.minX+q.maxX)/2;q.cz=(q.minZ+q.maxZ)/2;q.baseY=q.y/q.weight;q.height=q.heightSum/q.weight;q.topY=q.baseY+q.height;
  const rgb=a=>a.reduce((n,c)=>n*256+Math.round(c/q.weight),0);q.roofColor=rgb(q.roof);q.wallColor=rgb(q.wall);
  const width=q.maxX-q.minX,depth=q.maxZ-q.minZ,scale=Math.min(1,Math.sqrt(q.weight/Math.max(1,width*depth)));
  add(q,{x:q.cx,z:q.cz,width:Math.max(1,width*scale),depth:Math.max(1,depth*scale),angle:0,fill:1});
 }
 const meshes=[];let bytes=0,triangles=0,instances=0;
 for(const[style,records]of batches){
  const template=cityTemplate(style),g=new THREE.InstancedBufferGeometry(),count=records.length,pose=new Float32Array(count*4),dimensions=new Float32Array(count*4),roof=new Uint8Array(count*3),wall=new Uint8Array(count*3),types=new Uint8Array(count);
  g.setAttribute('position',new THREE.BufferAttribute(template.position,3));g.setAttribute('normal',new THREE.BufferAttribute(template.normal,3));g.setAttribute('citySurface',new THREE.BufferAttribute(template.citySurface,3));g.setAttribute('roofLift',new THREE.BufferAttribute(template.roofLift,1));g.setAttribute('color',new THREE.BufferAttribute(new Uint8Array(template.position.length).fill(255),3,true));g.setIndex(new THREE.BufferAttribute(template.index,1));
  for(let i=0;i<count;i++){const{b,f}=records[i],rise=style==='flat'?0:Math.min(1.7,b.height*.22);pose.set([f.x-origin.x,b.baseY,f.z-origin.z,f.angle],i*4);dimensions.set([f.width,b.height-rise,f.depth,rise],i*4);roof.set(channels(b.roofColor),i*3);wall.set(facadeColor(b,data.manifest?.architecture?.facadePalette),i*3);types[i]=kindOf(b);}
  for(const[name,array,size,normalized]of[['cityInstance',pose,4,false],['cityDimensions',dimensions,4,false],['cityRoofColor',roof,3,true],['cityWallColor',wall,3,true],['cityType',types,1,false]])g.setAttribute(name,new THREE.InstancedBufferAttribute(array,size,normalized));
  g.instanceCount=count;g.boundingBox=new THREE.Box3(new THREE.Vector3(tile.minX-origin.x-150,-500,tile.minZ-origin.z-150),new THREE.Vector3(tile.maxX-origin.x+150,tile.topY+100,tile.maxZ-origin.z+150));g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());
  g.userData={bytes:Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,g.index.array.byteLength),instances:count,triangles:g.index.count/3*count,style};
  const mesh=new THREE.Mesh(g,material);mesh.name='city-shared-'+style;mesh.position.set(origin.x,0,origin.z);mesh.castShadow=lod===1;mesh.userData.cityInstances=true;meshes.push(mesh);bytes+=g.userData.bytes;triangles+=g.userData.triangles;instances+=count;
 }
 return{meshes,exceptions,bytes,triangles,instances,represented};
}
// Used by the lit and shadow vertex programs. Shader deformation, bounding
// volumes and source heights must agree even with non-uniform instance scales.
export const CITY_INSTANCE_DECLARATIONS=`attribute vec4 cityInstance;attribute vec4 cityDimensions;attribute vec3 cityRoofColor;attribute vec3 cityWallColor;attribute float cityType;attribute float roofLift;
vec3 cityRotate(vec3 p){float c=cos(cityInstance.w),s=sin(cityInstance.w);return vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c);}`;
export const CITY_INSTANCE_POSITION=`vec3 transformed=cityRotate(vec3(position.x*cityDimensions.x,position.y*cityDimensions.y+roofLift*cityDimensions.w,position.z*cityDimensions.z))+cityInstance.xyz;`;
export function configureInstanceDepth(material){material.onBeforeCompile=shader=>{shader.vertexShader=CITY_INSTANCE_DECLARATIONS+'\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',CITY_INSTANCE_POSITION);};material.customProgramCacheKey=()=> 'city-shared-depth-v1';return material;}
