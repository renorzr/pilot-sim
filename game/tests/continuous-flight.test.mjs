import test from'node:test';import assert from'node:assert/strict';import * as THREE from'three';
import{createFlight,advanceFlight,skipCruise,FT,KT}from'../src/flight.js';
import{refreshAirData}from'../src/sim/aerodynamics.js';
import{sampleWeather}from'../src/sim/weather.js';
import{airportOf,runwayOf}from'../src/airports/registry.js';
import{canSkipCruise}from'../src/missions/airline.js';
import{geoDistance,geoBearing,geoMove,geoTrack,rotateFlightVector}from'../src/missions/route-geography.js';
import{startContinuousRoute,observeContinuousMotion,rebaseContinuousArrival}from'../src/missions/continuous-route.js';
import{arrivalNavigation}from'../src/missions/airline-navigation.js';
import{createCruiseTransition,advanceCruiseTransition,commitCruiseTransition}from'../src/views/cruise-transition.js';
import{FlightCameraRig}from'../src/views/camera-rig.js';
import{createViewState}from'../src/views/view-state.js';
import{FlightRecording}from'../src/replay/flight-recording.js';
import{terrainConfig,surfaceHeight}from'../src/terrain/heightfield.js';
import{createRadio,queueRadio,updateRadio}from'../src/comms/radio.js';
import{pilotInput}from'./pilot.mjs';
const fly=(s,predicate,max=9000)=>{for(let i=0;i<max*50&&!predicate(s)&&!s.result;i++)advanceFlight(s,pilotInput(s,{skip:false}),.02);assert(predicate(s),JSON.stringify({result:s.result,time:s.time,phase:s.airline.phase,nav:s.airline.navigation}));return s;};
for(const id of['lga-jfk','jfk-lga','pkx-hgh'])test(id+': physical takeoff, uninterrupted flight, genuine approach gates, landing and parking require no cruise skip',()=>{
 const s=createFlight(null,{levelId:id});fly(s,s=>!!s.result);assert(s.result.levelCleared,JSON.stringify(s.result));assert.equal(s.airline.cruiseSkipped,false);assert.equal(s.airline.arrivalMode,'continuous');assert(s.airline.departureRouteEvidence.endPassed);assert.equal(s.gates.length,2);assert(s.gates.every(g=>g.passed&&!g.preset));assert.equal(s.ground.stage,'parked');assert(s.airline.landingEvidence.valid);assert(!s.terrain.events.some(e=>e.level>0));
 if(s.airline.profile.short){assert(!s.radio.fired['cruise-climb']);assert(s.maxAltitude*FT<6000);}else{assert(s.radio.fired['cruise-climb']);assert(s.maxAltitude*FT>32000);assert(s.airline.enrouteEvidence.travelled>900000);}
});
test('an en-route player-requested skip uses remaining distance and preserves actual departures, mass, health and the selected cast',()=>{
 const s=fly(createFlight(null,{levelId:'pkx-hgh'}),s=>s.airline.navigation.kind==='enroute');fly(s,s=>s.airline.navigation.travelled>50000&&canSkipCruise(s));const before={weight:s.weight,health:s.engines.map(e=>e.health),pilot:s.radio.pilotVoice,departure:structuredClone(s.airline.departureRouteEvidence)},p=createCruiseTransition(s);assert(p);assert(p.radio.pending.every(l=>l.event!=='cruise-climb'));for(let i=0;i<1000&&(p.phase!=='black'||p.radio.active||p.radio.pending.length||p.source.time+p.elapsed<p.radio.readyAt);i++)advanceCruiseTransition(p,.1);assert(commitCruiseTransition(p,s));assert(s.airline.skippedCruiseSeconds<s.airline.distanceKm/830*3600);assert.equal(s.airline.arrivalMode,'skipped');assert.equal(s.weight,before.weight);assert.deepEqual(s.engines.map(e=>e.health),before.health);assert.equal(s.radio.pilotVoice,before.pilot);assert.deepEqual(s.airline.departureRouteEvidence,before.departure);
});
test('short skip dialogue uses terminal routing phrases and contains no FL330 clearance',()=>{
 const s=fly(createFlight(null,{levelId:'lga-jfk'}),canSkipCruise,1200),p=createCruiseTransition(s);assert(p);const lines=[p.radio.active,...p.radio.pending].filter(Boolean);assert(lines.length>=2);assert(lines.every(l=>l.event==='enroute-continue'&&!/三万|three three zero/.test(l.text)));
});
test('arrival waits for accepted scenery readiness without teleporting or silently skipping',()=>{
 const s=createFlight(null,{levelId:'lga-jfk'});for(let i=0;i<1200*50&&!s.airline.waitingForArrival&&!s.result;i++)advanceFlight(s,pilotInput(s,{skip:false}),.02,{canEnterArrival:()=>false});assert(s.airline.waitingForArrival);assert.equal(s.airportId,'lga');const before={x:s.x,y:s.y,z:s.z,time:s.time};for(let i=0;i<300*50&&!s.result;i++)advanceFlight(s,pilotInput(s,{skip:false}),.02,{canEnterArrival:()=>false});assert(!s.result,JSON.stringify(s.result));assert(s.airline.navigation.holding);assert(s.time>before.time&&Math.hypot(s.x-before.x,s.z-before.z)>50);assert(!s.airline.cruiseSkipped);advanceFlight(s,pilotInput(s,{skip:false}),.02,{canEnterArrival:()=>true});assert.equal(s.airportId,'jfk');assert.equal(s.airline.arrivalMode,'continuous');
});
test('spherical navigation crosses the date line by the short route and observed displacement cannot grant free distance',()=>{
 const a={longitude:179.9,latitude:35},b=geoMove(a,90,40000);assert(b.longitude<0);assert(Math.abs(geoDistance(a,b)-40000)<1e-5);assert(geoBearing(a,b)>89&&geoBearing(a,b)<91);const mid=geoMove(a,geoBearing(a,b),20000),track=geoTrack(a,b,mid);assert(Math.abs(track.cross)<.01);assert(Math.abs(track.along-20000)<.01);
 const s=createFlight(null,{levelId:'lax-kix'});startContinuousRoute(s,arrivalNavigation('lax','kansai'));s.airline.navigation.geo={...a};const p={x:s.x,y:s.y,z:s.z};observeContinuousMotion(s,p);assert.deepEqual(s.airline.navigation.geo,a);s.x+=100;observeContinuousMotion(s,p);assert(Math.abs(geoDistance(a,s.airline.navigation.geo)-100)<1e-4);assert(Math.abs(s.airline.navigation.travelled-100)<1e-8);
});
// Isolated frame/camera fixtures below, not evidence of completed flights.
test('runway-frame handoff preserves geography, MSL, velocity, airspeed, attitude, physical controls, time and failures',()=>{
 const s=createFlight(null,{levelId:'lga-jfk'});s.airborne=true;s.x=12000;s.z=-18000;s.y=runwayOf(s).ground+5000/FT;s.yaw=.74;s.pitch=.05;s.roll=.08;s.velocity={x:80,y:-.7,z:-65};s.engines[0].health=.7;s.systems.ils.glideSlope=false;refreshAirData(s);const ap=airportOf(s),geo=ap.unproject(s.x,s.z),msl=s.y+ap.elevationM,old=structuredClone(s),wind=sampleWeather(s.weather,s,s.time).wind;rebaseContinuousArrival(s);refreshAirData(s);const now=airportOf(s).unproject(s.x,s.z);assert(geoDistance(geo,now)<.001);assert(Math.abs(s.y+airportOf(s).elevationM-msl)<1e-9);assert(Math.abs(Math.hypot(...Object.values(old.velocity))-Math.hypot(...Object.values(s.velocity)))<1e-9);assert(Math.abs(s.speed-old.speed)<1e-8);assert.equal(s.pitch,old.pitch);assert.equal(s.roll,old.roll);assert.equal(s.time,old.time);assert.deepEqual(s.engines,old.engines);assert.deepEqual(s.controls,old.controls);assert.deepEqual(s.systems,old.systems);const transformed=rotateFlightVector(wind,s.airline.frameHandoff.angle),actual=sampleWeather(s.weather,s,s.time).wind;assert(Math.hypot(transformed.x-actual.x,transformed.y-actual.y,transformed.z-actual.z)<1e-9);
});
test('exterior camera is transformed into the new frame rather than restarted',()=>{
 const s=createFlight(null,{levelId:'lga-jfk'});s.x=12000;s.z=-18000;s.y=1500;s.airborne=true;const view=createViewState('exterior'),old=new FlightCameraRig(new THREE.PerspectiveCamera(43,1.6,.7,90000),{heightAt:()=>0});old.update(s,view,.016);const pose=old.relativePose();rebaseContinuousArrival(s);const rig=new FlightCameraRig(new THREE.PerspectiveCamera(43,1.6,.7,90000),{heightAt:()=>0});rig.seedRelative(pose,s,s.airline.frameHandoff.angle,view);const expected=rotateFlightVector(pose.offset,s.airline.frameHandoff.angle);assert(rig.camera.position.distanceTo(new THREE.Vector3(s.x+expected.x,s.y+expected.y,s.z+expected.z))<1e-9);const before=rig.camera.position.clone();rig.update(s,view,0);assert(rig.camera.position.distanceTo(before)<1e-8);
});
test('controller handoff preserves the speaker of in-flight transmissions and gives new lines the destination controller',()=>{
 const s={time:0,airline:{},radio:createRadio({pilotVoice:'h',towerVoice:'e'})};queueRadio(s,'cruise-ready');updateRadio(s);assert.equal(s.radio.active.speakerVoice,'e');s.radio.towerVoice='j';queueRadio(s,'destination-established');assert.equal(s.radio.active.speakerVoice,'e');assert(s.radio.pending.filter(l=>l.event==='destination-established'&&l.role==='tower').every(l=>l.speakerVoice==='j'));
});
test('full-flight recording retains continuous geography across the date line without changing old trajectory strides',()=>{
 const s=createFlight(null,{levelId:'lax-kix'}),r=new FlightRecording();s.time=1;s.airline.continuous=true;s.airline.phase='enroute';s.airline.navigation={kind:'enroute',geo:{longitude:179.9,latitude:35}};r.observe(s);s.time=1.1;s.airline.navigation.geo.longitude=180.1;r.observe(s);const mid=r.sample(0,1.05);assert.equal(mid.airline.navigation.kind,'enroute');assert(Math.abs(mid.airline.navigation.geo.longitude-180)<1e-9);assert(mid.airline.continuous);assert(r.stats().bytes>=r.segments[0].chunks[0].route.byteLength);
});
test('far continuous scenery and contact heights share the same sea-level fallback',()=>{
 const s=createFlight(null,{levelId:'pkx-hgh'}),t=terrainConfig(s);s.airline.continuous=true;s.x=t.width+10000;s.z=0;assert.equal(surfaceHeight(s.x,s.z,s),-airportOf(s).elevationM);
});
