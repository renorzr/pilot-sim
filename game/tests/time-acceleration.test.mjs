import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,advanceSimulation} from '../src/flight.js';
import {advanceAtRate} from '../src/sim/time-acceleration.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('1x, 2x and 4x advance the actual 100 Hz model by the requested simulation time',()=>{
 for(const rate of[1,2,4]){
  const s=createFlight(null,{levelId:'ils-approach'}),reference=structuredClone(s);
  advanceAtRate(s,{},.2,rate);
  for(let i=0;i<20*rate;i++)advanceSimulation(reference,{},.01);
  near(s.time,.2*rate);
  for(const key of['x','y','z','pitch','roll','yaw','speed','verticalSpeed'])near(s[key],reference[key]);
  assert.deepEqual(s.engines,reference.engines);assert.deepEqual(s.systems,reference.systems);
 }
});
test('a slow frame at 4x is not silently truncated by the ordinary half-second batch limit',()=>{
 const s=createFlight(null,{levelId:'ils-approach'}),reference=structuredClone(s);
 advanceAtRate(s,{},.4,4);
 for(let i=0;i<160;i++)advanceSimulation(reference,{},.01);
 near(s.time,1.6);near(s.x,reference.x);near(s.y,reference.y);near(s.z,reference.z);
});
test('completed or invalid elapsed frames do not resume or fabricate flight progress',()=>{
 const s=createFlight(null,{levelId:'ils-approach'}),before=structuredClone(s);
 for(const elapsed of[0,-1,NaN,Infinity])advanceAtRate(s,{},elapsed,4);
 assert.deepEqual(s,before);s.result={score:0};const ended=structuredClone(s);advanceAtRate(s,{},.5,4);assert.deepEqual(s,ended);
});
