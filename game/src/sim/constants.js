// Coordinates: x = runway-right, y = up, z = approach side.
// yaw 0 = runway heading 270 degrees, positive yaw/roll = right.
// SI internally. The airframe coefficients are game presets, not A320 data.
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const smooth=(dt,tau)=>1-Math.exp(-dt/tau);
export const moveToward=(v,t,a)=>v+clamp(t-v,-a,a);
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const KT=1.94384,FT=3.28084,NM=1852,RAD=Math.PI/180,G=9.80665;
export const RUNWAY={width:60,length:2600,ground:2.8};
export const AIRFRAME={wingArea:122.6,seaDensity:1.225,engineThrust:120000,engineArm:5.5,yawInertia:4400000,liftSlope:5.8,inducedDrag:.043};
export const massOf=s=>Math.max(10000,s.weight*1000);
