import {aircraftDefinition} from './registry.js';
import {AIRCRAFT_ADAPTERS} from './adapter-ids.js';

// These are game system adapters, not manufacturer control-law claims. Future
// aircraft select independently implemented thrust/control/cockpit adapters.
function detentThrust(s,t){
 if(s.reverse)return 'REV';if(s.throttle<t.idleThreshold)return 'IDLE';
 for(const d of t.detents)if(d.tolerance&&Math.abs(s.throttle-d.value)<d.tolerance)return d.id;
 return s.throttle>t.fullThreshold?'TOGA':'MAN';
}
const thrustSystems=Object.freeze({[AIRCRAFT_ADAPTERS.thrust.detentAutothrust]:detentThrust});
export const aircraftThrustDetent=s=>{const t=aircraftDefinition(s).thrust;return thrustSystems[t.law](s,t);};
export const detentLever=(s,id)=>aircraftDefinition(s).thrust.detents.find(d=>d.id===id)?.value;
export const landingSpeed=(source,configuration)=>aircraftDefinition(source).flaps.vappKt[configuration];
export function managedApproachSpeed(s){
 const f=aircraftDefinition(s).flaps;
 return f.managedVappAlways.includes(s.flaps)||f.managedVappAtLanding.includes(s.flaps)&&s.flaps===s.landingConfig?s.vapp:f.managedSpeedKt[s.flaps];
}
