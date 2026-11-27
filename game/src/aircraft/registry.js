import a320 from './definitions/a320.json' with {type:'json'};
import a380 from './definitions/a380.json' with {type:'json'};
import {AIRCRAFT_ADAPTERS} from './adapter-ids.js';

export function freezeDefinition(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freezeDefinition);Object.freeze(value);}
 return value;
}
const positive=(value,label)=>{if(!Number.isFinite(value)||value<=0)throw new Error('Invalid aircraft '+label);};
export function validateAircraftDefinition(d){
 if(d?.schemaVersion!==1||!/^[-a-z0-9]+$/.test(d.id)||!Number.isInteger(d.version)||d.version<1)throw new Error('Invalid aircraft definition identity');
 if(d.defaultAppearance?.model!==d.id||d.defaultAppearance.definitionVersion!==d.version)throw new Error('Aircraft default appearance has a different definition identity');
 for(const key of ['wingArea','yawInertia','referenceHeight','minimumMassKg'])positive(d.airframe?.[key],key);
 if(!d.engines?.length||new Set(d.engines.map(e=>e.key)).size!==d.engines.length)throw new Error('Invalid aircraft engine layout');
 d.engines.forEach((e,i)=>{if(e.id!==i||!Number.isFinite(e.yawArmM)||!Number.isFinite(e.audioPan)||e.reverseAvailable!==undefined&&typeof e.reverseAvailable!=='boolean')throw new Error('Invalid aircraft engine '+i);positive(e.maxThrustN,'engine thrust');});
 const f=d.flaps,n=f?.labels?.length;
 if(!n||n<2||['limitsKt','angles','vappKt','managedSpeedKt'].some(k=>f[k]?.length!==n||f[k].some(v=>!Number.isFinite(v))))throw new Error('Invalid aircraft flap table');
 for(const i of [...f.allowedLandingConfigurations,...f.landingConfigurations,f.defaultLandingConfiguration])if(!Number.isInteger(i)||i<0||i>=n)throw new Error('Invalid aircraft landing configuration');
 if(!Object.values(AIRCRAFT_ADAPTERS.controls).includes(d.controls?.law)||!Object.values(AIRCRAFT_ADAPTERS.thrust).includes(d.thrust?.law)||!Object.values(AIRCRAFT_ADAPTERS.cockpit).includes(d.cockpit?.adapter))throw new Error('Unsupported aircraft system adapter');
 for(const k of ['pitchCommandRate','rollCommandRate','pitchTimeConstant','rollTimeConstant'])positive(d.controls[k],'control '+k);
 positive(f.rate,'flap rate');positive(d.gear?.rate,'gear rate');positive(d.operations?.defaultMassTonnes,'default mass');
 const detents=d.thrust.detents;if(!detents?.length||new Set(detents.map(t=>t.id)).size!==detents.length||detents.some(t=>!Number.isFinite(t.value)||t.value<0||t.value>1))throw new Error('Invalid aircraft thrust detents');
 if(!d.geometry?.contacts?.main?.length||!d.geometry?.contacts?.water?.length||!d.geometry.cockpitEye)throw new Error('Missing aircraft contact geometry');
 if(!d.visual?.assetVersions||!d.visual.variants?.[d.visual.defaultVariant])throw new Error('Missing aircraft visual assets');
 const asset=d.visual.assetVersions[d.defaultAppearance.assetVersion];if(!asset||asset.uvLayout!==d.defaultAppearance.uvLayout||!asset.root||!asset.path||!asset.paintMaterial)throw new Error('Incompatible aircraft asset/UV contract');
 for(const group of Object.values(d.geometry.contacts))for(const p of group)if(['x','y','z'].some(k=>!Number.isFinite(p[k])))throw new Error('Invalid aircraft contact point');
 const signals=new Set(['gearPosition','retractedGear','gearDoor','flapPosition','flapAngle','slatFraction','pitch','roll','rudder','steer','spoiler',...d.engines.map(e=>'reverse'+e.id)]);
 for(const t of d.visual.rig.transforms)if(!t.node||!['x','y','z'].includes(t.axis)||!['rotation','position'].includes(t.property)||!signals.has(t.signal)||!Number.isFinite(t.scale)||t.offset!==undefined&&!Number.isFinite(t.offset)||t.visible&&(!signals.has(t.visible.signal)||!Number.isFinite(t.visible.above)))throw new Error('Invalid aircraft rig transform');
 for(const fan of d.visual.rig.fans)if(!d.engines[fan.engine])throw new Error('Invalid aircraft fan binding');
 return d;
}
export function createAircraftRegistry(definitions){
 const entries=new Map();
 for(const definition of definitions){const d=freezeDefinition(validateAircraftDefinition(structuredClone(definition))),key=d.id+':'+d.version;if(entries.has(key))throw new Error('Duplicate aircraft definition '+key);entries.set(key,d);}
 return Object.freeze({
  resolve(subject){const spec=typeof subject==='string'?{model:subject}:subject?.aircraft??subject??{},model=spec.model??'a320',version=spec.definitionVersion??1,d=entries.get(model+':'+version);if(!d)throw new Error('Unsupported aircraft definition '+model+':'+version);return d;},
  list:()=>[...entries.values()],
 });
}
// Missing identities in old checkpoints/recordings always mean original A320
// version 1, even if a future release changes the menu's default aircraft.
export const aircraftRegistry=createAircraftRegistry([a320,a380]);
export const aircraftDefinition=subject=>aircraftRegistry.resolve(subject);
export const DEFAULT_DEFINITION=aircraftDefinition();
export const flapLabels=s=>aircraftDefinition(s).flaps.labels;
export const flapLimits=s=>aircraftDefinition(s).flaps.limitsKt;
export const nominalThrust=s=>aircraftDefinition(s).engines.reduce((n,e)=>n+e.maxThrustN,0);
export const engineLayout=s=>aircraftDefinition(s).engines;
