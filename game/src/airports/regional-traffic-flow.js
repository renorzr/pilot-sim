import {trafficHash,trafficRandom,sampleRoadPath} from './road-data.js';
import {VEHICLE_TYPES} from './road-traffic.js';
import {REGION_ACTIVE_RADIUS,REGION_MINOR_RADIUS} from './regional-traffic-data.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),colors=[0xe7e5dd,0x989e9e,0x30383e,0x536e85,0x9b413b,0xccc4b3,0xd5d6d2,0x50585d,0x77877a];
// Regional cars have reproducible trajectories in world time. Neither changing
// tiles nor looking away establishes a new phase or allocates a new random ID.
export function createRegionalFlow({clock,manifest,contains=()=>true,maxVehicles=3600}){
 const vehicles=[],routes=new Map(),focus={x:0,z:0};let revision=0,lastTick=-1,lastX=Infinity,lastZ=Infinity;
 function ensureCars(route){
  route.ensureLanes?.();
  if(route.carsReady)return;route.carsReady=true;
  for(const lane of route.lanes){
   const n=lane.length*lane.density*.85,count=Math.min(Math.floor(lane.length/18),Math.floor(n)+(trafficRandom(lane.key,91)<n%1?1:0));lane.cars=[];
   // A lane uses one common speed, maintaining its headway without simulating
   // every remote junction. The 6km airport network retains its microsimulation.
   const speed=lane.speed*(.88+trafficRandom(lane.key,92)*.16),phase=trafficRandom(lane.key,93)*lane.length;
   for(let i=0;i<count;i++){
    const seed=trafficHash(lane.key+':'+i),r=trafficRandom(seed,2),type=r<.55?0:r<.82?1:r<.93||!lane.major?2:r<.98?3:4;
    lane.cars.push({id:'regional/'+lane.key+'/'+i,seed,type,...VEHICLE_TYPES[type],color:trafficRandom(seed,4)<.08?0xc8a83d:colors[seed%colors.length],lane,speed,phase:(phase+i*lane.length/count)%lane.length,major:lane.major});
   }
  }
 }
 function add(route){if(routes.has(route.id))return;routes.set(route.id,route);revision++;lastTick=-1;}
 function pose(v,out={}){
  const distance=(clock()*v.speed+v.phase)%v.lane.length;sampleRoadPath(v.lane,distance,out);
  const d=Math.hypot(out.x-focus.x,out.z-focus.z),radius=v.major?REGION_ACTIVE_RADIUS:REGION_MINOR_RADIUS;
  out.fade=clamp((radius-d)/(v.major?900:450),0,1)*clamp((Math.hypot(out.x-manifest.center[0],out.z-manifest.center[1])-manifest.innerRadiusM)/150,0,1);
  const p=v.lane.positions,closed=Math.hypot(p[0]-p[p.length-3],p[2]-p[p.length-1])<3;
  if(!closed)out.fade*=clamp(Math.min(distance,v.lane.length-distance)/Math.min(15,v.lane.length*.15),0,1);
  return out;
 }
 const point={};
 function update(position,force=false){
  focus.x=position.x;focus.z=position.z;const tick=Math.floor(clock()*10);
  if(!force&&tick===lastTick&&Math.hypot(lastX-focus.x,lastZ-focus.z)<15)return false;lastTick=tick;lastX=focus.x;lastZ=focus.z;
  const selected=[];
  for(const route of routes.values()){
   const b=route.bounds,radius=route.major?REGION_ACTIVE_RADIUS:REGION_MINOR_RADIUS;if(b&&Math.hypot(Math.max(b[0]-focus.x,0,focus.x-b[2]),Math.max(b[1]-focus.z,0,focus.z-b[3]))>radius)continue;
   ensureCars(route);for(const lane of route.lanes)for(const car of lane.cars){
   pose(car,point);if(point.fade<.015||!contains(point.x,point.z,car))continue;
   selected.push({car,score:Math.hypot(point.x-focus.x,point.z-focus.z)/(car.major?1.2:1)});
   }
  }
  selected.sort((a,b)=>a.score-b.score||a.car.seed-b.car.seed);vehicles.length=0;for(let i=0;i<Math.min(maxVehicles,selected.length);i++)vehicles.push(selected[i].car);revision++;return true;
 }
 return{vehicles,routes,add,remove(id){if(routes.delete(id)){revision++;lastTick=-1;}},pose,update,sync(){},get clock(){return clock();},get ticks(){return Math.floor(clock()*10)+revision;},get revision(){return revision;},stats:()=>({vehicles:vehicles.length,routes:routes.size,focus:{...focus},maxVehicles,clock:clock()})};
}
