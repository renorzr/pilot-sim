import test from'node:test';
import assert from'node:assert/strict';
import * as THREE from'three';
import{AIRPORTS}from'../src/airports/registry.js';
import{createFlight}from'../src/flight.js';
import{createViewState,orbitView,zoomView}from'../src/views/view-state.js';
import{FlightCameraRig}from'../src/views/camera-rig.js';
import{createAirportPresentation,advanceAirportPresentation,finishAirportPresentation,airportPresentationActive,AIRPORT_PRESENTATION_SECONDS}from'../src/views/airport-presentation.js';
test('all real-airport landing practices get a presentation without mutating flight/configuration/checkpoint state',()=>{
 for(const airport of AIRPORTS){const s=createFlight(null,{levelId:airport.id+'-landing'}),before=structuredClone(s),p=createAirportPresentation(s);assert(p?.active);assert.equal(p.duration,10);assert(airportPresentationActive(s,p));for(let i=0;i<20;i++)assert(advanceAirportPresentation(p,.5));assert.equal(p.elapsed,AIRPORT_PRESENTATION_SECONDS);assert(!p.active);assert(!airportPresentationActive(s,p));assert(!advanceAirportPresentation(p,1));assert.deepEqual(s,before);}
 assert.equal(createAirportPresentation(createFlight(null,{levelId:'ils-approach'})),null);assert.equal(createAirportPresentation(createFlight(null,{levelId:'xiaoshan-takeoff'})),null);
});
test('pause, skip and existing airline/departure previews preserve the physical aircraft and selected view',()=>{
 const s=createFlight(null,{levelId:'xiaoshan-landing'}),p=createAirportPresentation(s),before=structuredClone(s),view=createViewState('exterior');orbitView(view,60,-10);zoomView(view,80);const selected={...view};advanceAirportPresentation(p,.5);const paused={...p};assert(airportPresentationActive(s,p));assert(advanceAirportPresentation(p,30,false));assert.deepEqual(p,paused);assert(finishAirportPresentation(p));assert(!finishAirportPresentation(p));assert(!advanceAirportPresentation(p,5));assert.deepEqual(s,before);assert.deepEqual(view,selected);
 const departure=createFlight(null,{levelId:'xiaoshan-takeoff'});assert(airportPresentationActive(departure,null));const arrival={...s,airline:{phase:'arrival-preview',introSkipped:false,previewStarted:200},time:200};assert.equal(createAirportPresentation(arrival),null);assert(airportPresentationActive(arrival,null));arrival.airline.introSkipped=true;assert(!airportPresentationActive(arrival,null));
});
test('both view modes use the same airport camera while flight time is held, then return to the stored camera without a fly-through',()=>{
 const airport=AIRPORTS.find(a=>a.id==='xiaoshan'),s=createFlight(null,{levelId:'xiaoshan-landing'}),before=structuredClone(s),positions=[];
 for(const mode of['cockpit','exterior']){const camera=new THREE.PerspectiveCamera(43,1.6,.7,30000),rig=new FlightCameraRig(camera,{heightAt:()=>0}),view=createViewState(mode);if(mode==='exterior'){orbitView(view,40,20);zoomView(view,40);}const selected={...view};rig.update(s,view,.016,{cinematic:true,cinematicTime:0,airport});const first=camera.position.clone();rig.update(s,view,.016,{cinematic:true,cinematicTime:4,airport});assert.equal(rig.stats().mode,'intro');assert(camera.position.distanceTo(first)>100);assert.deepEqual(rig.stats().target,[airport.viewCenter.x,25,airport.viewCenter.z]);const paused=camera.position.clone();rig.update(s,view,.5,{cinematic:true,cinematicTime:4,airport});assert(camera.position.distanceTo(paused)<1e-9);positions.push(camera.position.clone());rig.update(s,view,.016,{cinematic:false,airport});assert.equal(rig.stats().mode,mode);assert(camera.position.distanceTo(new THREE.Vector3(s.x,s.y,s.z))<230);assert.deepEqual(view,selected);}
 assert(positions[0].distanceTo(positions[1])<1e-9);assert.deepEqual(s,before);
});
