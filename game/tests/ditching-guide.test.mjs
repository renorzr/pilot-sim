import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight} from '../src/flight.js';
import {takeHistoricalControl,historyReferenceSpeed,historicalApproach} from '../src/history/us1549.js';
import {ditchingGuide} from '../src/history/ditching-guide.js';
import {eventWaterCurrent,eventHeading} from '../src/history/event-world.js';
import {WATER_ENTRY_TARGETS,waterEntryQuality,beginWaterContact} from '../src/sim/water-contact.js';
import {setMotion,refreshAirData} from '../src/sim/aerodynamics.js';
import {RAD,KT,FT} from '../src/sim/constants.js';
import {t} from '../src/i18n/index.js';
const start=()=>createFlight(null,{levelId:'history-us1549',historical:{practice:true,finalApproach:true}});
const row=(g,id)=>g.rows.find(r=>r.id===id);
// Numerical presentation fixtures only: these placements do not claim a flown
// landing. Browser flight evidence continues to use actual UI controls.
function entry(){const s=start();Object.assign(s,{y:20/FT,pitch:9.5*RAD,roll:0,flapPosition:2,gearPosition:0});setMotion(s,{speed:130/KT,verticalSpeed:-1,yaw:s.yaw});refreshAirData(s);return s;}

test('entry targets agree with scoring and show both air-relative and water-relative quantities',()=>{
 const s=entry(),before=structuredClone(s),g=ditchingGuide(s);assert.equal(g.phase,'entry');assert.equal(row(g,'ias').target,'120–135');assert.equal(row(g,'sink').target,'0–1.5');assert.equal(row(g,'sink').secondary,'≤295 ft/min');assert.equal(row(g,'pitch').target,'8–11');assert.equal(row(g,'roll').target,'±2');assert.equal(row(g,'slip').target,'±2');assert.equal(row(g,'gear').target,'UP');assert.equal(row(g,'flaps').target,'CONF 2');assert(row(g,'water-speed'));
 for(const id of['ias','sink','pitch','roll','gear','flaps'])assert.equal(row(g,id).state,'good',id);assert.deepEqual(s,before,'The guide must not alter physics, controls or assessment');
 assert.equal(waterEntryQuality({ias:130/KT,pitch:9.5*RAD,roll:0,waterBeta:0,sinkMps:1,massTonnes:68.5}).total,1);
});
test('glide and approach show the actual configuration reference without premature red entry targets',()=>{
 const s=createFlight(null,{levelId:'history-us1549'});assert.equal(ditchingGuide(s),null);takeHistoricalControl(s,{early:true});s.historical.manualTarget='river';const g=ditchingGuide(s);
 assert.equal(g.phase,'glide');assert.equal(row(g,'ias').state,'neutral');assert.equal(row(g,'pitch').state,'neutral');assert.equal(g.context,`滑翔参考 ${Math.round(historyReferenceSpeed(s,{approach:historicalApproach(s)}))} kt`);
 s.y=300/FT;s.flapPosition=2;const app=ditchingGuide(s);assert.equal(app.phase,'approach');assert.equal(row(app,'ias').state,'neutral');assert.equal(app.context,`进近参考 ${Math.round(historyReferenceSpeed(s,{approach:historicalApproach(s)}))} kt`);
 s.stallWarning.active=true;assert.equal(row(ditchingGuide(s),'ias').state,'danger');
});
test('entry deviations are signed and actual actuator positions override selected commands',()=>{
 const s=entry();Object.assign(s,{pitch:4*RAD,roll:-4*RAD,gear:false,gearPosition:.7,flaps:2,flapPosition:1.2});s.verticalSpeed=-4;
 const g=ditchingGuide(s);assert.equal(row(g,'sink').status,'偏高');assert.equal(row(g,'pitch').status,'偏低');assert.equal(row(g,'roll').status,'偏低');assert.equal(row(g,'gear').state,'caution');assert.equal(row(g,'gear').value,'TRANSIT');assert.equal(row(g,'flaps').value,'1.2');assert.equal(row(g,'flaps').state,'caution');
 s.verticalSpeed=1;assert.equal(row(ditchingGuide(s),'sink').value,'-1.0');assert.equal(row(ditchingGuide(s),'sink').state,'caution');
});
test('first contact remains frozen through deceleration, flotation, configuration changes and yaw',()=>{
 const s=entry();beginWaterContact(s,{x:s.x,y:s.y,z:s.z,time:12,part:'belly-aft',point:{x:s.x,y:0,z:s.z}},{current:eventWaterCurrent});const initial=ditchingGuide(s);
 assert.equal(initial.phase,'contact');Object.assign(s,{y:-.36,speed:1,verticalSpeed:0,pitch:-.02,roll:.1,yaw:1.4,gearPosition:1,flapPosition:4});s.velocity={x:1,y:0,z:0};s.airData.ias=1;s.water.phase='evacuation';
 assert.deepEqual(ditchingGuide(s),initial);assert.equal(row(initial,'ias').value,'130.0');assert.equal(row(initial,'pitch').value,'9.5');assert.equal(row(initial,'gear').value,'UP');assert.equal(row(initial,'flaps').value,'2.0');
});
test('airborne water slip and water speed use exactly the contact model current and coordinate frame',()=>{
 const s=entry(),g=ditchingGuide(s);beginWaterContact(s,{x:s.x,y:s.y,z:s.z,time:1,part:'belly-aft',point:{x:s.x,y:0,z:s.z}},{current:eventWaterCurrent});assert.equal(row(g,'slip').value,(s.water.firstImpact.waterBeta/RAD).toFixed(1));assert.equal(row(g,'water-speed').value,(s.water.firstImpact.waterSpeed*KT).toFixed(1));
 const a=eventHeading*RAD,east=0,north=-.35;assert.deepEqual(eventWaterCurrent,{x:east*Math.cos(a)-north*Math.sin(a),z:-(east*Math.sin(a)+north*Math.cos(a))});
});
test('mass-scaled preferred IAS agrees with speed scoring, and runway/free-flight contexts stay separate',()=>{
 const s=entry();s.weight=60;const g=ditchingGuide(s),mass=Math.sqrt(60/WATER_ENTRY_TARGETS.referenceMass);assert.equal(row(g,'ias').target,`${Math.round(120*mass)}–${Math.round(135*mass)}`);
 const ideal={ias:127.5*mass/KT,pitch:9.5*RAD,roll:0,waterBeta:0,sinkMps:1,massTonnes:60};assert.equal(waterEntryQuality(ideal).speed,1);
 s.historical.manualTarget='LGA-22';assert.equal(ditchingGuide(s),null);s.historical.manualTarget='free';assert(ditchingGuide(s));s.y=1200/FT;assert.equal(ditchingGuide(s),null);assert.equal(ditchingGuide(createFlight()),null);
});
test('guidance and challenge display identical targets without switching on the challenge FD',()=>{
 const s=entry();s.historical.mode='challenge';s.flightDirector=false;const before=structuredClone(s),g=ditchingGuide(s);assert(g);assert.deepEqual(s,before);
 for(const value of[g.context,g.note,'入水建议范围',...g.rows.flatMap(r=>[r.label,r.status])])assert(!/\p{Script=Han}/u.test(t(value,'en')),value);
});
