// Offline release check: runtime files are checked in, never regenerated or
// fetched by a normal build. Verify the source/catalog and published bytes agree.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {aircraftRegistry} from '../game/src/aircraft/registry.js';
import {rigNodeNames} from '../game/src/aircraft/rig.js';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root)),json=async path=>JSON.parse(await read(path));
const pairs=[['game/src/aircraft/livery-manifest.json','public/assets/aircraft/liveries/manifest.json'],['game/src/aircraft/a380-livery-manifest.json','public/assets/aircraft/liveries/a380-manifest.json']],catalogs=new Map();
for(const [source,target]of pairs){const catalog=await json(source);assert.deepEqual(catalog,await json(target));catalogs.set(catalog.uvLayout,catalog);}
for(const definition of aircraftRegistry.list()){
 const layout=await json(definition.authoring.uvContract),catalog=catalogs.get(layout.version);assert(catalog,'Missing paint catalog '+layout.version);
 for(const asset of Object.values(definition.visual.assetVersions)){
  const glb=await read('public/'+asset.path.split('?')[0]),gltf=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12))),names=new Set(gltf.nodes.map(n=>n.name));
  assert(gltf.nodes.some(n=>n.name===asset.root&&n.extras?.uvLayout===asset.uvLayout));assert(!gltf.images?.length,'Paint must remain external to the shared model');
  for(const name of [...rigNodeNames(definition),...Object.values(definition.visual.variants).flatMap(v=>v.nodes)])assert(names.has(name)||names.has(name.replaceAll(' ','_')),'Missing authored aircraft node '+definition.id+':'+name);
  assert.equal(asset.uvLayout,catalog.uvLayout);
  for(const mesh of gltf.meshes)for(const part of mesh.primitives)if(gltf.materials[part.material].name===asset.paintMaterial)assert.notEqual(part.attributes.TEXCOORD_0,undefined,mesh.name+' missing UVs');
 }
}
for(const catalog of catalogs.values())for(const [name,livery]of Object.entries(catalog.liveries))for(const version of Object.values(livery.versions??{[livery.revision]:livery}))for(const [size,texture]of Object.entries(version.textures)){
 const b=await read('public/'+texture.path);assert.equal(b.length,texture.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),texture.sha256);
 assert.equal(b.readUInt32LE(20),+size);assert.equal(b.readUInt32LE(24),+size);assert.equal(b.readUInt32LE(40),Math.log2(+size)+1);
 console.log(name+': '+size+' KTX2, '+b.length+' bytes, mip chain and hash verified');
}
for(const name of ['basis_transcoder.js','basis_transcoder.wasm'])assert.deepEqual(await read('public/assets/aircraft/basis/three-0.187.0/'+name),await read('game/node_modules/three/examples/jsm/libs/basis/'+name));
await read('LICENSES/basis-universal-Apache-2.0.txt');
