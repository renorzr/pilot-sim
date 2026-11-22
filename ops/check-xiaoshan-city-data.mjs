// Ordinary builds verify included outputs; acquisition/Python stay optional.
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
const root=new URL('../public/assets/cities/xiaoshan/',import.meta.url),manifest=JSON.parse(await readFile(new URL('buildings-v2.json',root))),imagery=JSON.parse(await readFile(new URL('imagery-v1.json',root)));
assert.equal(manifest.airportId,'xiaoshan');assert.equal(manifest.formatVersion,3);assert.equal(manifest.appearance.version,2);assert(manifest.appearance.vegetationExcluded>0);assert.equal(manifest.sourceCounts.osm,47013);assert(manifest.buildings>100000);assert.equal(manifest.tiles.reduce((n,t)=>n+t.count,0),manifest.buildings);assert.equal(Object.values(manifest.heightSources).reduce((n,v)=>n+v,0),manifest.buildings);assert.equal(manifest.provenance.footprints.license,'CC-BY-4.0');assert.equal(manifest.provenance.osm.license,'ODbL-1.0');assert.equal(imagery.sourceNativeGsdM,10);assert.equal(imagery.tiles.length,20);
for(const r of[manifest,imagery.regional,imagery.overview,...imagery.tiles]){const bytes=await readFile(new URL('../public/'+r.path,import.meta.url));assert.equal(bytes.length,r.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);}
console.log('Xiaoshan continuous city:',manifest.buildings,'buildings,',manifest.tiles.length,'source chunks; Sentinel-2 imagery hashes verified');
