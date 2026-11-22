// Included outputs are verified offline; Python/source access is optional.
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
const root=new URL('../public/assets/cities/jfk/',import.meta.url),m=JSON.parse(await readFile(new URL('buildings-v1.json',root))),i=JSON.parse(await readFile(new URL('imagery-v1.json',root)));
assert.equal(m.airportId,'jfk');assert.equal(m.formatVersion,3);assert(m.buildings>500000);assert.equal(m.sourceCounts.osm,m.buildings);assert.equal(m.tiles.reduce((n,t)=>n+t.count,0),m.buildings);assert.equal(Object.values(m.heightSources).reduce((n,v)=>n+v,0),m.buildings);assert.equal(m.provenance.osm.license,'ODbL-1.0');assert.equal(m.provenance.osm.sources.length,2);assert.equal(i.sourceNativeGsdM,.6);assert.equal(i.tiles.length,252);assert(i.captureDates.every(d=>d.startsWith('2022')));
for(const r of[m,i.regional,i.overview,i.seaMask,i.coastMask,...i.tiles]){assert(r.path.startsWith('assets/cities/jfk/'));const b=await readFile(new URL('../public/'+r.path,import.meta.url));assert.equal(b.length,r.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);}
console.log('JFK continuous city:',m.buildings,'buildings,',m.tiles.length,'source chunks; NAIP and source marine-mask hashes verified');
