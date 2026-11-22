// Build-time only. The game uses the bundled offline silhouette data.
import {writeFile}from 'node:fs/promises';
const source='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';
const response=await fetch(source);if(!response.ok)throw new Error(`Natural Earth download: ${response.status}`);
const data=await response.json(),rings=[];
for(const feature of data.features){const geometry=feature.geometry,polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;for(const polygon of polygons)rings.push(polygon[0].map(([x,y])=>[Math.round(x*1000)/1000,Math.round(y*1000)/1000]));}
await writeFile(new URL('../game/src/airports/data/world-land.json',import.meta.url),JSON.stringify({source,license:'public domain',attribution:'Natural Earth',rings})+'\n');
console.log(`Natural Earth: ${rings.length} land outlines`);
