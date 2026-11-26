import {loadMappedCity}from './mapped-city-world.js';
export function loadDaxingCity(options){return loadMappedCity({...options,buildingManifestPath:'assets/cities/daxing/buildings-v1.json',imageryManifestPath:'assets/cities/daxing/imagery-v1.json',trafficManifestPath:'assets/cities/daxing/traffic-v1.json'});}
