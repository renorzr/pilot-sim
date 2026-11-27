import {aircraftDefinition} from '../aircraft/registry.js';
// Severity belongs to the actual fictional scenario, not the fault name alone.
// First declarations repeat the complete MAYDAY / PAN PAN unit three times.
export const emergencyLevels={engine:'distress',dual:'distress','engine-stable':'urgency',flaps:'urgency','distress-wind':'distress','distress-terrain':'distress','distress-stall':'distress'};
export const emergencyPriority=key=>emergencyLevels[key]==='distress'?4:emergencyLevels[key]==='urgency'?3:0;
export function createEmergencyMonitor(){return{windSeconds:0,terrainSeconds:0,stallSeconds:0,singleStableSeconds:0,safeSeconds:0};}
export function observeEmergency(s,dt,queue){
 const r=s.radio;if(!r||s.result||!s.airborne||s.landed)return;
 const m=r.monitor??=createEmergencyMonitor(),ra=s.terrain?.clearanceFt??((s.y-aircraftDefinition(s).airframe.referenceHeight)*3.28084),speed=s.speed*1.94384;
 const wind=s.mission?.kind==='windshear'&&s.mission.triggered&&!s.mission.clear&&!s.mission.avoided;
 m.windSeconds=wind&&ra<700&&(s.verticalSpeed< -7||s.airData.stalled||s.stallWarning?.active)?m.windSeconds+dt:0;
 m.terrainSeconds=s.terrain?.level===2&&s.terrain.timeToImpact>0&&s.terrain.timeToImpact<=10?m.terrainSeconds+dt:0;
 m.stallSeconds=s.stallWarning?.active&&ra<1000&&s.verticalSpeed< -3?m.stallSeconds+dt:0;
 if(m.windSeconds>=1.5)queue(s,'distress-wind',true);
 else if(m.terrainSeconds>=1.5)queue(s,'distress-terrain',true);
 else if(m.stallSeconds>=2)queue(s,'distress-stall',true);
 // A single engine still failed: this is an explicit downgrade, not a repair.
 const single=r.emergency?.event==='engine'&&s.engines.filter(e=>e.status==='running').length===1&&s.mission?.acknowledged&&ra>=1200&&speed>=145&&s.verticalSpeed>-.5&&Math.abs(s.roll)<.26&&!s.terrain?.level&&!s.stallWarning?.active;
 m.singleStableSeconds=single?m.singleStableSeconds+dt:0;
 if(m.singleStableSeconds>=20)queue(s,'engine-stable',true);
 // Cancel only the resolved transient hazard, never an engine failure or jam.
 const transient=['distress-wind','distress-terrain','distress-stall'].includes(r.emergency?.event);
 const safe=transient&&!s.terrain?.level&&!s.stallWarning?.level&&!s.airData.stalled&&ra>=1000&&s.verticalSpeed>=0&&speed>=145&&(!wind);
 m.safeSeconds=safe?m.safeSeconds+dt:0;
 if(m.safeSeconds>=15)queue(s,'distress-cancel',true);
}
