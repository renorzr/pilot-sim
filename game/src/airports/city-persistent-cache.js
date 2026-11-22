// Derived, reproducible assets only. Scores and settings live elsewhere.
export const CITY_CACHE_DB='pilot-sim-city-cache',CITY_CACHE_CHUNK_BYTES=4*1024*1024;
export const CITY_SOURCE_CACHE_VERSION=1,CITY_MODEL_CACHE_VERSION=1;
export function cityCacheNamespaces(airport,manifest){
 // Bump source revision for decoding/index rules; model revision for template,
 // facade, triangulation or serialization changes. Materials/shaders stay live.
 return{
  source:`${airport}:source:${CITY_SOURCE_CACHE_VERSION}:${manifest.sha256}`,
  models:`${airport}:models:${CITY_MODEL_CACHE_VERSION}:${manifest.sha256}:${JSON.stringify(manifest.architecture||{})}`,
  images:`${airport}:images:1`
 };
}
const TYPES={Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array};
let opening;
function database(){
 if(opening)return opening;
 opening=new Promise(resolve=>{
  if(!globalThis.indexedDB){resolve(null);return;}
  let request,done=false;const finish=db=>{if(done){db?.close();return;}done=true;clearTimeout(timer);resolve(db);};
  const timer=setTimeout(()=>finish(null),3000);
  try{request=indexedDB.open(CITY_CACHE_DB,1);}catch{finish(null);return;}
  request.onupgradeneeded=()=>{const s=request.result.createObjectStore('entries',{keyPath:'id'});s.createIndex('airport','airport');};
  request.onerror=()=>finish(null);request.onblocked=()=>finish(null);
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};finish(db);};
 });
 return opening;
}
export function createCityPersistentCache(airport,{open=database,storage=globalThis.navigator?.storage}={}){
 let queue=Promise.resolve(),writable=true;
 const info={available:null,hits:0,misses:0,writes:0,writeFailure:false,pendingWrites:0};
 const id=(ns,key)=>ns+'\0'+key;
 async function read(ns,key){
  try{const db=await open();info.available=!!db;if(!db)return null;
   return await new Promise(resolve=>{const tx=db.transaction('entries','readonly'),r=tx.objectStore('entries').get(id(ns,key));r.onsuccess=()=>resolve(r.result?.payload??null);r.onerror=()=>resolve(null);tx.onabort=()=>resolve(null);});
  }catch{return null;}
 }
 async function write(ns,key,payload){
  if(!writable)return false;
  try{const db=await open();info.available=!!db;if(!db){writable=false;return false;}
   await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put({id:id(ns,key),airport,payload});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});info.writes++;return true;
  }catch{writable=false;info.writeFailure=true;return false;}
 }
 async function removePrefix(ns,prefix){
  try{const db=await open();if(!db)return;await new Promise(resolve=>{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').delete(IDBKeyRange.bound(id(ns,prefix),id(ns,prefix)+'\uffff'));tx.oncomplete=tx.onerror=tx.onabort=resolve;});}catch{}
 }
 const enqueue=fn=>{info.pendingWrites++;const next=queue.then(fn).catch(()=>false).finally(()=>{info.pendingWrites--;});queue=next;return next;};
 return{
  async get(ns,key){const p=await read(ns,key);info[p===null?'misses':'hits']++;return p;},
  put(ns,key,payload){return enqueue(()=>write(ns,key,payload));},
  remove(ns,key){return enqueue(()=>removePrefix(ns,key));},
  async getArrays(ns,key,{isCurrent=()=>true,onProgress=()=>{}}={}){
   const meta=await read(ns,key);if(!meta||meta.format!==1||!meta.arrays){if(meta)await removePrefix(ns,key);info.misses++;return null;}
   try{
    const result={};let completed=0;
    for(const[name,a]of Object.entries(meta.arrays)){
     const Type=TYPES[a.type];if(!Type||!Number.isSafeInteger(a.bytes)||a.bytes<0||a.bytes>512*1024*1024||a.bytes%Type.BYTES_PER_ELEMENT||!Array.isArray(a.parts))throw Error('Invalid cache array');
     const array=new Type(a.bytes/Type.BYTES_PER_ELEMENT),dest=new Uint8Array(array.buffer);let offset=0;
     for(const part of a.parts){if(!isCurrent())return null;const bytes=await read(ns,part);if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>dest.byteLength-offset)throw Error('Incomplete cache array');dest.set(new Uint8Array(bytes),offset);offset+=bytes.byteLength;onProgress({completed:++completed,total:meta.parts});}
     if(offset!==a.bytes)throw Error('Truncated cache array');result[name]=array;
    }
    info.hits++;return result;
   }catch{await removePrefix(ns,key);info.misses++;return null;}
  },
  putArrays(ns,key,arrays,{isCurrent=()=>true}={}){
   return enqueue(async()=>{
    if(!writable||!isCurrent())return false;
    const bytes=Object.values(arrays).reduce((n,a)=>n+a.byteLength,0);
    try{const e=await storage?.estimate?.();if(e?.quota&&e.quota-e.usage<bytes+32*1024*1024){writable=false;info.writeFailure=true;return false;}}catch{}
    const generation=key+'/parts/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'/',meta={format:1,parts:0,arrays:{}};
    for(const[name,array]of Object.entries(arrays)){
     const a={type:array.constructor.name,bytes:array.byteLength,parts:[]};if(!TYPES[a.type])return false;
     for(let offset=0;offset<array.byteLength;offset+=CITY_CACHE_CHUNK_BYTES){
      const part=generation+name+'/'+offset,buffer=array.buffer.slice(array.byteOffset+offset,array.byteOffset+Math.min(array.byteLength,offset+CITY_CACHE_CHUNK_BYTES));
      if(!isCurrent()||!await write(ns,part,buffer)){await removePrefix(ns,generation);return false;}a.parts.push(part);meta.parts++;
     }
     meta.arrays[name]=a;
    }
    // Publish only after every chunk commits. Partial saves are never hits.
    if(!isCurrent()||!await write(ns,key,meta)){await removePrefix(ns,generation);return false;}return true;
   });
  },
  prune(keepNamespaces){return enqueue(async()=>{
   try{const db=await open();if(!db)return;await new Promise(resolve=>{const tx=db.transaction('entries','readwrite'),s=tx.objectStore('entries'),r=s.index('airport').openKeyCursor(IDBKeyRange.only(airport));r.onsuccess=()=>{const c=r.result;if(!c)return;const ns=c.primaryKey.split('\0')[0];if(!keepNamespaces.includes(ns))s.delete(c.primaryKey);c.continue();};tx.oncomplete=tx.onerror=tx.onabort=resolve;});}catch{}
  });},
  settled:()=>queue,
  stats:()=>({...info})
 };
}
