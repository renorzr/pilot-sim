// Two streaming passes bound rebuild memory independently of JSON source size.
import {createReadStream}from'node:fs';
import {readFile,writeFile}from'node:fs/promises';
import {createInterface}from'node:readline';
import {gzipSync}from'node:zlib';
import {createHash}from'node:crypto';
import {LAX,seaAt}from'../game/src/airports/registry.js';
import {surfaceHeight}from'../game/src/terrain/heightfield.js';
import {DENSE_MAGIC,DENSE_TILE_SIZE}from'../game/src/airports/dense-city-data.js';
import {buildingFrame}from'../game/src/airports/dense-city-instances.js';
const input=process.argv[2]||'/tmp/pilot-lax-regional-buildings.jsonl',source=JSON.parse(await readFile(input.replace(/\.jsonl$/,'.json'),'utf8')),tiles=new Map(),stride=76;
const provenance=JSON.parse(await readFile(new URL('../game/src/airports/data/lax-city.json',import.meta.url))).provenance.osm;
if(source.sourcePbfSha256!==provenance.sha256)throw Error('Regional source PBF does not match the recorded snapshot');
let count=0,ringCount=0,pointCount=0;
async function* records(){for await(const line of createInterface({input:createReadStream(input),crlfDelay:Infinity})){if(!line)continue;const r=JSON.parse(line),xs=r[7][0].map(p=>p[0]),zs=r[7][0].map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;if(seaAt('lax',cx,cz))continue;yield{r,cx,cz,tile:Math.floor(cx/DENSE_TILE_SIZE)+':'+Math.floor(cz/DENSE_TILE_SIZE)};}}
for await(const b of records()){if(!tiles.has(b.tile))tiles.set(b.tile,{id:b.tile,count:0});tiles.get(b.tile).count++;count++;ringCount+=b.r[7].length;pointCount+=b.r[7].reduce((s,r)=>s+r.length,0);}
const ordered=[...tiles.values()].sort((a,b)=>a.id.localeCompare(b.id));let next=0;for(const t of ordered){t.start=next;t.cursor=next;next+=t.count;t.minX=t.minZ=Infinity;t.maxX=t.maxZ=t.topY=-Infinity;}
const ringOffset=32+count*stride,pointOffset=ringOffset+(ringCount+1)*4,buffer=new ArrayBuffer(pointOffset+pointCount*4),v=new DataView(buffer),offsets=new Uint32Array(buffer,ringOffset,ringCount+1),points=new Int16Array(buffer,pointOffset,pointCount*2),heightSources=[0,0,0];
[DENSE_MAGIC,3,count,ringCount,pointCount,stride,0,0].forEach((n,i)=>v.setUint32(i*4,n,true));let ri=0,pi=0,processed=0;
for await(const b of records()){
 const t=tiles.get(b.tile),i=t.cursor++,[id,height,kind,hSource,seed,roof,wall,rings]=b.r,all=rings.flat(),xs=all.map(p=>p[0]),zs=all.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),grade=surfaceHeight(b.cx,b.cz,'lax'),base=Math.min(grade,...rings[0].map(p=>surfaceHeight(...p,'lax')))-.05,o=32+i*stride,[type,num,part]=id.split('/'),flags=kind|(hSource<<2)|(type==='relation'?16:0)|((Number(part)||0)<<8),frame=buildingFrame({rings:[Float32Array.from(rings[0].flat())]});
 v.setFloat64(o,Number(num),true);v.setUint32(o+8,flags,true);v.setUint32(o+12,seed,true);
 for(const[k,n]of[[16,minX],[20,maxX],[24,minZ],[28,maxZ],[32,base],[36,grade+height],[56,b.cx],[60,b.cz]])v.setFloat32(o+k,n,true);
 v.setInt16(o+64,Math.round((frame.x-b.cx)*50),true);v.setInt16(o+66,Math.round((frame.z-b.cz)*50),true);v.setUint16(o+68,Math.round(frame.width*50),true);v.setUint16(o+70,Math.round(frame.depth*50),true);v.setInt16(o+72,Math.round(frame.angle*10000),true);v.setUint16(o+74,Math.round(frame.fill*65535),true);
 v.setUint32(o+40,ri,true);v.setUint32(o+44,rings.length,true);v.setUint32(o+48,roof[0]<<16|roof[1]<<8|roof[2],true);v.setUint32(o+52,wall[0]<<16|wall[1]<<8|wall[2],true);
 for(const ring of rings){offsets[ri++]=pi;for(const[x,z]of ring){const qx=Math.round((x-b.cx)*50),qz=Math.round((z-b.cz)*50);if(Math.abs(qx)>32767||Math.abs(qz)>32767)throw Error('Footprint quantisation overflow '+id);points[pi*2]=qx;points[pi*2+1]=qz;pi++;}}
 heightSources[hSource]++;t.minX=Math.min(t.minX,minX);t.maxX=Math.max(t.maxX,maxX);t.minZ=Math.min(t.minZ,minZ);t.maxZ=Math.max(t.maxZ,maxZ);t.topY=Math.max(t.topY,grade+height);
 if(++processed%200000===0)console.log('packed regional buildings',processed);
}
offsets[ri]=pi;
const raw=Buffer.from(buffer),compressed=gzipSync(raw,{level:9}),path='assets/cities/lax/buildings-v2.bin.gz',manifest={version:2,formatVersion:3,pointQuantizationMetres:.02,airportId:'lax',frame:{runway:'25R',threshold:LAX.unproject(0,0),heading:LAX.runway.heading},sourceSha256:source.sourceSha256,sourceSnapshot:'2026-11-14',sourcePbf:provenance,modelNotes:'Source footprint/contact geometry is retained. Repeated houses use shared estimated architectural templates, other ordinary buildings use shared mid-distance boxes and source-derived district proxies in the far distance. Heights/colours are source fields or deterministic estimates, not guaranteed surveys.',imagery:'USDA NAIP 2022',license:'ODbL-1.0',attribution:'© OpenStreetMap contributors / ODbL',selection:source.selection,terrainBounds:source.terrainBounds,deduplicated:source.deduplicated,buildings:count,heightSources:{tagged:heightSources[0],levels:heightSources[1],estimated:heightSources[2]},colourMethod:'NAIP roof neighbourhood median, vegetation/shadow rejection; neutral stable facade palette',path,bytes:compressed.length,uncompressedBytes:raw.length,sha256:createHash('sha256').update(compressed).digest('hex'),geometrySha256:createHash('sha256').update(raw).digest('hex'),tileSize:DENSE_TILE_SIZE,tiles:ordered.map(({cursor,...t})=>t)};
await writeFile(new URL('../public/'+path,import.meta.url),compressed);await writeFile(new URL('../public/assets/cities/lax/buildings-v2.json',import.meta.url),JSON.stringify(manifest));console.log(JSON.stringify({...manifest,tiles:manifest.tiles.length},null,2));
