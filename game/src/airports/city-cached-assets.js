import {siteUrl}from '../urls.js';
export async function loadCityManifest(path,cache,namespace){
 const key='manifest/'+siteUrl(path);
 try{
  const response=await fetch(siteUrl(path),{cache:'no-cache'});if(!response.ok)throw Error('City metadata unavailable');
  const value=await response.json();if(!value||!Array.isArray(value.tiles))throw Error('Invalid city metadata');cache.put(namespace,key,value);return value;
 }catch(error){const saved=await cache.get(namespace,key);if(saved&&Array.isArray(saved.tiles))return saved;throw error;}
}
// Cache compressed image files, retaining the renderer's bounded GPU residency.
export async function loadCachedCityTexture(record,loader,cache,namespace){
 const key='image/'+record.sha256;let blob=await cache.get(namespace,key);
 if(!(blob instanceof Blob)||blob.size!==record.bytes){
  const response=await fetch(siteUrl(record.path)+'?v='+record.sha256.slice(0,12));if(!response.ok)throw Error('City image unavailable');blob=await response.blob();
  if(blob.size===record.bytes)cache.put(namespace,key,blob);
 }
 const url=URL.createObjectURL(blob);try{return await loader.loadAsync(url);}finally{URL.revokeObjectURL(url);}
}
