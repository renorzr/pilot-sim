import {scenerySourceId,validateSceneryFrame} from '../regions/scenery-source.js';
import {surfaceHeight} from '../terrain/heightfield.js';

export const ROAD_DATA_REVISION=2;
export const TRAFFIC_PROFILES=Object.freeze({
 motorway:{speed:23,density:.018},trunk:{speed:19,density:.015},primary:{speed:13,density:.012},
 secondary:{speed:10.5,density:.009},tertiary:{speed:8.5,density:.006},residential:{speed:7,density:.0035},
 unclassified:{speed:7,density:.0035},living_street:{speed:4,density:.0025},service:{speed:4.5,density:.002},
 motorway_link:{speed:12,density:.012},trunk_link:{speed:11,density:.011},primary_link:{speed:9,density:.009},secondary_link:{speed:8,density:.006},tertiary_link:{speed:7,density:.004},
});
export function trafficHash(value){let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;return h>>>0;}
export const trafficRandom=(value,salt=0)=>trafficHash(value+':'+salt)/4294967296;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function sampleRoadPath(path,distance,out={}){
 const{positions:p,lengths:s}=path;distance=clamp(distance,0,path.length);
 let lo=0,hi=s.length-1;while(lo+1<hi){const mid=(lo+hi)>>>1;if(s[mid]<=distance)lo=mid;else hi=mid;}
 const k=lo*3,j=Math.min(lo+1,s.length-1)*3,t=(distance-s[lo])/Math.max(.0001,s[Math.min(lo+1,s.length-1)]-s[lo]),dx=p[j]-p[k],dy=p[j+1]-p[k+1],dz=p[j+2]-p[k+2];
 out.x=p[k]+dx*t;out.y=p[k+1]+dy*t;out.z=p[k+2]+dz*t;out.yaw=Math.atan2(dx,-dz);out.pitch=Math.atan2(dy,Math.hypot(dx,dz));out.tx=dx/Math.max(.001,Math.hypot(dx,dz));out.tz=dz/Math.max(.001,Math.hypot(dx,dz));return out;
}
export function roadPath(points){
 const positions=points instanceof Float32Array?points:new Float32Array(points),lengths=new Float32Array(positions.length/3);
 for(let i=1;i<lengths.length;i++)lengths[i]=lengths[i-1]+Math.hypot(positions[i*3]-positions[(i-1)*3],positions[i*3+2]-positions[(i-1)*3+2]);
 return{positions,lengths,length:lengths.at(-1)};
}
export function resampleRoadPath(points,heightAt){
 const out=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/12));
  for(let j=0;j<count;j++){const t=j/count,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;out.push(x,heightAt(x,z)+a[1]+(b[1]-a[1])*t+.055,z);}
 }
 const p=points.at(-1);out.push(p[0],heightAt(p[0],p[2])+p[1]+.055,p[2]);return roadPath(out);
}
export function lanePath(road,reverse,offset,heightAt,trimEnds=true){
 const trim=trimEnds?Math.min(8,road.width*.65,road.path.length*.2):0,start=trim,end=road.path.length-trim,count=Math.max(1,Math.ceil((end-start)/10)),points=[],p={};
 for(let j=0;j<=count;j++){
  sampleRoadPath(road.path,reverse?end-(end-start)*j/count:start+(end-start)*j/count,p);
  const tx=reverse?-p.tx:p.tx,tz=reverse?-p.tz:p.tz,x=p.x-tz*offset,z=p.z+tx*offset,y=road.raised?p.y:p.y+heightAt(x,z)-heightAt(p.x,p.z);points.push(x,y,z);
 }
 return roadPath(points);
}
export function validateRoadSource(source,airport){
 if(source?.schema!==1||source.airportId!==scenerySourceId(airport)||!Array.isArray(source.nodes)||!Array.isArray(source.edges)||!Array.isArray(source.ground)||!source.fingerprint)throw Error('Invalid road source');
 if(source.drivingSide!==undefined&&!['left','right'].includes(source.drivingSide))throw Error('Invalid road driving side');
 validateSceneryFrame(airport,source.frame,'Road');
 for(const n of source.nodes)if(n.length<5||!n.slice(0,4).every(Number.isFinite))throw Error('Invalid road node');
 for(const e of source.edges)if(!TRAFFIC_PROFILES[e.kind]||!Array.isArray(e.nodes)||e.nodes.length<2||e.nodes.some(i=>!Number.isSafeInteger(i)||!source.nodes[i])||![0,1,-1].includes(e.oneway)||!Number.isFinite(e.width)||e.width<3||e.width>40||!Number.isSafeInteger(e.forward)||e.forward<1||e.forward>8||!Number.isSafeInteger(e.backward)||e.backward<0||e.backward>8||!e.oneway&&!e.backward)throw Error('Invalid road edge');
 return source;
}
export function buildRoadGraph(source,airport,{heightAt=(x,z)=>surfaceHeight(x,z,airport.id),prepared=null}={}){
 validateRoadSource(source,airport);
 const drivingSide=source.drivingSide||'right',hand=drivingSide==='left'?-1:1,terminals=new Set(source.edges.flatMap(e=>[e.nodes[0],e.nodes.at(-1)]));
 const nodePositions=new Float32Array(source.nodes.length*3),nodes=source.nodes.map((n,i)=>{
  const p=airport.project(n[1],n[2]),lift=n[3]>0&&source.bridgeDeckReference==='airport'?n[3]-Math.min(0,heightAt(p.x,p.z)):n[3];nodePositions.set([p.x,lift,p.z],i*3);
  return{id:n[0],x:p.x,z:p.z,lift,control:n[4],...(terminals.has(i)?{incoming:[],outgoing:[],ways:new Set()}:{}),boundary:Math.hypot(p.x-source.center[0],p.z-source.center[1])>source.radius-100};
 });
 const roads=[],lanes=[],roadRanges=[],laneRanges=[],roadPoints=[],lanePoints=[];
 let validPrepared=prepared?.roadRanges?.length===source.edges.length*2&&prepared?.roadPositions instanceof Float32Array&&prepared?.laneRanges instanceof Uint32Array&&prepared?.lanePositions instanceof Float32Array;
 if(validPrepared)for(const key of ['roadPositions','lanePositions'])if(!prepared[key].every(Number.isFinite))validPrepared=false;
 if(validPrepared){
  const expected=source.edges.reduce((n,e)=>n+(e.oneway?e.forward:e.forward+e.backward),0);
  if(prepared.laneRanges.length!==expected*2)validPrepared=false;
  for(const prefix of ['road','lane']){const ranges=prepared[prefix+'Ranges'],positions=prepared[prefix+'Positions'];for(let i=0;i<ranges.length;i+=2)if(ranges[i+1]<6||ranges[i+1]%3||ranges[i]+ranges[i+1]>positions.length)validPrepared=false;}
 }
 for(let index=0;index<source.edges.length;index++){
  const e=source.edges[index],path=validPrepared?roadPath(prepared.roadPositions.subarray(prepared.roadRanges[index*2],prepared.roadRanges[index*2]+prepared.roadRanges[index*2+1])):resampleRoadPath(e.nodes.map(i=>[nodes[i].x,nodes[i].lift,nodes[i].z]),heightAt);
  if(path.length<.1)throw Error('Degenerate road path');
  const r={...e,index,from:e.nodes[0],to:e.nodes.at(-1),path,raised:e.nodes.some(i=>nodes[i].lift>.05),lanes:[]};roads.push(r);
  if(!validPrepared){roadRanges.push(roadPoints.length,path.positions.length);roadPoints.push(...path.positions);}
  const directions=e.oneway===-1?[true]:e.oneway===1?[false]:[false,true];
  for(const reverse of directions){
   const count=reverse&&!e.oneway?e.backward:e.forward;
   for(let slot=0;slot<count;slot++){
    const offset=(e.oneway?(slot+.5-count/2)*3.25:(slot+.5)*3.25)*hand,id=lanes.length;
    const lane=validPrepared?roadPath(prepared.lanePositions.subarray(prepared.laneRanges[id*2],prepared.laneRanges[id*2]+prepared.laneRanges[id*2+1])):lanePath(r,reverse,offset,heightAt);
    const profile=TRAFFIC_PROFILES[e.kind],record={...lane,id,road:index,slot,slots:count,reverse,offset,from:reverse?r.to:r.from,to:reverse?r.from:r.to,
     speed:Math.min(profile.speed,e.speed>0?e.speed*.9:Infinity),density:profile.density,hidden:e.tunnel};
    if(!validPrepared){laneRanges.push(lanePoints.length,lane.positions.length);lanePoints.push(...lane.positions);}
    lanes.push(record);r.lanes.push(id);nodes[record.from].outgoing.push(id);nodes[record.to].incoming.push(id);nodes[record.from].ways.add(e.way);nodes[record.to].ways.add(e.way);
   }
  }
 }
 if(validPrepared&&prepared.laneRanges.length!==lanes.length*2)throw Error('Invalid prepared road lanes');
 const restrictions=new Map();for(const[from,to,via,type]of source.restrictions||[]){const k=via+':'+from;if(!restrictions.has(k))restrictions.set(k,[]);restrictions.get(k).push({to,type});}
 const options=lanes.map(l=>{
  const node=nodes[l.to],way=roads[l.road].way,rules=restrictions.get(node.id+':'+way)||[],incoming=sampleRoadPath(l,l.length,{});
  return node.outgoing.filter(i=>{
   const n=lanes[i],nextWay=roads[n.road].way;if(n.road===l.road)return false;
   if(rules.some(r=>r.type.startsWith('only_')?nextWay!==r.to:r.type.startsWith('no_')&&nextWay===r.to))return false;
   const p=sampleRoadPath(n,0,{});return incoming.tx*p.tx+incoming.tz*p.tz>-.87;
  });
 });
 const connections=new Map();
 function connector(from,to){
  const key=from+':'+to;if(connections.has(key))return connections.get(key);
  const a=sampleRoadPath(lanes[from],lanes[from].length,{}),b=sampleRoadPath(lanes[to],0,{}),size=Math.min(18,Math.max(.01,Math.hypot(b.x-a.x,b.z-a.z)*.55)),points=[];
  for(let i=0;i<=14;i++){const t=i/14,u=1-t;points.push(u*u*u*a.x+3*u*u*t*(a.x+a.tx*size)+3*u*t*t*(b.x-b.tx*size)+t*t*t*b.x,a.y+(b.y-a.y)*(t*t*(3-2*t)),u*u*u*a.z+3*u*u*t*(a.z+a.tz*size)+3*u*t*t*(b.z-b.tz*size)+t*t*t*b.z);}
  const path=roadPath(points),dot=a.tx*b.tx+a.tz*b.tz;path.speed=dot>.95?Math.min(lanes[from].speed,lanes[to].speed):dot>.5?10:6.5;path.from=from;path.to=to;path.node=lanes[from].to;
  if(connections.size>=8192)connections.delete(connections.keys().next().value);connections.set(key,path);return path;
 }
 const snapshot=validPrepared?{nodePositions,roadPositions:prepared.roadPositions,roadRanges:prepared.roadRanges,lanePositions:prepared.lanePositions,laneRanges:prepared.laneRanges}:
  {nodePositions,roadPositions:new Float32Array(roadPoints),roadRanges:new Uint32Array(roadRanges),lanePositions:new Float32Array(lanePoints),laneRanges:new Uint32Array(laneRanges)};
 if(!validPrepared){for(let i=0;i<roads.length;i++)roads[i].path.positions=snapshot.roadPositions.subarray(snapshot.roadRanges[i*2],snapshot.roadRanges[i*2]+snapshot.roadRanges[i*2+1]);for(let i=0;i<lanes.length;i++)lanes[i].positions=snapshot.lanePositions.subarray(snapshot.laneRanges[i*2],snapshot.laneRanges[i*2]+snapshot.laneRanges[i*2+1]);}
 return{airportId:airport.id,drivingSide,hand,source,nodes,roads,lanes,options,connector,snapshot:()=>snapshot,prepared:!!validPrepared,byteLength:Object.values(snapshot).reduce((s,a)=>s+a.byteLength,0)};
}
