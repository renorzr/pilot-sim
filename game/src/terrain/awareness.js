// Game terrain predictor; deliberately not a certified GPWS/EGPWS envelope.
import {FT,RUNWAY,clamp,wrap} from '../sim/constants.js';
import {surfaceHeight,terrainRadioAltitude} from './heightfield.js';
export const createTerrainAwareness=()=>({level:0,clearanceFt:0,aheadClearanceFt:9999,timeToImpact:null,escapeAltitudeFt:0,nextCheck:0,lastSpoken:-100,clearSeconds:0,events:[]});
// Distinguish expected runway contact from terrain closure. The corridor
// narrows toward the threshold and requires a closing runway track;
// gear alone or being in a landing lesson cannot inhibit a terrain warning.
export function runwayArrival(s){
 if(s.mode!=='landing'||s.goAround||s.route?.active&&!s.route.inFinal||s.gearPosition<=.95)return false;
 const v=s.velocity,z=s.z,h=Math.max(0,s.y-RUNWAY.ground),track=s.airData.groundTrack;
 if(z<=-RUNWAY.length||z>=11000||v.z>=-20||Math.abs(wrap(track))>25*Math.PI/180)return false;
 if(Math.abs(s.x)>clamp(120+Math.max(z,0)*.12,120,800))return false;
 // A small correction must not be extrapolated unchanged to the threshold;
 // centerline/stabilization checks handle lateral landing accuracy separately.
 const sinkLimit=s.mission?.kind==='dual-glide'?10:6.5;
 if(v.y< -sinkLimit||Math.abs(s.roll)>.28)return false;
 if(h<Math.tan(1.5*Math.PI/180)*Math.max(z-200,0)-10)return false;
 const contactZ=z+v.z*h/Math.max(-v.y,.5);
 return contactZ<=60&&contactZ>=-RUNWAY.length-100;
}
export function predictTerrain(s,heightAt=surfaceHeight){
 const ground=heightAt(s.x,s.z),clearance=terrainRadioAltitude(s),speed=s.airData.groundSpeed;
 const landingCorridor=runwayArrival(s);
 let closest=Infinity,impact=Infinity,near=Infinity,peak=ground;
 const track=s.airData.groundTrack,turn=clamp(s.yawRate,-.12,.12);
 for(let t=1;t<=30;t++)for(const angle of [-.12,0,.12]){
  const h=track+angle;
  const dx=Math.abs(turn)>.003?speed*(Math.cos(h)-Math.cos(h+turn*t))/turn:Math.sin(h)*speed*t;
  const dz=Math.abs(turn)>.003?-speed*(Math.sin(h+turn*t)-Math.sin(h))/turn:-Math.cos(h)*speed*t;
  const x=s.x+dx,z=s.z+dz,surface=heightAt(x,z),height=s.y+s.velocity.y*t-RUNWAY.ground;
  // Only the low airport surface is expected contact. Raised terrain remains
  // in the prediction, even for a fully configured, correctly aligned final.
  const airportSurface=surface<=5;
  if((landingCorridor&&airportSurface)||(surface<=5&&s.velocity.y>=0&&ground<=5))continue;
  const gap=height-surface;peak=Math.max(peak,surface);closest=Math.min(closest,gap);if(t<=15)near=Math.min(near,gap);if(gap<=0)impact=Math.min(impact,t);
 }
 const level=impact<=15||near<45?2:impact<=30||closest<150?1:0;
 return{level,landingCorridor,clearanceFt:clearance*FT,aheadClearanceFt:Number.isFinite(closest)?closest*FT:9999,timeToImpact:Number.isFinite(impact)?impact:null,peakHeight:peak,escapeAltitudeFt:Math.ceil(((peak-RUNWAY.ground)*FT+1000)/500)*500};
}
export function updateTerrainAwareness(s,dt,emit){
 const a=s.terrain;if(!a||s.result)return;
 a.clearanceFt=terrainRadioAltitude(s)*FT;
 if(!s.airborne||s.landed){a.level=0;return;}
 if(s.time<a.nextCheck)return;a.nextCheck=s.time+.1;
 const prediction=predictTerrain(s),old=a.level;
 if(prediction.level<old){a.clearSeconds+=.1;if(a.clearSeconds<2)prediction.level=old;}else a.clearSeconds=0;
 Object.assign(a,prediction);
 if(a.level!==old){a.events.push({level:a.level,time:s.time,x:s.x,z:s.z});if(a.events.length>20)a.events.shift();}
 if(a.level&&(a.level>old||s.time-a.lastSpoken>(a.level===2?6:12))){
  a.lastSpoken=s.time;
  emit(s,a.level===2?'TERRAIN · PULL UP · 立即避开地形':'TERRAIN AHEAD · 前方地形升高',a.level===2?'Terrain, terrain, pull up':'Terrain ahead','warning');
 }
}
