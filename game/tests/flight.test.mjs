import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, advanceFlight, adjustStick, centerStick, RUNWAY,setMotion } from '../src/flight.js';

function fly(state, controls, seconds=120) {
  for(let i=0;i<seconds*50&&!state.result;i++)advanceFlight(state,controls(state),.02);
  return state;
}
test('takeoff reaches a stable climb rather than touching down at liftoff',()=>{
  const s=fly(createFlight('takeoff'),s=>({throttle:1,pitch:s.speed>64&&s.pitch<.20?1:0}));
  assert.equal(s.result?.success,true);
  assert.equal(s.result?.title,'起飞成功');
  assert(s.y>85);
  assert.equal(s.touchdown,null);
});
test('landing approach, touchdown and braking complete the whole exercise',()=>{
  const s=fly(createFlight('landing'),s=>s.landed?{throttle:-1,brake:true}:{});
  assert.equal(s.result?.success,true);
  assert(s.touchdown.z<0&&s.touchdown.z>-RUNWAY.length);
  assert(s.touchdown.descent<6.5);
  assert(s.airData.groundSpeed<.6);
});
test('gear-up landing is reported with a recoverable explanation',()=>{
  const s=createFlight('landing');s.gear=false;
  fly(s,()=>({}));
  assert.equal(s.result?.success,false);
  assert.equal(s.result?.title,'起落架未到位');
});
test('holding down-pitch can cause a hard landing',()=>{
  const s=fly(createFlight('landing'),s=>({pitch:s.z<650?-1:0}));
  assert.equal(s.result?.success,false);
  assert(['接地过重','偏离跑道','撞击地形'].includes(s.result.title));
});
test('steering changes direction, bank, position and runway alignment',()=>{
  const s=createFlight('landing');fly(s,()=>({steer:1}),6);
  assert(s.x>20);assert(s.yaw>0);assert(s.roll>.2);assert(Math.abs(s.locDeviation)>.1);
});
test('throttle clamps and stopped results do not continue moving',()=>{
  const s=createFlight('takeoff');fly(s,()=>({throttle:-1}),2);assert.equal(s.throttle,0);
  s.throttle=1;advanceFlight(s,{throttle:1},.02);assert.equal(s.throttle,1);
  s.result={success:false};const z=s.z;advanceFlight(s,{throttle:1},.02);assert.equal(s.z,z);
});
test('release spring-centres both stick axes within 0.3 seconds',()=>{
  const s=createFlight('landing');
  fly(s,()=>({pitch:1,steer:1}),1);
  assert.equal(s.stickPitch,1);assert.equal(s.stickRoll,1);
  advanceFlight(s,{},.02);
  assert(s.stickPitch>0&&s.stickPitch<1);assert(s.stickRoll>0&&s.stickRoll<1);
  fly(s,()=>({}),.3);
  assert.equal(s.stickPitch,0);assert.equal(s.stickRoll,0);
});
test('neutral stick retains ordinary airborne bank and continues a coordinated turn',()=>{
  const s=createFlight('landing');
  fly(s,()=>({steer:1}),1);fly(s,()=>({}),.5);
  const bank=s.roll,yaw=s.yaw;
  assert(bank>.15&&bank<.5);assert.equal(s.stickRoll,0);
  fly(s,()=>({}),1);
  assert(Math.abs(s.roll-bank)<.002);assert(s.yaw>yaw);
});
test('opposite roll input levels the aircraft, then releasing holds the new bank',()=>{
  const s=createFlight('landing');
  fly(s,()=>({steer:1}),1);fly(s,()=>({}),.5);
  const bank=s.roll;
  for(let i=0;i<100&&s.roll>.08;i++)advanceFlight(s,{steer:-1},.02);
  fly(s,()=>({}),.6);
  assert(Math.abs(s.roll)<.08);assert(Math.abs(s.roll)<bank/2);assert.equal(s.stickRoll,0);
});
test('pitch attitude does not spring back when the physical stick recentres',()=>{
  const s=createFlight('landing');
  fly(s,()=>({pitch:1}),.8);fly(s,()=>({}),.6);
  const pitch=s.pitch;assert(pitch>.05);assert.equal(s.stickPitch,0);
  fly(s,()=>({}),1);
  assert(Math.abs(s.pitch-pitch)<.001);
});
test('Shift reduces stick rate and maximum travel for fine corrections',()=>{
  const normal=createFlight('landing'),fine=createFlight('landing');
  fly(normal,()=>({pitch:1,steer:1}),.5);
  fly(fine,()=>({pitch:1,steer:1,precision:true}),.5);
  assert(fine.stickPitch<normal.stickPitch);assert(fine.stickRoll<normal.stickRoll);
  fly(fine,()=>({pitch:1,steer:1,precision:true}),2);
  assert.equal(fine.stickPitch,.4);assert.equal(fine.stickRoll,.4);
});
test('direct mouse/touch input follows pointer position and springs back on release',()=>{
  const s=createFlight('landing');
  fly(s,()=>({stick:{pitch:.3,roll:-.6}}),.4);
  assert(Math.abs(s.stickPitch-.3)<.001);assert(Math.abs(s.stickRoll+.6)<.001);
  fly(s,()=>({}),.3);assert.equal(s.stickPitch,0);assert.equal(s.stickRoll,0);
});
test('opposing held keys request neutral and new exercises start centred',()=>{
  const s=createFlight('landing');adjustStick(s,1,-1);
  fly(s,()=>({pitch:0,steer:0}),.3);
  assert.equal(s.stickPitch,0);assert.equal(s.stickRoll,0);
  for(const mode of ['landing','takeoff']){
    const fresh=createFlight(mode);
    assert.equal(fresh.stickPitch,0);assert.equal(fresh.stickRoll,0);
  }
});
test('short key taps create a bounded impulse, then return to centre',()=>{
  const s=createFlight('landing');adjustStick(s,.04,-.04);
  advanceFlight(s,{},.02);
  assert(s.stickPitch>0&&s.stickPitch<.04);assert(s.stickRoll<0&&s.stickRoll>-.04);
  fly(s,()=>({}),.2);assert.equal(s.stickPitch,0);assert.equal(s.stickRoll,0);
  s.result={success:false};adjustStick(s,.04,.04);assert.equal(s.stickPitch,0);assert.equal(s.stickRoll,0);
});
test('centering on pause or focus loss preserves aircraft attitude',()=>{
  const s=createFlight('landing');fly(s,()=>({pitch:1,steer:1}),.6);
  const pitch=s.pitch,roll=s.roll;centerStick(s);
  assert.equal(s.stickPitch,0);assert.equal(s.stickRoll,0);
  assert.equal(s.pitch,pitch);assert.equal(s.roll,roll);
});
