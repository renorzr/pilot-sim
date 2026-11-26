// Independent render fixtures for camera/model inspection, never live flight
// state or assessed results. The actual mission UI is checked separately.
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const path=new URL('../game/qa/shot-director.html',import.meta.url);await mkdir(new URL('../game/qa/',import.meta.url),{recursive:true});
await writeFile(path,`<!doctype html><html><head><link rel="icon" href="/assets/sky.jpg"><style>html,body,#scene{margin:0;width:100%;height:100%;overflow:hidden}#label{position:fixed;left:12px;bottom:12px;color:white;background:#123b;padding:7px;font:12px sans-serif}</style></head><body><div id="scene"></div><div id="label">Independent camera fixtures</div><script type="module">
import {createWorld} from '/src/world.js';import {createFlight} from '/src/flight.js';
const world=createWorld(document.querySelector('#scene'),()=>window.__fixtureReady=true,message=>window.__fixtureError=message,'training');
const terminal={id:'training-terminal',position:[540,8.5,-1390],width:282,depth:80,height:17,baseY:0,kind:'terminal',polygons:[[[399,-1430],[681,-1430],[681,-1350],[399,-1350]]]};
window.__shotInspect={render(name){const s=createFlight(null,{levelId:'takeoff'});Object.assign(s,{airborne:true,x:0,y:240,z:-1700,pitch:.18,yaw:0,roll:0,time:20});let shot={template:'tail-bank',kind:'tail',side:1,anchor:{...s},elapsed:3,duration:8,index:0,panel:false};
if(name==='wheel'){Object.assign(s,{y:15,z:-600,gearPosition:.85,pitch:.18});shot={...shot,template:'wheel-close',kind:'wheel',anchor:{...s},elapsed:3};}
else if(name==='tail')s.roll=.45;
else if(name.startsWith('terminal')){Object.assign(s,{x:790,y:100,z:-1390,pitch:.04,gearPosition:0});shot={...shot,template:'landmark-pair',kind:'setting',landmark:terminal,side:1,along:-1,anchor:{...s},eventOffset:4,elapsed:name==='terminal-reverse'?6:3};}
else if(name==='landmark'){Object.assign(s,{x:950,y:100,z:-1510,pitch:.04});shot={...shot,template:'landmark-side',kind:'setting',side:1,along:-1,landmark:{id:'training-tower',position:[760,25,-1510],radius:15,width:30,depth:30,height:60,baseY:0,kind:'landmark'},anchor:{...s},elapsed:3};}
world.update(s,{}, {view:{mode:'exterior'},replay:shot,dt:0});document.querySelector('#label').textContent='RENDER FIXTURE · '+name;return {camera:world.viewStats(),aircraft:world.aircraftStats(),render:world.stats()};},dispose:()=>world.dispose()};
</script></body></html>`);
const base=process.argv[2]||'http://127.0.0.1:18096/',b=await connect(base+'qa/shot-director.html',1000,625),report={fixtureOnly:true,shots:{}};
try{
 await b.waitFor('window.__fixtureReady||window.__fixtureError',90000);assert(!await b.evaluate('window.__fixtureError'));
 for(const name of['wheel','tail','terminal-follow','terminal-reverse','landmark']){
  report.shots[name]=await b.evaluate('window.__shotInspect.render('+JSON.stringify(name)+')');await b.screenshot('qa/director-'+name+'.png');const c=report.shots[name].camera;
  assert(!c.replayShot.fallback,name+' used a fallback');assert(c.position.every(Number.isFinite));assert(report.shots[name].aircraft.visible);
 }
 assert.equal(report.shots.wheel.camera.replayShot.part,'wheel');assert(report.shots.tail.camera.replayShot.rollAttached);assert.equal(report.shots['terminal-reverse'].camera.replayShot.phase,'setting-ground');assert(report.shots.landmark.camera.fov<=66);
 report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(report.errors,[]);report.passed=true;console.log('All independent camera fixtures passed');
}catch(error){report.failure=error.stack;throw error;}
finally{await writeFile('qa/shot-director-scenes.json',JSON.stringify(report,null,2));await b.close();await rm(path,{force:true});}
