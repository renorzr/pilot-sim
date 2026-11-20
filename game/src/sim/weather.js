import {airPocket} from './cabin-motion.js';
import {KT,RAD,AIRFRAME,clamp} from './constants.js';

export function createWeather(options={}){
 return {ambientTurbulence:options.ambientTurbulence??0,visibility:options.visibility??42000,cloudBase:options.cloudBase??10000,rain:options.rain??0,overcast:options.overcast??0,disturbances:structuredClone(options.disturbances||[]),wind:{speedKt:5,directionDeg:270,vertical:0,...options.wind},gust:{amplitude:0,period:8,seed:27,...options.gust},shear:options.shear?structuredClone(options.shear):null,runwayFriction:clamp(options.runwayFriction??1,.1,1)};
}
// Analytic fields are reproducible at any position/time: no frame-based randomness.
export function sampleWeather(weather,position,time){
 const w=weather.wind,angle=(w.directionDeg-270)*RAD,v=w.speedKt/KT;
 const wind={x:-Math.sin(angle)*v,y:w.vertical,z:Math.cos(angle)*v};
 const gust=weather.gust,phase=time*2*Math.PI/Math.max(gust.period,1)+gust.seed;
 wind.x+=gust.amplitude*Math.sin(phase)*.8;
 wind.y+=gust.amplitude*Math.sin(phase*.73+1)*.35;
 wind.z+=gust.amplitude*Math.sin(phase*.91+2);
 if(weather.shear){
  const shear=weather.shear,t=clamp((position.y-shear.base)/Math.max(1,shear.depth),0,1),blend=t*t*(3-2*t);
  for(const axis of ['x','y','z'])wind[axis]+=(shear.delta[axis]||0)*blend;
 }
 const pocket=airPocket(time,gust.seed)*(weather.ambientTurbulence||0)*clamp((position.y-300)/200,0,1);
 wind.x+=pocket*Math.sin(time*4.3);wind.y+=pocket*Math.sin(time*6.1+1);wind.z+=pocket*Math.sin(time*3.7+2);
 let disturbanceStrength=0;
 for(const field of weather.disturbances||[]){
  const radius=Math.hypot((position.x-field.x)/field.radiusX,(position.z-field.z)/field.radiusZ);
  const u=clamp(1-radius,0,1),h=clamp((position.y-field.base)/(field.top-field.base),0,1);
  const blend=u*u*(3-2*u)*(1-h*h*(3-2*h))*clamp(field.strength??1,0,1);
  disturbanceStrength=Math.max(disturbanceStrength,blend);
  for(const axis of ['x','y','z'])wind[axis]+=(field.wind[axis]||0)*blend;
 }
 const density=AIRFRAME.seaDensity*Math.exp(-Math.max(0,position.y)/10000);
 return {wind,density,disturbanceStrength};
}
// Changing weather preserves inertial velocity. A wind change changes airspeed,
// not ground velocity instantaneously. Initial placement is handled by setMotion.
export function setWeather(s,patch){
 const old=s.weather;
 s.weather=createWeather({...old,...patch,wind:{...old.wind,...patch.wind},gust:{...old.gust,...patch.gust}});
 s.headwind=s.weather.wind.speedKt*Math.cos((s.weather.wind.directionDeg-270)*RAD);
 s.windDirection=s.weather.wind.directionDeg;
}

// Convert the local world-vector back to the compass bearing it comes from.
export function windReadout(wind){
 const speedKt=Math.hypot(wind.x,wind.z)*KT;
 const directionDeg=speedKt<.01?0:(270+Math.atan2(-wind.x,wind.z)/RAD+360)%360;
 return {speedKt,directionDeg,verticalFpm:wind.y*196.85};
}
