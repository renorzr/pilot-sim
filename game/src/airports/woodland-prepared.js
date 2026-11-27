const names=['poses','tints','farPoses','farTints'],align=n=>(n+3)&~3,encoder=new TextEncoder(),decoder=new TextDecoder();
export function encodePreparedWoodlands(arrays,metadata){
 const header=encoder.encode(JSON.stringify({...metadata,arrays:names.map(name=>({name,bytes:arrays[name].byteLength}))})),start=align(12+header.length),size=start+names.reduce((n,name)=>n+align(arrays[name].byteLength),0),bytes=new Uint8Array(size),view=new DataView(bytes.buffer);bytes.set(encoder.encode('NYCTREE1'));view.setUint32(8,header.length,true);bytes.set(header,12);let offset=start;
 for(const name of names){const array=arrays[name];bytes.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),offset);offset+=align(array.byteLength);}return bytes;
}
export function decodePreparedWoodlands(value,{inputs,datumOffset=0}={}){
 let bytes=value instanceof ArrayBuffer?new Uint8Array(value):value;if(bytes.byteOffset%4)bytes=bytes.slice();if(bytes.byteLength<16||decoder.decode(bytes.subarray(0,8))!=='NYCTREE1')throw Error('Invalid prepared woodland header');const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true);if(size>65536||12+size>bytes.byteLength)throw Error('Invalid prepared woodland metadata');
 const meta=JSON.parse(decoder.decode(bytes.subarray(12,12+size)));if(meta.datum!=='MSL'||!meta.inputs||!Array.isArray(meta.arrays)||meta.arrays.length!==4)throw Error('Invalid prepared woodland identity');if(inputs&&Object.entries(inputs).some(([k,v])=>meta.inputs[k]!==v))throw Error('Prepared woodland sources changed');
 const arrays={};let offset=align(12+size);
 for(let i=0;i<names.length;i++){const d=meta.arrays[i],name=names[i],Type=i%2?Uint8Array:Float32Array;if(d.name!==name||!Number.isSafeInteger(d.bytes)||d.bytes<0||d.bytes%Type.BYTES_PER_ELEMENT||offset+d.bytes>bytes.byteLength)throw Error('Invalid prepared woodland arrays');arrays[name]=new Type(bytes.buffer,bytes.byteOffset+offset,d.bytes/Type.BYTES_PER_ELEMENT);offset+=align(d.bytes);}
 if(offset!==bytes.byteLength)throw Error('Incomplete prepared woodlands');for(const name of['poses','farPoses']){const p=arrays[name];if(p.length%8)throw Error('Invalid prepared woodland poses');if(datumOffset)for(let i=1;i<p.length;i+=8)p[i]+=datumOffset;}
 return{...meta,arrays};
}

export async function loadPreparedWoodlands(record,{cache,namespace,inputs,datumOffset=0,isCurrent=()=>true}){
 const key='woodland/prepared/'+record.sha256;
 async function decode(blob){
  if(!(blob instanceof Blob)||![record.bytes,record.decodedBytes].includes(blob.size))throw Error('Incomplete prepared woodland download');const raw=await blob.arrayBuffer(),head=new Uint8Array(raw,0,2),packed=head[0]===31&&head[1]===139,sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join('');if(sha!==(packed?record.sha256:record.decodedSha256))throw Error('Prepared woodland checksum mismatch');
  const bytes=packed?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():raw;if(bytes.byteLength!==record.decodedBytes)throw Error('Incomplete prepared woodland model');return decodePreparedWoodlands(bytes,{inputs,datumOffset});
 }
 let blob=await cache.get(namespace,key),result;if(blob)try{result=await decode(blob);}catch{await cache.remove(namespace,key);}
 if(!result){if(!isCurrent())throw new DOMException('Woodland load cancelled','AbortError');const {siteUrl}=await import('../urls.js'),r=await fetch(siteUrl(record.path)+'?v='+record.sha256.slice(0,12));if(!r.ok)throw Error('Prepared woodland model unavailable');blob=await r.blob();result=await decode(blob);cache.put(namespace,key,blob);}
 return result;
}
