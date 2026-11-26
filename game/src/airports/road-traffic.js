import {sampleRoadPath,trafficHash,trafficRandom} from './road-data.js';

export const TRAFFIC_STEP=.1;
export const VEHICLE_TYPES=Object.freeze([
 {name:'sedan',width:1.82,height:1.48,length:4.5},
 {name:'suv',width:1.98,height:1.82,length:4.8},
 {name:'van',width:2.05,height:2.3,length:6.2},
 {name:'truck',width:2.45,height:3.1,length:9.2},
 {name:'bus',width:2.5,height:3.2,length:11.5},
]);
const PALETTE=[0xe7e5dd,0x989e9e,0x30383e,0x536e85,0x9b413b,0xccc4b3,0xd5d6d2,0x50585d,0x77877a];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
export function trafficGreen(node,lane,time){
 if(node.control!=='traffic_signals')return true;
 const p=sampleRoadPath(lane,lane.length,{}),axis=Math.abs(p.tx)>Math.abs(p.tz)?0:1,phase=(time+trafficHash(node.id)%60)%60;
 return axis===0?phase<24:phase>=30&&phase<54;
}
export function createRoadTraffic(graph,{maxVehicles=3600,densityScale=1}={}){
 const{lanes,nodes,roads}=graph,eligible=new Uint8Array(lanes.length).fill(1),dependents=lanes.map(()=>[]),degree=new Uint32Array(graph.options.map(o=>o.length)),sinks=[];
 // Short connector roads remain traversable. Remove only paths which lead
 // into an interior dead end; boundary exits can recycle beyond the coverage.
 for(let i=0;i<lanes.length;i++){for(const next of graph.options[i])dependents[next].push(i);if(!degree[i]&&!nodes[lanes[i].to].boundary)sinks.push(i);}
 for(let j=0;j<sinks.length;j++){const id=sinks[j];if(!eligible[id])continue;eligible[id]=0;for(const before of dependents[id])if(degree[before]&&!--degree[before]&&!nodes[lanes[before].to].boundary)sinks.push(before);}
 const total=lanes.reduce((n,l)=>n+(eligible[l.id]&&l.length>14?l.length*l.density*densityScale:0),0),scale=Math.min(1,maxVehicles/Math.max(1,total));
 const candidates=[];
 for(const l of lanes){
  if(!eligible[l.id]||l.length<=14)continue;
  const countExact=l.length*l.density*densityScale*scale,count=Math.floor(countExact)+(trafficRandom(roads[l.road].id,l.id)<countExact%1?1:0);
  for(let j=0;j<count;j++){
   const seed=trafficHash(roads[l.road].id+':'+l.reverse+':'+l.slot+':'+j),r=trafficRandom(seed,2),major=['motorway','trunk','primary','motorway_link'].includes(roads[l.road].kind),type=r<.55?0:r<.82?1:r<.93||!major?2:r<.98?3:4;
   const shape=VEHICLE_TYPES[type],s=clamp((j+.25+trafficRandom(seed,3)*.5)/count*l.length,shape.length/2+1,l.length-shape.length/2-1);
   candidates.push({seed,lane:l.id,s,type,...shape,color:trafficRandom(seed,4)<.08?0xc8a83d:PALETTE[seed%PALETTE.length]});
  }
 }
 candidates.sort((a,b)=>a.seed-b.seed);const vehicles=candidates.slice(0,maxVehicles).map((v,id)=>({...v,id,speed:lanes[v.lane].speed*(.88+trafficRandom(v.seed,5)*.18),speedFactor:.88+trafficRandom(v.seed,5)*.18,phase:'lane',next:-1,turns:0,pose:new Float64Array(6),previous:new Float64Array(6),portal:false,fade:1}));
 const buckets=lanes.map(()=>[]),occupied=[],nodeOwner=new Int32Array(nodes.length).fill(-1),entryOwner=new Int32Array(lanes.length).fill(-1),first=new Float32Array(lanes.length).fill(Infinity),scratch={},other={};
 const boundaryEntries=lanes.filter(l=>nodes[l.from].boundary&&eligible[l.id]&&!l.hidden).map(l=>l.id);
 let time=0,clock=0,lastSimulation=null,lastPresentation=null,ticks=0,transitions=0,queued=0,retired=0;
 function pose(v){
  if(v.phase==='connector')sampleRoadPath(v.connection,v.s,scratch);else sampleRoadPath(lanes[v.lane],v.s,scratch);
  v.pose.set([scratch.x,scratch.y,scratch.z,scratch.yaw,scratch.pitch,0]);
  const lane=lanes[v.lane];v.fade=lane.hidden||v.phase==='retired'||v.phase==='connector'&&lanes[v.next].hidden?0:1;
  if(v.phase!=='connector'){
   if(nodes[lane.from].boundary)v.fade*=clamp(v.s/70,0,1);
   if(nodes[lane.to].boundary)v.fade*=clamp((lane.length-v.s)/70,0,1);
   if(v.portal)v.fade*=clamp(v.s/20,0,1);
  }
  v.pose[5]=v.fade;
 }
 for(const v of vehicles){pose(v);v.previous.set(v.pose);}
 function chooseNext(v){
  const l=lanes[v.lane],incoming=sampleRoadPath(l,l.length,scratch),options=graph.options[l.id];
  let sum=0;const weighted=[];
  for(const id of options){
   if(!eligible[id]&&!nodes[lanes[id].to].boundary)continue;
   const next=lanes[id],p=sampleRoadPath(next,0,other),delta=wrap(p.yaw-incoming.yaw);
   const relativeTurn=delta*(graph.hand||1);
   if(nodes[l.to].ways.size>2&&l.slots>1&&(relativeTurn>.45&&l.slot!==l.slots-1||relativeTurn<-.45&&l.slot!==0))continue;
   const slot=Math.round(l.slot/Math.max(1,l.slots-1)*Math.max(0,next.slots-1));if(next.slot!==slot)continue;
   const weight=(1+Math.max(0,Math.cos(delta))*3)*(roads[next.road].kind===roads[l.road].kind?2:1);sum+=weight;weighted.push([id,sum]);
  }
  if(!weighted.length)return options.find(id=>eligible[id]||nodes[lanes[id].to].boundary)??-1;
  const choice=trafficRandom(v.seed,10+v.turns)*sum;return weighted.find(([,limit])=>choice<limit)?.[0]??weighted.at(-1)[0];
 }
 function enterable(v){
  if(v.next<0)return false;
  const l=lanes[v.lane],node=nodes[l.to],junction=node.ways.size>2||node.control==='traffic_signals';
  return trafficGreen(node,l,time)&&(!junction||nodeOwner[l.to]<0||nodeOwner[l.to]===v.id)&&entryOwner[v.next]<0&&first[v.next]>v.length+6;
 }
 function tick(){
  for(const v of vehicles)v.previous.set(v.pose);
  for(const id of occupied)buckets[id].length=0;occupied.length=0;first.fill(Infinity);queued=0;
  for(const v of vehicles)if(v.phase==='lane'||v.phase==='parked'){if(!buckets[v.lane].length)occupied.push(v.lane);buckets[v.lane].push(v);first[v.lane]=Math.min(first[v.lane],v.s);}
  // Cars already in a junction retain its reservation until their connector ends.
  for(const v of vehicles)if(v.phase==='connector'){
   v.speed=Math.min(v.speed+2*TRAFFIC_STEP,v.connection.speed);v.s+=v.speed*TRAFFIC_STEP;
   if(v.s>=v.connection.length){
    const node=v.connection.node;if(nodeOwner[node]===v.id)nodeOwner[node]=-1;if(entryOwner[v.next]===v.id)entryOwner[v.next]=-1;
    const hidden=lanes[v.lane].hidden;v.lane=v.next;v.s=0;v.next=-1;v.connection=null;v.phase='lane';v.portal=hidden;v.turns++;v.entered=ticks;
    if(!buckets[v.lane].length)occupied.push(v.lane);buckets[v.lane].push(v);first[v.lane]=0;transitions++;
   }
  }
  for(const id of occupied){
   const lane=lanes[id],list=buckets[id];list.sort((a,b)=>b.s-a.s);let leader=null;
   for(const v of list){
    if(v.phase==='parked'||v.entered===ticks){leader=v;continue;}
    if(v.next<0)v.next=chooseNext(v);
    const allowed=enterable(v),stop=allowed?lane.length:Math.max(0,lane.length-v.length/2-1),remaining=Math.max(0,stop-v.s);
    let desired=lane.speed*v.speedFactor;
    if(!allowed)desired=Math.min(desired,Math.sqrt(2*3.5*remaining));
    else if(lane.length-v.s<35){const connection=graph.connector(id,v.next);desired=Math.min(desired,Math.sqrt(connection.speed**2+2*3.5*Math.max(0,lane.length-v.s-5)));}
    let cap=stop;
    if(leader){const gap=(v.length+leader.length)/2+3.5;cap=Math.min(cap,leader.s-gap);desired=Math.min(desired,Math.max(0,leader.speed+(leader.s-v.s-gap-v.speed*1.2)*.6));}
    v.speed=Math.max(0,v.speed+clamp(desired-v.speed,-4.5*TRAFFIC_STEP,2*TRAFFIC_STEP));
    const distance=Math.max(0,Math.min(v.speed*TRAFFIC_STEP,cap-v.s));if(distance<v.speed*TRAFFIC_STEP-.001)v.speed=distance/TRAFFIC_STEP;
    v.s+=distance;if(v.speed<.5)queued++;
    if(allowed&&v.s>=lane.length-.001){
     v.connection=graph.connector(id,v.next);v.s=0;v.speed=Math.min(v.speed,v.connection.speed);v.phase='connector';entryOwner[v.next]=v.id;
     if(nodes[lane.to].ways.size>2||nodes[lane.to].control==='traffic_signals')nodeOwner[lane.to]=v.id;
    }else if(v.next<0&&remaining<.05){v.phase=nodes[lane.to].boundary?'retired':'parked';if(v.phase==='retired')retired++;}
    leader=v.phase==='lane'?v:null;
   }
  }
  for(const v of vehicles)if(v.phase==='retired'&&boundaryEntries.length){
   const next=boundaryEntries[(v.seed+v.turns)%boundaryEntries.length];if(first[next]>v.length+10&&entryOwner[next]<0){v.lane=next;v.s=0;v.speed=lanes[next].speed*.6;v.phase='lane';v.next=-1;v.turns++;first[next]=0;v.respawned=true;}
  }
  time+=TRAFFIC_STEP;ticks++;for(const v of vehicles){pose(v);if(v.respawned){v.previous.set(v.pose);v.respawned=false;}}
 }
 function advanceTo(next){
  if(!Number.isFinite(next)||next<0)return;clock=Math.max(clock,next);
  while(time+TRAFFIC_STEP<=clock+1e-8)tick();
 }
 function sync(simulation,presentation=null){
  if(lastSimulation===null){lastSimulation=simulation;lastPresentation=presentation;return;}
  const delta=simulation-lastSimulation;
  // A destination world/explicit long skip establishes a new clock origin.
  // Normal pause, fast-forward and view changes never reset cars or their IDs.
  if(delta>=0&&delta<300)clock+=delta;
  if(delta===0&&presentation!==null&&lastPresentation!==null)clock+=Math.max(0,presentation-lastPresentation);
  lastSimulation=simulation;lastPresentation=presentation;
  advanceTo(clock);
 }
 function interpolated(v,out={}){
  const alpha=clamp((clock-time)/TRAFFIC_STEP,0,1),p=v.previous,q=v.pose;
  out.x=p[0]+(q[0]-p[0])*alpha;out.y=p[1]+(q[1]-p[1])*alpha;out.z=p[2]+(q[2]-p[2])*alpha;out.yaw=p[3]+wrap(q[3]-p[3])*alpha;out.pitch=p[4]+(q[4]-p[4])*alpha;out.fade=p[5]+(q[5]-p[5])*alpha;return out;
 }
 return{graph,vehicles,advanceTo,sync,pose:interpolated,get time(){return time;},get clock(){return clock;},get ticks(){return ticks;},
  stats(){const byClass={},parked=vehicles.filter(v=>v.phase==='parked').length;for(const v of vehicles){const kind=roads[lanes[v.lane].road].kind;byClass[kind]=(byClass[kind]||0)+1;}return{vehicles:vehicles.length,moving:vehicles.length-parked,parked,queued,byClass,ticks,transitions,boundaryRecycles:retired,simulationTime:time};},
 };
}
