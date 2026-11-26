import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlight,advanceFlight,restoreCheckpoint} from '../src/flight.js';
import {chooseHistorical,historicalQuestion,takeHistoricalControl,historicalCandidates} from '../src/history/us1549.js';
import {orderHistoricalOptions,historicalDecisionPoints} from '../src/history/decisions.js';
import {FlightRecording} from '../src/replay/flight-recording.js';
import {t} from '../src/i18n/index.js';
import {G,RAD} from '../src/sim/constants.js';
const start=(decisionSeed=42)=>createFlight(null,{levelId:'history-us1549',historical:{decisionSeed}});
const motion=s=>Object.fromEntries(['x','y','z','pitch','roll','yaw','speed','flapPosition','gearPosition'].map(k=>[k,s[k]]));
function fly(s,seconds){for(let n=0;n<seconds*100&&!s.result;n++)advanceFlight(s,{},.01);}
function execute(s){for(let n=0;n<3000&&s.historical.execution&&!s.result;n++)advanceFlight(s,{},.01);assert(!s.result);assert(!s.historical.execution);}
function airport(s,id='return'){assert(chooseHistorical(s,'left'));execute(s);if(id==='teb')assert(chooseHistorical(s,'assess'));assert(chooseHistorical(s,id));execute(s);}

test('per-session ordering is varied, deterministic and stable as availability changes',()=>{
 const options=['a','b','c','d','e'].map(id=>({id})),orders=new Set();
 for(let seed=0;seed<100;seed++){
  const ordered=orderHistoricalOptions(seed,'priority',options);orders.add(ordered.map(o=>o.id).join(''));
  assert.deepEqual(ordered,orderHistoricalOptions(seed,'priority',options));
  assert.deepEqual(ordered.filter(o=>o.id!=='b'),orderHistoricalOptions(seed,'priority',options.filter(o=>o.id!=='b')));
 }
 assert(orders.size>50);assert.deepEqual(options.map(o=>o.id),['a','b','c','d','e']);
 const s=start();const first=historicalQuestion(s).options.map(o=>o.id);fly(s,.5);assert.deepEqual(historicalQuestion(s).options.map(o=>o.id),first);
 assert.equal(restoreCheckpoint(s).historical.decisionSeed,s.historical.decisionSeed);
 assert.equal(new Set(Array.from({length:10},()=>createFlight(null,{levelId:'history-us1549'}).historical.decisionSeed)).size,10);
});
test('gear distraction changes only the selected control, then costs real integrated energy and can be corrected',()=>{
 const s=start(),baseline=start(),before=motion(s),energy=a=>G*a.y+(a.velocity.x**2+a.velocity.y**2+a.velocity.z**2)/2;
 assert(chooseHistorical(s,'gear'));assert(s.gear);assert.deepEqual(motion(s),before);assert.equal(s.historical.node,'priority');assert(!chooseHistorical(s,'left'));
 fly(s,8.1);fly(baseline,8.1);assert(s.gearPosition>.9);assert(energy(s)<energy(baseline)-30);assert(s.historical.decisionExposure.gearSeconds>4);
 assert(chooseHistorical(s,'retract'));execute(s);assert.equal(s.gearPosition,0);assert(chooseHistorical(s,'left'));
 assert(s.engines.every(e=>e.irrecoverable&&e.thrustN===0));
});
test('waiting is a bounded physical action, prevents answer spam and does not restore engines or opportunity',()=>{
 const s=start(),margin=Math.max(...historicalCandidates(s).filter(c=>c.airport==='LGA').map(c=>c.margin));
 assert(chooseHistorical(s,'wait-restart'));assert(!chooseHistorical(s,'wait-restart'));fly(s,10);assert(s.historical.execution);execute(s);
 assert(s.time>=12);assert.equal(s.historical.decisionExposure.waitSeconds,0,'Waiting for a still-pending first relight result is not automatically an error');assert(!historicalQuestion(s).options.some(o=>o.id==='wait-restart'));
 assert(Math.max(...historicalCandidates(s).filter(c=>c.airport==='LGA').map(c=>c.margin))<margin);assert(s.engines.every(e=>e.thrustN===0));
 assert(chooseHistorical(s,'hold'));execute(s);assert(chooseHistorical(s,'assess'));assert(chooseHistorical(s,'hold'));execute(s);assert(s.historical.decisionExposure.waitSeconds>0,'Waiting after the no-thrust result costs decision points');
});
test('LGA and TEB branches have their own immediate formal handover and never announce river commitment',()=>{
 for(const id of['return','teb']){
  const s=start();airport(s,id);assert.equal(historicalQuestion(s).id,id==='return'?'lga-approach':'teb-approach');
  assert(!historicalQuestion(s).options.some(o=>o.id==='ditch'));assert(!takeHistoricalControl(s));
  const before=motion(s),target=s.historical.copilotRunway;assert(chooseHistorical(s,'land'));assert.deepEqual(motion(s),before);
  assert.equal(s.historical.manualTarget,target);assert.equal(s.historical.controlSource,'player');assert(!s.mission.practice&&!s.historical.earlyTakeover);assert(!s.autoPilot);
  const lines=[s.radio.active,...s.radio.pending].filter(Boolean);assert(lines.some(l=>l.clip==='us1549-commit-1'));assert(!lines.some(l=>l.clip==='us1549-commit-0'||['early','hudson','hudson-unable'].includes(l.historyEvent)));
  assert(s.mission.events.some(e=>e.type==='runway-handover'&&e.target===target));
 }
});
test('abandoning an airport preserves its physical cost and leads to a real water branch, not an automatic commitment',()=>{
 const s=start();airport(s);const before=motion(s),time=s.time;assert(chooseHistorical(s,'abandon'));assert.deepEqual(motion(s),before);assert.equal(s.time,time);assert.equal(historicalQuestion(s).id,'alternatives');assert.equal(s.historical.copilotRunway,null);
 assert(historicalQuestion(s).options.some(o=>o.id==='lga'));assert(chooseHistorical(s,'lga'));execute(s);assert.equal(historicalQuestion(s).id,'lga-approach');assert(chooseHistorical(s,'abandon'));
 assert(chooseHistorical(s,'river'));execute(s);assert.equal(historicalQuestion(s).id,'commit');assert(chooseHistorical(s,'reconsider'));assert.equal(historicalQuestion(s).id,'alternatives');assert.equal(s.historical.controlSource,'copilot');
 assert(chooseHistorical(s,'river'));execute(s);assert(chooseHistorical(s,'ditch'));assert.equal(s.historical.manualTarget,'river');assert(!s.mission.practice);
});
test('steep-turn distraction is a real temporary control request with measured exposure, and can be abandoned',()=>{
 const s=start();airport(s);const before=motion(s);assert(chooseHistorical(s,'steep'));assert.deepEqual(motion(s),before);
 let peak=0;for(let n=0;n<1200&&s.historical.execution;n++){advanceFlight(s,{},.01);peak=Math.max(peak,Math.abs(s.roll)/RAD);}
 assert(peak>32);assert(s.historical.decisionExposure.steepSeconds>0);assert(!s.historical.execution);assert(!historicalQuestion(s).options.some(o=>o.id==='steep'));assert(chooseHistorical(s,'abandon'));assert(!s.result);
});
test('decision scoring distinguishes measured consequences, adverse reach margin and late handover without changing survival',()=>{
 const h={selected:[{node:'priority',option:'left'}],assessments:[{}],handedOverAt:30,earlyTakeover:false,handedOverHeight:1500};
 assert.equal(historicalDecisionPoints(h,1500),30);
 assert(historicalDecisionPoints({...h,decisionExposure:{gearSeconds:20}},1500)<30);
 assert(historicalDecisionPoints({...h,decisionExposure:{waitSeconds:30}},1500)<30);
 assert(historicalDecisionPoints({...h,selected:[...h.selected,{node:'lga',option:'return',margin:-400}]},1500)<30);
 assert(historicalDecisionPoints(h,300)<historicalDecisionPoints(h,1500));
 const s=start();airport(s);assert(takeHistoricalControl(s,{early:true}));assert(s.mission.practice);assert.equal(s.historical.manualTarget,'free');assert(!chooseHistorical(s,'land'));
});
test('decision records retain the shown option order, seed, state evidence and selected intent for replay',()=>{
 const s=start(123),r=new FlightRecording();r.observe(s);const shown=historicalQuestion(s).options.map(o=>o.id);assert(chooseHistorical(s,'gear'));advanceFlight(s,{},.05);r.observe(s);
 const event=s.mission.events.find(e=>e.type==='crew-decision');assert.deepEqual(event.options,shown);assert.equal(event.option,'gear');assert(Number.isFinite(event.heightFt)&&Number.isFinite(event.margin));assert.equal(r.segments[0].base.historical.decisionSeed,123);assert(s.historical.selected.some(x=>x.option==='gear'));
 const recorded=r.timeline.filter(e=>e.type==='mission').flatMap(e=>e.data).find(e=>e.type==='crew-decision');assert.deepEqual(recorded.options,shown);
});
test('all reachable decision cards and consequences have English translations and preserve stable IDs',()=>{
 const s=start();const check=()=>{const q=historicalQuestion(s);assert(!/\p{Script=Han}/u.test(t(q.title,'en')));for(const o of q.options)assert(!/\p{Script=Han}/u.test(t(o.text,'en')),o.text);if(s.historical.lastDecision)assert(!/\p{Script=Han}/u.test(t(s.historical.lastDecision.text,'en')));};
 check();assert(chooseHistorical(s,'gear'));check();execute(s);check();assert(chooseHistorical(s,'retract'));execute(s);assert(chooseHistorical(s,'left'));execute(s);check();assert(chooseHistorical(s,'return'));execute(s);check();assert(chooseHistorical(s,'steep'));check();execute(s);assert(chooseHistorical(s,'abandon'));check();assert(chooseHistorical(s,'river'));execute(s);check();
});
