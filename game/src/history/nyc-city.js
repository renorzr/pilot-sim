import {loadNewYorkCity} from '../regions/new-york-city.js';
import {newYorkCityData} from '../regions/new-york-city-data.js';
// Only conspicuous post-2009 silhouettes are suppressed. Ordinary blocks and
// 2022 ground photography remain explicitly documented historical estimates.
const modernAreas=[[-74.004,40.752,-73.997,40.758],[-73.982,40.764,-73.977,40.768],[-73.973,40.760,-73.970,40.763],[-73.980,40.763,-73.975,40.766],[-74.015,40.711,-74.011,40.715]];
export function historicalCityData(data,airport){
 const grounded=newYorkCityData(data,airport),adapt=b=>{
  const p=airport.unproject(b.cx,b.cz),modern=b.height>85&&modernAreas.some(([w,s,e,n])=>p.longitude>=w&&p.longitude<=e&&p.latitude>=s&&p.latitude<=n);
  return{...b,baseY:b.baseY,topY:modern?b.baseY:b.topY,height:modern?0:b.height};
 };
 return{...grounded,building:(...args)=>adapt(grounded.building(...args)),candidates:function*(...args){for(const b of grounded.candidates(...args)){const adapted=adapt(b);if(adapted.height>0)yield adapted;}}};
}
export function loadHistoricalCity(options){return loadNewYorkCity({...options,adaptData:historicalCityData,season:'winter'});}
