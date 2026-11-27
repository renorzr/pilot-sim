import {sceneryExtent} from '../regions/scenery-source.js';
import {createPolygonMask} from './polygon-mask.js';
import {surfaceHeight} from '../terrain/heightfield.js';
import {seaAt} from './registry.js';

export const WOODLAND_CELL=24,WOODLAND_TILE=960,WOODLAND_DISTRICT=1920,WOODLAND_SCHEMA=1;
export const TREE_ROOTS=Object.freeze([[-.22,.04,.84],[.22,-.17,1],[.015,.26,.91]]);
const key=(x,z)=>x+':'+z;
export function woodlandHash(value){let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;return n>>>0;}
const random=(seed,salt)=>woodlandHash(seed+':'+salt)/4294967296;
const bounds=points=>({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});
export const isWoodland=f=>f.tags?.natural==='wood'||f.tags?.landuse==='forest'||Number.isFinite(f.treeCoverageEstimate)&&f.treeCoverageEstimate>0&&f.treeCoverageEstimate<=1;
function ring(points,project){return(points||[]).filter(p=>p.length===2&&p.every(Number.isFinite)).map(p=>project(...p));}
export function woodlandSourceKey(airport,extra=[]){return woodlandHash(JSON.stringify([WOODLAND_SCHEMA,WOODLAND_CELL,WOODLAND_TILE,WOODLAND_DISTRICT,airport.id,airport.elevationM,airport.data.runways,airport.data.dem,airport.data.osm.features,extra,...(airport.region?[airport.region.revision,sceneryExtent(airport),airport.grading,airport.regionGrading||null]:[])])).toString(16);}

export function woodlandMasks(airport,extra=[]){
 const woods=[],cells=new Map(),project=airport.project,extent=sceneryExtent(airport),features=[...airport.data.osm.features,...extra];
 function add(record,padding=0){
  record.bounds={...record.bounds};for(const k of['minX','minZ'])record.bounds[k]-=padding;for(const k of['maxX','maxZ'])record.bounds[k]+=padding;
  const b=record.bounds;
  for(let x=Math.max(Math.floor(-extent/512),Math.floor(b.minX/512));x<=Math.min(Math.floor(extent/512),Math.floor(b.maxX/512));x++)for(let z=Math.max(Math.floor(-extent/512),Math.floor(b.minZ/512));z<=Math.min(Math.floor(extent/512),Math.floor(b.maxZ/512));z++){const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(record);}
 }
 for(const f of features){
  const t=f.tags||{},points=ring(f.geometry,project);if(points.length<2)continue;
  if(isWoodland(f)&&points.length>=4){
   // Open source ways are not closed by inventing a long diagonal. Closed
   // multipolygon pieces retain their source holes and geographic coordinates.
   if(Math.hypot(points[0].x-points.at(-1).x,points[0].z-points.at(-1).z)>2)continue;
   const holes=(f.holes||[]).map(h=>ring(h,project)).filter(h=>h.length>=4);
   woods.push({id:f.id,...bounds(points),contains:createPolygonMask([{outer:points,holes}]),tags:t,coverage:f.treeCoverageEstimate??1});continue;
  }
  const area=t.aeroway==='aerodrome'||t.aeroway==='apron'||t.building||t.natural==='water'||t.water||t.landuse==='reservoir';
  if(area&&points.length>=4&&Math.hypot(points[0].x-points.at(-1).x,points[0].z-points.at(-1).z)<2){
   const contains=createPolygonMask([{outer:points,holes:(f.holes||[]).map(h=>ring(h,project)).filter(h=>h.length>=4)}]);add({bounds:bounds(points),contains});
  }
  if(t.highway||t.waterway||['runway','taxiway','taxilane'].includes(t.aeroway)){
   const width=Number.parseFloat(t.width)|| (t.aeroway==='runway'?60:t.aeroway?25:['motorway','trunk'].includes(t.highway)?24:t.waterway==='river'?30:8),radius=width/2+15;
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];add({bounds:bounds([a,b]),a,b,radius},radius);}
  }
 }
 function excluded(x,z){
  const r=airport.runway;
  if(Math.abs(x)<190&&z<1600&&z>-r.length-1600)return true;
  if(seaAt(airport.id,x,z))return true;
  for(const o of cells.get(key(Math.floor(x/512),Math.floor(z/512)))||[]){
   const b=o.bounds;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;
   if(o.contains){if(o.contains(x,z))return true;}
   else{const dx=o.b.x-o.a.x,dz=o.b.z-o.a.z,u=Math.max(0,Math.min(1,((x-o.a.x)*dx+(z-o.a.z)*dz)/(dx*dx+dz*dz||1)));if(Math.hypot(x-o.a.x-u*dx,z-o.a.z-u*dz)<o.radius)return true;}
  }
  return false;
 }
 if(airport.region)woods.sort((a,b)=>Math.floor(a.minX/200)-Math.floor(b.minX/200)||Math.floor(a.minZ/200)-Math.floor(b.minZ/200)||String(a.id).localeCompare(String(b.id)));
 return{woods,excluded};
}

// Source stands each contain three original trees. Shared canopy geometry is
// expanded only in the vertex shader; no per-tree Object3D/matrix is allocated.
export function* generateWoodlandSteps({airport,denseData=null,extraFeatures=[],heightAt=(x,z)=>surfaceHeight(x,z,airport.id),colorAt=()=>null}){
 const{woods,excluded}=woodlandMasks(airport,extraFeatures),stands=new Map(),buildingCells=new Map();let scanned=0,excludedCount=0;const extent=sceneryExtent(airport)-24;
 function buildingAt(x,z){
  if(!denseData)return false;const bx=Math.floor(x/200),bz=Math.floor(z/200),k=key(bx,bz);let records=buildingCells.get(k);
  if(!records){
   records=[...denseData.candidates({x:bx*200,y:-10000,z:bz*200},{x:(bx+1)*200,y:10000,z:(bz+1)*200},15,0,false)];
   if(buildingCells.size>128)buildingCells.delete(buildingCells.keys().next().value);buildingCells.set(k,records);
  }
  return records.some(b=>x>b.minX-15&&x<b.maxX+15&&z>b.minZ-15&&z<b.maxZ+15);
 }
 for(let j=0;j<woods.length;j++){
  const w=woods[j];
  for(let gx=Math.floor(Math.max(-extent,w.minX)/WOODLAND_CELL);gx<=Math.floor(Math.min(extent,w.maxX)/WOODLAND_CELL);gx++)for(let gz=Math.floor(Math.max(-extent,w.minZ)/WOODLAND_CELL);gz<=Math.floor(Math.min(extent,w.maxZ)/WOODLAND_CELL);gz++){
   if(++scanned%4096===0)yield{completed:j,total:woods.length,stands:stands.size};
   const k=key(gx,gz);if(stands.has(k))continue;const seed=woodlandHash(k),x=(gx+.5)*WOODLAND_CELL+(random(seed,0)-.5)*8,z=(gz+.5)*WOODLAND_CELL+(random(seed,1)-.5)*8;
   if(!w.contains(x,z)||w.coverage<1&&random(seed,7)>w.coverage)continue;
   if(excluded(x,z)||buildingAt(x,z)){excludedCount++;continue;}
   const y=heightAt(x,z);if(!Number.isFinite(y))continue;
   const height=Math.max(5,Math.min(26,Number.parseFloat(w.tags.height)|| (airport.id==='changi'?14:11)+random(seed,2)*6)),width=21+random(seed,3)*3,yaw=random(seed,4)*Math.PI*2;
   const co=Math.cos(yaw),si=Math.sin(yaw);
   if(TREE_ROOTS.some(([a,b])=>{const dx=(a*co-b*si)*width,dz=(a*si+b*co)*width;return !w.contains(x+dx,z+dz)||excluded(x+dx,z+dz);})){excludedCount++;continue;}
   const slopeX=(heightAt(x+8,z)-heightAt(x-8,z))/16,slopeZ=(heightAt(x,z+8)-heightAt(x,z-8))/16;
   const photo=colorAt(x,z),rgb=photo&&photo[1]>photo[0]*1.02&&photo[1]>photo[2]*.95?photo:[78,105,60],shade=.85+random(seed,5)*.25;
   const tint=rgb.map((c,i)=>Math.round(Math.pow(Math.max(.08,Math.min(.65,(c*.65+[65,95,53][i]*.35)*shade/255)),2.2)*255));tint.push(w.tags.leaf_type==='needleleaved'||w.tags.leaf_cycle==='evergreen'?255:0);
   stands.set(k,{gx,gz,p:[x,y,z,yaw,width,height,slopeX,slopeZ],c:tint});
  }
  if(j%8===0)yield{completed:j+1,total:woods.length,stands:stands.size};
 }
 buildingCells.clear();
 const all=[...stands.values()].sort((a,b)=>Math.floor(a.p[0]/WOODLAND_TILE)-Math.floor(b.p[0]/WOODLAND_TILE)||Math.floor(a.p[2]/WOODLAND_TILE)-Math.floor(b.p[2]/WOODLAND_TILE)||a.gx-b.gx||a.gz-b.gz),far=[];
 const used=new Set();
 for(const a of all){
  const gx=Math.floor(a.gx/2)*2,gz=Math.floor(a.gz/2)*2,k=key(gx,gz);if(used.has(k))continue;used.add(k);
  const four=[stands.get(k),stands.get(key(gx+1,gz)),stands.get(key(gx,gz+1)),stands.get(key(gx+1,gz+1))];
  if(four.every(Boolean)){
   const p=four[0].p.map((_,i)=>four.reduce((n,s)=>n+s.p[i],0)/4);p[3]=0;p[4]=48;const c=four[0].c.map((_,i)=>Math.round(four.reduce((n,s)=>n+s.c[i],0)/4));far.push({p,c});
  }else for(const s of four)if(s)far.push(s);
 }
 far.sort((a,b)=>Math.floor(a.p[0]/WOODLAND_DISTRICT)-Math.floor(b.p[0]/WOODLAND_DISTRICT)||Math.floor(a.p[2]/WOODLAND_DISTRICT)-Math.floor(b.p[2]/WOODLAND_DISTRICT));
 const pack=records=>{const poses=new Float32Array(records.length*8),tints=new Uint8Array(records.length*4);for(let i=0;i<records.length;i++){poses.set(records[i].p,i*8);tints.set(records[i].c,i*4);}return{poses,tints};},fine=pack(all),coarse=pack(far);
 return{arrays:{poses:fine.poses,tints:fine.tints,farPoses:coarse.poses,farTints:coarse.tints},sourceFeatures:woods.length,excludedCount};
}

export function restoreWoodlandData(arrays,{airportId='',sourceFeatures=0,excludedCount=0,extent=30000}={}){
 function tiles(poses,tints,size){
  if(!(poses instanceof Float32Array)||!(tints instanceof Uint8Array)||poses.length%8||tints.length!==poses.length/2||poses.length>16000000)throw Error('Invalid woodland arrays');
  const result=new Map();
  for(let i=0;i<poses.length/8;i++){
   const k=i*8,x=poses[k],y=poses[k+1],z=poses[k+2],width=poses[k+4],height=poses[k+5];
   for(let j=0;j<8;j++)if(!Number.isFinite(poses[k+j]))throw Error('Invalid woodland stand');
   if(Math.abs(x)>extent+100||Math.abs(z)>extent+100||width<1||width>60||height<3||height>40)throw Error('Invalid woodland stand');
   const id=key(Math.floor(x/size),Math.floor(z/size));let t=result.get(id);
   if(!t){t={id,start:i,count:0,minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity,minY:Infinity,topY:-Infinity};result.set(id,t);}
   if(t.start+t.count!==i)throw Error('Noncontiguous woodland tile');t.count++;t.minX=Math.min(t.minX,x-width*.6);t.maxX=Math.max(t.maxX,x+width*.6);t.minZ=Math.min(t.minZ,z-width*.6);t.maxZ=Math.max(t.maxZ,z+width*.6);t.minY=Math.min(t.minY,y-width);t.topY=Math.max(t.topY,y+height+width*Math.hypot(poses[k+6],poses[k+7]));
  }
  return result;
 }
 const fine=tiles(arrays.poses,arrays.tints,WOODLAND_TILE),far=tiles(arrays.farPoses,arrays.farTints,WOODLAND_DISTRICT);
 return{...arrays,tiles:[...fine.values()],districts:[...far.values()],airportId,extent,sourceFeatures,excludedCount,standCount:arrays.poses.length/8,treeCount:arrays.poses.length/8*TREE_ROOTS.length,byteLength:Object.values(arrays).reduce((n,a)=>n+a.byteLength,0),
  *candidates(a,b,margin=0,vertical=0){
   const minY=Math.min(a.y,b.y)-vertical,maxY=Math.max(a.y,b.y)+vertical;
   for(let x=Math.floor((Math.min(a.x,b.x)-margin-16)/WOODLAND_TILE);x<=Math.floor((Math.max(a.x,b.x)+margin+16)/WOODLAND_TILE);x++)for(let z=Math.floor((Math.min(a.z,b.z)-margin-16)/WOODLAND_TILE);z<=Math.floor((Math.max(a.z,b.z)+margin+16)/WOODLAND_TILE);z++){
    const tile=fine.get(key(x,z));if(!tile||tile.topY<minY||tile.minY>maxY)continue;
    for(let i=tile.start;i<tile.start+tile.count;i++){
     const p=arrays.poses.subarray(i*8,i*8+8),co=Math.cos(p[3]),si=Math.sin(p[3]),narrow=arrays.tints[i*4+3]? .72:1;
     for(let j=0;j<TREE_ROOTS.length;j++){
      const[rx,rz,h]=TREE_ROOTS[j],dx=rx*p[4],dz=rz*p[4],ox=dx*co-dz*si,oz=dx*si+dz*co,cx=p[0]+ox,cz=p[2]+oz,base=p[1]+ox*p[6]+oz*p[7],height=p[5]*h;
      if(cx<Math.min(a.x,b.x)-margin-8||cx>Math.max(a.x,b.x)+margin+8||cz<Math.min(a.z,b.z)-margin-8||cz>Math.max(a.z,b.z)+margin+8)continue;
      const common={id:'forest/'+i+'/'+j,name:'树林',kind:'tree',cx,cz,angle:0};
      yield{...common,width:p[4]*.64*narrow,depth:p[4]*.64*narrow,baseY:base+height*.36,topY:base+height};
      yield{...common,id:common.id+'/trunk',width:.55,depth:.55,baseY:base,topY:base+height*.65};
     }
    }
   }
  }};
}
