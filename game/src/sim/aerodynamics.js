import {AIRFRAME,G,RUNWAY,clamp,wrap,massOf} from './constants.js';
import {sampleWeather} from './weather.js';

export const liftZero=flaps=>.30+.175*flaps;
export const liftMaximum=flaps=>1.45+.25*flaps;
export function liftCoefficient(alpha,flaps){
 const raw=liftZero(flaps)+AIRFRAME.liftSlope*alpha,max=liftMaximum(flaps);
 if(raw>max)return max*Math.exp(-(raw-max)*.75);
 if(raw< -1)return -Math.exp(-(-raw-1)*.75);
 return raw;
}
export function refreshAirData(s){
 const {wind,density,disturbanceStrength}=sampleWeather(s.weather,s,s.time),v=s.velocity;
 const air={x:v.x-wind.x,y:v.y-wind.y,z:v.z-wind.z};
 const tas=Math.hypot(air.x,air.y,air.z),horizontal=Math.hypot(air.x,air.z);
 const track=horizontal>.1?Math.atan2(air.x,-air.z):s.yaw;
 const gamma=Math.atan2(air.y,Math.max(horizontal,.01));
 const alpha=wrap(s.pitch-gamma),beta=wrap(s.yaw-track),q=.5*density*tas*tas;
 const cl=liftCoefficient(alpha,s.flapPosition);
 const failed=s.engines?.filter(e=>e.status!=='running').length||0;
 const cd=.022+.008*s.flapPosition+.022*s.gearPosition+AIRFRAME.inducedDrag*cl*cl+.7*beta*beta+failed*.008;
 const lift=q*AIRFRAME.wingArea*cl,drag=q*AIRFRAME.wingArea*cd;
 const groundSpeed=Math.hypot(v.x,v.z),groundTrack=groundSpeed>.1?Math.atan2(v.x,-v.z):s.yaw;
 s.airData={wind,density,disturbanceStrength,airVelocity:air,tas,ias:tas*Math.sqrt(density/AIRFRAME.seaDensity),horizontal,track,gamma,alpha,beta,q,cl,cd,lift,drag,groundSpeed,groundTrack,loadFactor:lift/(massOf(s)*G),energy:massOf(s)*(G*(s.y-RUNWAY.ground)+.5*(v.x*v.x+v.y*v.y+v.z*v.z)),stalled:alpha>(liftMaximum(s.flapPosition)-liftZero(s.flapPosition))/AIRFRAME.liftSlope};
 s.speed=s.airData.ias;s.verticalSpeed=v.y;
 return s.airData;
}
// Explicit initial/reset placement API. Live physics never rewrites velocity
// from attitude or target speed. `speed` is indicated speed, in metres/second.
export function setMotion(s,{speed=s.speed,verticalSpeed=s.verticalSpeed,yaw=s.yaw}={}){
 s.yaw=yaw;
 const {wind,density}=sampleWeather(s.weather,s,s.time),tas=speed/Math.sqrt(density/AIRFRAME.seaDensity);
 const ay=verticalSpeed-wind.y,horizontal=Math.sqrt(Math.max(0,tas*tas-ay*ay));
 s.velocity={x:Math.sin(yaw)*horizontal+wind.x,y:verticalSpeed,z:-Math.cos(yaw)*horizontal+wind.z};
 return refreshAirData(s);
}
export function trimAlpha(s,speed=s.speed){
 // Quasi-steady trim estimate for FD/feed-forward only, never an imposed path.
 const q=.5*AIRFRAME.seaDensity*Math.max(speed,20)**2;
 const cl=massOf(s)*G/(q*AIRFRAME.wingArea*Math.max(.65,Math.cos(s.roll)));
 return clamp((cl-liftZero(s.flapPosition))/AIRFRAME.liftSlope,-.04,.25);
}
