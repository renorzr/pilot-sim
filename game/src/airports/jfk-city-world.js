import {loadMappedCity}from './mapped-city-world.js';
export function loadJfkCity(options){return loadMappedCity({...options,buildingManifestPath:'assets/cities/jfk/buildings-v1.json',imageryManifestPath:'assets/cities/jfk/imagery-v1.json'});}
