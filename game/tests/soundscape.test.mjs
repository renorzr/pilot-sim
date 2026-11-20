import test from 'node:test';
import assert from 'node:assert/strict';
import {soundTargets,ContactSounds} from '../src/audio/soundscape.js';
import {createFlight,advanceFlight,setEngineStatus,setDetent,toggleReverse} from '../src/flight.js';
import {flyLevel,pilotInput} from './pilot.mjs';

test('engine sound follows each actual engine, retaining wind after double failure',()=>{
 const s=createFlight(null,{levelId:'short-landing'}),original=structuredClone(s);
 const both=soundTargets(s);assert(both.engines.every(e=>e.rumble>0&&e.fan>0));
 assert.deepEqual(s,original,'audio sampling cannot mutate flight state');
 setEngineStatus(s,0,'failed');const one=soundTargets(s);
 for(const layer of ['rumble','fan'])assert.equal(one.engines[0][layer],0);
 assert.deepEqual(one.engines[1],both.engines[1]);assert.equal(one.engineNoise,.5);assert(one.wind>0);
 setEngineStatus(s,1,'failed');setDetent(s,'TOGA');const none=soundTargets(s);
 assert(none.engines.every(e=>['rumble','fan','reverse'].every(layer=>e[layer]===0)));assert.equal(none.engineNoise,0);assert(none.wind>0);
});
test('spooled-up running engine gets a stronger and higher sound than idle',()=>{
 const s=createFlight('takeoff');const idle=soundTargets(s);setDetent(s,'TOGA');
 for(let i=0;i<150;i++)advanceFlight(s,{},.02);const high=soundTargets(s);
 assert(high.engineGain>idle.engineGain);assert(high.engines[0].fan>idle.engines[0].fan);assert(high.engines[0].frequency>idle.engines[0].frequency);
});
test('reverse roar requires real ground reverse thrust and independently excludes failed engines',()=>{
 const s=createFlight('landing');s.reverse=true;
 assert(soundTargets(s).engines.every(e=>e.reverse===0),'airborne reverse has no sound');assert.equal(soundTargets(s).reverseBoost,1);
 s.landed=true;s.airborne=false;setDetent(s,'IDLE');toggleReverse(s);s.engines.forEach(e=>{e.spool=.4;e.thrustN=-12000;});
 assert(soundTargets(s).engines.every(e=>e.reverse>0));assert(soundTargets(s).reverseBoost>1);setEngineStatus(s,0,'failed');
 assert.equal(soundTargets(s).engines[0].reverse,0);assert(soundTargets(s).engines[1].reverse>0);
 toggleReverse(s);assert(soundTargets(s).engines.every(e=>e.reverse===0));assert.equal(soundTargets(s).reverseBoost,1);
});
test('ground roll depends on movement/contact and remains audible without engines',()=>{
 const s=createFlight('landing');s.airborne=false;s.landed=true;s.airData.groundSpeed=60;
 s.engines.forEach(e=>e.status='failed');assert(soundTargets(s).ground>0);
 s.airData.groundSpeed=0;assert.equal(soundTargets(s).ground,0);s.airborne=true;s.airData.groundSpeed=60;assert.equal(soundTargets(s).ground,0);
});
test('actual continuous approach produces one main contact and one nose contact',()=>{
 const s=createFlight(null,{levelId:'short-landing'}),contacts=new ContactSounds(),events=[];
 contacts.update(s);
 for(let i=0;i<15000&&!s.result;i++){advanceFlight(s,pilotInput(s),.02);events.push(...contacts.update(s));}
 assert(s.result?.levelCleared);assert.deepEqual(events.map(e=>e.kind),['main','nose']);assert(events[0].strength>0);
});
test('harder contacts are stronger; repeats, checkpoint restoration and initial snapshots are silent',()=>{
 const c=new ContactSounds(),s={time:10,touchdown:null,cabin:{noseAt:null}};assert.deepEqual(c.update(s),[]);
 s.time=11;s.touchdown={time:11,descent:.5};const soft=c.update(s)[0];assert.deepEqual(c.update(s),[]);
 s.time=12;s.touchdown=null;c.update(s);s.time=13;s.touchdown={time:13,descent:3};assert(c.update(s)[0].strength>soft.strength);
 s.time=11;s.touchdown={time:11,descent:.5};assert.deepEqual(c.update(s),[]);
 c.reset();assert.deepEqual(c.update(s),[]);
 s.time=20;s.touchdown={time:12,descent:3};assert.deepEqual(c.update(s),[],'old contacts do not replay');
});
