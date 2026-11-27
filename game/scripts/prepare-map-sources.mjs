import {mkdir,copyFile,readFile} from 'node:fs/promises';
const directory=new URL('../../public/assets/maps/',import.meta.url);
await mkdir(directory,{recursive:true});
for(const id of['daxing','xiaoshan','changi','kansai','jfk','lax','lga']){
 await copyFile(new URL(`../src/airports/data/${id}.json`,import.meta.url),new URL(`${id}-source.json`,directory));
 await copyFile(new URL(`../src/airports/data/${id}-departure.json`,import.meta.url),new URL(`${id}-departure.json`,directory));
}
await copyFile(new URL('../src/airports/data/world-land.json',import.meta.url),new URL('world-land.json',directory));

const city=JSON.parse(await readFile(new URL('../src/airports/data/lax-city-physics.json',import.meta.url),'utf8'));
if(city.provisional||city.buildings.length<500)throw new Error('LAX city source/layout must be finalized before release');
await copyFile(new URL('../src/airports/data/lax-city.json',import.meta.url),new URL('lax-city-source.json',directory));
await copyFile(new URL('../src/airports/data/lax-city-physics.json',import.meta.url),new URL('lax-city-physics.json',directory));
