// Shared terrain geometry: render vertices and physical sampling use the same
// triangles, including the coast. Heights are metres in the flight world.
import {clamp,RUNWAY} from '../sim/constants.js';
export const TERRAIN={width:16000,depth:50000,columns:160,rows:360,waterLevel:-2.8};
export const coastline=z=>-650+Math.sin(z/1050)*130+Math.sin(z/290)*30;
export function vertexHeight(x,z){
 const coast=x-coastline(z),foothill=Math.max(0,Math.abs(z+1200)-3200)/4500+Math.max(0,x-1700)/1800;
 let y=Math.pow(foothill,1.5)*140*(1+.30*Math.sin(x/920)*Math.cos(z/1060)+.07*Math.sin(z/350));
 if(coast<0)y=-8-Math.min(70,-coast*.09);
 else if(coast<90)y=-2.5+coast/90*2.4;
 else if(Math.abs(x)<1400&&z>-3800&&z<24000)y=-.1;
 return Math.fround(y);
}
const grid=new Float32Array((TERRAIN.columns+1)*(TERRAIN.rows+1));
for(let j=0;j<=TERRAIN.rows;j++)for(let i=0;i<=TERRAIN.columns;i++)grid[j*(TERRAIN.columns+1)+i]=vertexHeight(Math.fround(-8000+i*100),Math.fround(-25000+j*TERRAIN.depth/TERRAIN.rows));
export const onRunway=(x,z)=>Math.abs(x)<=RUNWAY.width/2&&z<=5&&z>=-RUNWAY.length;
export function terrainHeight(x,z){
 if(Math.abs(x)>8000||Math.abs(z)>25000)return vertexHeight(x,z);
 const gx=clamp((x+8000)/100,0,TERRAIN.columns-1e-9),gz=clamp((z+25000)/(TERRAIN.depth/TERRAIN.rows),0,TERRAIN.rows-1e-9);
 const i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,k=j*(TERRAIN.columns+1)+i;
 const a=grid[k],b=grid[k+TERRAIN.columns+1],c=grid[k+TERRAIN.columns+2],d=grid[k+1];
 return u+v<=1?a+(d-a)*u+(b-a)*v:c+(b-c)*(1-u)+(d-c)*(1-v);
}
export const surfaceHeight=(x,z)=>onRunway(x,z)?0:Math.max(TERRAIN.waterLevel,terrainHeight(x,z));
export const terrainRadioAltitude=s=>Math.max(0,(s.y-surfaceHeight(s.x,s.z)-RUNWAY.ground));
function contactAt(p){
 const right={x:Math.cos(p.yaw),z:Math.sin(p.yaw)},forward={x:Math.sin(p.yaw),z:-Math.cos(p.yaw)};
 const probes=[{x:p.x,y:p.y,z:p.z,margin:RUNWAY.ground},...[-17,17].map(t=>({x:p.x+t*right.x,y:p.y-t*Math.sin(p.roll),z:p.z+t*right.z,margin:.5})),{x:p.x+15*forward.x,y:p.y+15*Math.sin(p.pitch),z:p.z+15*forward.z,margin:1}];
 for(const q of probes){if(onRunway(q.x,q.z))continue;const ground=surfaceHeight(q.x,q.z);if(q.y<=ground+q.margin)return{...p,surface:ground,type:ground===TERRAIN.waterLevel?'water':'terrain'};}
 return null;
}
export function sweptContact(previous,current){
 const steps=Math.max(1,Math.ceil(Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z)/8));
 for(let i=0;i<=steps;i++){
  const t=i/steps,p={};for(const key of ['x','y','z','yaw','pitch','roll'])p[key]=previous[key]+(current[key]-previous[key])*t;
  if(!contactAt(p))continue;
  let lo=Math.max(0,(i-1)/steps),hi=t;
  for(let j=0;j<10;j++){const mid=(lo+hi)/2,q={};for(const key of ['x','y','z','yaw','pitch','roll'])q[key]=previous[key]+(current[key]-previous[key])*mid;contactAt(q)?hi=mid:lo=mid;}
  for(const key of ['x','y','z','yaw','pitch','roll'])p[key]=previous[key]+(current[key]-previous[key])*hi;
  return contactAt(p)||{...p,surface:surfaceHeight(p.x,p.z),type:'terrain'};
 }
 return null;
}
