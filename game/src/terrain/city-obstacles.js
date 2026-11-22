import {cityLayout}from '../airports/city-layout.js';
import {footprintEntry}from '../airports/dense-city-data.js';
const cells=new Map(),size=400;
const denseCities=new Map();
export function installDenseCity(index,airportId=index.manifest?.airportId||'lax'){denseCities.set(airportId,index);return()=>{if(denseCities.get(airportId)===index)denseCities.delete(airportId);};}
let ready=false;
function initialize(){
 if(ready)return;ready=true;
 for(const b of cityLayout().all){
  const co=Math.abs(Math.cos(b.angle)),si=Math.abs(Math.sin(b.angle)),rx=(co*b.width+si*b.depth)/2,rz=(si*b.width+co*b.depth)/2;
  b.radiusX=rx;b.radiusZ=rz;
  for(let x=Math.floor((b.cx-rx)/size);x<=Math.floor((b.cx+rx)/size);x++)for(let z=Math.floor((b.cz-rz)/size);z<=Math.floor((b.cz+rz)/size);z++){const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);}
 }
}
const airportIdOf=s=>typeof s==='string'?s:s?.airportId;
const supportsCity=s=>airportIdOf(s)==='lax'||denseCities.has(airportIdOf(s));
function candidates(a,b,margin=0,vertical=0,airportId='lax'){
 const denseCity=denseCities.get(airportId);if(airportId==='lax')initialize();const result=new Set();
 if(airportId==='lax')for(let x=Math.floor((Math.min(a.x,b.x)-margin)/size);x<=Math.floor((Math.max(a.x,b.x)+margin)/size);x++)for(let z=Math.floor((Math.min(a.z,b.z)-margin)/size);z<=Math.floor((Math.max(a.z,b.z)+margin)/size);z++)for(const o of cells.get(x+':'+z)||[])if(!denseCity||o.kind==='landmark')result.add(o);
 return denseCity?(function*(){yield*result;yield*denseCity.candidates(a,b,margin,vertical);})():result;
}
function intersect(a,b,o,horizontal=0,vertical=0){
 const co=Math.cos(o.angle),si=Math.sin(o.angle),local=p=>[(p.x-o.cx)*co+(p.z-o.cz)*si,p.y,-(p.x-o.cx)*si+(p.z-o.cz)*co],p=local(a),q=local(b);
 const low=[-o.width/2-horizontal,o.baseY-vertical,-o.depth/2-horizontal],high=[o.width/2+horizontal,o.topY+vertical,o.depth/2+horizontal];let lo=0,hi=1;
 for(let i=0;i<3;i++){const d=q[i]-p[i];if(Math.abs(d)<1e-10){if(p[i]<low[i]||p[i]>high[i])return null;continue;}let u=(low[i]-p[i])/d,v=(high[i]-p[i])/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>hi)return null;}
 return o.rings?footprintEntry(a,b,o.rings,lo,hi,horizontal):lo;
}
export function cityRay(origin,destination,airport='lax',{horizontal=0,vertical=0}={}){
 if(!supportsCity(airport))return null;let hit=null;
 for(const o of candidates(origin,destination,horizontal,vertical,airportIdOf(airport))){const t=intersect(origin,destination,o,horizontal,vertical);if(t!==null&&(!hit||t<hit.t))hit={t,obstacle:o};}
 if(!hit)return null;return{...hit,distance:Math.hypot(destination.x-origin.x,destination.y-origin.y,destination.z-origin.z)*hit.t,top:hit.obstacle.topY};
}
function probes(p){
 const co=Math.cos(p.yaw),si=Math.sin(p.yaw),out=[{x:p.x,y:p.y,z:p.z,margin:2.8}];
 for(const t of[-17,-8,8,17])out.push({x:p.x+t*co,y:p.y-t*Math.sin(p.roll),z:p.z+t*si,margin:.5});
 for(const t of[-15,15])out.push({x:p.x+t*si,y:p.y+t*Math.sin(p.pitch),z:p.z-t*co,margin:1});
 return out;
}
export function sweptCityContact(previous,current){
 if(!supportsCity(current))return null;
 const from=probes(previous),to=probes(current),near=candidates(previous,current,21,21,airportIdOf(current));let first=null;
 for(const o of near)for(let i=0;i<from.length;i++){const t=intersect(from[i],to[i],o,from[i].margin,from[i].margin);if(t!==null&&(!first||t<first.t))first={t,o};}
 if(!first)return null;const p={};for(const key of['x','y','z','pitch','roll'])p[key]=previous[key]+(current[key]-previous[key])*first.t;
 p.yaw=previous.yaw+Math.atan2(Math.sin(current.yaw-previous.yaw),Math.cos(current.yaw-previous.yaw))*first.t;
 return{...p,fraction:first.t,surface:first.o.topY,type:'building',obstacleId:first.o.id,obstacleName:first.o.name||first.o.id};
}
export function predictCityObstacles(s){
 if(!supportsCity(s))return null;const speed=s.airData.groundSpeed,heading=s.airData.groundTrack;let earliest=Infinity,peak=0,obstacleId=null;
 // This is an obstacle closure envelope, independent of the terrain landing
 // exemption. Roofs stay out of the DEM and cannot change runway radio heights.
 for(const angle of[-.05,0,.05]){const h=heading+angle,end={x:s.x+Math.sin(h)*speed*30,y:s.y+s.velocity.y*30,z:s.z-Math.cos(h)*speed*30},hit=cityRay(s,end,s,{horizontal:20,vertical:12});
  if(hit&&hit.t*30<earliest){earliest=hit.t*30;peak=hit.top;obstacleId=hit.obstacle.id;}}
 return Number.isFinite(earliest)?{level:earliest<=15?2:1,timeToImpact:earliest,peakHeight:peak,obstacleId}:null;
}
