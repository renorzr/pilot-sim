import {loadRunwayCity} from '../src/regions/runway-city.js';
import {newYorkCityData} from '../src/regions/new-york-city-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AIRPORTS,LGA,JFK,airportOf,seaAt} from '../src/airports/registry.js';
import {sceneryFrame,bridgeObstacleIndex} from '../src/regions/scenery-frame.js';
import {terrainHeight,vertexHeight,surfaceHeight,terrainConfig} from '../src/terrain/heightfield.js';
import {AIRPORT_MISSIONS,AIRLINE_ROUTES} from '../src/missions/catalog.js';
import {groupAirports,pickCityAirport} from '../src/airports/airline-planner.js';
import {departureOf,groundActive} from '../src/missions/ground.js';
import {ARRIVAL_TAXI} from '../src/missions/taxi-in.js';
import {departureNavigation} from '../src/missions/airline-navigation.js';
import {createFlight,advanceFlight} from '../src/flight.js';
import {groundPilot} from './ground-pilot.mjs';
import {flyLevel} from './pilot.mjs';
import {installDenseCity,cityRay} from '../src/terrain/city-obstacles.js';

const source=airportOf('lga-source'),toSource=sceneryFrame(LGA,source),toLocal=sceneryFrame(source,LGA);
test('NYC selector exposes JFK and LGA without silently picking an airport',()=>{
 const city=groupAirports(AIRPORTS).find(c=>c.id==='new-york');assert.deepEqual(city.airports.map(a=>a.id),['jfk','lga']);assert(pickCityAirport(city,'origin',{}).pickerOpen);assert.deepEqual(AIRPORT_MISSIONS.filter(m=>m.airportId==='lga').map(m=>m.id),['lga-takeoff','lga-landing']);assert(AIRLINE_ROUTES.some(m=>m.id==='lga-jfk'));assert(AIRLINE_ROUTES.some(m=>m.id==='jfk-lga'));assert(AIRLINE_ROUTES.slice(0,30).every(m=>m.origin!=='lga'&&m.destination!=='lga'));assert.equal(AIRLINE_ROUTES.length,42);
});
test('LGA uses source runway/stand/taxi geometry and common regional sources',()=>{
 assert.equal(LGA.ident,'KLGA');assert.equal(LGA.runway.id,'04');assert(LGA.runway.length>2100&&LGA.runway.length<2200);assert(LGA.runway.width>45);assert.equal(LGA.region,JFK.region);assert.equal(LGA.data.dem,JFK.data.dem);const d=departureOf('lga'),ids=new Set(LGA.data.osm.features.map(f=>f.id));assert(d.sourceFeatureIds.every(id=>ids.has(id)));assert(ids.has(d.stand.sourceId));assert.equal(d.runwayId,'04');assert.equal(ARRIVAL_TAXI.lga.runwayId,'04');assert(ARRIVAL_TAXI.lga.exits.length>0);assert(!seaAt('lga',d.stand.x,d.stand.z));
 const nav=departureNavigation('lga','jfk');assert.equal(nav.procedure.id,'LGA7-Bronx-initial');assert.equal(nav.points[0].altitudeMSL,500);assert.equal(nav.points[0].headingMag,44);assert.equal(nav.points[1].headingMag,360);assert.equal(nav.points[1].turn,'left');assert(Math.abs(nav.altitude+nav.elevationFt-5000)<1e-7);
});
test('LGA runway frame maps to shared NYC geography, water and MSL terrain exactly',()=>{
 for(const[x,z]of[[0,-300],[600,-1200],[-1500,22000],[8000,8000],[-7000,-9000]]){const p=toSource.point({x,y:15,z,time:7}),q=toLocal.point(p);assert(Math.hypot(q.x-x,q.z-z)<.0001);assert.equal(q.y,15);assert.equal(q.time,7);assert.equal(seaAt('lga',x,z),seaAt('jfk',p.x,p.z));assert(Math.abs(terrainHeight(x,z,'lga')+LGA.elevationM-terrainHeight(p.x,p.z,'jfk')-JFK.elevationM)<.0001);}
 assert(Math.abs(surfaceHeight(0,-500,'lga'))<.0001);
 const p=toSource.point({x:0,z:-500});assert(Math.abs(terrainHeight(p.x,p.z,'jfk')+JFK.elevationM-LGA.elevationM)<.001);
});
test('LGA rendered canonical terrain triangles agree with physical runway-local sampling',()=>{
 const c=terrainConfig('jfk'),geometry=new THREE.PlaneGeometry(c.width,c.depth,c.columns,c.rows);geometry.rotateX(-Math.PI/2);const p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,vertexHeight(p.getX(i),p.getZ(i),'jfk')+JFK.elevationM-LGA.elevationM);geometry.applyMatrix4(new THREE.Matrix4().fromArray(toLocal.elements));const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();try{for(const[x,z]of[[0,-300],[-1500,22000],[8000,8000],[-7000,-9000]]){const hit=new THREE.Raycaster(new THREE.Vector3(x,10000,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0];assert(hit&&Math.abs(hit.point.y-terrainHeight(x,z,'lga'))<.03,JSON.stringify({x,z,render:hit?.point.y,physical:terrainHeight(x,z,'lga')}));}}finally{geometry.dispose();material.dispose();}
});
test('shared scenery contacts bridge both frames and retain holes and moving-traffic time',()=>{
 const center=toSource.point({x:800,z:900}),obstacle={id:'frame-fixture',cx:center.x,cz:center.z,width:40,depth:25,angle:.4,baseY:0,topY:100};let query;const index=bridgeObstacleIndex({*candidates(...args){query=args;yield obstacle;}},toSource,toLocal),remove=installDenseCity(index,'lga');try{assert(cityRay({x:800,y:110,z:900,time:17},{x:800,y:-10,z:900},'lga'));const hits=[...index.candidates({x:800,y:90,z:900},{x:800,y:10,z:900},2,3,17)];assert.equal(query[4],17);assert.equal(hits[0].rings.length,1);assert(Math.hypot(hits[0].cx-800,hits[0].cz-900)<1);assert.equal(query[0].y,90);}finally{remove();}assert.equal(cityRay({x:800,y:110,z:900},{x:800,y:-10,z:900},'lga'),null);
});
test('runway scene bridge preserves photographic registration, camera lens and flight timing',async()=>{
 const scene=new THREE.Scene(),terrain=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshBasicMaterial()),camera=new THREE.PerspectiveCamera(43,1.6,.7,30000);camera.position.set(20,50,60);camera.updateMatrixWorld();let received,timing;
 const city=await loadRunwayCity({scene,terrain,camera,airport:LGA},async options=>{received=options;return{root:new THREE.Group(),update(c,t){timing=t;assert.equal(c,received.camera);},stats:()=>({roadTraffic:null}),dispose(){}};});
 try{assert.equal(received.airport.id,'lga-source');assert.equal(received.materialAirport,LGA);assert.equal(received.camera.fov,43);assert.equal(received.camera.near,.7);const expected=toSource.point(camera.position);assert(received.camera.position.distanceTo(new THREE.Vector3(expected.x,50,expected.z))<.0001);assert.deepEqual(received.camera.projectionMatrix.elements,camera.projectionMatrix.elements);camera.fov=21;camera.updateProjectionMatrix();city.update(camera,{time:17,position:{x:12,y:30,z:14},velocity:{x:2,y:3,z:4}});assert.equal(received.camera.fov,21);assert.equal(timing.time,17);assert.equal(timing.position.y,30);assert.equal(timing.velocity.y,3);assert(Math.abs(timing.position.x-toSource.point({x:12,z:14}).x)<.00001);}finally{city.dispose();terrain.geometry.dispose();terrain.material.dispose();}assert.equal(scene.children.length,0);
});
test('active LGA terminal replacement removes both dense geometry and invisible ground contacts',()=>{
 const c=JFK.project(LGA.data.airport.longitude,LGA.data.airport.latitude),b={index:0,cx:c.x,cz:c.z,baseY:0,topY:20,height:20},raw={count:1,building:()=>b,*candidates(){yield b;}},adapted=newYorkCityData(raw,source);assert.equal(adapted.building(0).height,0);assert.equal([...adapted.candidates({...c,y:-10},{...c,y:100})].length,0);assert.equal(raw.building().height,20);
});
for(const skip of[false,true])test(`LGA ${skip?'skipped':'full'} taxi requires real holding, lineup and takeoff clearances`,()=>{const s=createFlight(null,{levelId:'lga-takeoff'});for(let i=0;i<50000&&groundActive(s)&&!s.result;i++)advanceFlight(s,groundPilot(s,{skip})||{},.02);assert(!s.result,JSON.stringify(s.result));assert(s.ground.heldShort&&s.ground.lineupComplete&&s.ground.takeoffCleared);assert.equal(s.ground.skipped,skip);assert(s.ground.manualEntryDistance>100);});
for(const id of['lga-takeoff','lga-landing',...AIRLINE_ROUTES.filter(m=>m.origin==='lga'||m.destination==='lga').map(m=>m.id)])test(`${id} completes by integrated flight controls`,()=>{const s=flyLevel(createFlight(null,{levelId:id}),1800);assert(s.result?.levelCleared,JSON.stringify({result:s.result,ground:s.ground,airline:s.airline}));if(s.airline){assert(s.airline.cruiseSkipped&&s.airline.phase==='complete');assert.equal(s.airportId,s.airline.destination);assert.equal(s.ground.stage,'parked');}assert(!s.terrain.events.some(e=>e.level>0),JSON.stringify(s.terrain.events));});
