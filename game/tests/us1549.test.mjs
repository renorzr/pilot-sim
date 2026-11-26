// Deterministic numerical fixtures are physical-model evidence. They are not
// keyboard/pointer end-to-end flight evidence or an historical reconstruction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,advanceFlight,advanceSimulation,setDetent,setLever,setEngineStatus,stepFlaps,toggleGear,toggleAP,toggleApproach,restoreCheckpoint,setMotion,KT,FT,RAD} from '../src/flight.js';
import {refreshAirData,trimAlpha} from '../src/sim/aerodynamics.js';
import {advanceAtRate} from '../src/sim/time-acceleration.js';
import {beginWaterContact,stepWaterDynamics,impactDamage,sweptSurfaceContact,probePosition,WATER_PROBES} from '../src/sim/water-contact.js';
import {chooseHistorical,takeHistoricalControl,historicalQuestion,historicalPilotInput,historyHeight,historicalCandidates} from '../src/history/us1549.js';
import {US1549_PROFILE as P} from '../src/history/us1549-profile.js';
import {eventProject,eventUnproject,eventGroundMSL,eventWaterAt,eventHudsonAt} from '../src/history/event-world.js';
import {historicalObstacles} from '../src/history/obstacles.js';
import {cityRay,sweptCityContact} from '../src/terrain/city-obstacles.js';
import {airportOf,AIRPORTS} from '../src/airports/registry.js';
import {onRunway} from '../src/terrain/heightfield.js';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {recordHistoricalResult,loadHistoricalProgress,saveHistoricalProgress} from '../src/history/progress.js';
import {normalizeProgress,recordResult} from '../src/missions/progress.js';
import {historicalCityData} from '../src/history/nyc-city.js';
import {AIRCRAFT_CONTACTS} from '../src/aircraft/contact-anchors.js';
const start=options=>createFlight(null,{levelId:P.id,...options});
const near=(a,b,e=1e-6)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
function fly(s,seconds,input={}){for(let n=0;n<Math.round(seconds*100)&&!s.result;n++)advanceFlight(s,typeof input==='function'?input(s):input,.01);return s;}
function decisions(s){chooseHistorical(s,'left');fly(s,6);assert(chooseHistorical(s,'assess'));assert(chooseHistorical(s,'river'));fly(s,6);}
function waterFixture({speed=125,sink=3.8,roll=.4,pitch=9.5,gear=0}={}){
 const s=start({historical:{practice:true}}),p=eventProject(-74.0057,40.7713);
 Object.assign(s,{x:p.x,z:p.z,y:3.6,pitch:pitch*RAD,roll:roll*RAD,gear:!!gear,gearPosition:gear,flaps:2,flapPosition:2});
 s.y=0;s.y=-Math.min(...WATER_PROBES.filter(p=>!p.gear||gear).map(p=>probePosition(s,p).y));
 setMotion(s,{speed:speed/KT,verticalSpeed:-sink,yaw:0});
 beginWaterContact(s,{x:s.x,y:s.y,z:s.z,part:'belly-aft',point:{x:s.x,y:0,z:s.z}},{level:0});return s;
}
test('source-derived start has one stable NYC frame and an explicit AGL to MSL conversion',()=>{
 const s=start(),p=eventUnproject(s.x,s.z);near(p.latitude,P.initial.latitude);near(p.longitude,P.initial.longitude);
 near((s.y-eventGroundMSL(s.x,s.z))*FT,2818);near(s.speed*KT,219);assert.equal(s.weight,68.5);
 assert.equal(s.airportId,'us1549');assert.equal(airportOf(s).event,true);assert.equal(AIRPORTS.length,6);assert(!onRunway(0,-200,s));
 assert(s.engines.every(e=>e.status==='failed'&&e.irrecoverable));assert(!s.gear&&s.flapPosition===0);assert(!s.water);
});
test('Hudson qualification is narrower than source water contact and preserves land',()=>{
 const river=eventProject(-74.0057,40.7713),land=eventProject(-73.98,40.77),bay=eventProject(-73.8,40.57);
 assert(eventWaterAt(river.x,river.z));assert(eventHudsonAt(river.x,river.z));assert(!eventWaterAt(land.x,land.z));assert(eventWaterAt(bay.x,bay.z));assert(!eventHudsonAt(bay.x,bay.z));
 for(const q of P.riverTargets){const p=eventProject(...q);assert(eventWaterAt(p.x,p.z),'River navigation target must be inside source water');}
});
test('decision choices require physical execution; rapid clicks cannot skip the crew phase',()=>{
 const s=start();assert(!chooseHistorical(s,'ditch'));assert(chooseHistorical(s,'left'));assert.equal(historicalQuestion(s).id,'executing');assert(!chooseHistorical(s,'assess'));assert(!takeHistoricalControl(s));
 fly(s,6);assert.equal(historicalQuestion(s).id,'lga');assert(s.historical.executionEvidence[0].distance>=400);
 assert(chooseHistorical(s,'assess'));assert(chooseHistorical(s,'river'));assert(!chooseHistorical(s,'ditch'));fly(s,6);assert(chooseHistorical(s,'ditch'));assert.equal(s.historical.controlSource,'player');
});
test('copilot uses normal control inputs, ignores player flight controls and does not engage AP1',()=>{
 const a=start(),b=start();for(let i=0;i<500;i++){advanceFlight(a,{},.01);advanceFlight(b,{pitch:1,steer:1,throttle:1,rudder:1,brake:true},.01);}
 assert.deepEqual(a.velocity,b.velocity);near(a.pitch,b.pitch);near(a.roll,b.roll);assert(!a.autoPilot);
 assert.equal(stepFlaps(a),false);assert.equal(toggleGear(a),false);assert.equal(toggleAP(a),false);assert.equal(toggleApproach(a),false);
});
test('handover is immediate, continuous and independent of pending speech',()=>{
 const s=start();decisions(s);s.radio.active={clip:'old',event:'history-decision',until:999};
 const keys=['x','y','z','pitch','roll','yaw','speed','flapPosition','gearPosition'],before=keys.map(k=>s[k]),velocity={...s.velocity};
 assert(takeHistoricalControl(s));assert.deepEqual(keys.map(k=>s[k]),before);assert.deepEqual(s.velocity,velocity);assert.equal(s.radio.active,null);
 advanceFlight(s,{pitch:1},.01);assert(s.controls.pitchCommand>0);assert.equal(s.historical.controlSource,'player');
});
test('early practice is irreversible across retries; full restart clears it and keeps faulted engines',()=>{
 const s=start();assert(takeHistoricalControl(s,{early:true}));assert(s.historical.earlyTakeover&&s.mission.practice);
 const r=restoreCheckpoint(s);assert(r.historical.earlyTakeover&&r.mission.practice);assert(r.engines.every(e=>e.irrecoverable&&e.status==='failed'));
 const full=start();assert(!full.historical.earlyTakeover&&!full.mission.practice);
});
test('final practice starts on the river with downstream guidance and cannot produce training progress',()=>{
 const s=start({historical:{finalApproach:true,practice:true}});assert(eventWaterAt(s.x,s.z));assert.equal(s.historical.strategy,'river');assert.equal(s.phase,'manual-glide');assert(s.historical.earlyTakeover&&s.mission.practice);near(historyHeight(s),300);
 const legacy=normalizeProgress({levels:{'history-us1549':{revision:1,bestScore:100}}});assert.equal(legacy.levels['history-us1549'],undefined);
});
test('TOGA, levers, restart requests and A/THR cannot repair bird damage or create thrust',()=>{
 const s=start({historical:{practice:true}});for(let i=0;i<2;i++)assert.equal(setEngineStatus(s,i,'running'),false);
 setDetent(s,'TOGA');setLever(s,1);s.autoThrust=true;fly(s,12,{throttle:1});assert(s.engines.every(e=>e.thrustN===0&&e.n1>0));assert.equal(s.totalThrustN,0);assert.equal(s.goAround,false);assert.equal(s.autoThrustActive,false);
});
test('guidance modes share physical initialization; paused and accelerated clocks do not alter formal rate',()=>{
 const a=start(),b=start({historical:{mode:'challenge'}});assert.deepEqual(a.velocity,b.velocity);near(a.y,b.y);assert(a.flightDirector&&!b.flightDirector);
 advanceAtRate(a,{},.5,4);advanceAtRate(b,{},.5,1);near(a.time,.5);assert.deepEqual(a.velocity,b.velocity);
 const before=structuredClone(a);advanceSimulation(a,{},0);assert.deepEqual(a,before);
});
test('reachable-area estimates respond to wind, height, orientation and actual configuration',()=>{
 const s=start(),before=historicalCandidates(s);assert(before.every(x=>Number.isFinite(x.margin)&&x.turnDistance>=0&&x.alignment>=0));
 s.y-=200;const low=historicalCandidates(s);near(before[0].margin-low[0].margin,200);
 s.gearPosition=1;s.flapPosition=2;const dirty=historicalCandidates(s);assert(dirty[0].requiredHeight>low[0].requiredHeight);
 s.airData.wind.x+=20;const windy=historicalCandidates(s);assert.notEqual(windy[0].requiredHeight,dirty[0].requiredHeight);
});
test('swept probes find earliest contact at coarse steps and include pitch, roll and gear',()=>{
 const previous={x:0,y:10,z:0,yaw:0,pitch:.12,roll:.08,gearPosition:1},current={...previous,x:100,y:-5};
 const options={waterAt:()=>true,surfaceAt:()=>0,level:0};const hit=sweptSurfaceContact(previous,current,options);assert(hit.fraction>0&&hit.fraction<1);near(hit.point.y,0,.002);
 const p=probePosition(previous,{x:0,y:0,z:12});assert(p.y<previous.y);
 const segments=[];for(let j=1;j<=20;j++){const a={...previous,x:(j-1)*5,y:10-(j-1)*.75},b={...current,x:j*5,y:10-j*.75},h=sweptSurfaceContact(a,b,options);if(h){segments.push({...h,fraction:(j-1+h.fraction)/20});break;}}
 near(hit.fraction,segments[0].fraction,.001);
});
test('water does not hide a later shoreline contact while already decelerating',()=>{
 const a={x:0,y:1,z:0,yaw:0,pitch:0,roll:0,gearPosition:0},b={...a,x:100};
 const hit=sweptSurfaceContact(a,b,{waterAt:x=>x<40,surfaceAt:()=>3,ignoreWater:true});assert(hit&&hit.type==='terrain');assert(hit.fraction>0&&hit.fraction<1);
});
test('bridge deck and towers are collidable while genuine open space below stays open',()=>{
 for(const o of historicalObstacles.filter(o=>o.kind==='ship')){assert(eventWaterAt(o.cx,o.cz));assert.equal(cityRay({x:o.cx-80,y:4,z:o.cz},{x:o.cx+80,y:4,z:o.cz},'us1549').obstacle.id,o.id);}
 const deck=historicalObstacles[0],across=(y)=>[{x:deck.cx-Math.sin(deck.angle)*100,y,z:deck.cz+Math.cos(deck.angle)*100},{x:deck.cx+Math.sin(deck.angle)*100,y,z:deck.cz-Math.cos(deck.angle)*100}];
 const low=across(20),high=across(63);assert.equal(cityRay(...low,'us1549'),null);assert.equal(cityRay(...high,'us1549').obstacle.id,deck.id);
 const a={...high[0],pitch:0,roll:0,yaw:0,airportId:'us1549'},b={...high[1],pitch:0,roll:0,yaw:0,airportId:'us1549'};assert(sweptCityContact(a,b));
});
test('historical impact reference remains damaged but survivable; nearby roll values vary continuously',()=>{
 const a=waterFixture(),snapshot=structuredClone(a.water.firstImpact);assert(a.water.damage>0&&a.water.damage<1&&!a.water.fatal);
 const x={...snapshot,roll:3*RAD},y={...snapshot,roll:3.1*RAD};assert(Math.abs(impactDamage(x)-impactDamage(y))<.01);
 for(let n=0;n<7000&&!a.water.fatal;n++){a.time+=.01;stepWaterDynamics(a,.01);}assert(!a.water.fatal);assert.equal(a.water.phase,'evacuation');assert(a.water.evacuationAvailable>=45);assert(a.water.waterSpeed<5/KT);
 assert.deepEqual(a.water.firstImpact,snapshot);assert.equal(a.landed,false);assert(!a.reverse&&!a.autoBrakeActive);assert(a.water.elapsed>=10);
});
test('excessive sink, low nose, asymmetric roll and exposed gear increase damage without score rescue',()=>{
 const normal=waterFixture().water.damage;
 for(const preset of[{sink:12},{roll:40},{pitch:-10},{gear:1}]){const s=waterFixture(preset);assert(s.water.damage>normal);if(preset.sink||preset.roll)assert(s.water.fatal);}
});
test('independent water forces cause attitude changes and do not pin position to the river',()=>{
 const s=waterFixture({roll:8}),roll=s.roll,position={x:s.x,y:s.y,z:s.z};
 for(let n=0;n<200;n++)stepWaterDynamics(s,.01);assert.notEqual(s.roll,roll);assert(s.z!==position.z&&s.y!==position.y);assert(s.forces.waterSupportN>0&&s.forces.waterDragN>0);
});
test('water probes share authored-model anchors; entry damage cannot be overwritten by post-impact handover',()=>{
 assert(AIRCRAFT_CONTACTS.water.some(p=>p.id==='belly-mid'&&p.y===-1.17));
 const s=waterFixture();s.historical.controlSource='copilot';s.historical.node='commit';assert.equal(historicalQuestion(s),null);assert.equal(takeHistoricalControl(s),false);assert.equal(takeHistoricalControl(s,{early:true}),false);
});
test('historical skyline adaptation leaves reusable source data unchanged and excludes modern tower collisions',()=>{
 const p=eventProject(-74.001,40.755),b={cx:p.x,cz:p.z,height:300,baseY:2,topY:302},source={building:()=>({...b}),candidates:function*(){yield{...b};},snapshot:()=>({})};
 const adapted=historicalCityData(source,airportOf('us1549'));assert.equal(adapted.building(0).height,0);assert.deepEqual(source.building(),b);assert.deepEqual([...adapted.candidates()],[]);
});
test('historical records isolate mode/revision and exclude practice and physical-only success',()=>{
 const s=start();s.result={levelCleared:true,physicalSuccess:true,score:88};let p={version:1,records:{}};
 p=recordHistoricalResult(p,s);assert.equal(Object.keys(p.records).length,1);s.historical.mode='challenge';p=recordHistoricalResult(p,s);assert.equal(Object.keys(p.records).length,2);
 s.historical.earlyTakeover=true;assert.equal(recordHistoricalResult(p,s),p);assert.deepEqual(recordResult(normalizeProgress(null),s),normalizeProgress(null));
 assert.deepEqual(loadHistoricalProgress({getItem:()=>'{bad'}),{version:1,records:{}});assert(!saveHistoricalProgress(null,p));
});
test('continuous control-only fixture reaches Hudson, hands over with energy left, floats and records the actual water motion',()=>{
 const s=start(),r=new FlightRecording();r.observe(s);let maxStep=0,handed=false,snapshot;
 for(let n=0;n<26000&&!s.result;n++){
  if(n===1000)assert(chooseHistorical(s,'left'));if(n===2200)assert(chooseHistorical(s,'assess'));if(n===3500)assert(chooseHistorical(s,'river'));
  if(s.time>105&&!handed){assert(chooseHistorical(s,'ditch'));assert(historyHeight(s)>800&&historyHeight(s)<1200);assert(stepFlaps(s));handed=true;}
  let input={};if(handed&&!s.water){if(s.flaps===1&&s.speed*KT<199)assert(stepFlaps(s));input=historicalPilotInput(s,{approach:historyHeight(s)<800});if(s.y<15){const sink=-Math.max(.8,Math.min(2.5,s.y*.15)),pitch=Math.min(.20,trimAlpha(s)+Math.atan2(sink,s.airData.horizontal)+(sink-s.verticalSpeed)*.008);input.pitch=Math.max(-1,Math.min(1,(pitch-s.pitch)*3.2-s.pitchRate*2));}}
  const before={x:s.x,y:s.y,z:s.z};advanceFlight(s,input,.01);r.observe(s,input);maxStep=Math.max(maxStep,Math.hypot(s.x-before.x,s.y-before.y,s.z-before.z));
  assert.equal(s.totalThrustN,0);if(s.water&&!snapshot)snapshot=structuredClone(s.water.firstImpact);
 }
 assert(s.result?.levelCleared,JSON.stringify(s.result));assert(s.result.physicalSuccess);assert(!s.landed);assert(s.time>180);assert(maxStep<2);assert(snapshot);assert.deepEqual(snapshot,s.water.firstImpact);
 const impact=r.events.find(e=>e.type==='water-contact');assert(impact);assert(r.events.some(e=>e.type==='afloat'));assert(r.timeline.some(e=>e.type==='mission'&&e.data.some(x=>x.type==='water-contact')));
 const replay=r.sample(impact.segment,impact.time);near(replay.water.firstImpact.sinkMps,snapshot.sinkMps,.001);assert.equal(replay.historical.controlSource,'player');assert(replay.water.damage>0);
});
test('slow and fast frame batches retain the same physical ticks and guided/challenge use the same dynamics',()=>{
 const a=start(),b=start(),c=start({historical:{mode:'challenge'}});
 for(let i=0;i<20;i++){advanceSimulation(a,{},.5);advanceSimulation(c,{},.5);}
 for(let i=0;i<600;i++)advanceSimulation(b,{},1/60);
 for(const k of ['time','x','y','z','speed','pitch','roll']){near(a[k],b[k],1e-9);near(a[k],c[k],1e-9);}
 assert(a.flightDirector&&!c.flightDirector);
});
test('sustained aft stick can stall and lose the aircraft; feedback cannot manufacture a safe outcome',()=>{
 const s=start();assert(takeHistoricalControl(s,{early:true}));let stalled=false;
 for(let n=0;n<9000&&!s.result;n++){advanceFlight(s,{pitch:1},.01);stalled||=s.stallWarning.active;}
 assert(stalled);assert(s.result&&!s.result.success&&!s.result.physicalSuccess);assert.equal(s.result.score,0);assert(s.engines.every(e=>e.thrustN===0));
});
test('excessive water-entry speed has a continuous penalty and can make an otherwise survivable attitude fatal',()=>{
 const a=waterFixture({speed:125}),b=waterFixture({speed:155}),c=waterFixture({speed:180});
 assert(a.water.damage<b.water.damage&&b.water.damage<c.water.damage);assert(!a.water.fatal&&c.water.fatal);
 const impact=b.water.firstImpact;assert(Math.abs(impactDamage({...impact,waterSpeed:impact.waterSpeed+.1/KT})-impactDamage(impact))<.01);
});
