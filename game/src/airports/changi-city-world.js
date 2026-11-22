import {loadMappedCity}from './mapped-city-world.js';
export function loadChangiCity(options){return loadMappedCity({...options,buildingManifestPath:'assets/cities/changi/buildings-v1.json',imageryManifestPath:'assets/cities/changi/imagery-v1.json'});}
