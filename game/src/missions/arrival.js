import {FT,KT,RAD,RUNWAY} from '../sim/constants.js';
// Explicit side-intercept presets, not completed final-approach snapshots.
const profiles={
 'short-landing':{x:-650,z:10500,altitude:1500,speed:195,heading:12},
 'ils-approach':{x:-1400,z:22000,altitude:3000,speed:210,heading:12},
 'goaround':{x:-700,z:11000,altitude:1500,speed:195,heading:12},
 'dual-glide':{x:-650,z:10500,altitude:2800,speed:185,heading:10},
};
export function initializeArrival(s,level){
 if(level.mode!=='landing')return;
 const p=profiles[level.id]||{x:-900,z:12000,altitude:1500,speed:200,heading:12};
 s.arrival={...p,requiresPreparation:true};s.x=p.x;s.z=p.z;s.y=RUNWAY.ground+p.altitude/FT;s.yaw=p.heading*RAD;s.speed=p.speed/KT;s.verticalSpeed=0;
 s.gear=false;s.gearPosition=0;s.flaps=s.flapPosition=0;s.spoilersArmed=false;s.autoBrake='OFF';s.landingChecklistConfirmed=false;
 s.apprArmed=s.locCaptured=s.gsCaptured=s.gsCaptureEligible=false;s.autoPilot=false;s.selectedAltitude=p.altitude;s.selectedSpeed=p.speed;
 s.gates=[];s.previousRA=p.altitude;s.phase='intercept';s.checkpointLabel='侧方进近 · 未完成着陆准备';
}
export function preparedAtTouchdown(s){
 const t=s.touchdown;
 return !!t&&t.gearPosition>.98&&Math.abs(t.flapPosition-s.landingConfig)<.05&&(s.mission?.kind==='dual-glide'||t.checklistConfirmed);
}
