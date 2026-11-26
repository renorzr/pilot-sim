import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORTS,airportOf} from '../src/airports/registry.js';
import {createFlight,FT} from '../src/flight.js';
import {departureNavigation,airlineTarget,advanceAirlineNavigation,departureTurnLead,departureConstraintText,departureInstruction,airportAltitude} from '../src/missions/airline-navigation.js';
import {initialDeparture} from '../src/missions/departure-procedures.js';
import {computeGuidance} from '../src/sim/guidance.js';
import {t} from '../src/i18n/index.js';

// These are isolated navigation samples, not evidence of completed flights.
function airborne(level){const s=createFlight(null,{levelId:level});s.airborne=true;return s;}
function msl(s,feet){s.y=2.8+(feet-airportOf(s).elevationM*FT)/FT;}
function active(s,index){const n=s.airline.navigation;n.index=index;n.legIndex=index;n.visited=n.points.slice(0,index).map((_,i)=>i);n.legEstablished=true;n.previousAlong=.99;return n;}
function cross(s,n,fraction){const b=n.points[n.index],a=n.index?n.points[n.index-1]:n.origin;s.x=a.x+(b.x-a.x)*fraction;s.z=a.z+(b.z-a.z)*fraction;s.airData.groundTrack=Math.atan2(b.x-a.x,a.z-b.z);return advanceAirlineNavigation(s,.02);}

test('DOCKR uses the FAA 2611 coordinate, beyond the LAX 25R runway end rather than the former 4.5 km point',()=>{
 const a=airportOf('lax'),n=departureNavigation('lax','daxing'),p=n.points.find(p=>p.id==='DOCKR'),geo=a.unproject(p.x,p.z);
 assert(Math.abs(geo.latitude-33.931844444444444)<1e-10);assert(Math.abs(geo.longitude+118.45810277777778)<1e-10);
 assert(-p.z-a.runway.length>3300&&-p.z-a.runway.length<3400);assert(-p.z-4500>2700);
 assert.equal(p.maxMSL,3000);assert(p.flyOver);assert.equal(n.points[0].altitudeMSL,640);assert.equal(n.points[2].headingMag,236);assert(n.points[2].simulated);
 assert(Math.abs(n.points[0].alt+n.elevationFt-3000)<1e-8);
});
test('Daxing follows AD450 and AD451 before a bounded initial-leg handoff, never inventing an official fix at the handoff',()=>{
 for(const destination of ['xiaoshan','changi','kansai']){const n=departureNavigation('daxing',destination);assert.deepEqual(n.points.slice(0,2).map(p=>p.id),['AD450','AD451']);assert(-n.points[1].z>19700);const b=n.points.at(-1),a=n.points.at(-2);assert(b.kind==='handoff'&&b.simulated&&!b.id);assert(Math.abs(Math.hypot(b.x-a.x,b.z-a.z)-6000)<.001);assert(b.targetFix.id.startsWith('AD'));}
});
test('airport prefixes retain their distinct charted gates and fly-over requirements',()=>{
 const sin=departureNavigation('changi','daxing'),hgh=departureNavigation('xiaoshan','daxing'),kix=departureNavigation('kansai','daxing'),jfk=departureNavigation('jfk','daxing');
 assert.deepEqual(sin.points.map(p=>p.id),['MOLVO','ATRUM']);assert(sin.points[0].z< -18000&&sin.points[0].minMSL===2000);assert.equal(sin.speedLimit,230);
 assert(Math.abs(hgh.points[0].altitudeMSL-150/.3048)<1e-8);assert.equal(hgh.points[1].id,'HC503');assert.equal(hgh.points[1].turn,'right');
 assert.equal(kix.points[0].altitudeMSL,500);assert(kix.points.find(p=>p.id==='B6R10').flyOver);assert.equal(kix.points.at(-1).minMSL,2500);
 assert(jfk.points.every(p=>p.simulated&&!p.id));assert.equal(jfk.points[0].headingMag,224);assert(Math.abs(jfk.altitude+jfk.elevationFt-5000)<1e-8);
});
test('altitude termination uses MSL, forbids a pre-DER turn and stores the actual termination instead of a guessed position',()=>{
 const s=airborne('hgh-pkx'),n=s.airline.navigation,p=n.points[0],initial={x:p.x,z:p.z};msl(s,550);s.x=0;s.z=-3000;s.yaw=0;
 advanceAirlineNavigation(s,3);assert.equal(n.index,0);
 msl(s,450);s.z=-5000;advanceAirlineNavigation(s,3);assert.equal(n.index,0);
 msl(s,550);advanceAirlineNavigation(s,3);assert.equal(n.index,1);assert.equal(p.z,-5000);assert(p.observed);assert.notDeepEqual({x:p.x,z:p.z},initial);assert.equal(n.captures[0].altitudeMSL,550);
});
test('a crossing below a published minimum fails at that crossing and cannot be retroactively fixed by climbing later',()=>{
 const s=airborne('sin-pkx'),n=active(s,0);msl(s,1600);cross(s,n,.999);cross(s,n,1.001);
 assert.equal(s.result?.title,'未满足离场过点限制');assert.equal(n.index,0);assert.deepEqual(n.visited,[]);assert(n.restrictionMissed);
 msl(s,2500);cross(s,n,1.05);assert.equal(n.index,0);assert.deepEqual(n.visited,[]);assert.equal(n.captures.length,0);
});
test('DOCKR fly-over does not anticipate the turn; an overheight crossing does not count as a compliant visit',()=>{
 const s=airborne('lax-pkx'),n=active(s,1);msl(s,3400);assert.equal(departureTurnLead(s,n),0);
 cross(s,n,.97);assert.equal(n.index,1);assert(!s.result);cross(s,n,1.001);assert.equal(s.result?.title,'未满足离场过点限制');assert.deepEqual(n.visited,[0]);
});
test('fly-by anticipation responds to actual speed and stays bounded by both adjacent legs',()=>{
 const s=airborne('sin-pkx'),n=s.airline.navigation;s.airData.groundSpeed=50;const slow=departureTurnLead(s,n);s.airData.groundSpeed=100;const fast=departureTurnLead(s,n);assert(fast>slow*2&&fast<2500);
});
test('published HDG commands remain headings in crosswind; fix tracking uses wind correction',()=>{
 const s=airborne('lax-pkx');msl(s,500);s.airData.horizontal=95;s.airData.wind={x:15,y:0,z:0};s.yaw=airlineTarget(s).track;computeGuidance(s,()=>0);assert(Math.abs(s.guidance.roll)<1e-8);
 const n=active(s,1);s.x=0;s.z=-5000;s.yaw=airlineTarget(s).track;computeGuidance(s,()=>0);assert(Math.abs(s.guidance.roll)>.1);assert(!airlineTarget(s).headingMode);assert(airportAltitude(s)>499);
});
test('all new procedure names, restrictions and live instructions have bilingual coverage',()=>{
 for(const a of AIRPORTS){const profile=initialDeparture(a,200),n=departureNavigation(a.id,a.id==='daxing'?'changi':'daxing');for(const value of [profile.name,...n.points.map(p=>p.name),...n.points.map(departureConstraintText)])assert(!/\p{Script=Han}/u.test(t(value,'en')),value);}
 for(const level of ['hgh-pkx','pkx-sin','sin-pkx','kix-pkx','kix-sin','lax-pkx','jfk-pkx']){const s=airborne(level);for(let i=0;i<s.airline.navigation.points.length;i++){s.airline.navigation.index=i;const text=departureInstruction(s);assert(!/\p{Script=Han}/u.test(t(text,'en')),text);}}
});
