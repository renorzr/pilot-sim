import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,advanceFlight,setDetent,toggleGear,toggleAP,restoreCheckpoint,setEngineStatus,FT,KT} from '../src/flight.js';
import {AIRLINE_ROUTES} from '../src/missions/catalog.js';
import {canSkipCruise,canAutoSkipCruise,arrivalPreview} from '../src/missions/airline.js';
import {airlineTarget,advanceAirlineNavigation} from '../src/missions/airline-navigation.js';
import {advanceAtRate} from '../src/sim/time-acceleration.js';
import {runwayOf} from '../src/airports/registry.js';
import {wrap,RAD} from '../src/sim/constants.js';
import {groundPilot} from './ground-pilot.mjs';
import {setRadioLanguage} from '../src/comms/radio.js';
import {pilotInput} from './pilot.mjs';

// Actual takeoff/CL/gear/AP controls; deliberately never uses the early-cut button.
function departurePilot(s,{keepGear=false}={}){
 const ground=groundPilot(s,{skip:true});if(ground)return ground;
 if(!s.airborne){setDetent(s,'TOGA');return{pitch:s.speed*KT>=125&&s.pitch<.2?1:0};}
 if(!keepGear&&s.gear&&s.verticalSpeed>.5)toggleGear(s);
 const altitude=(s.y-runwayOf(s).ground)*FT;
 if(altitude>500&&s.throttle>.845)setDetent(s,'CL');
 if(altitude>200&&!s.autoPilot)toggleAP(s);
 return{};
}
function until(s,predicate,options={},maxSeconds=1500){
 for(let i=0;i<maxSeconds*50&&!predicate(s)&&!s.result;i++)advanceFlight(s,departurePilot(s,options),.02);
 assert(predicate(s),JSON.stringify({airport:s.airportId,time:s.time,result:s.result,nav:s.airline.navigation}));return s;
}
function cutAlong(s){const n=s.airline.departureRouteEvidence,p=s.airline.departureCut,b=n.points.at(-1),a=n.points.length>1?n.points.at(-2):n.origin,dx=b.x-a.x,dz=b.z-a.z;return((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz);}

for(const route of AIRLINE_ROUTES)test(`${route.id}: ordered physical departure automatically cuts only after the last waypoint`,()=>{
 const s=createFlight(null,{levelId:route.id});until(s,s=>s.airline.cruiseSkipped);
 assert.equal(s.airportId,route.destination);assert.equal(s.airline.cruiseSkipMode,'automatic');
 const n=s.airline.departureRouteEvidence;assert(n.endPassed);assert.deepEqual(n.visited,n.points.map((_,i)=>i));assert(cutAlong(s)>=1);
 assert.equal(n.captures.length,n.points.length);
 for(const capture of n.captures){const point=n.points[capture.index];assert(capture.speedKt<=n.speedLimit+5);if(point.minMSL!==undefined)assert(capture.altitudeMSL>=point.minMSL-30);if(point.maxMSL!==undefined)assert(capture.altitudeMSL<=point.maxMSL+30);}
 assert(s.airline.departureEvidence.heldShort&&s.airline.departureEvidence.lineupComplete&&s.airline.departureEvidence.takeoffCleared);
 assert(arrivalPreview(s)&&!s.result);assert.equal(s.levelId,route.id);assert.equal(s.gearPosition,0);assert.equal(s.flapPosition,0);
 assert(!s.autoPilot&&!s.apprArmed&&!s.landingChecklistConfirmed);assert.deepEqual(s.gates,[]);assert(!s.terrain.events.some(e=>e.level>0));
});

test('KIX–PKX: gear-down overflight continues outbound, then cuts after real retraction and stable recovery',()=>{
 const s=createFlight(null,{levelId:'kix-pkx'});until(s,canSkipCruise);toggleGear(s);
 until(s,s=>s.airline.navigation.endPassed,{keepGear:true});
 assert.equal(s.airportId,'kansai');assert(!canAutoSkipCruise(s));assert.deepEqual(s.airline.navigation.visited,s.airline.navigation.points.map((_,i)=>i));
 assert.equal(s.airline.stableSeconds,0);
 const course=(s.airline.navigation.course-runwayOf(s).heading)*RAD,end=s.time+25;
 while(s.time<end&&!s.result){advanceFlight(s,departurePilot(s,{keepGear:true}),.02);assert.equal(s.airportId,'kansai');assert(Math.abs(wrap(airlineTarget(s).track-course))<5*RAD);}
 assert(!s.result);assert(Math.abs(wrap(s.airData.groundTrack-course))<5*RAD);assert(Math.abs(s.roll)<10*RAD);assert(airlineTarget(s).along>1.08);
 toggleGear(s);const retractionStarted=s.time;
 until(s,s=>s.airline.cruiseSkipped);assert(s.airline.departureCut.time>retractionStarted+6);assert(s.airline.departureCut.time>s.airline.departureRouteEvidence.endPassedAt+25);
 assert.equal(s.airline.cruiseSkipMode,'automatic');assert(cutAlong(s)>1.08);
});

test('an added initial-departure point preserves ordered capture and cannot cut early',()=>{
 const s=createFlight(null,{levelId:'kix-pkx'}),n=s.airline.navigation,a=n.points.at(-2),b=n.points.at(-1);
 n.points.splice(n.points.length-1,0,{kind:'fix',x:(a.x+b.x)/2,z:(a.z+b.z)/2,alt:n.altitude,name:'中间离场航点'});
 let second=false;
 for(let i=0;i<75000&&!s.result&&!s.airline.cruiseSkipped;i++){
  advanceFlight(s,departurePilot(s),.02);
  if(!s.airline.cruiseSkipped&&n.index===n.points.length-1){second=true;assert.deepEqual(n.visited,n.points.slice(0,-1).map((_,i)=>i));assert(!canAutoSkipCruise(s));}
 }
 assert(second&&s.airline.cruiseSkipped);assert.deepEqual(s.airline.departureRouteEvidence.visited,n.points.map((_,i)=>i));assert(cutAlong(s)>=1);
});

test('an engine failure prevents a terminal overflight from triggering the normal automatic cut',()=>{
 const s=createFlight(null,{levelId:'kix-pkx'});until(s,s=>canSkipCruise(s));setEngineStatus(s,0,'failed');
 until(s,s=>s.airline.navigation.endPassed);assert(!canAutoSkipCruise(s));assert.equal(s.airportId,'kansai');
 for(let i=0;i<250;i++)advanceFlight(s,departurePilot(s),.02);
 assert(!s.airline.cruiseSkipped);assert.equal(s.engines[0].status,'failed');
});

test('automatic cut preserves language, mass, health and practice checkpoints while keeping arrival clean',()=>{
 let s=createFlight(null,{levelId:'kix-pkx'});setRadioLanguage(s,'en');s.engines[0].health=.8;s.systems.ils.localizer=false;
 until(s,s=>s.airline.navigation.endPassed,{keepGear:true});s=restoreCheckpoint(s);assert(s.mission.practice);
 toggleGear(s);
 const mass=s.weight;until(s,s=>s.airline.cruiseSkipped);
 assert.equal(s.weight,mass);assert.equal(s.engines[0].health,.8);assert.equal(s.radio.language,'en');assert(s.mission.practice);
 assert(!s.systems.ils.localizer);
 assert(!s.autoPilot&&!s.apprArmed&&!s.gear&&s.flapPosition===0&&!s.landingChecklistConfirmed);assert.equal(s.gates.length,0);
 const entry={x:s.x,y:s.y,z:s.z};advanceFlight(s,{pitch:1,steer:1,throttle:1},.02);assert.deepEqual({x:s.x,y:s.y,z:s.z},entry);
});

test('an automatic KIX–PKX cut continues through genuine destination gates, landing and parking',()=>{
 const s=createFlight(null,{levelId:'kix-pkx'});until(s,s=>s.airline.cruiseSkipped);
 for(let i=0;i<100000&&!s.result;i++)advanceFlight(s,pilotInput(s),.02);
 assert(s.result?.levelCleared,JSON.stringify(s.result));assert.equal(s.airline.cruiseSkipMode,'automatic');
 assert(s.landed&&s.gates.length===2&&s.gates.every(g=>g.passed&&!g.preset));assert.equal(s.ground.stage,'parked');
});

test('4x crossing discards the remaining frame and starts destination preview at its initial time',()=>{
 const s=createFlight(null,{levelId:'kix-pkx'});until(s,s=>s.airline.navigation.index===s.airline.navigation.points.length-1&&canSkipCruise(s)&&airlineTarget(s).along>.997);
 assert(!s.airline.cruiseSkipped);advanceAtRate(s,{},.5,4);
 assert(s.airline.cruiseSkipped);assert.equal(s.airline.cruiseSkipMode,'automatic');assert.equal(s.time,s.airline.previewStarted);assert.equal(s.clock.accumulator,0);
});

// Isolated geometry/capture fixtures: these do not manufacture completed flights.
function geometryFixture(){const s=createFlight(null,{levelId:'kix-pkx'});s.airborne=true;s.y=runwayOf(s).ground+3000/FT;s.airData.groundTrack=0;return s;}
function sample(s,x,z,seconds=2.1){s.x=x;s.z=z;return advanceAirlineNavigation(s,seconds);}
test('shortcuts, proximity alone and missing ordered evidence cannot pass the departure terminal',()=>{
 const s=geometryFixture(),n=s.airline.navigation,end=n.points.at(-1);
 sample(s,end.x,end.z);assert.equal(n.index,0);assert.deepEqual(n.visited,[]);assert(!n.endPassed&&!canAutoSkipCruise(s));
 n.index=n.points.length-1;n.legIndex=n.index;n.legEstablished=true;n.previousAlong=.999;s.airData.groundTrack=airlineTarget(s).track;
 sample(s,end.x,end.z);assert(!n.endPassed);assert.deepEqual(n.visited,[]);
 n.visited=n.points.slice(0,-1).map((_,i)=>i);n.previousAlong=.99;const a=n.points.at(-2);
 sample(s,a.x+(end.x-a.x)*.999,a.z+(end.z-a.z)*.999);assert(!n.endPassed);
 sample(s,a.x+(end.x-a.x)*1.001,a.z+(end.z-a.z)*1.001);assert(n.endPassed);assert.deepEqual(n.visited,n.points.map((_,i)=>i));
});
test('Kansai altitude termination waits for 500 ft MSL and the runway end, then records its observed position',()=>{
 const s=geometryFixture(),n=s.airline.navigation;s.y=runwayOf(s).ground+(400-n.elevationFt)/FT;
 sample(s,0,-4200);sample(s,0,-4600);assert.equal(n.index,0);assert(!n.legPassed);assert(Math.abs(airlineTarget(s).track)<.02);
 s.y=runwayOf(s).ground+(501-n.elevationFt)/FT;sample(s,0,-3000);assert.equal(n.index,0);
 sample(s,0,-4700);assert.equal(n.index,1);assert.deepEqual(n.visited,[0]);assert.equal(n.points[0].z,-4700);assert(Math.abs(n.captures[0].altitudeMSL-501)<1e-8);
});
