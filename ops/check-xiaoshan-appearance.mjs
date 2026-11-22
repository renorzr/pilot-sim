// A full-pack comparison protects retained geography/height against appearance
// edits. Both versioned source packs are included for cached local previews.
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{gunzipSync}from'node:zlib';
import{decodeDenseCity}from'../game/src/airports/dense-city-data.js';
const root=new URL('../public/assets/cities/xiaoshan/',import.meta.url);
async function load(version){const m=JSON.parse(await readFile(new URL(`buildings-v${version}.json`,root))),b=gunzipSync(await readFile(new URL('../public/'+m.path,import.meta.url)));return decodeDenseCity(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),m);}
const before=await load(1),after=await load(2),source=new Map();for(let i=0;i<before.count;i++)source.set(before.building(i,false).id,i);
let blue=0;for(let i=0;i<after.count;i++){
 const b=after.building(i),j=source.get(b.id);assert.notEqual(j,undefined,'No fabricated source identity');const a=before.building(j);
 for(const key of['cx','cz','baseY','topY','heightSource','kind','seed','minX','maxX','minZ','maxZ'])assert.equal(b[key],a[key],b.id+' '+key);
 assert.deepEqual(b.rings,a.rings,b.id+' source rings');assert.deepEqual(b.frame,a.frame,b.id+' shared-template frame');if((b.roofColor&255)>(b.roofColor>>>16)*1.4)blue++;
 source.delete(b.id);
}
assert.equal(source.size,after.manifest.appearance.vegetationExcluded);assert([...source.keys()].every(id=>id.startsWith('eab/')));assert.equal(after.manifest.sourceCounts.osm,before.manifest.sourceCounts.osm);assert(blue>1000);
console.log('Appearance revision verified:',after.count,'retained source plans/heights unchanged;',source.size,'EAB-only vegetation exclusions;',blue,'blue roofs preserved');
