import {scenerySourceId} from '../game/src/regions/scenery-source.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {AIRPORTS,airportOf} from '../game/src/airports/registry.js';
import {validateRoadSource} from '../game/src/airports/road-data.js';
import {createPolygonMask} from '../game/src/airports/polygon-mask.js';
import {runwayFootprints} from '../game/src/airports/ground-footprints.js';
for(const registered of AIRPORTS){
 const airport=airportOf(registered.sceneryAirportId||registered.id);
 const manifest=JSON.parse(await readFile(new URL(`../public/assets/cities/${scenerySourceId(airport)}/traffic-v1.json`,import.meta.url))),buffer=await readFile(new URL('../public/'+manifest.path,import.meta.url)),decoded=gunzipSync(buffer),source=JSON.parse(decoded);
 assert.equal(buffer.byteLength,manifest.bytes);assert.equal(decoded.byteLength,manifest.decodedBytes);assert.equal(createHash('sha256').update(buffer).digest('hex'),manifest.sha256);assert.equal(createHash('sha256').update(decoded).digest('hex'),manifest.decodedSha256);assert.equal(source.fingerprint,manifest.fingerprint);validateRoadSource(source,airport);
 assert.equal(source.provenance.license,'ODbL-1.0');assert(/^[a-f0-9]{64}$/.test(source.provenance.sha256));assert.equal(source.radius,6000);assert(source.edges.length>50);assert.equal(source.drivingSide||'right',['changi','kansai'].includes(airport.id)?'left':'right');
 const mask=createPolygonMask(runwayFootprints(airport).map(outer=>({outer}))),counts={};
 for(const e of source.edges){counts[e.kind]=(counts[e.kind]||0)+1;assert(!['private','no'].includes(e.tags.access));assert(!['parking_aisle','driveway'].includes(e.tags.service));
  if(e.tunnel)continue;for(let i=1;i<e.nodes.length;i++){const a=airport.project(...source.nodes[e.nodes[i-1]].slice(1,3)),b=airport.project(...source.nodes[e.nodes[i]].slice(1,3)),steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/10));for(let j=0;j<=steps;j++){const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;assert(!mask(x,z),'Public road intrudes into protected runway: '+airport.id+'/'+e.id);}}
 }
 assert.deepEqual(counts,manifest.counts);for(const rings of source.ground)for(const ring of rings)for(const p of ring)assert(p.length===2&&p.every(Number.isFinite));
 if(airport.id==='kansai')assert.equal(source.bridgeDeckReference,'airport');
 console.log(`${airport.id}: ${source.edges.length} road segments, ${source.restrictions.length} turn restrictions; ${manifest.bytes} compressed bytes. Checksums, frame, driving side and runway exclusions verified.`);
}
