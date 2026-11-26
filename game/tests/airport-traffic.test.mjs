import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {airportOf} from '../src/airports/registry.js';
import {surfaceHeight} from '../src/terrain/heightfield.js';
import {buildRoadGraph,sampleRoadPath} from '../src/airports/road-data.js';
import {createRoadTraffic} from '../src/airports/road-traffic.js';
import {prepareRoadSurfaces} from '../src/airports/road-meshes.js';
import {createRoadObstacleIndex} from '../src/airports/road-obstacles.js';
import {installRoadTraffic} from '../src/terrain/city-obstacles.js';
import {createFlight,advanceFlight} from '../src/flight.js';
import {pilotInput} from './pilot.mjs';

for(const id of ['xiaoshan','changi','jfk','kansai','daxing'])test(id+': source-aligned roads, stable regional traffic and physical takeoff/landing remain clear',async()=>{
 const source=JSON.parse(gunzipSync(await readFile(new URL(`../../public/assets/cities/${id}/traffic-v1.source.json.gz`,import.meta.url)))),airport=airportOf(id),graph=buildRoadGraph(source,airport),traffic=createRoadTraffic(graph);
 assert.equal(graph.drivingSide,['changi','kansai'].includes(id)?'left':'right');assert(graph.roads.length>50);assert(traffic.vehicles.length>0&&traffic.vehicles.length<=3600);assert.equal(source.radius,6000);
 const stable=traffic.vehicles.map(v=>[v,v.seed]);traffic.advanceTo(30);assert.equal(traffic.stats().parked,0);assert(traffic.stats().transitions>0);
 for(const[v,seed]of stable){assert(traffic.vehicles.includes(v));assert.equal(v.seed,seed);assert(Object.values(traffic.pose(v)).every(Number.isFinite));}
 const steps=prepareRoadSurfaces(graph,(x,z)=>surfaceHeight(x,z,id));let step;while(!(step=steps.next()).done){}const {arrays,obstacles}=step.value;
 assert(arrays.roadGround.length>0);for(const a of Object.values(arrays))assert(a.every(Number.isFinite));assert(Object.values(arrays).reduce((n,a)=>n+a.byteLength,graph.byteLength)<64*1024*1024);
 if(id==='kansai'){
  assert.equal(source.bridgeDeckReference,'airport');const seaBridge=graph.roads.filter(r=>r.bridge&&r.path.positions.some((_,i,p)=>i%3===1&&p[i]>6));assert(seaBridge.length>0);
  for(const r of seaBridge){const p=sampleRoadPath(r.path,r.path.length/2);assert(p.y>surfaceHeight(p.x,p.z,id));assert(obstacles.some(o=>o.id.startsWith(r.id+'/deck/')));}
 }
 for(const kind of ['takeoff','landing']){
  const active=createRoadTraffic(graph),remove=installRoadTraffic(createRoadObstacleIndex(graph,active,obstacles),id);
  try{const s=createFlight(null,{levelId:id+'-'+kind});for(let i=0;i<80000&&!s.result;i++)advanceFlight(s,pilotInput(s),.02);assert(s.result?.levelCleared,JSON.stringify({id,kind,result:s.result,impact:s.impact}));}finally{remove();}
 }
});
