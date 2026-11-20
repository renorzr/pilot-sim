import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFlight,advanceFlight,setMotion,setEngineStatus,FT,KT,clamp,restoreCheckpoint,saveCheckpoint} from '../src/flight.js';
import {trimAlpha} from '../src/sim/aerodynamics.js';
import {TERRAIN,vertexHeight,terrainHeight,surfaceHeight,terrainRadioAltitude,sweptContact} from '../src/terrain/heightfield.js';
import {predictTerrain} from '../src/terrain/awareness.js';
import {updateATC} from '../src/comms/atc.js';
import {updateRadio,queueRadio,calloutClip} from '../src/comms/radio.js';
import {pilotInput} from './pilot.mjs';
const step=(s,n,input={})=>{for(let i=0;i<n*50&&!s.result;i++)advanceFlight(s,typeof input==='function'?input(s):input,.02);};
function airborne(x=0,z=-2000,alt=1500){
 const s=createFlight(null,{levelId:'circuit'});s.airborne=true;s.x=x;s.z=z;s.y=2.8+alt/FT;s.flaps=s.flapPosition=1;s.gear=false;s.gearPosition=0;s.throttle=.78;
 setMotion(s,{speed:175/KT,verticalSpeed:0,yaw:Math.PI/2});s.pitch=trimAlpha(s);return s;
}
function levelPilot(s){const targetVS=clamp((2.8+1500/FT-s.y)*.15,-3,3),target=trimAlpha(s)+Math.atan2(targetVS,s.airData.horizontal)+(targetVS-s.verticalSpeed)*.009;return{stick:{pitch:clamp((target-s.pitch)*10-s.pitchRate*3,-.7,.7),roll:clamp(-s.roll*8-s.rollRate*3,-.7,.7)}};}
test('terrain queries agree with the actual rendered triangles, including shoreline interpolation',()=>{
 const geometry=new THREE.PlaneGeometry(TERRAIN.width,TERRAIN.depth,TERRAIN.columns,TERRAIN.rows);geometry.rotateX(-Math.PI/2);const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++)p.setY(i,vertexHeight(p.getX(i),p.getZ(i)));
 geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
 for(const [x,z]of [[-620,1300],[1430,-4210],[4321,-9001],[6300,2800],[-350,-9000],[25,4000],[-7700,12100],[7990,-24900]]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,20000,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert(hit);assert(Math.abs(hit.point.y-terrainHeight(x,z))<.02,`${x},${z}: render ${hit.point.y} physics ${terrainHeight(x,z)}`);
 }geometry.dispose();mesh.material.dispose();
});
test('swept contact finds a hillside before the next end point, including a wing strike',()=>{
 const from={x:1800,y:460,z:-2000,pitch:0,roll:0,yaw:Math.PI/2},to={...from,x:7000};const hit=sweptContact(from,to);assert(hit&&hit.x<to.x&&hit.x>from.x);assert.equal(hit.type,'terrain');
 const x=4800,z=-2000,ground=surfaceHeight(x,z),wing=sweptContact({...from,x,z,y:ground+10,roll:.7},{...from,x:x+1,z,y:ground+10,roll:.7});assert(wing,'a banked wing can hit before the fuselage reference');
});
test('following the 1500 ft coastal circuit keeps real terrain clearance without false warnings',()=>{
 const s=createFlight(null,{levelId:'circuit'});let minimum=Infinity;
 for(let i=0;i<40000&&!s.result;i++){advanceFlight(s,pilotInput(s),.02);if(s.route.active&&!s.route.inFinal&&(s.y-2.8)*FT>=1100)minimum=Math.min(minimum,terrainRadioAltitude(s)*FT);}
 assert(s.result?.levelCleared);assert(minimum>700,`minimum coast clearance ${minimum}`);assert(!s.terrain.events.some(e=>e.level>0));assert.equal(s.atc.violations.length,0,JSON.stringify(s.atc.violations));
});
test('ignoring the coastal route at 1500 ft triggers caution, PULL UP, ATC and then a frozen collision',()=>{
 const s=airborne(1800,-2000);s.mode='enroute';let caution=null,warning=null;
 for(let i=0;i<6000&&!s.result;i++){advanceFlight(s,levelPilot(s),.02);if(s.terrain.level===1&&caution===null)caution=s.time;if(s.terrain.level===2&&warning===null)warning=s.time;}
 assert(s.result&&!s.result.success);assert.equal(s.result.title,'撞击地形');assert(s.impact?.type==='terrain');assert(caution!==null&&warning!==null&&caution<=warning);assert(warning<s.time-3,`warning ${warning}, impact ${s.time}`);assert(s.atc.violations.some(e=>e.type==='terrain'));
 const frozen={x:s.x,y:s.y,z:s.z,time:s.time};step(s,5,{pitch:1,throttle:1});assert.deepEqual({x:s.x,y:s.y,z:s.z,time:s.time},frozen);
});
test('gear/APPR cannot suppress elevated terrain, while normal configured final does not warn',()=>{
 const final=createFlight(null,{levelId:'short-landing'});assert.equal(predictTerrain(final).level,0);
 const s=airborne(4000,-2000);s.mode='landing';s.gearPosition=1;s.apprArmed=true;const prediction=predictTerrain(s);assert(prediction.level>0);assert(prediction.clearanceFt<1500);
 assert.equal(calloutClip('Terrain ahead'),'call-terrain');assert.equal(calloutClip('Terrain, terrain, pull up'),'call-pull-up');
});
test('ATC observes sustained altitude deviations, repeats reminders, and confirms only actual recovery',()=>{
 const s=airborne(0,-1800,2000);s.yaw=0;s.verticalSpeed=0;s.velocity.y=0;
 for(let i=0;i<3500;i++){s.time+=.02;updateATC(s,.02);updateRadio(s);}
 assert(s.atc.violations.filter(v=>v.type==='high').length>=2);assert.equal(s.atc.deviation.type,'high');assert(s.radio.history.some(line=>line.event==='atc-high'));
 s.y=2.8+1500/FT;for(let i=0;i<230;i++){s.time+=.02;updateATC(s,.02);updateRadio(s);}
 assert.equal(s.atc.deviation,null);assert(s.radio.pending.some(line=>line.event==='atc-recovered')||s.radio.active?.event==='atc-recovered');
});
test('ATC tolerates normal climb and a brief correction, but reacts to wrong route and heading',()=>{
 const s=airborne(0,-2000,900);s.verticalSpeed=6;
 for(let i=0;i<1000;i++){s.time+=.02;updateATC(s,.02);updateRadio(s);}assert.equal(s.atc.violations.length,0);
 s.z=-8000;for(let i=0;i<350;i++){s.time+=.02;updateATC(s,.02);updateRadio(s);}assert(s.atc.violations.some(v=>v.type==='route'));
 const h=airborne();h.route.active=false;h.goAround=true;h.goAroundHeading=0;h.selectedAltitude=3000;h.yaw=Math.PI/2;h.verticalSpeed=5;
 for(let i=0;i<700;i++){h.time+=.02;updateATC(h,.02);updateRadio(h);}assert(h.atc.violations.some(v=>v.type==='heading'));
});
test('terrain avoidance amends guidance clearance, never changes selected FCU or restores unavailable thrust',()=>{
 const s=airborne(4000,-2000);const selected=s.selectedAltitude;step(s,.4,levelPilot);assert(s.atc.terrainFloorFt>1500);assert(s.atc.clearance.altitude>1500);assert.equal(s.selectedAltitude,selected);assert(s.route.targetAltitude>=s.atc.terrainFloorFt);
 saveCheckpoint(s,'地形避让');const r=restoreCheckpoint(s);assert.equal(r.atc.terrainFloorFt,s.atc.terrainFloorFt);assert.equal(r.terrain.level,s.terrain.level);
 setEngineStatus(s,0,'failed');setEngineStatus(s,1,'failed');step(s,.2,levelPilot);assert.equal(s.atc.terrainFloorFt,0);assert(s.engines.every(e=>e.thrustN===0));
 const critical=createFlight(null,{levelId:'takeoff'});critical.time=1;queueRadio(critical,'engine',true);critical.time=4;updateRadio(critical);critical.atc.lastSent=-100;critical.atc.issuedAt=-10;critical.atc.phaseKey='route-0';critical.route=s.route;critical.airborne=true;critical.terrain.level=2;critical.terrain.escapeAltitudeFt=3000;updateATC(critical,.02);assert.equal(critical.radio.active.event,'engine');
});

test('approach ATC reacts to sustained wrong track, while a transient excursion remains quiet',()=>{
 const s=createFlight(null,{levelId:'short-landing'});s.x=800;s.yaw=.8;s.airData.groundTrack=.8;
 for(let i=0;i<700;i++){s.time+=.02;updateATC(s,.02);updateRadio(s);}assert(s.atc.violations.some(v=>v.type==='approach'));
 const t=airborne(0,-1800,1500);t.yaw=0;for(let i=0;i<400;i++){t.time+=.02;updateATC(t,.02);}
 t.y=2.8+2000/FT;for(let i=0;i<200;i++){t.time+=.02;updateATC(t,.02);}
 t.y=2.8+1500/FT;for(let i=0;i<250;i++){t.time+=.02;updateATC(t,.02);updateRadio(t);}assert.equal(t.atc.violations.length,0);assert(!t.radio.active);assert.equal(t.radio.pending.length,0);
});

// These isolated final states model a normal three-degree arrival while the
// pilot is still correcting a modest lateral error, rather than perfect x=0.
function correctingFinal(x,z){
 const s=createFlight('landing',{landingConfig:3});s.x=x;s.z=z;s.y=2.8+15.24+Math.tan(3*Math.PI/180)*z;
 setMotion(s,{speed:150/KT,verticalSpeed:-3.8,yaw:-Math.atan2(x,z+300)});return s;
}
test('normal final corrections beyond 90 m do not mistake the flat airport for a mountain',()=>{
 for(const z of [4000,2000,1000,500])for(const x of [-180,-120,0,120,180]){
  const s=correctingFinal(x,z),p=predictTerrain(s);assert.equal(p.level,0,JSON.stringify({x,z,p}));assert(p.landingCorridor);
  step(s,.15);assert.equal(s.terrain.level,0);assert.equal(s.atc.terrainFloorFt,0);
 }
});
test('a landing exemption never conceals an actual ridge inside the approach corridor',()=>{
 const s=correctingFinal(120,1000),ridge=(x,z)=>z>550&&z<850?90:surfaceHeight(x,z);
 const p=predictTerrain(s,ridge);assert(p.landingCorridor);assert.equal(p.level,2);assert(p.timeToImpact<=15);
});
test('undershoot, steep descent, divergent track, gear-up and missed approach still receive warnings',()=>{
 const cases=[
  s=>{s.y=2.8+15;},
  s=>setMotion(s,{speed:150/KT,verticalSpeed:-12,yaw:0}),
  s=>{s.x=700;setMotion(s,{speed:150/KT,verticalSpeed:-3.8,yaw:.35});},
  s=>{s.gear=false;s.gearPosition=0;},
  s=>{s.goAround=true;},
 ];
 for(const change of cases){const s=correctingFinal(0,1000);change(s);const p=predictTerrain(s);assert(!p.landingCorridor);assert(p.level>0,JSON.stringify(p));}
});
test('a continuous complete circuit tolerates a hand-flown lateral correction during final',()=>{
 const s=createFlight(null,{levelId:'circuit'});let peakOffset=0;
 for(let i=0;i<40000&&!s.result;i++){
  const input=pilotInput(s);
  if(s.route.inFinal&&s.z<3600&&s.z>700){
   const offset=200*Math.sin(Math.PI*(3600-s.z)/2900)**2,roll=clamp((offset-s.x)*.002-s.velocity.x*.04,-.18,.18);
   input.stick.roll=clamp((roll-s.roll)*8-s.rollRate*3,-.7,.7);peakOffset=Math.max(peakOffset,Math.abs(s.x));
  }
  advanceFlight(s,input,.02);
 }
 assert(peakOffset>90,`correction only reached ${peakOffset} m`);assert(s.result?.levelCleared,JSON.stringify(s.result));assert.equal(s.terrain.events.filter(e=>e.level>0).length,0);assert.equal(s.atc.terrainFloorFt,0);assert(s.touchdown.offset<30);
});

test('a brief bank correction does not turn projected flat-ground contact into a terrain alarm',()=>{
 const s=correctingFinal(80,2000);s.roll=.2;s.yawRate=.03;assert(predictTerrain(s).landingCorridor);assert.equal(predictTerrain(s).level,0);
});

test('rolling out a modest lateral correction stays an approach alignment issue, not a terrain alarm',()=>{
 const s=correctingFinal(55,1430);s.y=2.8+90;s.roll=.054;
 setMotion(s,{speed:150/KT,verticalSpeed:-3.71,yaw:.17});assert(predictTerrain(s).landingCorridor);assert.equal(predictTerrain(s).level,0);
});
