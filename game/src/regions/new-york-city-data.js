import {createPolygonMask} from '../airports/polygon-mask.js';
import {airportOf} from '../airports/registry.js';
import {surfaceHeight} from '../terrain/heightfield.js';
// The archived source pack predates the extended tidal grid. Its bases may
// stand above newly interpolated banks (verified maximum <23m for this pack).
// Rebase rendering and contact together without changing source arrays/heights.
export const NEW_YORK_GROUND_MARGIN=32;
export function newYorkCityData(data,airport){
 const airportMask=airport.sceneryAirportBoundary?.length?createPolygonMask(airport.sceneryAirportBoundary.map(f=>({outer:f.geometry.map(p=>airport.project(...p)),holes:(f.holes||[]).map(r=>r.map(p=>airport.project(...p)))}))):null;
 const offset=airportOf('jfk').elevationM-airport.elevationM,bases=Number.isSafeInteger(data.count)?new Float32Array(data.count).fill(NaN):null;
 function adapt(b){
  let base=bases?.[b.index];if(!Number.isFinite(base)){base=Math.min(b.baseY+offset,surfaceHeight(b.cx,b.cz,airport.id));if(bases&&Number.isSafeInteger(b.index))bases[b.index]=base;}
  const height=airportMask?.(b.cx,b.cz)?0:b.height;return{...b,baseY:base,topY:base+height,height};
 }
 return{...data,building:(...args)=>adapt(data.building(...args)),candidates:function*(a,b,margin=0,vertical=0,includeRings=true){
  if(!a||!b){for(const source of data.candidates())yield adapt(source);return;}
  const sourceA={...a,y:a.y-offset},sourceB={...b,y:b.y-offset},low=Math.min(a.y,b.y)-vertical,high=Math.max(a.y,b.y)+vertical;
  for(const source of data.candidates(sourceA,sourceB,margin,vertical+NEW_YORK_GROUND_MARGIN,includeRings)){const adjusted=adapt(source);if(adjusted.height>0&&adjusted.topY>=low&&adjusted.baseY<=high)yield adjusted;}
 }};
}
