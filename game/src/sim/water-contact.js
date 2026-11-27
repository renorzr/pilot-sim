import {G,KT,RAD,clamp,massOf,wrap} from './constants.js';
import {refreshAirData} from './aerodynamics.js';
import {AIRCRAFT_CONTACTS,aircraftContacts} from '../aircraft/contact-anchors.js';
import {aircraftDefinition,DEFAULT_DEFINITION} from '../aircraft/registry.js';
// Authored airframe-local metres: x right, y up, z aft, matching aircraft-pose.
// No runway wheel reaction or tyre friction is used by this model.
export const WATER_PROBES=AIRCRAFT_CONTACTS.water;
// Preferred entry/scoring targets, shared with the read-only flight guide.
// They are not independent survival gates; damage combines the full impact.
export const WATER_ENTRY_TARGETS=DEFAULT_DEFINITION.water.entryTargets;
export const waterEntryTargets=source=>{const t=aircraftDefinition(source).water?.entryTargets;if(!t)throw new Error('Aircraft has no calibrated water-entry profile');return t;};
export function probePosition(s,p){
 const roll=-s.roll,pitch=s.pitch,yaw=-s.yaw,cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);
 const px=p.x*cr-p.y*sr,py=p.x*sr+p.y*cr,yy=py*cp-p.z*sp,zz=py*sp+p.z*cp;
 return{x:s.x+px*cy+zz*sy,y:s.y+yy,z:s.z-px*sy+zz*cy};
}
const interpolate=(a,b,t)=>{
 const p={gearPosition:b.gearPosition};for(const k of ['x','y','z','pitch','roll','yaw'])p[k]=a[k]+(k==='yaw'?Math.atan2(Math.sin(b[k]-a[k]),Math.cos(b[k]-a[k])):b[k]-a[k])*t;return p;
};
// Sweep every probe, then refine the earliest crossing. Classification is based
// on the physical source surface, not the colour of the aerial photograph.
export function sweptSurfaceContact(previous,current,{surfaceAt,waterAt,runwayAt=()=>null,level=0,ignoreWater=false}){
 let first=null;
 const distance=Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z),angle=Math.max(Math.abs(current.pitch-previous.pitch),Math.abs(current.roll-previous.roll));
 const steps=Math.max(1,Math.ceil((distance+angle*20)/1.5));
 for(const p of aircraftContacts(current).water){
  if(p.gear&&current.gearPosition<.5)continue;
  const evaluate=t=>{const pose=interpolate(previous,current,t),q=probePosition(pose,p),runway=runwayAt(q.x,q.z),water=!runway&&waterAt(q.x,q.z),height=water?level:runway?.elevationM??surfaceAt(q.x,q.z);return{pose,q,water,runway,height,below:q.y<=height};};
  for(let j=0;j<=steps;j++){
   const hi=j/steps;if(first&&hi-1/steps>first.fraction)break;
   const hit=evaluate(hi);if(!hit.below||ignoreWater&&hit.water)continue;
   let low=Math.max(0,(j-1)/steps),high=hi;
   for(let n=0;n<14;n++){const mid=(low+high)/2,h=evaluate(mid);h.below&&(!ignoreWater||!h.water)?high=mid:low=mid;}
   if(!first||high<first.fraction){const h=evaluate(high);first={...h.pose,fraction:high,type:h.water?'water':h.runway?'runway':'terrain',surface:h.height,part:p.id,point:h.q,runway:h.runway?.id,airport:h.runway?.airport};}
   break;
  }
 }
 return first;
}
export function impactDamage(snapshot){
 const sink=Math.max(0,snapshot.sinkMps),roll=Math.abs(snapshot.roll)/RAD,pitch=snapshot.pitch/RAD,speed=snapshot.waterSpeed*KT,beta=Math.abs(snapshot.waterBeta??snapshot.beta)/RAD;
 // Continuous severity: the historical ~3.8 m/s, 9.5°, 125 kt sample is
 // damaged but survivable. These are tunable game estimates, not certification.
 const snag=snapshot.part?.startsWith('wing-')?.22:snapshot.part?.startsWith('engine-')?.14:0;
 const severity=(sink/5.8)**2+(roll/12)**2+(Math.max(0,8-pitch)/8)**2+(Math.max(0,pitch-11.5)/4.5)**2+(Math.max(0,speed-waterEntryTargets(snapshot).waterMaxKt)/35)**2+(beta/15)**2+.8*snapshot.gearPosition+snag;
 return clamp(severity,0,2);
}
// Scoring targets are narrower than the damaged-but-survivable envelope.
export function waterEntryQuality(s){
 const t=waterEntryTargets(s),mass=Math.sqrt((s.massTonnes||t.referenceMass)/t.referenceMass),ias=s.ias*KT,pitch=s.pitch/RAD,roll=Math.abs(s.roll)/RAD,beta=Math.abs(s.waterBeta??s.beta)/RAD;
 const speedCost=(Math.max(0,ias-t.iasMaxKt*mass)/20)**2+(Math.max(0,t.iasMinKt*mass-ias)/12)**2;
 const cost=speedCost+(Math.max(0,s.sinkMps-t.sinkMaxMps)/3.5)**2+(Math.max(0,roll-t.rollMaxDeg)/6)**2+(Math.max(0,t.pitchMinDeg-pitch)/6)**2+(Math.max(0,pitch-t.pitchMaxDeg)/3.5)**2+(Math.max(0,beta-t.slipMaxDeg)/8)**2;
 return{speed:Math.exp(-speedCost),total:Math.exp(-cost)};
}
export function beginWaterContact(s,hit,{level=0,current={x:0,z:0}}={}){
 if(s.water)return s.water;
 const a=refreshAirData(s),snapshot={aircraft:s.aircraft?{...s.aircraft}:undefined,time:hit.time??s.time,position:{x:hit.x,y:hit.y,z:hit.z},point:hit.point,part:hit.part,pitch:s.pitch,roll:s.roll,yaw:s.yaw,alpha:a.alpha,beta:a.beta,waterBeta:wrap(s.yaw-Math.atan2(s.velocity.x-current.x,-(s.velocity.z-current.z))),massTonnes:s.weight,ias:a.ias,groundSpeed:a.groundSpeed,waterSpeed:Math.hypot(s.velocity.x-current.x,s.velocity.z-current.z),sinkMps:Math.max(0,-s.velocity.y),gearPosition:s.gearPosition,flapPosition:s.flapPosition,input:structuredClone(s.recordedInput||{}),velocity:{...s.velocity}};
 const damage=impactDamage(snapshot);
 s.water={phase:'water-contact',started:s.time,level,current:{...current},firstImpact:snapshot,damage,flooding:0,elapsed:0,stableSeconds:0,evacuationSeconds:0,evacuationAvailable:Math.max(0,100-55*damage),supportN:0,dragN:0,waterSpeed:snapshot.waterSpeed,contacts:[],fatal:damage>=1?'不可生存的入水冲击':null};
 s.autoPilot=s.autoThrust=s.autoThrustActive=false;s.reverse=false;s.autoBrakeActive=false;s.spoilersDeployed=false;s.landed=false;s.airborne=true;s.phase='water-contact';
 // Water support supersedes airborne-only alerts; shore/obstacle contact stays live.
 if(s.stallWarning)Object.assign(s.stallWarning,{active:false,level:0,ratio:0,clearSeconds:0,since:null});
 if(s.terrain)Object.assign(s.terrain,{level:0,timeToImpact:null});
 return s.water;
}
export function stepWaterDynamics(s,dt){
 const w=s.water,m=massOf(s),a=refreshAirData(s),moments=aircraftDefinition(s).geometry.waterMoments;if(!w||dt<=0)return;
 w.elapsed+=dt;if(w.elapsed>.12&&w.phase==='water-contact')w.phase='water-run';
 const rel={x:s.velocity.x-w.current.x,z:s.velocity.z-w.current.z},speed=Math.hypot(rel.x,rel.z),contacts=[];
 let support=0,drag=0,pitchMoment=0,rollMoment=0,yawMoment=0;
 for(const p of aircraftContacts(s).water){
  if(p.gear&&s.gearPosition<.5)continue;
  const q=probePosition(s,p),depth=w.level-q.y;if(depth<=0)continue;
  // Local spring/buoyancy + dissipative normal damping. Capped force is a
  // numerical stability bound, never a correction of height or sink rate.
  const vy=s.velocity.y-s.pitchRate*p.z-s.rollRate*p.x;
  const lift=clamp(1000*G*p.area*depth-8500*vy*Math.min(1,depth/.35),0,m*G*2);
  const wetted=Math.min(1,depth/.8);
  const resistance=(.5*1000*speed*speed*p.area*.025+speed*p.area*220)*wetted*(p.gear?2.8:1);
  support+=lift;drag+=resistance;pitchMoment-=lift*p.z+resistance*Math.max(0,-p.y)*.25;rollMoment-=lift*p.x;
  yawMoment+=resistance*p.x;contacts.push({id:p.id,depth,forceN:lift,dragN:resistance});
 }
 // Buoyancy decreases as the hull floods. Drag acts against water-relative
 // velocity and cannot reverse the aircraft in a single substep.
 support*=1-.4*w.flooding;drag=Math.min(drag,m*speed/Math.max(dt,.0001));
 const airLift=a.lift*Math.cos(s.roll),verticalDrag=-a.drag*Math.sin(a.gamma);
 const fx=-drag*rel.x/Math.max(speed,.001)-a.drag*a.airVelocity.x/Math.max(a.tas,1);
 const fz=-drag*rel.z/Math.max(speed,.001)-a.drag*a.airVelocity.z/Math.max(a.tas,1);
 const fy=support+airLift+verticalDrag-m*G;
 s.velocity.x+=fx/m*dt;s.velocity.z+=fz/m*dt;s.velocity.y+=fy/m*dt;
 // Physical moments coexist with diminishing aerodynamic control authority.
 const control=clamp(speed/70,0,1),pitchControl=s.stickPitch*moments.pitchControlMoment*control,rollControl=s.stickRoll*moments.rollControlMoment*control;
 s.pitchRate+=((pitchMoment+pitchControl)/moments.pitchInertia-s.pitchRate*(2.3+contacts.length*.2))*dt;
 s.rollRate+=((rollMoment+rollControl)/moments.rollInertia-s.rollRate*(2.8+contacts.length*.2))*dt;
 s.yawRate+=(yawMoment/moments.yawInertia-s.yawRate*1.5)*dt;
 s.pitch+=s.pitchRate*dt;s.roll+=s.rollRate*dt;s.yaw+=s.yawRate*dt;
 for(const k of ['x','y','z'])s[k]+=s.velocity[k]*dt;
 w.supportN=support;w.dragN=drag;w.contacts=contacts;w.waterSpeed=Math.hypot(s.velocity.x-w.current.x,s.velocity.z-w.current.z);
 w.damage=clamp(w.damage+Math.max(0,support/(m*G)-4)*dt*.12,0,2);
 if(w.damage>=1)w.fatal='机体损伤超过可生存范围';
 w.flooding=clamp(w.flooding+Math.max(0,w.damage-.15)*dt*.0015,0,1);
 w.evacuationAvailable=Math.max(0,100-55*w.damage-w.flooding*45);
 if(Math.abs(s.roll)>65*RAD)w.fatal='机身倾覆';
 if(s.y<w.level-1.4||w.evacuationAvailable<10)w.fatal='机身失去可撤离的漂浮条件';
 const stable=w.elapsed>=10&&w.waterSpeed<5/KT&&Math.abs(s.roll)<10*RAD&&Math.abs(s.pitch)<15*RAD&&Math.abs(s.velocity.y)<.35&&w.evacuationAvailable>=45;
 w.stableSeconds=stable?w.stableSeconds+dt:0;
 if(w.phase==='evacuation'&&!stable){w.phase='water-run';w.evacuationSeconds=0;}
 if(w.stableSeconds>=3&&w.phase==='water-run')w.phase='afloat';
 if(w.phase==='afloat'){w.phase='evacuation';w.evacuationStarted=s.time;}
 if(w.phase==='evacuation')w.evacuationSeconds+=dt;
 s.phase=w.phase;s.landed=false;s.airborne=true;
 s.forces={x:fx,y:fy,z:fz,liftN:airLift,dragN:a.drag,waterSupportN:support,waterDragN:drag,thrustN:0,weightN:m*G};refreshAirData(s);
}
