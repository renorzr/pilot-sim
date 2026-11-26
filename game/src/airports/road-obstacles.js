// Collision uses the same road deck and interpolated car poses as rendering.
// No rendered-LOD decision changes physical obstacle availability.
export function createRoadObstacleIndex(graph,traffic,structures){
 const size=200,staticCells=new Map(),coverage=new Set(),carCells=new Map(),boxes=[],scratch={},key=(x,z)=>x+':'+z;
 let gridTick=-1,maxY=-Infinity;
 const add=(map,k,value)=>{if(!map.has(k))map.set(k,[]);map.get(k).push(value);};
 function cells(minX,minZ,maxX,maxZ,fn){for(let x=Math.floor(minX/size);x<=Math.floor(maxX/size);x++)for(let z=Math.floor(minZ/size);z<=Math.floor(maxZ/size);z++)fn(key(x,z));}
 for(const r of graph.roads){const p=r.path.positions;for(let j=0;j<p.length;j+=3){maxY=Math.max(maxY,p[j+1]+4);cells(p[j]-r.width-25,p[j+2]-r.width-25,p[j]+r.width+25,p[j+2]+r.width+25,k=>coverage.add(k));}}
 for(const o of structures){
  const c=Math.abs(Math.cos(o.angle)),s=Math.abs(Math.sin(o.angle)),rx=(c*o.width+s*o.depth)/2,rz=(s*o.width+c*o.depth)/2;
  cells(o.cx-rx,o.cz-rz,o.cx+rx,o.cz+rz,k=>add(staticCells,k,o));maxY=Math.max(maxY,o.topY);
 }
 function updateGrid(){
  const tick=traffic.ticks;if(tick===gridTick)return;gridTick=tick;carCells.clear();
  for(const v of traffic.vehicles){const p=traffic.pose(v,scratch);if(p.fade<=.01)continue;cells(p.x-v.length,p.z-v.length,p.x+v.length,p.z+v.length,k=>add(carCells,k,v));}
 }
 return{airportId:graph.airportId,
  *candidates(a,b,margin=0,vertical=0,time=null){
   if(Math.min(a.y,b.y)>maxY+vertical)return;
   const keys=[];cells(Math.min(a.x,b.x)-margin,Math.min(a.z,b.z)-margin,Math.max(a.x,b.x)+margin,Math.max(a.z,b.z)+margin,k=>keys.push(k));
   if(!keys.some(k=>coverage.has(k)))return;
   if(Number.isFinite(time))traffic.sync(time);
   updateGrid();const seen=new Set();
   for(const k of keys){
    for(const o of staticCells.get(k)||[])if(!seen.has(o)){seen.add(o);yield o;}
    for(const v of carCells.get(k)||[])if(!seen.has(v)){
     seen.add(v);const p=traffic.pose(v,scratch);if(p.fade<=.01)continue;
     const o=boxes[v.id]??={id:'traffic/car/'+v.seed,kind:'vehicle',name:'道路车辆',width:v.width+.1,depth:v.length};
     o.cx=p.x;o.cz=p.z;o.angle=p.yaw;o.baseY=p.y-.15;o.topY=p.y+v.height+Math.abs(Math.sin(p.pitch))*v.length/2;yield o;
    }
   }
  },
  stats:()=>({structures:structures.length,indexCells:coverage.size}),
 };
}
