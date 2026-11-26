import {loadMappedCity}from './mapped-city-world.js';
export function loadKansaiCity(options){return loadMappedCity({...options,buildingManifestPath:'assets/cities/kansai/buildings-v1.json',imageryManifestPath:'assets/cities/kansai/imagery-v1.json',trafficManifestPath:'assets/cities/kansai/traffic-v1.json'});}
