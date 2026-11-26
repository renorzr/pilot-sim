import {loadMappedCity}from './mapped-city-world.js';
import {cityLayout}from './city-layout.js';
import {buildUrbanBlocks}from './lax-city-buildings.js';
import {buildLaxCityLandmarks}from './lax-city-landmarks.js';
import physics from './data/lax-city-physics.json' with {type:'json'};
import {CITY_BUILDING_MANIFEST}from './dense-city-data.js';
export {geographicUv,detailRect,batchCityGeometry}from './mapped-city-world.js';
export function buildCityBlocks(root,options={}){return buildUrbanBlocks(root,{blocks:cityLayout().buildings,...options});}
export function loadLaxCity(options){return loadMappedCity({...options,buildingManifestPath:CITY_BUILDING_MANIFEST,imageryManifestPath:'assets/cities/lax/imagery-lod.json',woodlandSourcePath:'assets/cities/lax/woodlands-v1.json',trafficManifestPath:'assets/cities/lax/traffic-v1.json',createLandmarks:args=>{const result=buildLaxCityLandmarks({...args,landmarks:physics.landmarks});return{...result,records:cityLayout().landmarks.map(o=>({id:o.id,name:o.name,x:o.cx,y:o.baseY,z:o.cz,height:o.height}))};}});}
