import {aircraftDefinition} from '../aircraft/registry.js';
// Shared terrain geometry: render vertices and physical sampling use the same
// triangles, including the coast. Heights are metres in the flight world.
import {clamp,RUNWAY} from '../sim/constants.js';
import {runwayOf,airportOf,isRealAirport,sampleAirportElevation,seaAt} from '../airports/registry.js';
export const TERRAIN={width:16000,depth:50000,columns:160,rows:360,waterLevel:-2.8};
const REAL_AIRPORT_TERRAIN={width:60000,depth:60000,columns:240,rows:240,waterLevel:-10000};
export const terrainConfig=airport=>airportOf(airport).region?{...REAL_AIRPORT_TERRAIN,width:airportOf(airport).region.extent*2,depth:airportOf(airport).region.extent*2,columns:airportOf(airport).region.extent/125,rows:airportOf(airport).region.extent/125,waterLevel:-airportOf(airport).elevationM}:airportOf(airport).event?{width:80000,depth:80000,columns:320,rows:320,waterLevel:0}:isRealAirport(airport)?(airportOf(airport).coastal?{...REAL_AIRPORT_TERRAIN,waterLevel:-airportOf(airport).elevationM}:REAL_AIRPORT_TERRAIN):TERRAIN;
export const coastline=z=>-650+Math.sin(z/1050)*130+Math.sin(z/290)*30;
export function vertexHeight(x,z,airport){
 if(isRealAirport(airport)){
  if(seaAt(airport,x,z))return Math.fround(-airportOf(airport).elevationM-1);
  const info=airportOf(airport);let outside=Infinity,base=0;
  for(const zone of info.regionAirports||[info.id]){const ap=airportOf(zone),geo=info.unproject(x,z),q=info.id===ap.id?{x,z}:ap.project(geo.longitude,geo.latitude),b=ap.regionGrading?.bounds||ap.grading,d=Math.hypot(Math.max(0,b.minX-q.x,q.x-b.maxX),Math.max(0,b.minZ-q.z,q.z-b.maxZ));if(d<outside){outside=d;base=(ap.regionGrading?.baseMSL??ap.elevationM)-info.elevationM;}}
  const t=clamp(outside/800,0,1),blend=t*t*(3-2*t);
  return Math.fround(sampleAirportElevation(airport,x,z)*blend+base*(1-blend));
 }
 const coast=x-coastline(z),foothill=Math.max(0,Math.abs(z+1200)-3200)/4500+Math.max(0,x-1700)/1800;
 let y=Math.pow(foothill,1.5)*140*(1+.30*Math.sin(x/920)*Math.cos(z/1060)+.07*Math.sin(z/350));
 if(coast<0)y=-8-Math.min(70,-coast*.09);
 else if(coast<90)y=-2.5+coast/90*2.4;
 else if(Math.abs(x)<1400&&z>-3800&&z<24000)y=-.1;
 return Math.fround(y);
}
const grid=new Float32Array((TERRAIN.columns+1)*(TERRAIN.rows+1));
for(let j=0;j<=TERRAIN.rows;j++)for(let i=0;i<=TERRAIN.columns;i++)grid[j*(TERRAIN.columns+1)+i]=vertexHeight(Math.fround(-8000+i*100),Math.fround(-25000+j*TERRAIN.depth/TERRAIN.rows));
export const onRunway=(x,z,airport)=>{if(airportOf(airport).event)return false;const r=runwayOf(airport);return Math.abs(x)<=r.width/2&&z<=5&&z>=-r.length;};
const airportGrids=new Map();
function realAirportHeight(x,z,airport){
 const id=airportOf(airport).id;let airportGrid=airportGrids.get(id);
 const t=terrainConfig(airport),dx=t.width/t.columns,dz=t.depth/t.rows;
 if(!airportGrid){airportGrid=new Float32Array((t.columns+1)*(t.rows+1));for(let j=0;j<=t.rows;j++)for(let i=0;i<=t.columns;i++)airportGrid[j*(t.columns+1)+i]=vertexHeight(Math.fround(-t.width/2+i*dx),Math.fround(-t.depth/2+j*dz),id);airportGrids.set(id,airportGrid);}
 if(Math.abs(x)>t.width/2||Math.abs(z)>t.depth/2)return vertexHeight(x,z,id);
 const gx=clamp((x+t.width/2)/dx,0,t.columns-1e-9),gz=clamp((z+t.depth/2)/dz,0,t.rows-1e-9),i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,k=j*(t.columns+1)+i;
 const a=airportGrid[k],b=airportGrid[k+t.columns+1],c=airportGrid[k+t.columns+2],d=airportGrid[k+1];
 return u+v<=1?a+(d-a)*u+(b-a)*v:c+(b-c)*(1-u)+(d-c)*(1-v);
}
export function terrainHeight(x,z,airport){
 const info=airportOf(airport);if(info.terrainFrameId){const source=airportOf(info.terrainFrameId),p=info.unproject(x,z),q=source.project(p.longitude,p.latitude);return realAirportHeight(q.x,q.z,source.id)+source.elevationM-info.elevationM;}
 if(isRealAirport(airport))return realAirportHeight(x,z,airport);
 if(Math.abs(x)>8000||Math.abs(z)>25000)return vertexHeight(x,z);
 const gx=clamp((x+8000)/100,0,TERRAIN.columns-1e-9),gz=clamp((z+25000)/(TERRAIN.depth/TERRAIN.rows),0,TERRAIN.rows-1e-9);
 const i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,k=j*(TERRAIN.columns+1)+i;
 const a=grid[k],b=grid[k+TERRAIN.columns+1],c=grid[k+TERRAIN.columns+2],d=grid[k+1];
 return u+v<=1?a+(d-a)*u+(b-a)*v:c+(b-c)*(1-u)+(d-c)*(1-v);
}
// Continuous routes have a coarse sea-level world surface outside the authored
// airport DEM. The route backdrop renders this same surface; no extrapolated
// edge mountain follows the aircraft across an entire ocean.
export function continuousCoarseSurface(x,z,state){
 if(!state?.airline?.continuous||state.airline.arrivalMode==='skipped')return null;
 const t=terrainConfig(state);return Math.abs(x)>t.width/2||Math.abs(z)>t.depth/2?-airportOf(state).elevationM:null;
}
export const surfaceHeight=(x,z,airport)=>continuousCoarseSurface(x,z,airport)??(onRunway(x,z,airport)?0:airportOf(airport).id==='lax'&&seaAt(airport,x,z)?terrainConfig(airport).waterLevel:Math.max(terrainConfig(airport).waterLevel,terrainHeight(x,z,airport)));
export const terrainRadioAltitude=s=>Math.max(0,(s.y-surfaceHeight(s.x,s.z,s)-(airportOf(s).event?0:runwayOf(s).ground)));
function contactAt(p,airport,definition){
 const g=definition.geometry.terrainEnvelope;
 const right={x:Math.cos(p.yaw),z:Math.sin(p.yaw)},forward={x:Math.sin(p.yaw),z:-Math.cos(p.yaw)};
 const probes=[{x:p.x,y:p.y,z:p.z,margin:g.centerMargin},...g.wingStations.map(t=>({x:p.x+t*right.x,y:p.y-t*Math.sin(p.roll),z:p.z+t*right.z,margin:g.wingMargin})),{x:p.x+g.forwardStation*forward.x,y:p.y+g.forwardStation*Math.sin(p.pitch),z:p.z+g.forwardStation*forward.z,margin:g.forwardMargin}];
 for(const q of probes){if(onRunway(q.x,q.z,airport))continue;const ground=surfaceHeight(q.x,q.z,airport);if(q.y<=ground+q.margin)return{...p,surface:ground,type:ground===terrainConfig(airport).waterLevel?'water':'terrain'};}
 return null;
}
export function sweptContact(previous,current){
 const airport=current,definition=aircraftDefinition(current);
 const steps=Math.max(1,Math.ceil(Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z)/8));
 for(let i=0;i<=steps;i++){
  const t=i/steps,p={};for(const key of ['x','y','z','yaw','pitch','roll'])p[key]=previous[key]+(current[key]-previous[key])*t;
  if(!contactAt(p,airport,definition))continue;
  let lo=Math.max(0,(i-1)/steps),hi=t;
  for(let j=0;j<10;j++){const mid=(lo+hi)/2,q={};for(const key of ['x','y','z','yaw','pitch','roll'])q[key]=previous[key]+(current[key]-previous[key])*mid;contactAt(q,airport,definition)?hi=mid:lo=mid;}
  for(const key of ['x','y','z','yaw','pitch','roll'])p[key]=previous[key]+(current[key]-previous[key])*hi;
  return contactAt(p,airport,definition)||{...p,surface:surfaceHeight(p.x,p.z,airport),type:'terrain'};
 }
 return null;
}
