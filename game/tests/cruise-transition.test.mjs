import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFlight,advanceFlight,toggleAP} from '../src/flight.js';
import {canSkipCruise} from '../src/missions/airline.js';
import {advanceAtRate} from '../src/sim/time-acceleration.js';
import {pilotInput} from './pilot.mjs';
import {createCruiseTransition,advanceCruiseTransition,commitCruiseTransition,cruiseVisualFlight} from '../src/views/cruise-transition.js';
import {createViewState,orbitView,zoomView} from '../src/views/view-state.js';
import {FlightCameraRig} from '../src/views/camera-rig.js';
import {createAirportWorldManager} from '../src/views/airport-world-manager.js';
import {RADIO_PACKS} from '../src/comms/radio-packs.js';
import {PILOT_VOICE_IDS} from '../src/comms/pilot-voices.js';
import {createRadio} from '../src/comms/radio.js';
import {stat} from 'node:fs/promises';

const qualified=createFlight(null,{levelId:'kix-pkx'});
for(let i=0;i<75000&&!canSkipCruise(qualified)&&!qualified.result;i++)advanceFlight(qualified,pilotInput(qualified),.02);
assert(canSkipCruise(qualified)&&qualified.airportId==='kansai');
const flight=()=>structuredClone(qualified);
function toBlack(p){for(let i=0;i<1000&&p.phase!=='black';i++)advanceCruiseTransition(p,.1);assert.equal(p.phase,'black');assert.equal(p.opacity,1);}

test('cruise presentation uses measured velocity without changing physical time, health, mass or departure evidence',()=>{
 assert.equal(createCruiseTransition(createFlight(null,{levelId:'takeoff'})),null);
 const s=flight(),before=structuredClone(s),p=createCruiseTransition(s);
 for(let i=0;i<40;i++)advanceCruiseTransition(p,.1);
 const visual=cruiseVisualFlight(p);assert.equal(visual.x,s.x+s.velocity.x*p.elapsed);assert.equal(visual.y,s.y+s.velocity.y*p.elapsed);assert.equal(visual.z,s.z+s.velocity.z*p.elapsed);assert.equal(visual.time,s.time+p.elapsed);
 assert.deepEqual(s,before);const saved=structuredClone(p);advanceCruiseTransition(p,30,{visible:false});assert.deepEqual(p,saved);
});
test('B cuts overhead from either player view, holds one second and rolls below the real aircraft without replacing its state',()=>{
 for(const mode of['cockpit','exterior'])for(const yaw of[0,.8,-2.1]){
  const s=flight();Object.assign(s,{yaw,pitch:.11,roll:-.12});
  const before=structuredClone(s),view=createViewState(mode);orbitView(view,137,-19);zoomView(view,72);const selected={...view};
  const cam=new THREE.PerspectiveCamera(43,1.6,.7,30000),rig=new FlightCameraRig(cam,{heightAt:()=>0});rig.update(s,view,.016);
  const old=cam.position.clone(),p=createCruiseTransition(s),heading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-yaw);
  let top=null;
  for(let i=0;i<=571;i++){
   if(i)advanceCruiseTransition(p,1/60);
   const visual=cruiseVisualFlight(p);rig.update(visual,view,1/60,{cruise:p});cam.updateMatrixWorld();
   const origin=new THREE.Vector3(visual.x,visual.y,visual.z),relative=cam.position.clone().sub(origin).applyQuaternion(heading.clone().invert());
   assert(cam.position.distanceTo(origin)>=84-1e-8&&cam.position.distanceTo(origin)<=115+1e-8);
   const center=origin.clone().project(cam);assert(Math.hypot(center.x,center.y)<1e-9);assert.equal(cam.fov,42);assert(!cam.view?.enabled);
   assert.deepEqual(rig.stats().target,origin.toArray());assert.equal(visual.pitch,s.pitch);assert.equal(visual.roll,s.roll);assert.equal(visual.gearPosition,s.gearPosition);assert.equal(visual.flapPosition,s.flapPosition);
   if(!i){assert(cam.position.distanceTo(old)>10);top=relative;assert(relative.y>80);}
   if(p.elapsed<=1)assert(relative.distanceTo(top)<1e-8);
   if(p.elapsed>=8.2)assert(relative.y<-35);
  }
  assert.deepEqual(s,before);assert.deepEqual(view,selected);assert.equal(p.phase,'black');
 }
});
test('B still uses live terrain and building obstruction constraints without moving the aircraft',()=>{
 const s=flight(),view=createViewState('exterior'),cam=new THREE.PerspectiveCamera(),rig=new FlightCameraRig(cam,{heightAt:()=>s.y+10,obstruction:()=>({distance:20,top:s.y+120})}),p=createCruiseTransition(s),before=structuredClone(s);
 for(let i=0;i<85;i++)advanceCruiseTransition(p,.1);
 rig.update(cruiseVisualFlight(p),view,.1,{cruise:p});assert(rig.stats().obstacleAdjusted);assert(cam.position.y>s.y+10);assert.deepEqual(s,before);
});
test('B keeps its camera deadline while every language/pilot uses normal speech speed',()=>{
 for(const language of['zh','en'])for(const pilotVoice of PILOT_VOICE_IDS)for(const step of[1/60,.5]){
  const s=flight();s.radio=createRadio({pilotVoice,airportId:s.airportId,destinationId:s.airline.destination});s.radio.language=language;const p=createCruiseTransition(s);
  while(p.phase!=='black'){
   advanceCruiseTransition(p,step);
   const visual=cruiseVisualFlight(p);assert.equal(visual.time,s.time+p.elapsed);assert.equal(p.radio.presentationRate,1);
  }
  assert(p.elapsed>=9.5-1e-8&&p.elapsed<10.01);
 }
});
function finishSpeech(p){for(let i=0;i<2000&&(p.radio.active||p.radio.pending.length||p.source.time+p.elapsed<p.radio.readyAt);i++)advanceCruiseTransition(p,.1);assert.equal(p.radio.history.length,3);}
test('normal dialogue continues under black before the destination switch, then black holds for world readiness',()=>{
 let blackSpeechHolds=0;
 for(const language of['zh','en'])for(const pilotVoice of PILOT_VOICE_IDS){
  const s=flight();s.radio=createRadio({pilotVoice,airportId:s.airportId,destinationId:s.airline.destination});s.radio.language=language;const p=createCruiseTransition(s),initial=s.airportId,before=structuredClone(s);
  assert(!commitCruiseTransition(p,s));toBlack(p);assert(p.elapsed>=9.5-1e-8&&p.elapsed<9.61);assert.equal(p.radio.presentationRate,1);
  if(p.radio.active||p.radio.pending.length||p.source.time+p.elapsed<p.radio.readyAt){blackSpeechHolds++;assert(!commitCruiseTransition(p,s));}assert.deepEqual(s,before);
  finishSpeech(p);assert(p.elapsed>=9.5);assert.equal(p.radio.pilotVoice,pilotVoice);const weight=s.weight,health=structuredClone(s.engines),practice=s.mission.practice;assert(commitCruiseTransition(p,s));assert(!commitCruiseTransition(p,s));assert.equal(s.airportId,'daxing');assert.equal(s.weight,weight);assert.deepEqual(s.engines.map(({id,status,health,spool,lever})=>({id,status,health,spool,lever})),health.map(({id,status,health,spool,lever})=>({id,status,health,spool,lever})));assert.equal(s.mission.practice,practice);
  assert.equal(s.radio.history.filter(l=>l.event==='cruise-climb').length,3);const destination=structuredClone(s);
  for(let i=0;i<200;i++)advanceCruiseTransition(p,.1,{ready:false});assert.equal(p.phase,'black');assert.equal(p.opacity,1);assert.deepEqual(s,destination);assert.equal(s.time,s.airline.previewStarted);
  advanceCruiseTransition(p,.1,{ready:true});assert.equal(p.phase,'fadein');assert.equal(p.opacity,1);while(p.active)advanceCruiseTransition(p,.1,{ready:true});assert.equal(p.opacity,0);assert.deepEqual(s,destination);
 }
 assert(blackSpeechHolds>0);
});
test('buffering and stale ended events cannot cut off a transmission under black; mute can use measured timing',()=>{
 const s=flight(),p=createCruiseTransition(s),first={clip:p.radio.active.clip,started:p.radio.active.started,ended:false};
 for(let i=0;i<90;i++)advanceCruiseTransition(p,.5,{media:first});assert.equal(p.phase,'black');assert.equal(p.radio.history.length,0);assert(!commitCruiseTransition(p,s));
 advanceCruiseTransition(p,.5,{media:{...first,started:first.started-1,ended:true}});assert.equal(p.radio.history.length,0);
 advanceCruiseTransition(p,.1,{media:{...first,ended:true}});assert.equal(p.radio.history.length,1);
 finishSpeech(p);assert(commitCruiseTransition(p,s));
 const muted=flight(),q=createCruiseTransition(muted);for(let i=0;i<100;i++)advanceCruiseTransition(q,.5,{media:{ended:false,bypass:true}});assert.equal(q.radio.history.length,3);assert(commitCruiseTransition(q,muted));
});
test('the browser automatic-cut hook stops a 4x batch at the qualified event while native flight APIs keep their existing behavior',()=>{
 const s=flight();if(!s.autoPilot)toggleAP(s);let p=null;
 for(let i=0;i<1500&&!p&&!s.result;i++)advanceAtRate(s,{},.5,4,{onCruiseSkip:(state,options)=>{p=createCruiseTransition(state,options);return !!p;}});
 assert(p?.automatic);assert.equal(s.airportId,'kansai');assert.equal(s.clock.accumulator,0);assert.equal(s.time,p.source.time);assert(!s.airline.cruiseSkipped);
 toBlack(p);finishSpeech(p);assert(commitCruiseTransition(p,s));assert.equal(s.airline.cruiseSkipMode,'automatic');assert(s.airline.departureRouteEvidence.endPassed);
});

function worldFixture(){
 const records=[],events=[];
 const document={createElement(){return{ownerDocument:document,style:{},children:[],attrs:{},setAttribute(k,v){this.attrs[k]=v;},appendChild(n){n.parent=this;this.children.push(n);},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}};}};
 const host=document.createElement();
 const manager=createAirportWorldManager({host,createWorld:(node,ready,error,id,progress,options)=>{const r={id,ready,error,progress,options,activated:0,disposed:0,updates:0};records.push(r);return{activate(){r.activated++;},update(){r.updates++;},settled(){return r.pendingTextures;},dispose(){r.disposed++;}};},onReady:()=>events.push('ready'),onError:()=>events.push('error'),onProgress:()=>events.push('progress')});
 return{manager,records,events,host};
}
test('destination preparation never activates contact data or replaces the source before explicit promotion',async()=>{
 const{manager:m,records:r,events,host}=worldFixture();m.useAirport('kansai');r[0].ready();const baseline=events.length;
 m.prefetch('daxing');m.prefetch('daxing');assert.equal(r.length,2);assert.equal(r[1].options.activate,false);r[1].progress({percent:70});r[1].ready();assert.equal(events.length,baseline);assert.equal(m.current().id,'kansai');assert.equal(r[1].activated,0);assert.equal(r[0].disposed,0);
 const warming=m.warmPrepared({},{});assert.equal(m.warmPrepared({},{}),warming);await warming;assert.equal(r[1].updates,2);m.useAirport('daxing');assert.equal(r[0].disposed,1);assert.equal(r[1].activated,1);assert(m.ready());assert.equal(m.prepared(),null);assert.equal(host.children.length,1);m.dispose();assert.equal(host.children.length,0);
});
test('cancelled destination loads cannot publish late readiness; failed promoted loads can retry under black',async()=>{
 const{manager:m,records:r,events}=worldFixture();m.useAirport('kansai');r[0].ready();m.prefetch('daxing');m.prefetch('jfk');assert.equal(r[1].disposed,1);const n=events.length;r[1].ready();r[1].error('late');assert.equal(events.length,n);
 r[2].error('offline');assert.equal(m.current().id,'kansai');m.useAirport('jfk');assert(!m.ready());m.retry();assert.equal(r[2].disposed,1);r[3].ready();assert(!m.ready());await m.warmPrepared({},{});assert(m.ready());m.prefetch('lax');m.retainDestination(null);assert.equal(r[4].disposed,1);m.dispose();
});
test('black readiness waits for the actual destination view textures after data is loaded and after promotion',async()=>{
 const{manager:m,records:r}=worldFixture();m.useAirport('kansai');r[0].ready();m.prefetch('daxing');let finish;
 r[1].pendingTextures=new Promise(resolve=>{finish=resolve;});r[1].ready();assert.equal(m.prepared().progress.percent,99);
 const warming=m.warmPrepared({},{});m.useAirport('daxing');assert(!m.ready());assert.equal(r[1].updates,1);finish();await warming;assert(m.ready());assert.equal(r[1].updates,2);assert.equal(m.current().progress.percent,100);m.dispose();
});
test('cruise-climb captions have matched measured bilingual audio files',async()=>{
 const pack=RADIO_PACKS.airline;
 for(const language of['zh','en']){assert.equal(pack[language]['cruise-climb'].length,3);for(let i=0;i<3;i++){const id='airline-cruise-climb-'+i;assert(pack.durations[language][id]>.5);assert((await stat(new URL('../../public/assets/radio/'+(language==='en'?'en/':'')+id+'.mp3',import.meta.url))).size>1000);}}
});
test('replay warms the promoted airport by identity even while another airport is prefetching',async()=>{
 const{manager:m,records:r}=worldFixture();m.useAirport('kansai');r[0].ready();m.prefetch('daxing');r[1].ready();m.useAirport('daxing');assert(!m.ready());m.prefetch('jfk');r[2].ready();
 await m.warmPrepared({airportId:'daxing'},{});assert(m.ready());assert.equal(r[1].updates,2);assert.equal(r[2].updates,0);assert.equal(m.prepared().id,'jfk');m.dispose();
});
