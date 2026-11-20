import test from'node:test';import assert from'node:assert/strict';
import{createFlight,advanceFlight,beginGoAround,setDetent,setLever,toggleReverse,toggleGear,radioAltitude,restoreCheckpoint,setEngineStatus,setMotion,getInstruction,KT}from'../src/flight.js';
import{pilotInput,flyLevel}from'./pilot.mjs';
function contact(id='short-landing'){const s=createFlight(null,{levelId:id});for(let i=0;i<30000&&!s.landed&&!s.result;i++)advanceFlight(s,pilotInput(s),.02);assert(s.landed&&!s.result&&s.touchdown);return s;}
function advance(s,seconds,input={}){for(let i=0;i<seconds*50&&!s.result;i++)advanceFlight(s,typeof input==='function'?input(s):input,.02);}
for(const [name,command] of[['TOGA action',beginGoAround],['TOGA detent',s=>setDetent(s,'TOGA')],['full thrust lever',s=>setLever(s,1)]])test(`${name} accepts actual wheel contact without teleporting or instantly spooling engines`,()=>{
 const s=contact(),pose={x:s.x,y:s.y,z:s.z,velocity:structuredClone(s.velocity)},engines=structuredClone(s.engines),td=structuredClone(s.touchdown);command(s);
 assert(s.goAround&&s.landed&&!s.airborne);assert.equal(s.throttle,1);assert(!s.reverse&&!s.spoilersDeployed&&!s.autoBrakeActive);assert.deepEqual({x:s.x,y:s.y,z:s.z,velocity:s.velocity},pose);assert.deepEqual(s.engines,engines);assert.equal(s.result,null);assert.equal(s.landingAttempts[0].time,td.time);assert(!s.landingChecklistConfirmed);
});
test('TOGA retracts deployed spoilers, cancels reverse and releases automatic braking while retaining arming',()=>{
 const s=contact();advance(s,.2);assert(s.spoilersDeployed&&s.autoBrakeActive);toggleReverse(s);advance(s,.1);assert(s.reverse&&s.engines.some(e=>e.thrustN<0));assert(beginGoAround(s));assert(!s.reverse&&!s.spoilersDeployed&&!s.autoBrakeActive);assert(s.spoilersArmed&&s.autoBrake==='MED');advance(s,.1,{brake:true});assert(s.brake&&!s.autoBrakeActive);assert(getInstruction(s).includes('松开空格'));
});
test('ground pitch control returns, gear stays down until real lift-off, then the old contact is archived',()=>{
 const s=contact();beginGoAround(s);assert.equal(toggleGear(s),false);assert(s.gear);const old=s.pitch;advance(s,.08,{pitch:1});assert(s.pitch>old);for(let i=0;i<1000&&!s.airborne&&!s.result;i++)advanceFlight(s,pilotInput(s),.02);
 assert(s.airborne&&!s.landed);assert(s.touchAndGo.liftOffAt>s.touchAndGo.started);assert.equal(s.touchdown,null);assert.equal(s.cabin.noseAt,null);assert.equal(s.landingAttempts.length,1);assert.equal(s.result,null);assert(toggleGear(s));
});
test('low-speed TOGA remains on its wheels until forces support takeoff and never awards a landing result',()=>{
 const s=contact();setMotion(s,{speed:60/KT,verticalSpeed:0});s.pitch=0;beginGoAround(s);advance(s,.5,{pitch:1});assert(!s.airborne&&s.landed);assert.equal(s.y,2.8);assert.equal(s.touchAndGo.liftOffAt,null);assert.equal(s.result,null);
 const stopped=contact();setMotion(stopped,{speed:0,verticalSpeed:0});beginGoAround(stopped);advance(stopped,.02);assert.equal(stopped.result,null);
});
test('touch-and-go preserves unavailable engine power and rejects a double failure',()=>{
 const single=contact();setEngineStatus(single,0,'failed');assert(beginGoAround(single));advance(single,1,pilotInput);assert.equal(single.engines[0].status,'failed');assert.equal(single.engines[0].thrustN,0);
 const dual=contact();setEngineStatus(dual,0,'failed');setEngineStatus(dual,1,'failed');assert.equal(beginGoAround(dual),false);assert(!dual.goAround&&!dual.touchAndGo);assert(dual.message.includes('轮刹车'));
});
test('retry preserves ground touch-and-go state and speed without manufacturing completed flight',()=>{
 const s=contact();beginGoAround(s);const r=restoreCheckpoint(s);assert(r.goAround&&r.landed&&!r.airborne);assert.equal(r.touchAndGo.liftOffAt,null);assert.deepEqual(r.velocity,s.velocity);assert.equal(r.landingAttempts.length,1);assert(r.mission.practice);assert.equal(r.result,null);
});
test('a full landing, touch-and-go, continuous return and second landing are required for final completion',()=>{
 const s=contact();const first=structuredClone(s.touchdown);beginGoAround(s);let airborne=false,returned=false,maxJump=0;
 for(let i=0;i<60000&&!s.result;i++){const p={x:s.x,y:s.y,z:s.z};advanceFlight(s,pilotInput(s),.02);maxJump=Math.max(maxJump,Math.hypot(s.x-p.x,s.y-p.y,s.z-p.z));if(s.airborne){airborne=true;assert.equal(s.result,null);}if(s.mission.recovery?.stage==='return')returned=true;}
 assert(airborne&&returned&&maxJump<10);assert(s.result?.levelCleared&&s.landed&&s.airData.groundSpeed===0);assert(s.touchdown.time>first.time+300);assert(s.touchdown.checklistConfirmed);assert(s.gates.every(g=>g.passed&&!g.preset));assert.equal(s.landingAttempts[0].time,first.time);
});


test('single-engine touch-and-go turns sea-side before terrain and lands again on the same remaining engine',()=>{
 const s=contact('engine-out');assert(beginGoAround(s));let coast=false;
 for(let i=0;i<70000&&!s.result;i++){advanceFlight(s,pilotInput(s),.02);if(s.touchAndGo.coastalTurn){coast=true;assert.equal(s.engines[0].thrustN,0);}if(s.mission.recovery?.stage==='return')assert(s.touchAndGo.coastalTurn);}
 assert(coast&&s.result?.levelCleared&&s.landed);assert.equal(s.engines[0].status,'failed');assert.equal(s.engines[0].thrustN,0);assert.equal(s.landingAttempts.length,1);assert(!s.impact);
});
