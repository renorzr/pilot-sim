import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AIRPORTS} from '../game/src/airports/registry.js';
import {isWoodland} from '../game/src/airports/woodland-data.js';
const lax=JSON.parse(await readFile(new URL('../public/assets/cities/lax/woodlands-v1.json',import.meta.url),'utf8'));
assert.equal(lax.airportId,'lax');assert.equal(lax.provenance.license,'ODbL-1.0');assert(/^[a-f0-9]{64}$/.test(lax.provenance.sha256));assert(lax.features.length>100);
for(const airport of AIRPORTS){
 const features=airport.id==='lax'?lax.features:airport.data.osm.features.filter(isWoodland);
 assert(features.length>0,airport.id+' needs source woodland features');let closed=0;
 for(const f of features){assert(isWoodland(f));assert(f.geometry.length>=2);for(const p of[f.geometry,...(f.holes||[])].flat())assert(p.length===2&&p.every(Number.isFinite));if(f.geometry.length>=4&&f.geometry[0].every((v,i)=>v===f.geometry.at(-1)[i]))closed++;}
 assert(closed>0,airport.id+' needs closed woodland areas');
}
console.log('Woodland source coverage: seven airports; attributed LAX derivative and finite source rings verified.');
