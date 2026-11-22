// Rebuild the compact deterministic runtime contact/instance list from OSM.
import {readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{CITY_BUILDING_MANIFEST}from'../game/src/airports/dense-city-data.js';
import{LAX,seaAt}from'../game/src/airports/registry.js';
const file=new URL('../game/src/airports/data/lax-city.json',import.meta.url),source=await readFile(file),data=JSON.parse(source),existing=new Set(LAX.data.osm.features.map(f=>f.id)),landmarkIds=new Set([data.landmarks.sofi,data.landmarks.forum,...data.landmarks.downtown].filter(Boolean).map(f=>f.id));
const height=tags=>{const value=String(tags.height||'');return Math.min(100,Math.max(3,parseFloat(value)*(value.includes('ft')?.3048:1)||parseFloat(tags['building:levels'])*3.2||(['house','detached','bungalow','residential','semidetached_house','terrace'].includes(tags.building)?6.8:tags.building==='apartments'?13:9)));};
function box(points){let best=null;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],angle=Math.atan2(b.z-a.z,b.x-a.x),co=Math.cos(angle),si=Math.sin(angle),u=points.map(p=>p.x*co+p.z*si),v=points.map(p=>-p.x*si+p.z*co),minU=Math.min(...u),maxU=Math.max(...u),minV=Math.min(...v),maxV=Math.max(...v),width=maxU-minU,depth=maxV-minV;if(!best||width*depth<best.area){const cu=(minU+maxU)/2,cv=(minV+maxV)/2;best={cx:cu*co-cv*si,cz:cu*si+cv*co,width,depth,angle,area:width*depth};}}return best;}
const buildings=[];
for(const f of data.features){if(!f.tags?.building||existing.has(f.id)||landmarkIds.has(f.id)||f.geometry.length<4)continue;const b=box(f.geometry.map(([lon,lat])=>LAX.project(lon,lat)));if(!b||b.width<4||b.depth<4||b.width>300||b.depth>300||b.area<35)continue;
 const geo=LAX.unproject(b.cx,b.cz),g=LAX.grading;if(seaAt('lax',b.cx,b.cz)||b.cx>g.minX&&b.cx<g.maxX&&b.cz>g.minZ&&b.cz<g.maxZ)continue;
 const range=Math.hypot(b.cx,b.cz+2000),corridor=b.cz>0&&b.cz<23000&&Math.abs(b.cx)<1800;if(range>10000&&!corridor)continue;
 buildings.push({id:f.id,...Object.fromEntries(['cx','cz','width','depth','angle'].map(k=>[k,+b[k].toFixed(k==='angle'?6:2)])),height:+height(f.tags).toFixed(2),kind:['house','detached','bungalow','residential','semidetached_house','terrace'].includes(f.tags.building)?'home':f.tags.building==='industrial'||f.tags.building==='warehouse'?'industrial':'commercial'});
}
if(buildings.length<500&&!process.argv.includes('--allow-preview'))throw Error('City building selection is incomplete');
const result={provisional:buildings.length<500,version:1,airportId:'lax',frame:{runway:'25R',heading:LAX.runway.heading,threshold:LAX.unproject(0,0)},sourceSha256:createHash('sha256').update(source).digest('hex'),notes:'OSM oriented envelope blocks; unknown heights are documented visual estimates. Same boxes feed visible instances, contact and obstacle prediction.',buildings,landmarks:data.landmarks};
await writeFile(new URL('../game/src/airports/data/lax-city-physics.json',import.meta.url),JSON.stringify(result));console.log('LAX source-derived city blocks:',buildings.length,'landmarks:',2+data.landmarks.downtown.length);
// Dense source assets are prepared offline; ordinary builds only verify them.
const dense=JSON.parse(await readFile(new URL('../public/'+CITY_BUILDING_MANIFEST,import.meta.url))),denseBytes=await readFile(new URL('../public/'+dense.path,import.meta.url));
if(dense.buildings<250000||dense.tiles.reduce((n,t)=>n+t.count,0)!==dense.buildings||denseBytes.byteLength!==dense.bytes||createHash('sha256').update(denseBytes).digest('hex')!==dense.sha256)throw Error('Incomplete or corrupted continuous LAX city pack');
console.log('LAX continuous source footprints:',dense.buildings,'spatial chunks:',dense.tiles.length);
