import test from 'node:test';import assert from 'node:assert/strict';import {stat}from'node:fs/promises';import * as THREE from'three';
import {createFlight,advanceFlight,advanceSimulation,skipCruise,restoreCheckpoint,beginGoAround,setEngineStatus,FT}from'../src/flight.js';
import {AIRPORTS,XIAOSHAN,DAXING,airportOf}from'../src/airports/registry.js';
import {vertexHeight,terrainHeight,terrainConfig}from'../src/terrain/heightfield.js';
import {departureOf,groundActive,skipTaxi,skipAirportIntro}from'../src/missions/ground.js';
import {canSkipCruise,arrivalPreview,routeDistance}from'../src/missions/airline.js';
import {AIRLINE_ROUTES,AIRPORT_MISSIONS,LEVELS,nextLevel}from'../src/missions/catalog.js';
import {groundPilot}from'./ground-pilot.mjs';import {pilotInput,flyLevel}from'./pilot.mjs';
import {normalizeProgress,recommendedLevel,recordResult}from'../src/missions/progress.js';
import {t}from'../src/i18n/index.js';import {setRadioLanguage,clipUrl}from'../src/comms/radio.js';
import xiaoshanRadio from'../src/comms/xiaoshan-radio.json' with{type:'json'};import airlineRadio from'../src/comms/airline-radio.json' with{type:'json'};
function until(s,predicate,input=pilotInput,max=1500){for(let i=0;i<max*50&&!predicate(s)&&!s.result;i++)advanceFlight(s,input(s),.02);assert(predicate(s),JSON.stringify({result:s.result,airline:s.airline,ground:s.ground}));return s;}
function cruiseReady(id='pkx-hgh'){return until(createFlight(null,{levelId:id}),s=>canSkipCruise(s),s=>{if(canSkipCruise(s))return{};return pilotInput(s);});}

test('two independent real-airport frames retain source runway geometry, labels and true bearings',()=>{
 assert.equal(AIRPORTS.length,6);assert.equal(XIAOSHAN.ident,'ZSHC');assert.equal(XIAOSHAN.iata,'HGH');assert.equal(XIAOSHAN.runway.id,'07');assert(XIAOSHAN.runway.width>44&&XIAOSHAN.runway.width<46);assert(XIAOSHAN.runway.length>3500&&XIAOSHAN.runway.length<3700);assert(XIAOSHAN.runway.heading>60&&XIAOSHAN.runway.heading<65);assert.notEqual(XIAOSHAN.data,DAXING.data);
 for(const airport of AIRPORTS){const source=airport.data.runways.find(r=>r.ends.some(e=>e.id===airport.runway.id));for(const e of source.ends){const p=airport.project(e.longitude,e.latitude),q=airport.unproject(p.x,p.z);assert(Math.abs(q.longitude-e.longitude)<1e-8&&Math.abs(q.latitude-e.latitude)<1e-8);if(e.id===airport.runway.id)assert(Math.hypot(p.x,p.z)<.001);else assert(Math.abs(p.x)<.001&&Math.abs(p.z+airport.runway.length)<.001);}}
 assert.equal(airportOf('training').runway.heading,270);
});
test('Xiaoshan uses its own source DEM triangles for rendered ground and terrain contact',()=>{
 const cfg=terrainConfig('xiaoshan'),g=new THREE.PlaneGeometry(cfg.width,cfg.depth,cfg.columns,cfg.rows);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,vertexHeight(p.getX(i),p.getZ(i),'xiaoshan'));const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.updateMatrixWorld();
 for(const[x,z]of[[0,-100],[-1500,22000],[5000,13000],[-21000,-19300],[17000,-23200]]){const h=new THREE.Raycaster(new THREE.Vector3(x,10000,z),new THREE.Vector3(0,-1,0)).intersectObject(m)[0];assert(h);assert(Math.abs(h.point.y-terrainHeight(x,z,'xiaoshan'))<.02);}
 assert.equal(terrainHeight(0,-100,'xiaoshan'),0);assert(XIAOSHAN.data.dem.heights.some(h=>h>500));g.dispose();m.material.dispose();
});
test('Xiaoshan starts at source stand 251, preserves permissions and permits a complete manual taxi',()=>{
 const s=createFlight(null,{levelId:'xiaoshan-takeoff'}),d=departureOf(s);assert.equal(s.ground.stand,'251');assert.equal(s.x,d.stand.x);assert.equal(s.radio.pending[0].clip,'xiaoshan-preparation-0');assert.equal(s.radio.pending[0].text,xiaoshanRadio.zh.preparation[0][1]);
 until(s,s=>!groundActive(s),s=>groundPilot(s)||{});assert(s.ground.distance>2200&&!s.ground.skipped);assert(s.ground.heldShort&&s.ground.lineupComplete&&s.ground.manualEntryDistance>200);assert(Math.abs(s.x)<6);assert(!s.result);
});
for(const id of['xiaoshan-takeoff','xiaoshan-landing'])test(`${id} completes via physical controls with no normal-flight terrain alerts`,()=>{const s=flyLevel(createFlight(null,{levelId:id}),800);assert(s.result?.levelCleared,JSON.stringify(s.result));assert(!s.terrain.events.some(e=>e.level>0));if(id.endsWith('landing'))assert(s.landed&&s.gates.every(g=>g.passed&&!g.preset));});
for(const id of['pkx-hgh','hgh-pkx'])test(`${id} completes departure, explicit cruise cut, destination preparation and actual landing`,()=>{
 const s=flyLevel(createFlight(null,{levelId:id}),1600);assert(s.result?.levelCleared,JSON.stringify(s.result));assert.equal(s.airportId,s.airline.destination);assert(s.airline.cruiseSkipped&&s.airline.phase==='complete');assert(s.airline.departureEvidence.manualEntryDistance>200);assert(s.landed&&s.touchdown.gearPosition>.98&&s.touchdown.checklistConfirmed);assert.equal(s.gates.filter(g=>g.passed&&!g.preset).length,2);assert(!s.terrain.events.some(e=>e.level>0));assert.equal(s.levelId,id);
});
test('cruise skip rejects gate, early climb and an unavailable engine; position is never moved by a rejected skip',()=>{
 const initial=createFlight(null,{levelId:'pkx-hgh'}),p={x:initial.x,y:initial.y,z:initial.z};assert(!skipCruise(initial));assert.deepEqual({x:initial.x,y:initial.y,z:initial.z},p);
 const s=cruiseReady();setEngineStatus(s,0,'failed');const pos={x:s.x,y:s.y,z:s.z};assert(!skipCruise(s));assert.deepEqual({x:s.x,y:s.y,z:s.z},pos);assert.equal(s.engines[0].status,'failed');assert.equal(s.airportId,'daxing');
});
test('cross-airport cut keeps mass, system failures, spool, language and departure evidence, never preconfigures landing',()=>{
 const s=cruiseReady();s.systems.autoThrustAvailable=false;s.systems.ils={localizer:false,glideSlope:false};s.engines[0].health=.8;setRadioLanguage(s,'en');const before={time:s.time,spool:s.engines.map(e=>e.spool),weight:s.weight};assert(skipCruise(s));assert.equal(s.airportId,'xiaoshan');assert.equal(s.weight,before.weight);assert.equal(s.radio.language,'en');assert.equal(s.engines[0].health,.8);assert.deepEqual(s.engines.map(e=>e.spool),before.spool);assert(!s.systems.autoThrustAvailable&&!s.systems.ils.localizer);assert.equal(s.gearPosition,0);assert.equal(s.flapPosition,0);assert(!s.autoPilot&&!s.apprArmed&&!s.landingChecklistConfirmed);assert(s.airline.navigation.kind==='arrival'&&Math.abs(Math.hypot(s.x,s.z)-28000)<.01);assert.equal(s.gates.length,0);assert(arrivalPreview(s));assert(s.time>before.time+4000);assert(s.airline.departureEvidence.takeoffCleared);assert(!skipCruise(s));
 const restored=restoreCheckpoint(s);assert.equal(restored.airportId,'xiaoshan');assert(restored.mission.practice);assert(!restored.systems.ils.localizer);assert.equal(restored.airline.destination,'xiaoshan');
});
test('arrival preview is pausable and freezes physical motion while radio and independent camera skip advance',()=>{
 const s=cruiseReady();assert(skipCruise(s));const p={x:s.x,y:s.y,z:s.z,velocity:structuredClone(s.velocity)};advanceSimulation(s,{},0);assert.deepEqual({x:s.x,y:s.y,z:s.z,velocity:s.velocity},p);assert(skipAirportIntro(s));assert(s.airline.introSkipped);for(let i=0;i<100;i++)advanceFlight(s,{throttle:1,pitch:1,steer:1},.02);assert.deepEqual({x:s.x,y:s.y,z:s.z,velocity:s.velocity},p);assert.equal(s.flapPosition,0);until(s,s=>s.airline.phase==='arrival',()=>({}));assert(!s.ground);assert.equal(s.airportId,'xiaoshan');
});
test('a destination go-around continues the same city flight and still requires a real subsequent landing',()=>{
 const s=createFlight(null,{levelId:'pkx-hgh'});let requested=false,returned=false;for(let i=0;i<100000&&!s.result;i++){const input=pilotInput(s);if(s.airline.phase==='approach'&&(s.y-2.8)*FT<700&&!requested){assert(beginGoAround(s));requested=true;}advanceFlight(s,input,.02);if(s.mission.recovery?.stage==='return')returned=true;}
 assert(requested&&returned);assert(s.result?.levelCleared,JSON.stringify(s.result));assert.equal(s.levelId,'pkx-hgh');assert.equal(s.airportId,'xiaoshan');assert(s.landed&&s.airline.cruiseSkipped);assert(s.airline.departureEvidence.takeoffCleared);
});
test('route menus and airport mission briefings have bilingual catalog coverage',()=>{for(const l of[...AIRLINE_ROUTES,...AIRPORT_MISSIONS])for(const x of[l.title,l.category,l.duration,l.goal,l.focus,l.description,l.keys,...l.objectives])assert(!/\p{Script=Han}/u.test(t(x,'en')),x);assert(routeDistance('daxing','xiaoshan')>1000&&routeDistance('daxing','xiaoshan')<1200);assert.equal(routeDistance('daxing','xiaoshan'),routeDistance('xiaoshan','daxing'));});
test('new self-hosted radio assets match language timing, airport/runway and cache fingerprints',async()=>{for(const[prefix,pack]of[['xiaoshan',xiaoshanRadio],['airline',airlineRadio]])for(const lang of['zh','en'])for(const[key,lines]of Object.entries(pack[lang]))for(let i=0;i<lines.length;i++){const id=`${prefix}-${key}-${i}`;assert(pack.durations[lang][id]>0);assert((await stat(new URL(`../../public/assets/radio/${lang==='en'?'en/':''}${id}.mp3`,import.meta.url))).size>1000);assert(clipUrl(id,lang).includes(pack.version));assert(!/\p{Script=Han}/u.test(t(lines[i][1],'en')));}});
test('city routes and four airport practices do not change the 13 training records or recommendations',()=>{assert.equal(LEVELS.length,13);assert.equal(AIRPORT_MISSIONS.length,12);assert.equal(AIRLINE_ROUTES.length,30);const p=normalizeProgress({levels:{takeoff:{bestScore:95},'daxing-takeoff':{bestScore:90,revision:2},'pkx-hgh':{bestScore:97}}});assert.equal(recommendedLevel(p).id,'short-landing');assert.equal(p.levels['daxing-takeoff'].bestScore,90);assert.equal(p.levels['pkx-hgh'].bestScore,97);assert.equal(nextLevel('pkx-hgh').id,'hgh-pkx');assert.equal(nextLevel('hgh-pkx').id,'pkx-sin');assert.equal(nextLevel('lax-landing'),null);});
