import {siteUrl} from '../urls.js';
import {lanePath,resampleRoadPath,roadPath,sampleRoadPath,TRAFFIC_PROFILES} from './road-data.js';

export const REGION_TILE_SIZE=4000,REGION_EXTENT=30000,REGION_ACTIVE_RADIUS=5000,REGION_MINOR_RADIUS=2500;
export const REGION_MODEL_REVISION=2;
export const regionalTileId=(x,z)=>Math.floor(x/REGION_TILE_SIZE)+':'+Math.floor(z/REGION_TILE_SIZE);
export function selectRegionalTiles(manifest,position,velocity={x:0,z:0}){
 const ahead={x:position.x+Math.max(-3000,Math.min(3000,(velocity.x||0)*15)),z:position.z+Math.max(-3000,Math.min(3000,(velocity.z||0)*15))};
 const distance=(t,p)=>Math.hypot(Math.max(t.bounds[0]-p.x,0,p.x-t.bounds[2]),Math.max(t.bounds[1]-p.z,0,p.z-t.bounds[3]));
 return manifest.tiles.filter(t=>distance(t,position)<REGION_ACTIVE_RADIUS+1000||distance(t,ahead)<REGION_ACTIVE_RADIUS).sort((a,b)=>distance(a,position)-distance(b,position)).slice(0,28);
}
export async function loadRegionalManifest(airport,path,cache){
 const namespace=airport.id+':images:1',key='manifest/'+siteUrl(path),valid=m=>m?.schema===1&&m.airportId===airport.id&&m.tileSize===REGION_TILE_SIZE&&/^[a-f0-9]{64}$/.test(m.identity)&&Array.isArray(m.tiles)&&m.tiles.every(t=>t.bounds?.length===4&&t.bounds.every(Number.isFinite)&&t.path.startsWith('assets/cities/'+airport.id+'/traffic-region-v1/'));
 let value;try{const r=await fetch(siteUrl(path),{cache:'no-cache'});if(!r.ok)throw Error('Regional road metadata unavailable');value=await r.json();if(!valid(value))throw Error('Invalid regional road metadata');cache.put(namespace,key,value);}catch(e){value=await cache.get(namespace,key);if(!valid(value))throw e;}
 const p=airport.unproject(0,0),d=(value.frame.heading-airport.runway.heading)*Math.PI/180;if(Math.abs(p.longitude-value.frame.threshold[0])>1e-7||Math.abs(p.latitude-value.frame.threshold[1])>1e-7||Math.abs(Math.atan2(Math.sin(d),Math.cos(d)))>1e-5)throw Error('Regional road frame mismatch');return value;
}
export async function loadRegionalTile(record,airport,cache,isCurrent=()=>true){
 const namespace=airport.id+':images:1',key='regional-roads/'+record.sha256;
 async function decode(blob){
  if(!(blob instanceof Blob)||![record.bytes,record.decodedBytes].includes(blob.size))throw Error('Incomplete regional road source');
  const buffer=await blob.arrayBuffer(),head=new Uint8Array(buffer,0,2),packed=head[0]===31&&head[1]===139,sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');if(sha!==(packed?record.sha256:record.decodedSha256))throw Error('Regional road checksum mismatch');
  const raw=packed?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():buffer;if(raw.byteLength!==record.decodedBytes)throw Error('Incomplete decoded regional roads');const t=JSON.parse(new TextDecoder().decode(raw));
  if(t.schema!==1||t.airportId!==airport.id||t.id!==record.id||!Array.isArray(t.routes)||!Array.isArray(t.pieces)||t.routes.length!==record.routes)throw Error('Invalid regional road tile');
  for(const r of t.routes)if(!TRAFFIC_PROFILES[r.kind]||!r.id||r.points.length<2||r.points.some(p=>p.length!==3||!p.every(Number.isFinite))||r.width<3||r.width>40||![0,1,-1].includes(r.oneway)||!Number.isInteger(r.forward)||r.forward<1||r.forward>5||!Number.isInteger(r.backward)||r.backward<0||r.backward>5)throw Error('Invalid regional road route');
  for(const [i,a,b]of t.pieces)if(!t.routes[i]||!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a)throw Error('Invalid regional road interval');return t;
 }
 let blob=await cache.get(namespace,key),tile;if(blob)try{tile=await decode(blob);}catch{await cache.remove(namespace,key);}
 if(!tile){if(!isCurrent())throw new DOMException('Regional load cancelled','AbortError');const r=await fetch(siteUrl(record.path)+'?v='+record.sha256.slice(0,12));if(!r.ok)throw Error('Regional road tile unavailable');blob=await r.blob();tile=await decode(blob);cache.put(namespace,key,blob);}return tile;
}
export function prepareRegionalRoute(record,airport,manifest,heightAt,{lazyLanes=false}={}){
 const points=record.points.map(([lon,lat,lift])=>{const p=airport.project(lon,lat);if(lift>0&&manifest.bridgeDeckReference==='airport')lift-=Math.min(0,heightAt(p.x,p.z));return[p.x,lift,p.z];}),path=resampleRoadPath(points,heightAt),raised=points.some(p=>p[1]>.05),bounds=[Infinity,Infinity,-Infinity,-Infinity];for(const p of points){bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[2]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[2]);}const {points:sourcePoints,...properties}=record;const road={...properties,path,raised,lanes:[],bounds,major:!['residential','unclassified','living_street','service'].includes(record.kind)},hand=manifest.drivingSide==='left'?-1:1,profile=TRAFFIC_PROFILES[record.kind];
 road.ensureLanes=()=>{if(road.lanes.length)return;
 for(const reverse of road.oneway===-1?[true]:road.oneway===1?[false]:[false,true]){
  const count=reverse&&!road.oneway?road.backward:road.forward;
  for(let slot=0;slot<count;slot++){
   const offset=(road.oneway?(slot+.5-count/2)*3.25:(slot+.5)*3.25)*hand;
   road.lanes.push({...lanePath(road,reverse,offset,heightAt,false),key:road.id+':'+reverse+':'+slot,reverse,slot,speed:Math.min(profile.speed,road.speed>0?road.speed*.9:Infinity),density:profile.density,kind:road.kind,major:road.major});
  }
 }
 };if(!lazyLanes)road.ensureLanes();return road;
}
// Simplify in the road plane and vertically. Ground faces are subsequently
// split at the exact DEM boundaries; elevated grade changes remain vertices.
export function regionalPiece(path,start,end){
 start=Math.max(0,start);end=Math.min(path.length,end);const indices=[];let p={};p=sampleRoadPath(path,start,p);const points=[[p.x,p.y,p.z]];
 for(let i=1;i<path.lengths.length-1;i++)if(path.lengths[i]>start&&path.lengths[i]<end)points.push(Array.from(path.positions.subarray(i*3,i*3+3)));sampleRoadPath(path,end,p);points.push([p.x,p.y,p.z]);
 function simplify(a,b){if(b<=a+1)return;let worst=1,at=-1;const p=points[a],q=points[b],dx=q[0]-p[0],dz=q[2]-p[2],l=dx*dx+dz*dz;for(let i=a+1;i<b;i++){const r=points[i],t=l?Math.max(0,Math.min(1,((r[0]-p[0])*dx+(r[2]-p[2])*dz)/l)):0,err=Math.max(Math.hypot(r[0]-p[0]-dx*t,r[2]-p[2]-dz*t)/.3,Math.abs(r[1]-p[1]-(q[1]-p[1])*t)/.04);if(err>worst){worst=err;at=i;}}if(at>=0){simplify(a,at);indices.push(at);simplify(at,b);}}
 indices.push(0);simplify(0,points.length-1);indices.push(points.length-1);return roadPath(indices.flatMap(i=>points[i]));
}
export function regionalSurfaceGraph(tile,routes,airport,manifest,heightAt=()=>0){
 const roads=[],ground=[];
 function emit(original,p,raised){
  if(p.length<6)return;const path=roadPath(p);if(path.length<.25)return;const r={...original,raised,id:original.id+'/'+tile.id+'/'+roads.length,index:roads.length,path};roads.push(r);
  if(raised)return;
  for(let j=3;j<p.length;j+=3){const ax=p[j-3],az=p[j-1],bx=p[j],bz=p[j+2],len=Math.hypot(bx-ax,bz-az);if(len<.01)continue;const x=-(bz-az)/len*r.width/2,z=(bx-ax)/len*r.width/2;ground.push([[[ax+x,az+z],[bx+x,bz+z],[bx-x,bz-z],[ax-x,az-z]]]);}
 }
 for(const [index,start,end] of tile.pieces){
  const original=routes.get(tile.routes[index].id);if(!original)continue;const p=regionalPiece(original.path,start,end).positions;let from=0,last=null;
  // A long source way may only have a raised approach at one end. Do not turn
  // its kilometres of ordinary pavement into finely tessellated bridge decks.
  for(let j=3;j<p.length;j+=3){const raised=original.bridge||p[j-2]-heightAt(p[j-3],p[j-1])>.14||p[j+1]-heightAt(p[j],p[j+2])>.14;if(last!==null&&raised!==last){emit(original,p.subarray(from,j),last);from=j-3;}last=raised;}
  emit(original,p.subarray(from),last);
 }
 return{airportId:airport.id,source:{ground},roads,hand:manifest.drivingSide==='left'?-1:1};
}
