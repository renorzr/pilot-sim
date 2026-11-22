import {loadMappedCity}from './mapped-city-world.js';
export function loadXiaoshanCity(options){return loadMappedCity({...options,buildingManifestPath:'assets/cities/xiaoshan/buildings-v2.json',imageryManifestPath:'assets/cities/xiaoshan/imagery-v1.json'});}
