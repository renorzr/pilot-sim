import englishPilotClean from '../src/comms/english-pilot-clean.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFlight,advanceFlight,beginGoAround,restoreCheckpoint,saveCheckpoint,FT} from '../src/flight.js';
import {DAXING,projectDaxing,unprojectDaxing,runwayOf,runwayHeading} from '../src/airports/registry.js';
import {LEVELS,AIRPORT_MISSIONS,nextLevel} from '../src/missions/catalog.js';
import {terrainHeight,vertexHeight,terrainConfig,surfaceHeight} from '../src/terrain/heightfield.js';
import {predictTerrain} from '../src/terrain/awareness.js';
import {queueRadio,updateRadio,setRadioLanguage,clipUrl} from '../src/comms/radio.js';
import {loadProgress,recordResult,normalizeProgress,recommendedLevel} from '../src/missions/progress.js';
import {pilotInput,flyLevel} from './pilot.mjs';
import daxingRadio from '../src/comms/daxing-radio.json' with {type:'json'};
import {stat} from 'node:fs/promises';
import {t} from '../src/i18n/index.js';

test('Daxing mission menu and briefings are fully translated',()=>{
 for(const l of AIRPORT_MISSIONS)for(const value of[l.title,l.category,l.duration,l.goal,l.focus,l.description,l.keys,...l.objectives])assert(!/\p{Script=Han}/u.test(t(value,'en')),value);
});

test('Daxing pack retains real source geometry and an independent runway coordinate frame',()=>{
 assert.equal(LEVELS.length,13);assert.equal(AIRPORT_MISSIONS.length,12);assert.equal(DAXING.data.runways.length,4);
 assert(DAXING.data.osm.features.some(f=>f.id==='relation/12731810'&&f.geometry.length>100));
 assert.equal(DAXING.data.dem.heights.length,DAXING.data.dem.columns*DAXING.data.dem.rows);
 const r=DAXING.data.runways.find(r=>r.ends.some(e=>e.id==='17L')),a=r.ends.find(e=>e.id==='17L'),b=r.ends.find(e=>e.id==='35R');
 assert(Math.hypot(...Object.values(projectDaxing(a.longitude,a.latitude)))<.001);
 const end=projectDaxing(b.longitude,b.latitude);assert(Math.abs(end.x)<.001);assert(Math.abs(end.z+DAXING.runway.length)<.001);
 assert(DAXING.runway.length>3700&&DAXING.runway.length<3900);assert(runwayHeading('daxing')>170&&runwayHeading('daxing')<176);
 for(const e of r.ends){const p=projectDaxing(e.longitude,e.latitude),q=unprojectDaxing(p.x,p.z);assert(Math.abs(q.longitude-e.longitude)<1e-9);assert(Math.abs(q.latitude-e.latitude)<1e-9);}
 assert.equal(runwayHeading('training'),270);assert.equal(runwayOf('training').length,2600);
});

test('Daxing renderer and terrain contact query share the same triangles and graded runway',()=>{
 const t=terrainConfig('daxing'),g=new THREE.PlaneGeometry(t.width,t.depth,t.columns,t.rows);g.rotateX(-Math.PI/2);const p=g.attributes.position;
 for(let i=0;i<p.count;i++)p.setY(i,vertexHeight(p.getX(i),p.getZ(i),'daxing'));
 const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.updateMatrixWorld();
 for(const [x,z]of [[0,-100],[25,-3700],[-1500,18000],[6000,13000],[-21000,19300],[17000,-23200]]){
  const hits=new THREE.Raycaster(new THREE.Vector3(x,10000,z),new THREE.Vector3(0,-1,0)).intersectObject(m);assert(hits[0]);assert(Math.abs(hits[0].point.y-terrainHeight(x,z,'daxing'))<.02);
 }
 assert.equal(surfaceHeight(0,-3000,'daxing'),0);g.dispose();m.material.dispose();
});

test('Daxing missions preserve clean side-intercept entry and airport snapshots without changing training',()=>{
 const s=createFlight(null,{levelId:'daxing-landing'});assert.equal(s.airportId,'daxing');assert(s.x!==0&&s.z===22000);assert.equal(s.flapPosition,0);assert.equal(s.gearPosition,0);assert(!s.apprArmed&&!s.autoPilot&&!s.landingChecklistConfirmed);
 assert.equal(s.atc.clearance.label,'进近 · 跑道 17L');assert.equal(s.weather.referenceHeading,runwayHeading(s));assert.equal(predictTerrain(s).level,0);
 saveCheckpoint(s,'Daxing');assert.equal(restoreCheckpoint(s).airportId,'daxing');assert.equal(createFlight(null,{levelId:'takeoff'}).selectedHeading,270);
});

test('Daxing takeoff and full manual approach can complete through actual forces and controls',()=>{
 for(const id of['daxing-takeoff','daxing-landing']){
  const s=flyLevel(createFlight(null,{levelId:id}),500);assert(s.result?.levelCleared,JSON.stringify({id,result:s.result,impact:s.impact,terrain:s.terrain.events}));
  if(id==='daxing-landing'){assert(s.landed);assert(s.touchdown.z>=-runwayOf(s).length);assert(s.touchdown.gearPosition>.98);assert.equal(s.gates.filter(g=>g.passed&&!g.preset).length,2);assert.equal(s.terrain.events.filter(e=>e.level>0).length,0);}
 }
});

test('Daxing go-around retains the mission and requires a subsequent real landing',()=>{
 const s=createFlight(null,{levelId:'daxing-landing'});let requested=false,returned=false;
 for(let i=0;i<65000&&!s.result;i++){
  const input=pilotInput(s);
  if(!requested&&(s.y-2.8)*FT<700){beginGoAround(s);requested=true;}
  advanceFlight(s,input,.02);
  if(s.mission.recovery?.stage==='return'){returned=true;assert.equal(s.airportId,'daxing');assert(!s.route.points.some(p=>p.name.includes('海侧')));}
 }
 assert(requested&&returned);assert(s.result?.levelCleared,JSON.stringify({result:s.result,impact:s.impact,terrain:s.terrain.events,route:s.route}));assert(s.touchdown);
});

test('Daxing bilingual recordings match runway and language duration while generic alerts remain reusable',async()=>{
 for(const lang of['zh','en'])for(const [key,lines]of Object.entries(daxingRadio[lang]))for(let i=0;i<lines.length;i++){
  const clip=`daxing-${key}-${i}`;assert(daxingRadio.durations[lang][clip]>0);assert((await stat(new URL(`../../public/assets/radio/${lang==='en'?'en/':''}${clip}.mp3`,import.meta.url))).size>1000);
 }
 const s=createFlight(null,{levelId:'daxing-landing'});queueRadio(s,'approach');updateRadio(s);assert.equal(s.radio.active.clip,'daxing-approach-0');assert(!s.radio.active.text.includes('二七'));
 setRadioLanguage(s,'en');assert(Math.abs(s.radio.active.until-(s.time+(englishPilotClean.clips[s.radio.active.clip]?.duration??daxingRadio.durations.en[s.radio.active.clip])+.2))<1e-8);assert(clipUrl(s.radio.active.clip,'en').includes('/en/daxing-approach-0.mp3'));
});

test('airport records do not change training recommendations, counts or next-stage navigation',()=>{
 const p=normalizeProgress({levels:{takeoff:{bestScore:90},'daxing-takeoff':{bestScore:95,revision:2}}});assert.equal(recommendedLevel(p).id,'short-landing');assert.equal(p.levels.takeoff.bestScore,90);assert.equal(p.levels['daxing-takeoff'].bestScore,95);
 assert.equal(nextLevel('daxing-takeoff').id,'daxing-landing');assert.equal(nextLevel('daxing-landing').id,'xiaoshan-takeoff');assert.equal(nextLevel('dual-glide'),null);
});
