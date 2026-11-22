// Verify the included pack offline; source acquisition is an optional tool.
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
const root=new URL('../public/assets/cities/changi/',import.meta.url),manifest=JSON.parse(await readFile(new URL('buildings-v1.json',root))),imagery=JSON.parse(await readFile(new URL('imagery-v1.json',root)));
assert.equal(manifest.airportId,'changi');assert.equal(manifest.formatVersion,3);assert.equal(manifest.sourceCounts.osm,manifest.buildings);assert(manifest.candidateSourceCounts.osm>=manifest.buildings);assert(manifest.buildings>80000);assert.equal(manifest.tiles.reduce((n,t)=>n+t.count,0),manifest.buildings);assert.equal(Object.values(manifest.heightSources).reduce((n,v)=>n+v,0),manifest.buildings);assert.equal(manifest.provenance.osm.license,'ODbL-1.0');assert.equal(imagery.sourceNativeGsdM,10);assert.equal(imagery.tiles.length,36);assert(imagery.captureDates.length>=4);assert(imagery.mosaic.coveredPixelFraction>.999);assert(imagery.mosaic.clearPixelFraction>.97);
for(const r of[manifest,imagery.regional,imagery.overview,imagery.seaMask,imagery.coastMask,...imagery.tiles]){assert(r.path.startsWith('assets/cities/changi/'));const bytes=await readFile(new URL('../public/'+r.path,import.meta.url));assert.equal(bytes.length,r.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);}
console.log('Changi continuous city:',manifest.buildings,'buildings,',manifest.tiles.length,'source chunks; cloud-screened Sentinel-2 and marine mask hashes verified');
