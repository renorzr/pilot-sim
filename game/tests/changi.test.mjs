import test from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {CHANGI,seaAt,AIRPORTS} from '../src/airports/registry.js';
import {createFlight,advanceFlight,skipCruise,FT} from '../src/flight.js';
import {groundPilot} from './ground-pilot.mjs';
import {groundActive,departureOf,skipTaxi} from '../src/missions/ground.js';
import {flyLevel} from './pilot.mjs';
import {surfaceHeight,terrainConfig,sweptContact} from '../src/terrain/heightfield.js';
import radio from '../src/comms/changi-radio.json' with {type:'json'};
import {clipUrl,setRadioLanguage,queueRadio} from '../src/comms/radio.js';
import {refreshAirData} from '../src/sim/aerodynamics.js';
import {t} from '../src/i18n/index.js';
test('Changi uses an independent true 02L frame, real stand A16 and offline coastal geography',()=>{
 assert.equal(AIRPORTS.length,6);assert.equal(CHANGI.ident,'WSSS');assert.equal(CHANGI.iata,'SIN');assert.equal(CHANGI.data.runways.length,3);assert(CHANGI.runway.heading>22&&CHANGI.runway.heading<24);assert(CHANGI.runway.length>3990&&CHANGI.runway.length<4050);assert.equal(CHANGI.data.dem.heights.length,129*129);const d=departureOf('changi');assert.equal(d.stand.ref,'A16');assert.equal(d.stand.sourceId,'way/1302460669');assert(d.hold.x>100&&d.taxiDistanceM<500);assert(CHANGI.data.osm.features.some(f=>f.tags?.water==='sea'&&f.holes?.length>50));
 for(const[lon,lat,expected]of[[103.98,1.30,true],[104.08,1.33,true],[103.994,1.35,false],[103.96,1.415,false],[103.85,1.29,false]]){const p=CHANGI.project(lon,lat);assert.equal(seaAt('changi',p.x,p.z),expected);if(expected)assert.equal(surfaceHeight(p.x,p.z,'changi'),terrainConfig('changi').waterLevel);}
});
test('complete A16 taxi and right-side runway entry require independent clearances and real movement',()=>{
 const s=createFlight(null,{levelId:'changi-takeoff'});for(let i=0;i<20000&&groundActive(s)&&!s.result;i++)advanceFlight(s,groundPilot(s)||{},.02);assert(!s.result,JSON.stringify(s.result));assert(s.ground.takeoffCleared&&s.ground.lineupComplete&&s.ground.heldShort);assert(!s.ground.skipped&&s.ground.distance>350);assert(s.ground.manualEntryDistance>160&&Math.abs(s.x)<6&&Math.abs(Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw)))<5*Math.PI/180);
});
for(const id of['changi-takeoff','changi-landing','pkx-sin','hgh-sin','sin-pkx','sin-hgh'])test(`${id} completes through physical controls and actual landing when required`,()=>{
 const s=flyLevel(createFlight(null,{levelId:id}),1800);assert(s.result?.levelCleared,JSON.stringify({result:s.result,ground:s.ground,airline:s.airline,x:s.x,z:s.z}));assert(!s.terrain.events.some(e=>e.level>0));if(!id.endsWith('takeoff'))assert(s.landed&&s.gates.every(g=>g.passed&&!g.preset));if(s.airline){assert(s.airline.cruiseSkipped&&s.airportId===s.airline.destination);assert(s.airline.departureEvidence.manualEntryDistance>160);}
});
test('sea below airport reference permits low flight, then stops aircraft on actual water contact',()=>{
 const s=createFlight(null,{levelId:'changi-landing'}),p=CHANGI.project(103.98,1.30);Object.assign(s,p,{y:0,yaw:0,pitch:0,roll:0,velocity:{x:0,y:0,z:-100}});refreshAirData(s);advanceFlight(s,{},.02);assert(!s.result&&!s.touchdown);assert(s.y<2.8);const sea=terrainConfig('changi').waterLevel,previous={...s,y:10},current={...s,y:sea+2};assert.equal(sweptContact(previous,current).type,'water');Object.assign(s,{y:sea+2,velocity:{x:0,y:-1,z:-100}});refreshAirData(s);advanceFlight(s,{},.02);assert.equal(s.result?.title,'撞击水面');const frozen={x:s.x,y:s.y,z:s.z};advanceFlight(s,{},1);assert.deepEqual({x:s.x,y:s.y,z:s.z},frozen);
});
test('Changi bilingual speech uses the correct runway/stand, durations and cache version',async()=>{
 for(const lang of['zh','en'])for(const[key,lines]of Object.entries(radio[lang]))for(let i=0;i<lines.length;i++){const id=`changi-${key}-${i}`;assert(radio.durations[lang][id]>0);assert((await stat(new URL(`../../public/assets/radio/${lang==='en'?'en/':''}${id}.mp3`,import.meta.url))).size>1000);assert(clipUrl(id,lang).includes(radio.version));assert(!/\p{Script=Han}/u.test(t(lines[i][1],'en')));}
 const s=createFlight(null,{levelId:'changi-takeoff'});assert(s.radio.pending[0].clip.startsWith('changi-preparation-'));assert(!skipCruise(s));assert(!skipTaxi(s));
});
