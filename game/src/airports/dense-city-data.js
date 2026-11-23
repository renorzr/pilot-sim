// Compact source geometry shared by rendering, camera rays and flight contact.
// Nothing in this module depends on WebGL or changes the terrain heightfield.
export const CITY_BUILDING_MANIFEST='assets/cities/lax/buildings-v2.json';
export const DENSE_MAGIC=0x3141584c,DENSE_STRIDE=64,DENSE_TILE_SIZE=1500;
export async function readDenseResponse(response,manifest,{onProgress=()=>{},isCurrent=()=>true}={}){
 if(!response.ok)throw Error('City footprints unavailable');
 const check=()=>{if(!isCurrent())throw new DOMException('City load cancelled','AbortError');};
 // Content-Encoding is decoded by fetch. Manifest wire bytes are only a valid
 // denominator for the plain gzip file, not a browser-inflated response body.
 const encoded=response.headers?.get('Content-Encoding'),length=Number(response.headers?.get('Content-Length'));
 const totalBytes=encoded?null:length>0?length:manifest.bytes||null;
 let buffer;
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let loadedBytes=0,last=0;
  try{while(true){check();const{done,value}=await reader.read();if(done)break;chunks.push(value);loadedBytes+=value.byteLength;const now=performance.now();if(now-last>100){last=now;onProgress({stage:'download',fraction:totalBytes?Math.min(.99,loadedBytes/totalBytes):0,loadedBytes,totalBytes});}}
   check();onProgress({stage:'download',fraction:1,loadedBytes,totalBytes});
   const joined=new Uint8Array(loadedBytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}buffer=joined.buffer;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }else{buffer=await response.arrayBuffer();check();onProgress({stage:'download',fraction:1,loadedBytes:buffer.byteLength,totalBytes});}
 const bytes=new Uint8Array(buffer);
 onProgress({stage:'decompress',fraction:0});await new Promise(resolve=>setTimeout(resolve,0));check();
 if(bytes[0]===0x1f&&bytes[1]===0x8b)buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 check();onProgress({stage:'decompress',fraction:1});
 const steps=decodeDenseCitySteps(buffer,manifest);let lastYield=performance.now();
 while(true){check();const step=steps.next();if(step.done)return step.value;onProgress({stage:'decode',fraction:step.value});if(performance.now()-lastYield>16){await new Promise(resolve=>setTimeout(resolve,0));lastYield=performance.now();}}
}
export function decodeDenseCity(buffer,manifest){const steps=decodeDenseCitySteps(buffer,manifest);while(true){const step=steps.next();if(step.done)return step.value;}}
function* decodeDenseCitySteps(buffer,manifest){
 let view=new DataView(buffer);if(buffer.byteLength<32||view.getUint32(0,true)!==DENSE_MAGIC||![2,3].includes(view.getUint32(4,true)))throw Error('Invalid city geometry');
 const stride=view.getUint32(20,true),format=view.getUint32(4,true),count=view.getUint32(8,true),ringCount=view.getUint32(12,true),pointCount=view.getUint32(16,true),ringOffset=32+count*stride,pointOffset=ringOffset+(ringCount+1)*4;
 if(stride!==(format===3?76:64)||pointOffset+pointCount*4!==buffer.byteLength||manifest.buildings!==count)throw Error('Truncated city geometry');
 let offsets=new Uint32Array(buffer,ringOffset,ringCount+1);const packed=new Int16Array(buffer,pointOffset,pointCount*2),points=new Float32Array(pointCount*2),grid=new Map(),cell=200;
 for(let i=0;i<count;i++){const o=32+i*stride,cx=view.getFloat32(o+56,true),cz=view.getFloat32(o+60,true),first=view.getUint32(o+40,true),n=view.getUint32(o+44,true);for(let p=offsets[first];p<offsets[first+n];p++){points[p*2]=cx+packed[p*2]*.02;points[p*2+1]=cz+packed[p*2+1]*.02;}if(i%8192===0)yield .5*i/Math.max(1,count);}
 buffer=buffer.slice(0,pointOffset);view=new DataView(buffer);offsets=new Uint32Array(buffer,ringOffset,ringCount+1);
 const number=(i,k)=>view.getFloat32(32+i*stride+k,true),key=(x,z)=>x*65536+z;
 for(let i=0;i<count;i++){for(let x=Math.floor(number(i,16)/cell);x<=Math.floor(number(i,20)/cell);x++)for(let z=Math.floor(number(i,24)/cell);z<=Math.floor(number(i,28)/cell);z++){const k=key(x,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}if(i%8192===0)yield .5+.45*i/Math.max(1,count);}
 let cells=0;for(const[k,a]of grid){grid.set(k,Uint32Array.from(a));if(++cells%8192===0)yield .95+.05*cells/Math.max(1,grid.size);}yield 1;
 return denseCityAccess(buffer,points,grid,manifest);
}
function denseCityAccess(buffer,points,grid,manifest){
 const view=new DataView(buffer),format=view.getUint32(4,true),count=view.getUint32(8,true),stride=view.getUint32(20,true),ringCount=view.getUint32(12,true),offsets=new Uint32Array(buffer,32+count*stride,ringCount+1),cell=200;
 const number=(i,k)=>view.getFloat32(32+i*stride+k,true),integer=(i,k)=>view.getUint32(32+i*stride+k,true),key=(x,z)=>x*65536+z;
 function rings(i){const first=integer(i,40),n=integer(i,44),result=[];for(let j=first;j<first+n;j++)result.push(points.subarray(offsets[j]*2,offsets[j+1]*2));return result;}
 function building(i,includeRings=true){const flags=integer(i,8),part=flags>>>8,id=(flags&64?'ms/':flags&32?'eab/':flags&16?'relation/':'way/')+view.getFloat64(32+i*stride,true)+(part?'/'+part:'');return{index:i,id,kind:['home','industrial','commercial'][flags&3],heightSource:(flags>>>2)&3,seed:integer(i,12),cx:number(i,56),cz:number(i,60),minX:number(i,16),maxX:number(i,20),minZ:number(i,24),maxZ:number(i,28),baseY:number(i,32),topY:number(i,36),height:number(i,36)-number(i,32),width:number(i,20)-number(i,16),depth:number(i,28)-number(i,24),angle:0,roofColor:integer(i,48),wallColor:integer(i,52),ringCount:integer(i,44),frame:format===3?{x:number(i,56)+view.getInt16(32+i*stride+64,true)*.02,z:number(i,60)+view.getInt16(32+i*stride+66,true)*.02,width:view.getUint16(32+i*stride+68,true)*.02,depth:view.getUint16(32+i*stride+70,true)*.02,angle:view.getInt16(32+i*stride+72,true)/10000,fill:view.getUint16(32+i*stride+74,true)/65535}:undefined,rings:includeRings||format===2?rings(i):undefined};}
 function candidates(a,b,margin=0,vertical=0){
  const found=new Set(),steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.z-a.z))/(cell*.5))),r=Math.ceil(margin/cell)+1,minY=Math.min(a.y,b.y)-vertical,maxY=Math.max(a.y,b.y)+vertical;
  for(let j=0;j<=steps;j++){const t=j/steps,x=Math.floor((a.x+(b.x-a.x)*t)/cell),z=Math.floor((a.z+(b.z-a.z)*t)/cell);for(let u=x-r;u<=x+r;u++)for(let v=z-r;v<=z+r;v++)for(const i of grid.get(key(u,v))||[]){if(number(i,36)<minY||number(i,32)>maxY)continue;found.add(i);}}
  return(function*(){for(const i of found)yield building(i);})();
 }
 function snapshot(){
  const keys=new Int32Array(grid.size),starts=new Uint32Array(grid.size+1),indices=new Uint32Array([...grid.values()].reduce((n,a)=>n+a.length,0));let i=0,offset=0;
  for(const[k,a]of grid){keys[i]=k;starts[i++]=offset;indices.set(a,offset);offset+=a.length;}starts[i]=offset;
  return{header:new Uint8Array(buffer),points,keys,starts,indices};
 }
 return{count,byteLength:buffer.byteLength+points.byteLength+[...grid.values()].reduce((n,a)=>n+a.byteLength,0),manifest,building,rings,candidates,snapshot};
}

// Restore derived arrays without expanding source rings or rebuilding the grid.
export function restoreDenseCity(a,manifest){
 if(!(a?.header instanceof Uint8Array)||!(a.points instanceof Float32Array)||!(a.keys instanceof Int32Array)||!(a.starts instanceof Uint32Array)||!(a.indices instanceof Uint32Array))throw Error('Invalid decoded cache');
 const buffer=a.header.byteOffset||a.header.byteLength!==a.header.buffer.byteLength?a.header.slice().buffer:a.header.buffer;
 if(buffer.byteLength<32)throw Error('Truncated decoded cache');
 const v=new DataView(buffer),format=v.getUint32(4,true),count=v.getUint32(8,true),rings=v.getUint32(12,true),stride=v.getUint32(20,true),offset=32+count*stride;
 if(v.getUint32(0,true)!==DENSE_MAGIC||![2,3].includes(format)||stride!==(format===3?76:64)||manifest.buildings!==count||offset+(rings+1)*4!==buffer.byteLength||a.points.length!==v.getUint32(16,true)*2||a.starts.length!==a.keys.length+1||a.starts[0]!==0||a.starts.at(-1)!==a.indices.length)throw Error('Incompatible decoded cache');
 const ringOffsets=new Uint32Array(buffer,offset,rings+1);if(ringOffsets[0]!==0||ringOffsets.at(-1)!==a.points.length/2)throw Error('Invalid cached rings');
 for(let i=1;i<ringOffsets.length;i++)if(ringOffsets[i]<ringOffsets[i-1])throw Error('Invalid cached ring order');
 for(const index of a.indices)if(index>=count)throw Error('Invalid cached contact index');
 const grid=new Map();for(let i=0;i<a.keys.length;i++){if(a.starts[i]>a.starts[i+1])throw Error('Invalid cached grid');grid.set(a.keys[i],a.indices.subarray(a.starts[i],a.starts[i+1]));}
 return denseCityAccess(buffer,a.points,grid,manifest);
}

export function footprintContains(x,z,rings){let inside=false;for(const ring of rings)for(let i=0,j=ring.length-2;i<ring.length;j=i,i+=2){const ax=ring[j],az=ring[j+1],bx=ring[i],bz=ring[i+1];if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;}return inside;}

// Earliest entry into an extruded polygon, including courtyard holes and a
// horizontal capsule margin for the aircraft probes / obstacle prediction.
export function footprintEntry(a,b,rings,lo,hi,radius=0){
 const dx=b.x-a.x,dz=b.z-a.z,x=a.x+dx*lo,z=a.z+dz*lo;
 if(footprintContains(x,z,rings))return lo;
 let best=Infinity;
 const accept=t=>{if(t>=lo-1e-9&&t<=hi+1e-9)best=Math.min(best,Math.max(lo,t));};
 for(const ring of rings)for(let i=0,j=ring.length-2;i<ring.length;j=i,i+=2){
  const ax=ring[j],az=ring[j+1],ex=ring[i]-ax,ez=ring[i+1]-az,len2=ex*ex+ez*ez;if(len2<1e-10)continue;
  const u=Math.max(0,Math.min(1,((x-ax)*ex+(z-az)*ez)/len2));if((x-ax-u*ex)**2+(z-az-u*ez)**2<=radius*radius+1e-10)return lo;
  const len=Math.sqrt(len2),s=((a.x-ax)*ez-(a.z-az)*ex)/len,d=(dx*ez-dz*ex)/len;
  if(Math.abs(d)>1e-12)for(const side of radius?[radius,-radius]:[0]){const t=(side-s)/d,q=((a.x+dx*t-ax)*ex+(a.z+dz*t-az)*ez)/len2;if(q>=0&&q<=1)accept(t);}
  if(radius>0){const speed2=dx*dx+dz*dz;if(speed2<1e-12)continue;for(const[px,pz]of[[ax,az],[ax+ex,az+ez]]){const ox=a.x-px,oz=a.z-pz,c=ox*dx+oz*dz,disc=c*c-speed2*(ox*ox+oz*oz-radius*radius);if(disc>=0){accept((-c-Math.sqrt(disc))/speed2);accept((-c+Math.sqrt(disc))/speed2);}}}
 }
 return Number.isFinite(best)?best:null;
}
