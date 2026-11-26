// Numerical fixtures validate physical envelopes. Browser flight evidence uses
// UI controls separately; none of these fixture placements is an end-to-end flight.
import test from 'node:test';import assert from 'node:assert/strict';
import{createFlight,advanceFlight,stepFlaps,toggleGear,setMotion,targetSpeed,KT,FT,RAD}from'../src/flight.js';
import{trimAlpha,refreshAirData}from'../src/sim/aerodynamics.js';
import{setWeather}from'../src/sim/weather.js';
import{impactDamage,waterEntryQuality,beginWaterContact}from'../src/sim/water-contact.js';
import{takeHistoricalControl,selectHistoricalTarget,historicalPilotInput,historicalApproach,historicalCandidates,historicalScore,historyReferenceSpeed,historicalRunwayContactIssue}from'../src/history/us1549.js';
import{eventRunways,eventRunwayStrips,runwayAt}from'../src/history/event-world.js';
import{runwayKey,runwayGeometry}from'../src/history/navigation.js';
import{queueHistorical,updateHistoricalComms}from'../src/history/comms.js';
import{FlightRecording}from'../src/replay/flight-recording.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),start=()=>createFlight(null,{levelId:'history-us1549'}),pose=s=>[s.x,s.y,s.z,s.pitch,s.roll,s.yaw,...Object.values(s.velocity)];
const entry={ias:130/KT,waterSpeed:130/KT,sinkMps:1.5,pitch:9.5*RAD,roll:.4*RAD,beta:0,gearPosition:0,flapPosition:2,massTonnes:68.5,part:'belly-aft'};
test('water survival and high-score envelopes are tighter while the historical damaged reference remains survivable',()=>{
 const reference={...entry,ias:125/KT,waterSpeed:125/KT,sinkMps:3.8};assert(impactDamage(reference)>impactDamage(entry)&&impactDamage(reference)<1);
 for(const x of[{sinkMps:6},{roll:15*RAD},{waterSpeed:180/KT},{pitch:0},{pitch:16*RAD}])assert(impactDamage({...reference,...x})>=1,JSON.stringify(x));
 const score=e=>{const s=start();Object.assign(s.historical,{selected:[{node:'priority'}],assessments:[{airport:'LGA'}],handedOverAt:1,manualSeconds:50,energyError:0});s.water={firstImpact:e,damage:impactDamage(e),flooding:0};return Object.values(historicalScore(s)).reduce((a,b)=>a+b,0);};
 assert(score(entry)>=90);assert(score(reference)<90&&score(reference)>65);assert(score({...reference,ias:153/KT,waterSpeed:155/KT,pitch:6.5*RAD})<75);
 assert(waterEntryQuality({...entry,pitch:13.5*RAD}).total<.7);
 assert(waterEntryQuality({...entry,ias:160/KT}).speed<waterEntryQuality(entry).speed);
 const a={...reference,roll:4*RAD},b={...a,roll:4.1*RAD};assert(Math.abs(impactDamage(a)-impactDamage(b))<.01);
});
test('water-relative sideslip changes impact load independently of indicated airspeed',()=>{
 assert(impactDamage({...entry,waterBeta:12*RAD})>impactDamage({...entry,waterBeta:0}));assert(waterEntryQuality({...entry,waterBeta:12*RAD}).total<waterEntryQuality(entry).total);
});
test('power-off energy is dissipated by aerodynamic work rather than a scripted airspeed decay',()=>{
 const s=start();takeHistoricalControl(s,{early:true});setWeather(s,{...s.weather,wind:{speedKt:0,directionDeg:0,vertical:0}});setMotion(s,{speed:205/KT,verticalSpeed:0});s.pitch=trimAlpha(s);refreshAirData(s);
 const initial=s.airData.energy;let work=0,first,last;
 for(let n=0;n<3000;n++){work+=s.airData.drag*s.airData.tas*.01;advanceFlight(s,{},.01);if(n===2500)first=s.speed;last=s.speed;assert.equal(s.totalThrustN,0);}
 assert(s.y<850);assert(Math.abs(first-last)*KT<3,'Steady gliding speed is possible without thrust');assert(Math.abs((initial-s.airData.energy)-work)/work<.03);
});
test('flap and gear drag consume actual energy and the event polar does not alter normal training',()=>{
 const normal=createFlight(null,{levelId:'ils-approach'});assert(!normal.aerodynamics);
 const a=start();takeHistoricalControl(a,{early:true});a.y=1800;setMotion(a,{speed:195/KT,verticalSpeed:-5});a.pitch=trimAlpha(a)+a.airData.gamma;const b=structuredClone(a);stepFlaps(b);stepFlaps(b);toggleGear(b);
 for(let n=0;n<2000;n++){advanceFlight(a,{},.01);advanceFlight(b,{},.01);}
 assert(b.speed<a.speed-10/KT);assert(b.airData.energy<a.airData.energy);assert.equal(b.totalThrustN,0);
 const c=start();c.flapPosition=2;assert(historyReferenceSpeed(c,{approach:true})<150);takeHistoricalControl(c,{early:true});selectHistoricalTarget(c,'river');c.y=150;assert.equal(targetSpeed(c),historyReferenceSpeed(c,{approach:true}));c.historical.manualTarget='river';c.y=20;assert(historyReferenceSpeed(c,{approach:true})<135);
});
test('six runway directions share three physical strips and contact follows actual travel direction',()=>{
 assert.equal(eventRunways.length,6);assert.equal(eventRunwayStrips.length,3);
 for(const r of eventRunways){const x=(r.a.x+r.b.x)/2,z=(r.a.z+r.b.z)/2,hit=runwayAt(x,z,r.heading);assert.equal(hit.airport,r.airport);assert.equal(hit.id,r.id);const opposite=eventRunways.find(q=>q.airport===r.airport&&q.id===r.opposite);assert(opposite);assert.deepEqual(opposite.a,r.b);}
});
test('navigation changes leave motion and practice qualification unchanged and cancel water-only crew instructions',()=>{
 const s=start();assert(!selectHistoricalTarget(s,'LGA-22'));takeHistoricalControl(s,{early:true});selectHistoricalTarget(s,'river');queueHistorical(s,'hudson');const before=pose(s);
 assert(selectHistoricalTarget(s,'LGA-22'));assert.deepEqual(pose(s),before);assert(s.mission.practice&&s.historical.earlyTakeover);assert(!s.autoPilot);updateHistoricalComms(s,.01);assert(!s.radio.pending.some(l=>l.historyEvent==='hudson'));assert(!selectHistoricalTarget(s,'LGA-99'));
 const recorder=new FlightRecording();recorder.observe(s);advanceFlight(s,{},.05);recorder.observe(s);const decoded=recorder.sample(0,s.time);assert.equal(decoded.historical.manualTarget,'LGA-22');
});
test('touchdown and controlled braking work at both ends of each strip and preserve the actual landing evidence',()=>{
 for(const r of eventRunways){const s=start();takeHistoricalControl(s,{early:true});selectHistoricalTarget(s,runwayKey(r));const f={x:Math.sin(r.heading),z:-Math.cos(r.heading)};
  Object.assign(s,{x:r.a.x+f.x*300,z:r.a.z+f.z*300,y:r.elevationM+3.4,pitch:6.5*RAD,roll:0,gear:true,gearPosition:1,flaps:3,flapPosition:3});setMotion(s,{speed:135/KT,verticalSpeed:-1.5,yaw:r.heading});
  let touchdown;
  for(let n=0;n<5000&&!s.result;n++){const g=runwayGeometry(s,r);advanceFlight(s,{brake:true,steer:clamp(-g.cross*.04-Math.atan2(Math.sin(s.yaw-r.heading),Math.cos(s.yaw-r.heading))*4-s.yawRate*3,-1,1)},.01);if(s.historical.alternate&&!touchdown)touchdown=structuredClone(s.historical.alternate.touchdown);}
  assert(s.result?.physicalSuccess,runwayKey(r)+': '+JSON.stringify(s.result));assert(!s.result.levelCleared&&!s.water);assert.equal(s.historical.alternate.runway,r.id);assert.deepEqual(s.historical.alternate.touchdown,touchdown);assert(touchdown.ias*KT>125&&touchdown.sinkMps>0);
 }
});
function returnFlight(delay=0){
 const s=start();for(let n=0;n<delay*100&&!s.result;n++)advanceFlight(s,{},.01);takeHistoricalControl(s,{early:true});selectHistoricalTarget(s,'LGA-22');const r=eventRunways.find(r=>runwayKey(r)==='LGA-22');
 for(let n=0;n<26000&&!s.result;n++){const g=runwayGeometry(s,r),height=s.y-r.elevationM;
  if(g.distance<3500&&g.along<0){if(!s.gear)toggleGear(s);if(s.flaps<2&&s.speed*KT<(s.flaps?199:229))stepFlaps(s);}
  let input=historicalPilotInput(s,{approach:historicalApproach(s)});
  if(height<18&&g.along<r.length&&Math.abs(g.cross)<100){const sink=-Math.max(.7,Math.min(2,height*.15)),pitch=Math.min(.20,trimAlpha(s)+Math.atan2(sink,s.airData.horizontal)+(sink-s.verticalSpeed)*.008);input.pitch=clamp((pitch-s.pitch)*3.2-s.pitchRate*2,-1,1);}
  if(s.historical.alternate)input={brake:true,steer:clamp(-g.cross*.04-Math.atan2(Math.sin(s.yaw-r.heading),Math.cos(s.yaw-r.heading))*4-s.yawRate*3,-1,1)};
  const before={x:s.x,y:s.y,z:s.z};advanceFlight(s,input,.01);assert(Math.hypot(s.x-before.x,s.y-before.y,s.z-before.z)<2);assert.equal(s.totalThrustN,0);
 }return s;
}
test('a control-only immediate return can stop on LGA 22 while a delayed attempt loses its margin',()=>{
 const a=returnFlight(),b=returnFlight(35);assert(a.result?.physicalSuccess,JSON.stringify(a.result));assert.equal(a.historical.alternate.runway,'22');assert(!a.result.levelCleared&&a.mission.practice);assert(b.result&&!b.result.physicalSuccess);
 const initial=start();const c=historicalCandidates(initial).find(c=>c.runway==='22'&&c.airport==='LGA');assert(c.margin> -100);for(let n=0;n<3500;n++)advanceFlight(initial,{},.01);assert(historicalCandidates(initial).find(c=>c.runway==='22'&&c.airport==='LGA').margin<c.margin);
});

test('water support clears airborne-only stall and terrain alerts without altering collision evidence',()=>{
 const s=start();Object.assign(s.stallWarning,{active:true,level:2});s.terrain.level=2;s.y=2.5;s.pitch=9.5*RAD;s.roll=0;setMotion(s,{speed:125/KT,verticalSpeed:-3.8});const before=pose(s);
 beginWaterContact(s,{time:s.time,x:s.x,y:s.y,z:s.z,part:'belly-aft',point:{x:s.x,y:0,z:s.z}});assert(!s.stallWarning.active&&s.terrain.level===0);assert.deepEqual(pose(s),before);assert(s.water.firstImpact.sinkMps>3);
});

test('runway failures explain the actual contact instead of treating a recognized runway as ordinary ground',()=>{
 const s=start(),r=eventRunways.find(r=>runwayKey(r)==='LGA-22'),hit={airport:'LGA',runway:'22',part:'main-0'};
 Object.assign(s,{gearPosition:1,roll:0,pitch:8*RAD});setMotion(s,{speed:135/KT,verticalSpeed:-2,yaw:r.heading});assert.equal(historicalRunwayContactIssue(s,hit),null);s.verticalSpeed=-4.65;assert.equal(historicalRunwayContactIssue(s,hit),'备降接地过重');s.verticalSpeed=-2;s.gearPosition=.7;assert.equal(historicalRunwayContactIssue(s,hit),'备降起落架未到位');
});
