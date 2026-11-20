import test from'node:test';import assert from'node:assert/strict';
import{createFlight,advanceFlight,restoreCheckpoint,setEngineStatus}from'../src/flight.js';import{pilotInput,flyLevel}from'./pilot.mjs';
import{observeEmergency}from'../src/comms/emergency.js';import{queueRadio,repeatRadio,updateRadio}from'../src/comms/radio.js';
import script from'../src/comms/script.json' with{type:'json'};
const MAY='MAYDAY, MAYDAY, MAYDAY.',PAN='PAN PAN, PAN PAN, PAN PAN.';
function monitor(s,seconds){for(let i=0;i<seconds*50;i++){s.time+=.02;observeEmergency(s,.02,queueRadio);}}
function low(){const s=createFlight(null,{levelId:'short-landing'});s.terrain.clearanceFt=500;s.verticalSpeed=-8;return s;}
test('first distress calls repeat MAYDAY three times; urgency repeats all of PAN PAN three times',()=>{
 for(const key of['engine','dual','distress-wind','distress-terrain','distress-stall']){assert(script[key][0][1].startsWith(MAY));assert.equal(script[key][0][1].match(/MAYDAY/g).length,3);}
 for(const key of['flaps','engine-stable']){assert(script[key][0][1].startsWith(PAN));assert.equal(script[key][0][1].match(/PAN/g).length,6);}
 for(const key of['takeoff','approach','athr','ils','wind','clear','minimum','goaround','distress-cancel'])assert(!/MAYDAY|PAN PAN/.test(script[key][0][1]),key);
});
test('low-altitude takeoff engine failure and dual loss generate real distress events',()=>{
 for(const id of['engine-out','dual-glide']){const s=createFlight(null,{levelId:id});for(let i=0;i<6000&&!s.mission.triggered;i++)advanceFlight(s,pilotInput(s),.02);assert.equal(s.radio.emergency.level,'distress');assert(s.radio.pending.some(l=>l.role==='pilot'&&l.text.startsWith(MAY)&&l.priority===4));assert(s.engines.some(e=>e.status==='failed'));}
});
test('actual CONF 2 flap jam declares urgency while recoverable A/THR and ILS failures stay ordinary reports',()=>{
 for(const id of['flap-jam','athr-failure','ils-loss']){const s=createFlight(null,{levelId:id});for(let i=0;i<10000&&!s.mission.triggered;i++)advanceFlight(s,pilotInput(s),.02);assert(s.mission.triggered);if(id==='flap-jam'){assert.equal(s.radio.emergency.level,'urgency');assert.equal(s.flapPosition,2);}else assert.equal(s.radio.emergency,null);}
});
test('single-engine distress is explicitly downgraded only after sustained stable flight, without repairing the engine',()=>{
 const s=flyLevel(createFlight(null,{levelId:'engine-out'}));assert(s.result?.levelCleared);assert(s.radio.fired['engine-stable']);assert.equal(s.radio.emergency.level,'urgency');assert.equal(s.engines[0].status,'failed');assert.equal(s.engines[0].thrustN,0);
});
test('wind report alone is not distress; sustained low-altitude energy loss escalates',()=>{
 const s=low();s.mission.kind='windshear';s.mission.triggered=true;s.mission.clear=false;queueRadio(s,'wind',true);s.verticalSpeed=-4;monitor(s,2);assert.equal(s.radio.emergency,null);s.verticalSpeed=-8;monitor(s,1);assert.equal(s.radio.emergency,null);monitor(s,.6);assert.equal(s.radio.emergency.event,'distress-wind');
});
test('brief or high stall and terrain cautions do not automatically declare MAYDAY',()=>{
 const s=low();s.stallWarning.active=true;monitor(s,1);assert.equal(s.radio.emergency,null);s.stallWarning.active=false;monitor(s,.1);s.stallWarning.active=true;monitor(s,1);assert.equal(s.radio.emergency,null);s.terrain.clearanceFt=1500;monitor(s,4);assert.equal(s.radio.emergency,null);s.stallWarning.active=false;s.terrain.level=1;s.terrain.timeToImpact=8;monitor(s,3);assert.equal(s.radio.emergency,null);
});
test('sustained low descending stall and imminent terrain produce one distress declaration per active incident',()=>{
 const stall=low();stall.stallWarning.active=true;monitor(stall,2.1);assert.equal(stall.radio.emergency.event,'distress-stall');const n=stall.radio.pending.length;monitor(stall,4);assert.equal(stall.radio.pending.length,n);
 const terrain=low();terrain.terrain.level=2;terrain.terrain.timeToImpact=15;monitor(terrain,2);assert.equal(terrain.radio.emergency,null);terrain.terrain.timeToImpact=8;monitor(terrain,1.6);assert.equal(terrain.radio.emergency.event,'distress-terrain');
});
test('MAYDAY outranks PAN and fault/reminder chatter cannot shorten its delay or interrupt either declaration line',()=>{
 const s=low();queueRadio(s,'dual',true);const ready=s.radio.readyAt;queueRadio(s,'athr',true);repeatRadio(s,'atc-low');assert.equal(s.radio.readyAt,ready);assert(!queueRadio(s,'flaps',true));s.time=ready+.01;updateRadio(s);assert.equal(s.radio.active.event,'dual');assert.equal(s.radio.active.priority,4);repeatRadio(s,'atc-high');assert.equal(s.radio.active.event,'dual');
 s.time=s.radio.active.until+.01;updateRadio(s);s.time+=.6;updateRadio(s);assert.equal(s.radio.active.clip,'dual-1');
 const p=low();queueRadio(p,'flaps',true);p.time=p.radio.readyAt+.01;updateRadio(p);assert.equal(p.radio.active.priority,3);queueRadio(p,'dual',true);assert.equal(p.radio.active,null);assert(p.radio.pending.every(l=>l.event==='dual'));
});
test('transient distress clears only after safe recovery and restores an earlier urgency condition',()=>{
 const s=low();setEngineStatus(s,0,'failed');queueRadio(s,'flaps',true);queueRadio(s,'distress-stall',true);assert.equal(s.radio.emergency.level,'distress');s.stallWarning.active=false;s.terrain.level=0;s.terrain.clearanceFt=1500;s.verticalSpeed=1;monitor(s,14);assert.equal(s.radio.emergency.level,'distress');monitor(s,1.2);assert.equal(s.radio.emergency.level,'urgency');assert.equal(s.engines[0].status,'failed');assert(s.radio.fired['distress-cancel']);
 // A later incident is a new declaration, not an endless repeat of the old one.
 s.terrain.clearanceFt=500;s.verticalSpeed=-5;s.stallWarning.active=true;monitor(s,2.2);assert.equal(s.radio.emergency.level,'distress');assert(!s.radio.fired['distress-cancel']);
});
test('fixed engine distress never self-cancels, and snapshots retain declaration/monitor state',()=>{
 const s=low();queueRadio(s,'dual',true);s.terrain.clearanceFt=1500;s.verticalSpeed=1;monitor(s,20);assert.equal(s.radio.emergency.event,'dual');assert(!s.radio.fired['distress-cancel']);
 const d=createFlight(null,{levelId:'dual-glide'});for(let i=0;i<110;i++)advanceFlight(d,{},.02);const r=restoreCheckpoint(d);assert.deepEqual(r.radio.emergency,d.checkpoint.radio.emergency);assert.deepEqual(r.radio.monitor,d.checkpoint.radio.monitor);
});
test('radio emergency monitoring never changes flight dynamics, system capabilities or controls',()=>{
 const s=low();s.stallWarning.active=true;const before={engines:structuredClone(s.engines),velocity:structuredClone(s.velocity),systems:structuredClone(s.systems),controls:structuredClone(s.controls),x:s.x,y:s.y,z:s.z};monitor(s,3);assert.deepEqual({engines:s.engines,velocity:s.velocity,systems:s.systems,controls:s.controls,x:s.x,y:s.y,z:s.z},before);
});
