// Coordinates: x = runway-right, y = up, z = approach side.
// yaw 0 = runway heading 270 degrees, positive yaw/roll = right.
// SI internally. The airframe coefficients are game presets, not A320 data.
import {DEFAULT_DEFINITION,aircraftDefinition} from '../aircraft/registry.js';
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const smooth=(dt,tau)=>1-Math.exp(-dt/tau);
export const moveToward=(v,t,a)=>v+clamp(t-v,-a,a);
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const KT=1.94384,FT=3.28084,NM=1852,RAD=Math.PI/180,G=9.80665;
export const RUNWAY={width:60,length:2600,ground:DEFAULT_DEFINITION.airframe.referenceHeight};
export const SEA_LEVEL_DENSITY=1.225;
// Compatibility view for old fixtures/tools. Runtime force calculations obtain
// the active definition from flight state, never this default-aircraft alias.
export const AIRFRAME=Object.freeze({wingArea:DEFAULT_DEFINITION.airframe.wingArea,seaDensity:SEA_LEVEL_DENSITY,engineThrust:DEFAULT_DEFINITION.engines[0].maxThrustN,engineArm:DEFAULT_DEFINITION.engines[0].yawArmM,yawInertia:DEFAULT_DEFINITION.airframe.yawInertia,liftSlope:DEFAULT_DEFINITION.aerodynamics.liftSlope,inducedDrag:DEFAULT_DEFINITION.aerodynamics.inducedDrag});
export const massOf=(s,d=aircraftDefinition(s))=>Math.max(d.airframe.minimumMassKg,s.weight*1000);
