// Generate reviewed arrival alternatives from bundled OSM taxiway geometry.
// Source network connectivity is retained; apron handoffs/stop offsets reuse
// the existing curated stand data and are explicitly game estimates.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {AIRPORTS} from '../game/src/airports/registry.js';
import {departureOf} from '../game/src/missions/ground.js';
const outputDirectory=process.env.PILOT_TAXI_OUTPUT||new URL('../game/src/airports/data/',import.meta.url).pathname;
await mkdir(outputDirectory,{recursive:true});
for(const airport of AIRPORTS.filter(a=>!process.env.PILOT_TAXI_AIRPORT||a.id===process.env.PILOT_TAXI_AIRPORT)){
 const d=departureOf(airport.id),nodes=[],edges=[],keys=new Map(),candidates=[];
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 function node(p){const key=[p.x.toFixed(1),p.z.toFixed(1)].join(':');if(keys.has(key))return keys.get(key);const id=nodes.length;nodes.push(p);edges.push([]);keys.set(key,id);return id;}
 function edge(a,b,source,oneway=false){const cost=dist(nodes[a],nodes[b]);if(cost<.01)return;
  edges[a].push({to:b,cost,source});if(!oneway)edges[b].push({to:a,cost,source});
 }
 for(const way of airport.data.osm.features.filter(f=>f.tags?.aeroway==='taxiway')){
  const ps=way.geometry.map(p=>airport.project(...p)),ids=ps.map(node);
  for(let i=1;i<ps.length;i++){
   const a=ps[i-1],b=ps[i],src={sourceId:way.id,name:way.tags.ref||'EXIT'};
   if(a.x*b.x<=0&&Math.abs(a.x-b.x)>1){const t=-a.x/(b.x-a.x),z=a.z+(b.z-a.z)*t;
    if(z< -900&&z> -airport.runway.length+70){const q=node({x:0,z});edge(ids[i-1],q,src);edge(q,ids[i],src);candidates.push({node:q,ref:src.name,sourceId:way.id});continue;}
   }
   const reverse=way.tags.oneway==='-1';edge(reverse?ids[i]:ids[i-1],reverse?ids[i-1]:ids[i],src,way.tags.oneway==='yes'||reverse);
   if(Math.abs(b.x)<6&&b.z< -900&&b.z> -airport.runway.length+70)candidates.push({node:ids[i],ref:src.name,sourceId:way.id});
  }
 }
 // Reconcile tiny source endpoint rounding gaps, never bridge unrelated roads.
 const count=nodes.length;for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)if(dist(nodes[i],nodes[j])<2)edge(i,j,{name:'JUNCTION',sourceId:'source-endpoint-snap'});
 const sourceEdges=edges.flatMap((es,i)=>es.filter(e=>e.to>i).map(e=>({a:i,b:e.to,source:e.source})));
 for(const e of sourceEdges){const a=nodes[e.a],b=nodes[e.b],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
  for(let i=0;i<count;i++){if(i===e.a||i===e.b)continue;const p=nodes[i],t=((p.x-a.x)*dx+(p.z-a.z)*dz)/l2;
   if(t<=0||t>=1||Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)>1)continue;
   edge(e.a,i,e.source);edge(i,e.b,e.source);
  }
 }
 const end=node(d.handoff);let nearest=null,best=Infinity;
 for(let i=0;i<count;i++)for(const e of edges[i]){const a=nodes[i],b=nodes[e.to],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((d.handoff.x-a.x)*dx+(d.handoff.z-a.z)*dz)/(dx*dx+dz*dz))),p={x:a.x+dx*t,z:a.z+dz*t},v=dist(p,d.handoff);if(v<best){nearest={a:i,b:e.to,p,source:e.source};best=v;}}
 if(best>40)throw new Error(`${airport.id}: stand handoff disconnected ${best}`);
 const junction=node(nearest.p);edge(nearest.a,junction,nearest.source,true);edge(junction,nearest.b,nearest.source,true);
 if(edges[nearest.b].some(e=>e.to===nearest.a)){edge(nearest.b,junction,nearest.source,true);edge(junction,nearest.a,nearest.source,true);}
 edge(junction,end,{sourceId:d.handoff.sourceId,name:'APRON'});
 const reverse=nodes.map(()=>[]);edges.forEach((es,i)=>es.forEach(e=>reverse[e.to].push({...e,to:i})));
 const costs=nodes.map(()=>Infinity),next=nodes.map(()=>null),visited=new Set();costs[end]=0;
 while(true){let k=-1,cost=Infinity;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&costs[i]<cost){cost=costs[i];k=i;}if(k<0)break;visited.add(k);
  if(Math.abs(nodes[k].x)<.2&&nodes[k].z<0&&nodes[k].z> -airport.runway.length)continue;
  for(const e of reverse[k])if(cost+e.cost<costs[e.to]){costs[e.to]=cost+e.cost;next[e.to]={to:k,source:e.source};}}
 const exits=[],seen=new Set();
 for(const c of candidates.sort((a,b)=>nodes[b.node].z-nodes[a.node].z)){
  if(!Number.isFinite(costs[c.node])||seen.has(c.node))continue;seen.add(c.node);
  let i=c.node,points=[{...nodes[i],name:c.ref,sourceId:c.sourceId}],guard=0;
  while(i!==end&&guard++<nodes.length){const n=next[i];if(!n)break;points.push({...nodes[n.to],...n.source});i=n.to;}
  if(i!==end||points.length<3)continue;
  // Once clear, the route must not re-enter the active landing runway.
  let vacated=false,invalid=false;for(let j=0;j<points.length;j++){const p=points[j],previous=points[Math.max(0,j-1)],half=airport.runway.width/2+5;
   if(vacated){const dx=p.x-previous.x,lo=Math.abs(dx)<1e-9?(Math.abs(p.x)<half?0:2):Math.max(0,Math.min((-half-previous.x)/dx,(half-previous.x)/dx)),hi=Math.abs(dx)<1e-9?1:Math.min(1,Math.max((-half-previous.x)/dx,(half-previous.x)/dx));if(lo<=hi){const a=previous.z+(p.z-previous.z)*lo,b=previous.z+(p.z-previous.z)*hi;if(Math.max(a,b)>-airport.runway.length&&Math.min(a,b)<0)invalid=true;}}
   if(Math.abs(p.x)>airport.runway.width/2+45)vacated=true;
  }
  if(invalid)continue;
  const lead=airport.data.osm.features.find(f=>f.id===(d.stand.sourceLeadInId||d.stand.sourceId)&&f.geometry.length>1);
  // Retain the real source curve where it already reaches the final lead-in.
  if(lead){let ps=lead.geometry.map(p=>airport.project(...p));if(dist(ps.at(-1),d.handoff)<dist(ps[0],d.handoff))ps.reverse();for(const p of ps){const along=(p.x-d.stand.x)*Math.sin(d.stand.yaw)-(p.z-d.stand.z)*Math.cos(d.stand.yaw);if(along>=0||dist(p,d.stand)<8)break;if(dist(p,points.at(-1))>3)points.push({...p,name:d.stand.ref,sourceId:lead.id});}}
  // Ensure a straight final lead-in in the actual stand orientation.
  const pre={x:d.stand.x-Math.sin(d.stand.yaw)*28,z:d.stand.z+Math.cos(d.stand.yaw)*28,name:d.stand.ref,sourceId:d.stand.sourceId};
  const last=points.at(-1),along=(last.x-d.stand.x)*Math.sin(d.stand.yaw)-(last.z-d.stand.z)*Math.cos(d.stand.yaw);
  if(along< -30&&dist(pre,last)>4)points.push(pre);points.push({...d.stand,name:d.stand.ref});
  exits.push({ref:c.ref,sourceId:c.sourceId,z:nodes[c.node].z,points:points.filter((p,j)=>!j||dist(p,points[j-1])>1)});
 }
 if(!exits.length)throw new Error(`${airport.id}: no connected arrivals`);
 const output={schemaVersion:1,airportId:airport.id,runwayId:airport.runway.id,stand:d.stand,notes:'OSM taxiway graph; curated stand handoff and CG offsets are game estimates. Other runway crossings, where present, have automatic crew/ATC clearance; no traffic simulation. Not an operational airport chart.',exits};
 await writeFile(resolve(outputDirectory,`${airport.id}-arrival.json`),JSON.stringify(output,null,2)+'\n');
 console.log(airport.id,exits.map(e=>`${e.ref}@${Math.round(-e.z)}m/${e.points.length}`).join(', '));
}
