import {aircraftDefinition} from '../aircraft/registry.js';
// Capabilities are distinct from crew-selected modes. A failed system cannot
// be restored by pressing its normal ON button.
export const createSystems=source=>({...structuredClone(aircraftDefinition(source).capabilities),flapsJammed:false,jammedPosition:null,thrustLocked:false,heldCommands:[],emergencyPower:false,visualReferences:true});
export function failAutoThrust(s){
 s.systems.autoThrustAvailable=false;s.systems.thrustLocked=true;s.systems.heldCommands=s.engines.map(e=>e.command);s.autoThrust=false;s.autoThrustActive=false;
}
export function transferManualThrust(s,value,force=false){
 if(!s.systems?.thrustLocked)return;
 const held=s.systems.heldCommands.reduce((a,b)=>a+b,0)/Math.max(1,s.systems.heldCommands.length);
 if(force||value>aircraftDefinition(s).thrust.takeoverThreshold||Math.abs(value-held)<aircraftDefinition(s).thrust.takeoverTolerance){s.systems.thrustLocked=false;if(s.mission)s.mission.manualTakenOver=true;}
}
export function loseILS(s){s.systems.ils={localizer:false,glideSlope:false};s.apprArmed=s.locCaptured=s.gsCaptured=false;s.autoPilot=false;s.flightDirector=false;}
export function jamFlaps(s){s.systems.flapsJammed=true;s.systems.jammedPosition=s.flapPosition;}
export function toggleAutoThrust(s){if(s.result||!s.systems.autoThrustAvailable)return false;s.autoThrust=!s.autoThrust;return true;}
export function updateVisualReferences(s){
 const d=Math.hypot(s.x,Math.max(s.z,0));
 s.systems.visualReferences=s.y-aircraftDefinition(s).airframe.referenceHeight<=(s.weather.cloudBase??10000)&&d<=(s.weather.visibility??42000);
}
