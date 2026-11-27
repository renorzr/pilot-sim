import {loadRunwayCity} from './runway-city.js';
import {newYorkCityData} from './new-york-city-data.js';
import {loadMappedCity} from '../airports/mapped-city-world.js';
import {NEW_YORK_REGION} from './new-york.js';
import {validateSceneryFrame} from './scenery-source.js';
export function loadNewYorkCity(options){if(options.airport.sceneryAirportId)return loadRunwayCity(options,loadNewYorkCity);validateSceneryFrame(options.airport,NEW_YORK_REGION.frame,'New York');return loadMappedCity({...NEW_YORK_REGION,adaptData:newYorkCityData,...options,regionId:NEW_YORK_REGION.id});}
