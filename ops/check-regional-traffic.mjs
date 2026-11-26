import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {AIRPORTS} from '../game/src/airports/registry.js';
import {TRAFFIC_PROFILES,roadPath,sampleRoadPath} from '../game/src/airports/road-data.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const airport of AIRPORTS){
 const m=JSON.parse(await readFile(new URL(`../public/assets/cities/${airport.id}/traffic-region-v1.json`,import.meta.url))),ids=new Set(),routes=new Map();assert.equal(m.airportId,airport.id);assert.equal(m.schema,1);assert.deepEqual(m.bounds,[-30000,-30000,30000,30000]);assert.equal(m.tileSize,4000);assert.equal(m.innerRadiusM,6000);assert(m.tiles.length>30);assert.equal(m.drivingSide,['changi','kansai'].includes(airport.id)?'left':'right');assert.equal(m.provenance.license,'ODbL-1.0');assert(/^[a-f0-9]{64}$/.test(m.identity));let bytes=0,pieces=0;
 const origin=airport.unproject(0,0);assert(Math.abs(origin.longitude-m.frame.threshold[0])<1e-7);assert(Math.abs(origin.latitude-m.frame.threshold[1])<1e-7);
 for(const r of m.tiles){
  assert(!ids.has(r.id));ids.add(r.id);assert(r.path.startsWith(`assets/cities/${airport.id}/traffic-region-v1/`));const packed=await readFile(new URL('../public/'+r.path,import.meta.url)),raw=gunzipSync(packed),t=JSON.parse(raw);assert.equal(sha(packed),r.sha256);assert.equal(sha(raw),r.decodedSha256);assert.equal(packed.length,r.bytes);assert.equal(raw.length,r.decodedBytes);assert.equal(t.id,r.id);assert.equal(t.airportId,airport.id);assert.deepEqual(t.bounds,r.bounds);assert.equal(t.routes.length,r.routes);assert.equal(t.pieces.length,r.pieces);bytes+=packed.length;pieces+=t.pieces.length;
  const paths=[];
  for(const a of t.routes){assert(TRAFFIC_PROFILES[a.kind]);assert(/^way\/[0-9]+$/.test(a.id));assert(a.points.length>=2);assert(a.points.every(p=>p.length===3&&p.every(Number.isFinite)));assert(a.width>=3&&a.width<=40);const identity=sha(JSON.stringify(a));if(routes.has(a.id))assert.equal(routes.get(a.id),identity,'Way changes at tile boundary');else routes.set(a.id,identity);paths.push(roadPath(a.points.flatMap(([lon,lat])=>{const p=airport.project(lon,lat);return[p.x,0,p.z];})));}
  for(const [i,a,b]of t.pieces){assert(paths[i]);assert(a>=0&&b>a&&b<=paths[i].length+.1);for(const d of [a,(a+b)/2,b]){const p=sampleRoadPath(paths[i],d);assert(p.x>=r.bounds[0]-.15&&p.x<=r.bounds[2]+.15&&p.z>=r.bounds[1]-.15&&p.z<=r.bounds[3]+.15);assert(Math.hypot(p.x-m.center[0],p.z-m.center[1])>=m.innerRadiusM-.2);}}
 }
 console.log(`${airport.id}: ${ids.size} regional road tiles, ${routes.size} unique ways, ${pieces} clipped intervals, ${bytes} wire bytes; hashes, seams, city bounds and airport exclusion checked.`);
}
