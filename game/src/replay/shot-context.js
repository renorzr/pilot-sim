import {createShotOcclusionIndex} from './shot-occlusion.js';
import {airportOf} from '../airports/registry.js';
import {surfaceHeight} from '../terrain/heightfield.js';
import anchors from './landmark-anchors.json' with {type:'json'};
const cache=new Map();
const area=points=>Math.abs(points.reduce((n,p,i)=>{const q=points[(i+1)%points.length];return n+p[0]*q[1]-q[0]*p[1];},0))/2;
function mergeTerminals(records,airport){
 if(!records.length)return[];
 // Keep named passenger terminals and their connected wings. Tiny isolated
 // terminal-tagged service buildings must not outrank the principal terminal.
 const largest=Math.max(...records.map(r=>r.area)),major=records.filter(r=>r.area>=Math.max(1800,largest*.05));
 const groups=[];for(const r of major){const near=groups.filter(g=>g.some(p=>Math.max(0,p.min[0]-r.max[0],r.min[0]-p.max[0])<65&&Math.max(0,p.min[2]-r.max[2],r.min[2]-p.max[2])<65));if(!near.length)groups.push([r]);else{near[0].push(r);for(const other of near.slice(1)){near[0].push(...other);groups.splice(groups.indexOf(other),1);}}}
 return groups.map(parts=>{parts.sort((a,b)=>b.area-a.area);const min=[Math.min(...parts.map(p=>p.min[0])),Math.min(...parts.map(p=>p.baseY)),Math.min(...parts.map(p=>p.min[2]))],max=[Math.max(...parts.map(p=>p.max[0])),Math.max(...parts.map(p=>p.max[1])),Math.max(...parts.map(p=>p.max[2]))],main=parts[0];return {...main,id:'terminal:'+main.id,name:parts.length>1?airport.shortName+'航站楼':main.name,kind:'terminal',sourceIds:parts.map(p=>p.id),polygons:parts.flatMap(p=>p.polygons),facades:parts.flatMap(p=>p.polygons.map(points=>({points,baseY:p.baseY,height:p.height,id:p.id}))),min,max,width:max[0]-min[0],depth:max[2]-min[2],height:max[1]-min[1],baseY:min[1],position:main.position,subjectPolygon:main.polygons[0],subjectHeight:main.height,radius:Math.hypot(max[0]-min[0],max[2]-min[2])/2,area:parts.reduce((n,p)=>n+p.area,0),importance:.85};}).sort((a,b)=>b.area-a.area).slice(0,8);
}
export function airportShotContext(id){
 if(cache.has(id))return cache.get(id);const airport=airportOf(id),heightAt=(x,z)=>surfaceHeight(x,z,id),terminalParts=[],obstacles=[],landmarks=[],buildings=[];
 if(airport.data){
  for(const f of airport.data.osm.features){
   const t=f.tags||{},terminal=t.aeroway==='terminal'||t.building==='terminal',named=/jewel/i.test([t.name,t['name:en']].join(' '));if(!terminal&&!t.building&&!named)continue;
   const points=(f.geometry||[]).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>airport.project(p[0],p[1]));if(points.length<3)continue;
   const polygon=points.map(p=>[p.x,p.z]),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z)),x=(minX+maxX)/2,z=(minZ+maxZ)/2,base=heightAt(x,z),height=Math.max(5,Math.min(100,parseFloat(t.height)||Number(t['building:levels'])*3.2||(terminal?20:10))),record={id:f.id,name:t['name:en']||t.name||airport.ident,position:[x,base+height/2,z],width:maxX-minX,depth:maxZ-minZ,height,baseY:base,min:[minX,base,minZ],max:[maxX,base+height,maxZ],polygons:[polygon],area:area(polygon),radius:Math.hypot(maxX-minX,maxZ-minZ)/2,kind:terminal?'terminal':named?'landmark':'building',sourceIds:[f.id],importance:named?1:terminal?.85:.35};
   obstacles.push(record);if(terminal)terminalParts.push(record);else if(named)landmarks.push(record);else if(record.area>1500&&height>10)buildings.push(record);
  }
 }else{
  const record={id:'training-terminal',name:'训练机场航站楼',position:[540,8.5,-1390],width:282,depth:80,height:17,baseY:0,min:[399,0,-1430],max:[681,17,-1350],area:282*80,polygons:[[[399,-1430],[681,-1430],[681,-1350],[399,-1350]]],kind:'terminal',sourceIds:['training-terminal'],importance:.85};terminalParts.push(record);obstacles.push(record);
 }
 for(const a of anchors[id]||[]){const p=airport.project(a.longitude,a.latitude),base=heightAt(p.x,p.z),r=a.radius,polygon=a.footprint?.map(q=>{const p=airport.project(...q);return[p.x,p.z];})||[[p.x-r,p.z-r],[p.x+r,p.z-r],[p.x+r,p.z+r],[p.x-r,p.z+r]],minX=Math.min(...polygon.map(p=>p[0])),maxX=Math.max(...polygon.map(p=>p[0])),minZ=Math.min(...polygon.map(p=>p[1])),maxZ=Math.max(...polygon.map(p=>p[1])),record={...a,position:[p.x,base+a.height/2,p.z],baseY:base,min:[minX,base,minZ],max:[maxX,base+a.height,maxZ],width:maxX-minX,depth:maxZ-minZ,polygons:[polygon],sourceIds:[a.id],importance:1,...(a.roofFootprint?{roofEdges:[{points:a.roofFootprint.map(q=>{const p=airport.project(...q);return[p.x,p.z];}),baseY:base,height:a.roofHeight}]}:{})};landmarks.push(record);obstacles.push(record);}

 const terminals=mergeTerminals(terminalParts,airport),targets=[...landmarks,...terminals];
 // Ordinary existing buildings are eligible ground foregrounds, with lower
 // interest; keep a compact, spatially spread set instead of every OSM house.
 const occupied=new Set();for(const b of buildings.sort((a,b)=>b.area*b.height-a.area*a.height)){const cell=Math.floor(b.position[0]/1500)+':'+Math.floor(b.position[2]/1500);if(!occupied.has(cell)&&targets.length<56){occupied.add(cell);targets.push(b);}}
 const value={airportId:id,heightAt,terminals,landmarks:targets,obstacles,occluders:createShotOcclusionIndex(obstacles)};cache.set(id,value);return value;
}
