// Game terrain predictor; deliberately not a certified GPWS/EGPWS envelope.
import {FT,RUNWAY,clamp,wrap} from '../sim/constants.js';
import {surfaceHeight,terrainRadioAltitude} from './heightfield.js';
import {runwayOf} from '../airports/registry.js';
import {predictCityObstacles}from './city-obstacles.js';
export const createTerrainAwareness=()=>({level:0,clearanceFt:0,aheadClearanceFt:9999,timeToImpact:null,escapeAltitudeFt:0,nextCheck:0,lastSpoken:-100,clearSeconds:0,events:[]});
// Distinguish expected runway contact from terrain closure. The corridor
// narrows toward the threshold and requires a closing runway track;
// gear alone or being in a landing lesson cannot inhibit a terrain warning.
export function runwayArrival(s){
 const RUNWAY=runwayOf(s);
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
export function predictTerrain(s,heightAt=(x,z)=>surfaceHeight(x,z,s)){
 const RUNWAY=runwayOf(s);
 const ground=heightAt(s.x,s.z),clearance=terrainRadioAltitude(s),speed=s.airData.groundSpeed;
 const landingCorridor=runwayArrival(s);
 let closest=Infinity,impact=Infinity,peak=ground,caution=false,urgent=false;
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
  const gap=height-surface;peak=Math.max(peak,surface);closest=Math.min(closest,gap);if(gap<=0)impact=Math.min(impact,t);
  // A fixed 150 m buffer is inappropriate while deliberately descending onto
  // a real airport plain: a 6 m DEM undulation must not demand a go-around.
  // Every raised sample still participates. Scale clearance with predicted
  // height only inside the validated landing envelope; collision and imminent
  // terrain closure retain their independent warning paths.
  const margin=landingCorridor?Math.min(150,Math.max(20,height*.5)):150;
  if(gap<margin)caution=true;
  if(t<=15&&gap<(landingCorridor?Math.min(45,margin*.3):45))urgent=true;
 }
 const obstacle=predictCityObstacles(s);if(obstacle){impact=Math.min(impact,obstacle.timeToImpact);peak=Math.max(peak,obstacle.peakHeight);}
 const level=Math.max(impact<=15||urgent?2:impact<=30||caution?1:0,obstacle?.level??0);
 return{level,landingCorridor,clearanceFt:clearance*FT,aheadClearanceFt:Number.isFinite(closest)?closest*FT:9999,timeToImpact:Number.isFinite(impact)?impact:null,peakHeight:peak,obstacleId:obstacle?.obstacleId??null,escapeAltitudeFt:Math.ceil(((peak-RUNWAY.ground)*FT+1000)/500)*500};
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
