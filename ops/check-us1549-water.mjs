import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';import {decodeGrayPng} from './lib/png-gray.mjs';
import {eventProject,eventWaterAt,eventHudsonAt} from '../game/src/history/event-world.js';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root)),sha=b=>createHash('sha256').update(b).digest('hex'),source=await read('game/src/history/tidal-water.json'),water=JSON.parse(source),base=JSON.parse(await read('public/assets/cities/jfk/imagery-v1.json')),imagery=JSON.parse(await read('public/assets/cities/us1549/imagery-river-v1.json'));
assert.equal(water.schemaVersion,1);assert.equal(water.provenance.license,'ODbL-1.0');assert.equal(water.provenance.snapshots.length,3);assert.equal(imagery.airportId,'us1549');assert.equal(imagery.waterSourceSHA256,sha(source));
for(const s of water.provenance.snapshots){const blob=await read(s.path);assert.equal(blob.length,s.bytes);assert.equal(sha(blob),s.sha256);assert.equal(sha(gunzipSync(blob)),s.decodedSHA256);assert.equal(s.url,'https://api.openstreetmap.org/api/0.6/'+s.id+'/full');}
for(const f of water.features){assert(f.tidalSurface&&f.surfaceMSL===0);assert.equal(f.waterbody,'Hudson River');for(const ring of[f.geometry,...f.holes]){assert(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));assert(ring.every(p=>p.length===2&&p.every(Number.isFinite)));}}
for(const k of['overview','regional','tiles','sourceNativeGsdM','captureDates'])assert.deepEqual(imagery[k],base[k],'Original photographs must retain their content identities: '+k);
const river=[[-73.932051,40.885],[-73.925347,40.9],[-73.918586,40.92],[-73.911478,40.94],[-73.904264,40.96],[-73.896872,40.98],[-73.893401,41],[-73.890399,41.04],[-73.892319,41.08],[-73.887358,41.14]],land=[[-73.95,40.91],[-73.90,40.91],[-73.98,40.77],[-74.016,40.689]];
for(const [lon,lat]of river){const p=eventProject(lon,lat);assert(eventWaterAt(p.x,p.z));assert(eventHudsonAt(p.x,p.z));}
for(const key of['seaMask','coastMask']){
 const r=imagery[key];assert(r.path.startsWith('assets/cities/us1549/'));assert(!r.path.includes('..'));const bytes=await read('public/'+r.path);assert.equal(bytes.length,r.bytes);assert.equal(sha(bytes),r.sha256);const image=decodeGrayPng(bytes);assert.equal(image.width,r.width);assert.equal(image.height,r.height);
 const pixel=(lon,lat)=>{const[s,w,n,e]=r.bounds,x=Math.floor((lon-w)/(e-w)*image.width),y=Math.floor((n-lat)/(n-s)*image.height);assert(x>=0&&x<image.width&&y>=0&&y<image.height);return image.pixels[y*image.width+x];};
 for(const q of river)assert.equal(pixel(...q),255,`${key} missing river ${q}`);for(const q of land)assert.equal(pixel(...q),0,`${key} floods land ${q}`);
}
console.log('US1549 tidal Hudson: 3 pinned OSM relations, source/texture identities, 10 upstream river sections and both banks/islands verified offline.');
