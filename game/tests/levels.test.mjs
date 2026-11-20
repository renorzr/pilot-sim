import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {LEVELS,getLevel,nextLevel} from '../src/missions/catalog.js';
import {trimAlpha} from '../src/sim/aerodynamics.js';
import {holdConfiguration,afterLevelPhysics} from '../src/missions/runtime.js';
import {createFlight,advanceFlight,advanceSimulation,centerStick,radioAltitude,setMotion,setDetent,setLever,stepFlaps,toggleGear,toggleAP,toggleApproach,toggleAutoThrust,toggleReverse,beginGoAround,confirmAction,restoreCheckpoint,KT} from '../src/flight.js';
import {queueRadio,updateRadio,calloutClip} from '../src/comms/radio.js';
import script from '../src/comms/script.json' with {type:'json'};
import durations from '../src/comms/durations.json' with {type:'json'};
import {loadProgress,saveProgress,normalizeProgress,recordResult,recommendedLevel} from '../src/missions/progress.js';
import {flyLevel,pilotInput} from './pilot.mjs';
function advance(s,seconds,input={}){for(let i=0;i<seconds*50&&!s.result;i++)advanceFlight(s,typeof input==='function'?input(s):input,.02);return s;}
// Prepared 900 ft unit fixture for testing a fault in isolation. Playable
// entry conditions and full preparation are separately tested for every level.
function trigger(id){
 const s=createFlight(null,{levelId:id});
 if(id==='dual-glide'){advance(s,2.2);return s;}
 s.x=0;s.y=2.8+900/3.28084;s.z=(s.y-2.8-15.24)/Math.tan(3*Math.PI/180);s.yaw=0;
 s.gear=true;s.gearPosition=1;s.flaps=s.flapPosition=id==='flap-jam'?2:s.landingConfig;s.spoilersArmed=true;s.autoBrake='MED';s.landingChecklistConfirmed=false;
 s.apprArmed=s.locCaptured=s.gsCaptured=true;s.previousRA=900;setMotion(s,{speed:(id==='flap-jam'?165:s.vapp)/KT,verticalSpeed:-3.8,yaw:0});s.pitch=trimAlpha(s)+s.airData.gamma;
 if(id==='flap-jam')stepFlaps(s,1);advance(s,.02);return s;
}

test('13 ordered levels include a continuous single-engine return, weather and selected failures',()=>{
 assert.equal(LEVELS.length,13);assert.equal(new Set(LEVELS.map(l=>l.id)).size,13);
 LEVELS.forEach((l,i)=>{assert.equal(l.order,i+1);if(i)assert(l.difficulty>=LEVELS[i-1].difficulty);const s=createFlight(null,{levelId:l.id});assert.equal(s.levelId,l.id);assert.equal(s.mission.kind,l.kind);assert(!s.result);});
 assert.equal(getLevel('engine-out').kind,'engine-return');assert.equal(nextLevel('dual-glide'),null);assert.equal(nextLevel('missing'),null);
});
for(const l of LEVELS)test(`whole-level flight: ${l.id}`,()=>{
 const s=flyLevel(createFlight(null,{levelId:l.id}));assert(s.result?.levelCleared,JSON.stringify({id:l.id,result:s.result,phase:s.phase,route:s.route?.index}));
 if(l.kind==='circuit'||l.kind==='engine-return'){assert.deepEqual(s.route.visited,[0,1,2,3]);assert(s.route.inFinal);assert(s.touchdown&&s.landingChecklistConfirmed);assert(s.gates.every(g=>g.passed&&!g.preset));}
 if(l.kind==='engine-return'){assert.equal(s.engines[0].status,'failed');assert.equal(s.engines[0].thrustN,0);assert.equal(s.airData.groundSpeed,0);}
 if(['takeoff','short-landing','ils-approach','goaround','circuit','crosswind','low-visibility','athr-failure','ils-loss'].includes(l.id))assert.equal(s.radio.emergency,null,`${l.id}: controllable ordinary scenario should not declare an emergency`);
 if(l.kind==='dual-glide'){assert(s.engines.every(e=>e.thrustN===0&&e.status==='failed'));assert(s.touchdown.descent<6.5);assert(s.z>=-2600);}
});
test('optional AP flies the continuous single-engine route and hands back the manual final',()=>{
 const s=createFlight(null,{levelId:'engine-out'});let enabled=false,handedBack=false;
 for(let i=0;i<40000&&!s.result;i++){let input=pilotInput(s);
  if(s.route.active&&!s.route.inFinal&&s.mission.triggered&&radioAltitude(s)>300){if(!enabled){centerStick(s);toggleAP(s);enabled=true;}input={};}
  if(enabled&&s.route.inFinal&&radioAltitude(s)<200&&!s.autoPilot)handedBack=true;
  advanceFlight(s,input,.02);
 }
 assert(enabled&&handedBack);assert(s.result?.levelCleared);assert.equal(s.engines[0].thrustN,0);assert.deepEqual(s.route.visited,[0,1,2,3]);
});
test('route stages are reached by continuous movement and gates only run in final',()=>{
 const s=createFlight(null,{levelId:'circuit'});let distance=0,maxJump=0;
 for(let i=0;i<40000&&!s.result;i++){const before={x:s.x,y:s.y,z:s.z};advanceFlight(s,pilotInput(s),.02);const d=Math.hypot(s.x-before.x,s.y-before.y,s.z-before.z);distance+=d;maxJump=Math.max(maxJump,d);if(!s.route.inFinal)assert.equal(s.gates.length,0);}
 assert(s.result?.levelCleared);assert(distance>24000);assert(maxJump<10);for(const key of ['crosswind','downwind','base','final'])assert(s.radio.fired[key]);
});
test('climbing through 1000 ft does not finish the merged single-engine lesson',()=>{
 const s=createFlight(null,{levelId:'engine-out'});
 for(let i=0;i<10000&&radioAltitude(s)<1100;i++)advanceFlight(s,pilotInput(s),.02);
 assert(radioAltitude(s)>=1100);assert.equal(s.engines[0].status,'failed');assert.equal(s.result,null);assert(!s.route.inFinal);
 const r=restoreCheckpoint(s);assert.equal(r.engines[0].status,'failed');assert(r.mission.practice);const count=r.mission.events.filter(e=>e.type==='engine').length;advance(r,.1,pilotInput);assert.equal(r.mission.events.filter(e=>e.type==='engine').length,count);
});
test('A/THR failure latches availability and holds current output until lever matching',()=>{
 const s=trigger('athr-failure'),lever=s.throttle,held=[...s.systems.heldCommands];
 assert(!s.systems.autoThrustAvailable&&s.systems.thrustLocked);assert.equal(lever,.78);assert.equal(toggleAutoThrust(s),false);
 s.autoThrust=true;advance(s,1);assert.equal(s.autoThrustActive,false);assert.equal(s.throttle,lever);s.engines.forEach((e,i)=>assert(Math.abs(e.command-held[i])<.001));
 setLever(s,held.reduce((a,b)=>a+b)/2);assert(!s.systems.thrustLocked);assert(s.mission.manualTakenOver);assert(!s.systems.autoThrustAvailable);
});
test('ILS loss removes signal capture and does not feed hidden runway truth to AP',()=>{
 const s=trigger('ils-loss');assert(!s.systems.ils.localizer&&!s.systems.ils.glideSlope);assert(!s.locCaptured&&!s.gsCaptured&&!s.flightDirector&&!s.autoPilot);
 toggleApproach(s);assert(!s.apprArmed);s.x=500;advance(s,.02);assert(Math.abs(s.guidance.roll)<.001);assert(s.locDeviation!==0);assert(!s.gsCaptured);
});
test('flap jam freezes actual position and uses the real configuration for speed/checks',()=>{
 const s=trigger('flap-jam');assert(s.systems.flapsJammed);assert.equal(s.flapPosition,2);assert.equal(s.landingConfig,2);assert.equal(s.vapp,165);
 assert.equal(stepFlaps(s,-1),false);advance(s,2);assert.equal(s.flapPosition,2);confirmAction(s);assert(s.mission.acknowledged);assert(!s.landingChecklistConfirmed);confirmAction(s);assert(s.landingChecklistConfirmed);
});
test('a jammed-flap go-around continues into a real return and landing with the actual stuck configuration',()=>{
 const s=trigger('flap-jam');confirmAction(s);beginGoAround(s);advance(s,220,pilotInput);assert.equal(s.result,null);assert.equal(s.mission.recovery.stage,'return');assert.equal(s.flapPosition,2);flyLevel(s);assert(s.result?.levelCleared);assert.equal(s.touchdown.flapPosition,2);
});
test('double failure removes thrust/AP/reverse and never repairs itself on crew commands',()=>{
 const s=trigger('dual-glide');assert(s.engines.every(e=>e.thrustN===0));assert(s.systems.emergencyPower&&!s.systems.apAvailable);assert.equal(s.throttle,.78);toggleAP(s);assert(!s.autoPilot);assert.equal(beginGoAround(s),false);
 setDetent(s,'TOGA');advance(s,2);assert(s.engines.every(e=>e.thrustN===0));assert(!s.autoThrustActive);s.landed=true;setDetent(s,'IDLE');toggleReverse(s);assert(!s.reverse);
});
test('rain/fog visual conditions and wet/crosswind forces are distinct presets',()=>{
 const fog=createFlight(null,{levelId:'low-visibility'}),wet=createFlight(null,{levelId:'crosswind'});
 assert(fog.weather.visibility<1000&&fog.weather.overcast>.5&&fog.weather.rain>0);advance(fog,.02);assert(!fog.systems.visualReferences);
 assert(wet.weather.runwayFriction<.5);assert(Math.abs(wet.airData.wind.x)>3);assert(wet.weather.visibility>10000);
});
test('late low-visibility decisions continue to landing instead of ending in the air',()=>{
 const s=trigger('low-visibility');s.y=2.8+90/3.28084;s.z=1000;setMotion(s,{speed:150/KT,verticalSpeed:-3});advance(s,.02);assert(s.mission.lateDecision);beginGoAround(s);advance(s,220,pilotInput);assert.equal(s.result,null);assert(s.mission.recovery);flyLevel(s);assert(s.result?.levelCleared);assert(s.touchdown&&s.airData.groundSpeed===0);
});
test('lowering FCU altitude cannot bypass the decision lesson climb, and circuit abort selects 3000 ft',()=>{
 const s=createFlight(null,{levelId:'low-visibility'});beginGoAround(s);s.selectedAltitude=1000;
 s.y=2.8+1000/3.28084;s.gear=false;s.gearPosition=0;s.flaps=s.flapPosition=1;setMotion(s,{speed:180/KT,verticalSpeed:0});
 advance(s,8,pilotInput);assert.equal(s.result,null);assert(s.mission.stableSeconds<3);
 const circuit=createFlight(null,{levelId:'circuit'});circuit.airborne=true;setMotion(circuit,{speed:175/KT,verticalSpeed:3});circuit.y=400;
 assert(beginGoAround(circuit));assert.equal(circuit.selectedAltitude,3000);assert(!circuit.route.active);
});
test('early low-visibility avoidance is accepted',()=>{
 const s=createFlight(null,{levelId:'low-visibility'});beginGoAround(s);advance(s,220,pilotInput);assert.equal(s.result,null);assert(s.mission.avoided);flyLevel(s);assert(s.result?.levelCleared&&s.landed);
});
test('windshear holds configuration and permits existing but not new AP during encounter',()=>{
 const s=createFlight(null,{levelId:'windshear'});s.gear=true;s.gearPosition=1;s.flaps=s.flapPosition=3;s.mission.triggered=true;s.mission.clear=false;assert(holdConfiguration(s));assert.equal(toggleGear(s),false);assert.equal(stepFlaps(s,-1),false);toggleAP(s);assert(!s.autoPilot);s.autoPilot=true;advance(s,.02);assert(s.autoPilot);
 s.mission.clear=true;assert(toggleGear(s));assert(stepFlaps(s,-1));
});
test('a safe go-around in a landing-only lesson is acknowledged without false completion',()=>{
 const s=createFlight(null,{levelId:'short-landing'});s.result={success:true,title:'复飞成功',score:95};afterLevelPhysics(s,.02);assert(!s.result.levelCleared);
});
test('whole ILS completion needs both actual gates and checklist',()=>{
 const s=createFlight(null,{levelId:'ils-approach'});s.landed=true;s.result={success:true,score:55};afterLevelPhysics(s,.02);assert(!s.result.levelCleared);
});
test('radio is event-driven, serial, one-shot and critical conversations replace stale ones',()=>{
 const s=createFlight(null,{levelId:'takeoff'});advance(s,.02);assert.equal(s.radio.active.clip,'takeoff-0');const count=s.radio.pending.length;queueRadio(s,'takeoff');assert.equal(s.radio.pending.length,count);
 queueRadio(s,'engine',true);assert.equal(s.radio.active,null);s.time+=3;updateRadio(s);assert.equal(s.radio.active.clip,'engine-0');s.time=s.radio.active.until+.1;updateRadio(s);assert.equal(s.radio.active,null);s.time+=1;updateRadio(s);assert.equal(s.radio.active.clip,'engine-1');
 assert.equal(calloutClip('Five hundred, stable'),'call-h500');assert.equal(calloutClip('Autopilot off'),'call-ap-off');
});
test('paused simulation freezes radio and phase replay preserves already-fired exchanges',()=>{
 const s=createFlight(null,{levelId:'takeoff'});advance(s,.02);const active=structuredClone(s.radio.active);advanceSimulation(s,{},0);assert.deepEqual(s.radio.active,active);
 const r=restoreCheckpoint(s);assert(r.mission.practice);assert.deepEqual(r.radio.fired,s.checkpoint.radio.fired);
});
test('all scripted dialogue and safety cues have self-hosted, nonempty audio with duration metadata',async()=>{
 const ids=Object.keys(script).flatMap(key=>script[key].map((_,i)=>`${key}-${i}`));for(const id of [...ids,'call-h1000','call-h20','call-engine-one','call-all-engines','call-wind-shear','call-stall']){assert(durations[id]>0&&durations[id]<30,id);const file=process.env.PILOT_SIM_RADIO_ASSETS?join(process.env.PILOT_SIM_RADIO_ASSETS,`${id}.mp3`):new URL(`../../public/assets/radio/${id}.mp3`,import.meta.url);assert((await stat(file)).size>1000,id);const header=await readFile(file);assert(header.length>1000);}
});
test('progress retains unchanged lessons but invalidates old climb-only engine scores',()=>{
 const p=normalizeProgress({levels:{takeoff:{bestScore:94},'engine-out':{bestScore:100},windshear:{bestScore:99}}});assert.equal(p.levels.takeoff.stars,3);assert(!p.levels['engine-out']);assert(!p.levels.windshear);assert.equal(p.version,2);
 const s=createFlight(null,{levelId:'engine-out'});s.result={success:true,levelCleared:true,score:95};const next=recordResult(p,s);assert.equal(next.levels['engine-out'].revision,2);assert.equal(next.levels['engine-out'].bestScore,95);
});
test('best records persist without decreasing and phase practice cannot overwrite them',()=>{
 const values=new Map(),store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let p=loadProgress(store);const s=createFlight(null,{levelId:'takeoff'});s.result={success:true,levelCleared:true,score:94};p=recordResult(p,s);assert(saveProgress(store,p));assert.deepEqual(loadProgress(store),p);assert.equal(recommendedLevel(p).id,'short-landing');s.result.score=70;assert.equal(recordResult(p,s),p);s.mission.practice=true;s.result.score=100;assert.equal(recordResult(p,s),p);
});
test('corrupt or denied local storage never blocks flight or creates achievements',()=>{
 const bad={getItem:()=>{throw Error();},setItem:()=>{throw Error();}};assert.deepEqual(loadProgress(bad),normalizeProgress(null));assert(!saveProgress(bad,normalizeProgress(null)));assert.deepEqual(normalizeProgress({levels:{unknown:{bestScore:100},takeoff:{bestScore:NaN}}}),normalizeProgress(null));
});
