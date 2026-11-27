import {aircraftDefinition,DEFAULT_DEFINITION} from '../aircraft/registry.js';
import {G,RUNWAY,SEA_LEVEL_DENSITY,clamp,wrap,massOf} from './constants.js';
import {sampleWeather} from './weather.js';

const curve=(values,p)=>{const f=clamp(p,0,values.length-1),i=Math.min(values.length-2,Math.floor(f));return values[i]+(values[i+1]-values[i])*(f-i);};
export const liftZero=(flaps,polar,d=DEFAULT_DEFINITION)=>polar?.liftZero?curve(polar.liftZero,flaps):d.aerodynamics.liftZeroBase+d.aerodynamics.liftZeroPerFlap*flaps;
export const liftMaximum=(flaps,polar,d=DEFAULT_DEFINITION)=>polar?.liftMax?curve(polar.liftMax,flaps):d.aerodynamics.liftMaxBase+d.aerodynamics.liftMaxPerFlap*flaps;
export const criticalAlpha=(flaps,polar,d=DEFAULT_DEFINITION)=>(liftMaximum(flaps,polar,d)-liftZero(flaps,polar,d))/(polar?.liftSlope??d.aerodynamics.liftSlope);
export const configurationDrag=(s,d=aircraftDefinition(s))=>s.aerodynamics?.flapDrag?curve(s.aerodynamics.flapDrag,s.flapPosition):d.aerodynamics.flapDragPerNotch*s.flapPosition;
export function liftCoefficient(alpha,flaps,polar,d=DEFAULT_DEFINITION){
 const raw=liftZero(flaps,polar,d)+(polar?.liftSlope??d.aerodynamics.liftSlope)*alpha,max=liftMaximum(flaps,polar,d);
 if(raw>max)return max*Math.exp(-(raw-max)*.75);
 if(raw< -1)return -Math.exp(-(-raw-1)*.75);
 return raw;
}
export function refreshAirData(s,d=aircraftDefinition(s)){
 const base=d.aerodynamics;
 const {wind,density,disturbanceStrength}=sampleWeather(s.weather,s,s.time),v=s.velocity;
 const air={x:v.x-wind.x,y:v.y-wind.y,z:v.z-wind.z};
 const tas=Math.hypot(air.x,air.y,air.z),horizontal=Math.hypot(air.x,air.z);
 const track=horizontal>.1?Math.atan2(air.x,-air.z):s.yaw;
 const gamma=Math.atan2(air.y,Math.max(horizontal,.01));
 const alpha=wrap(s.pitch-gamma),beta=wrap(s.yaw-track),q=.5*density*tas*tas;
 const polar=s.aerodynamics,cl=liftCoefficient(alpha,s.flapPosition,polar,d);
 const failed=s.engines?.filter(e=>e.status!=='running').length||0;
 const stallDrag=(polar?.stallDrag??base.stallDrag)*Math.max(0,Math.abs(alpha)/criticalAlpha(s.flapPosition,polar,d)-.8)**2;
 const cd=(polar?.cleanDrag??base.cleanDrag)+configurationDrag(s,d)+base.gearDrag*s.gearPosition+(polar?.inducedDrag??base.inducedDrag)*cl*cl+base.sideslipDrag*beta*beta+failed*(polar?.failedEngineDrag??base.failedEngineDrag)+stallDrag;
 const lift=q*d.airframe.wingArea*cl,drag=q*d.airframe.wingArea*cd;
 const groundSpeed=Math.hypot(v.x,v.z),groundTrack=groundSpeed>.1?Math.atan2(v.x,-v.z):s.yaw;
 s.airData={wind,density,disturbanceStrength,airVelocity:air,tas,ias:tas*Math.sqrt(density/SEA_LEVEL_DENSITY),horizontal,track,gamma,alpha,beta,q,cl,cd,lift,drag,groundSpeed,groundTrack,loadFactor:lift/(massOf(s,d)*G),energy:massOf(s,d)*(G*(s.y-d.airframe.referenceHeight)+.5*(v.x*v.x+v.y*v.y+v.z*v.z)),stalled:alpha>criticalAlpha(s.flapPosition,polar,d)};
 s.speed=s.airData.ias;s.verticalSpeed=v.y;
 return s.airData;
}
// Explicit initial/reset placement API. Live physics never rewrites velocity
// from attitude or target speed. `speed` is indicated speed, in metres/second.
export function setMotion(s,{speed=s.speed,verticalSpeed=s.verticalSpeed,yaw=s.yaw}={}){
 s.yaw=yaw;
 const {wind,density}=sampleWeather(s.weather,s,s.time),tas=speed/Math.sqrt(density/SEA_LEVEL_DENSITY);
 const ay=verticalSpeed-wind.y,horizontal=Math.sqrt(Math.max(0,tas*tas-ay*ay));
 s.velocity={x:Math.sin(yaw)*horizontal+wind.x,y:verticalSpeed,z:-Math.cos(yaw)*horizontal+wind.z};
 return refreshAirData(s);
}
export function trimAlpha(s,speed=s.speed){
 const d=aircraftDefinition(s);
 // Quasi-steady trim estimate for FD/feed-forward only, never an imposed path.
 const q=.5*SEA_LEVEL_DENSITY*Math.max(speed,20)**2;
 const cl=massOf(s)*G/(q*d.airframe.wingArea*Math.max(.65,Math.cos(s.roll)));
 return clamp((cl-liftZero(s.flapPosition,s.aerodynamics,d))/(s.aerodynamics?.liftSlope??d.aerodynamics.liftSlope),-.04,.25);
}
