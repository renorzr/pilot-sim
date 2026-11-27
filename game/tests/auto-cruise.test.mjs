import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,advanceFlight,skipCruise,setEngineStatus,FT} from '../src/flight.js';
import {AIRLINE_ROUTES} from '../src/missions/catalog.js';
import {canSkipCruise,canAutoSkipCruise} from '../src/missions/airline.js';
import {airlineTarget,advanceAirlineNavigation} from '../src/missions/airline-navigation.js';
import {runwayOf} from '../src/airports/registry.js';
import {pilotInput} from './pilot.mjs';

// Regression for the former automatic skip: normal navigation now continues.
for(const route of AIRLINE_ROUTES)test(`${route.id}: physical departure continues without an automatic cut`,()=>{
 const s=createFlight(null,{levelId:route.id});let automaticRequests=0;
 for(let i=0;i<1500*50&&!s.airline.continuous&&!s.result;i++)advanceFlight(s,pilotInput(s,{skip:false}),.02,{onCruiseSkip:()=>{automaticRequests++;return true;}});
 assert(s.airline.continuous,JSON.stringify({result:s.result,nav:s.airline.navigation}));assert(!s.airline.cruiseSkipped);assert.equal(automaticRequests,0);assert.equal(canAutoSkipCruise(s),false);
 const n=s.airline.departureRouteEvidence;assert(n.endPassed);assert.deepEqual(n.visited,n.points.map((_,i)=>i));assert.equal(n.captures.length,n.points.length);assert(s.airline.departureEvidence.takeoffCleared);
 if(s.airline.profile.short){assert.equal(s.airportId,route.destination);assert.equal(s.airline.arrivalMode,'continuous');assert(!s.radio.fired['cruise-climb']);}
 else{assert.equal(s.airportId,route.origin);assert.equal(s.airline.navigation.kind,'enroute');assert(s.radio.fired['cruise-climb']);}
 assert(!s.result);assert(!s.terrain.events.some(e=>e.level>0));
});
test('a player can still choose an early skip, while automatic requests and failed-engine skips are rejected',()=>{
 const s=createFlight(null,{levelId:'kix-pkx'});for(let i=0;i<75000&&!canSkipCruise(s)&&!s.result;i++)advanceFlight(s,pilotInput(s,{skip:false}),.02);assert(canSkipCruise(s));
 const copy=structuredClone(s),before={x:s.x,y:s.y,z:s.z,time:s.time};assert(!skipCruise(s,{automatic:true}));assert.deepEqual({x:s.x,y:s.y,z:s.z,time:s.time},before);setEngineStatus(s,0,'failed');assert(!canSkipCruise(s));assert(!skipCruise(s));assert.equal(s.engines[0].status,'failed');
 assert(skipCruise(copy));assert.equal(copy.airline.cruiseSkipMode,'manual');assert.equal(copy.airline.arrivalMode,'skipped');assert.equal(copy.airportId,'daxing');
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
