// Keep repository blobs below hosting limits; runtime files retain their URLs
// and hashes. No Git LFS, Python, network or source-data download is needed.
import {createReadStream}from 'node:fs';
import {mkdir,readFile,writeFile,open,rename,unlink,stat,readdir}from 'node:fs/promises';
import {createHash}from 'node:crypto';
import {resolve,dirname,relative,sep}from 'node:path';
import {fileURLToPath,pathToFileURL}from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),catalog='ops/assets/large-files.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashFile(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
function local(root,path){const p=resolve(root,path);if(relative(root,p).startsWith('..'+sep)||p===root)throw Error('Invalid asset path');return p;}
export async function packLargeAssets({directory=root,paths,partBytes=32*1024*1024}={}){
 if(!paths?.length){const previous=JSON.parse(await readFile(local(directory,catalog),'utf8'));paths=previous.files.map(f=>f.path);}
 const files=[];
 for(const path of paths){
  const full=local(directory,path),bytes=(await stat(full)).size,parts=[],h=createHash('sha256'),dir='ops/assets/large-files/'+path.replace(/^public\/assets\//,'');await mkdir(local(directory,dir),{recursive:true});
  const handle=await open(full,'r');try{let offset=0,index=0;while(offset<bytes){const b=Buffer.alloc(Math.min(partBytes,bytes-offset));let n=0;while(n<b.length){const r=await handle.read(b,n,b.length-n,offset+n);if(!r.bytesRead)throw Error('Truncated asset '+path);n+=r.bytesRead;}const part=dir+'/'+String(index++).padStart(3,'0')+'.part';await writeFile(local(directory,part),b);parts.push({path:part,bytes:b.length,sha256:sha(b)});h.update(b);offset+=b.length;}}finally{await handle.close();}
  const keep=new Set(parts.map(p=>p.path.split('/').at(-1)));for(const name of await readdir(local(directory,dir)))if(/^\d+\.part$/.test(name)&&!keep.has(name))await unlink(local(directory,dir+'/'+name));
  files.push({path,bytes,sha256:h.digest('hex'),parts});
 }
 const value={version:1,partBytes,files};await mkdir(local(directory,'ops/assets'),{recursive:true});await writeFile(local(directory,catalog),JSON.stringify(value,null,2)+'\n');return value;
}
export async function restoreLargeAssets({directory=root}={}){
 const manifest=JSON.parse(await readFile(local(directory,catalog),'utf8'));if(manifest.version!==1)throw Error('Unsupported large-asset catalog');let restored=0;
 for(const file of manifest.files){
  const target=local(directory,file.path);let exists=false;try{exists=(await stat(target)).isFile();}catch(e){if(e.code!=='ENOENT')throw e;}
  if(exists){if((await stat(target)).size===file.bytes&&await hashFile(target)===file.sha256)continue;throw Error('Local asset differs from repository parts: '+file.path+'. Repack intentional changes with node ops/large-assets.mjs pack.');}
  await mkdir(dirname(target),{recursive:true});const temp=target+'.restore-'+process.pid;const output=await open(temp,'wx'),h=createHash('sha256');let total=0;
  try{
   for(const part of file.parts){const b=await readFile(local(directory,part.path));if(b.length!==part.bytes||sha(b)!==part.sha256)throw Error('Invalid asset part: '+part.path);let offset=0;while(offset<b.length){const r=await output.write(b,offset,b.length-offset);if(!r.bytesWritten)throw Error('Asset write failed');offset+=r.bytesWritten;}h.update(b);total+=b.length;}
   if(total!==file.bytes||h.digest('hex')!==file.sha256)throw Error('Invalid assembled asset: '+file.path);await output.close();await rename(temp,target);restored++;
  }catch(e){await output.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}
 }
 return{files:manifest.files.length,restored};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const operation=process.argv[2]||'restore';
 if(operation==='pack'){
  let paths=process.argv.slice(3);
  if(paths.length)try{const old=JSON.parse(await readFile(local(root,catalog),'utf8'));paths=[...new Set([...old.files.map(f=>f.path),...paths])];}catch(e){if(e.code!=='ENOENT')throw e;}
  const m=await packLargeAssets({paths});console.log('Packed large runtime assets:',m.files.length);
 }
 else if(operation==='restore'){const r=await restoreLargeAssets();console.log('Verified large runtime assets:',r.files,'restored:',r.restored);}
 else throw Error('Usage: node ops/large-assets.mjs [restore | pack [public/assets/...]]');
}
