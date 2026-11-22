import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,unlink,rm,readdir}from 'node:fs/promises';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {packLargeAssets,restoreLargeAssets}from '../../ops/large-assets.mjs';
test('a fresh checkout reconstructs byte-identical runtime files from bounded repository parts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pilot-asset-parts-'));try{
  const path='public/assets/cities/test/buildings.bin.gz',bytes=Buffer.from(Array.from({length:101},(_,i)=>i));await mkdir(join(directory,'public/assets/cities/test'),{recursive:true});await writeFile(join(directory,path),bytes);
  const m=await packLargeAssets({directory,paths:[path],partBytes:16});assert(m.files[0].parts.every(p=>p.bytes<=16));await unlink(join(directory,path));assert.deepEqual(await restoreLargeAssets({directory}),{files:1,restored:1});assert.deepEqual(await readFile(join(directory,path)),bytes);assert.deepEqual(await restoreLargeAssets({directory}),{files:1,restored:0});
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('corrupt parts never publish partial runtime files',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pilot-asset-parts-'));try{
  const path='public/file.bin';await mkdir(join(directory,'public'));await writeFile(join(directory,path),'complete asset');const m=await packLargeAssets({directory,paths:[path],partBytes:4});await unlink(join(directory,path));await writeFile(join(directory,m.files[0].parts[1].path),'bad');await assert.rejects(restoreLargeAssets({directory}),/Invalid asset part/);assert.deepEqual(await readdir(join(directory,'public')),[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('local rebuilt data is protected until its repository parts are explicitly updated',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pilot-asset-parts-'));try{
  const path='public/file.bin';await mkdir(join(directory,'public'));await writeFile(join(directory,path),'old');await packLargeAssets({directory,paths:[path],partBytes:4});await writeFile(join(directory,path),'new source');await assert.rejects(restoreLargeAssets({directory}),/Repack intentional changes/);assert.equal(await readFile(join(directory,path),'utf8'),'new source');await packLargeAssets({directory,partBytes:4});await unlink(join(directory,path));await restoreLargeAssets({directory});assert.equal(await readFile(join(directory,path),'utf8'),'new source');
 }finally{await rm(directory,{recursive:true,force:true});}
});
