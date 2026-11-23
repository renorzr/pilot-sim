// Approved B shot, expressed only as an aircraft-relative observer pose.
// The game supplies the real aircraft position and heading. This track only
// moves the observer and never changes flight dynamics.
export const CRUISE_CAMERA_TIMING=Object.freeze({hold:1,ramp:1.2,fadeStart:8.5,duration:9.5});
const clamp=n=>Math.max(0,Math.min(1,n));
const integratedSmooth=u=>u**6-3*u**5+2.5*u**4;
export function sampleCruiseCamera(time){
 const {hold,ramp,duration,fadeStart}=CRUISE_CAMERA_TIMING;
 const t=Math.max(0,Math.min(duration,Number.isFinite(time)?time:0)),active=Math.max(0,t-hold);
 const elapsed=ramp*integratedSmooth(clamp(active/ramp))+Math.max(0,active-ramp);
 const progress=t>=duration?1:elapsed/(duration-hold-ramp/2);
 const radius=84*Math.exp(Math.log(115/84)*progress),theta=.18+(1.48-.18)*progress,elevation=1.49+(-.75-1.49)*progress;
 const offset=[Math.sin(theta)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(theta)*Math.cos(elevation)*radius];
 const fade=clamp((t-fadeStart)/(duration-fadeStart)),opacity=fade**3*(fade*(fade*6-15)+10);
 return{offset,radius,roll:-Math.PI*.28+Math.PI*.28*progress,fov:42,opacity:t>=duration?1:opacity};
}
