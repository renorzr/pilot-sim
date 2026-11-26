import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const started=Date.now(),url=process.argv[2]||'https://flight.awsdev.renorzr.top/',existing=process.argv[3]&&process.argv[3]!=='-'?process.argv[3]:null,airport=process.argv[4]||'lax',b=await connect(url,960,600,existing),report={url,airport},wait=ms=>new Promise(r=>setTimeout(r,ms));
async function click(selector){await b.evaluate('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"nearest"})');await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await b.click(selector);}
const roadStats=()=>b.evaluate('window.__flightSim.stats().city.roadTraffic');
try{
 await b.send('Emulation.setDeviceMetricsOverride',{width:960,height:600,deviceScaleFactor:.6,mobile:false});await b.send('Network.enable');
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',90000);
 if(!existing){await click('[data-stage-id="airline"]');await click('[data-airline-mode="practice"]');await click('[data-level-id="'+airport+'-landing"]');await click('.enter-level');}
 await b.waitFor('!!window.__flightSim.stats()?.city?.roadTraffic&&!document.querySelector(".flight-card .primary-button")?.disabled',300000);
 report.prepared=await roadStats();assert(report.prepared.vehicles>0&&report.prepared.vehicles<=3600);assert(report.prepared.roadSegments>50);assert.equal(report.prepared.parked,0);assert.equal(report.prepared.drivingSide,['changi','kansai'].includes(airport)?'left':'right');assert(report.prepared.regional?.availableTiles>30);assert(report.prepared.regional.loadedTiles<=32);assert.equal(report.prepared.regional.unavailableTiles,0);
 const before=await b.evaluate('window.__flightSim.snapshot()');await click('[data-view-mode="exterior"]');await click('.flight-card .primary-button');
 await b.waitFor('window.__flightSim.airportPresentation()?.active',20000);await b.waitFor('window.__flightSim.stats().city.roadTraffic.ticks>0',30000);
 report.intro={flight:await b.evaluate('window.__flightSim.snapshot()'),roads:await roadStats()};assert.equal(report.intro.flight.time,before.time);assert(Math.hypot(report.intro.roads.regional.focus.x-report.intro.flight.x,report.intro.roads.regional.focus.z-report.intro.flight.z)<5);if(airport==='lax'){assert(report.intro.roads.regional.vehicles>100);}assert.deepEqual([report.intro.flight.x,report.intro.flight.y,report.intro.flight.z],[before.x,before.y,before.z]);
 await click('.pause-button');const paused=await roadStats();await wait(800);assert.equal((await roadStats()).ticks,paused.ticks);assert.equal(await b.evaluate('window.__flightSim.snapshot().playing'),false);
 // Real view controls remain usable while paused, without recreating traffic.
 await click('[data-view-mode="cockpit"]');await click('[data-view-mode="exterior"]');const returned=await roadStats();assert.equal(returned.ticks,paused.ticks);assert.equal(returned.vehicles,paused.vehicles);report.pausedAndViewReturned=returned;
 await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait(1000);await b.screenshot('qa/traffic-game-'+airport+'-paused.png');await click('.pause-button');await b.waitFor('window.__flightSim.stats().city.roadTraffic.ticks>'+paused.ticks,30000);report.resumed=await roadStats();
 if(airport==='lax'){
  await click('.skip-intro');await b.waitFor('!window.__flightSim.airportPresentation()?.active',10000);
  await click('.pause-button');
  const point=await b.evaluate('(()=>{for(let y=70;y<520;y+=20)for(let x=30;x<900;x+=20)if(document.elementFromPoint(x,y)?.classList.contains("external-camera-input"))return{x,y};})()');assert(point);
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y+230,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y+230,button:'left',buttons:0,clickCount:1});
  await click('.pause-button');const start=await b.evaluate('window.__flightSim.snapshot()');await b.waitFor('window.__flightSim.snapshot().time>='+JSON.stringify(start.time+3),300000);
  report.flightAfter=await b.evaluate('window.__flightSim.snapshot()');report.regionalAfter=(await roadStats()).regional;assert(!report.flightAfter.result);assert(Math.hypot(report.flightAfter.x-start.x,report.flightAfter.z-start.z)>100);assert(Math.hypot(report.regionalAfter.focus.x-report.flightAfter.x,report.regionalAfter.focus.z-report.flightAfter.z)<10);assert(report.regionalAfter.vehicles>100);assert(report.regionalAfter.render.visible>0);await click('.pause-button');await b.screenshot('qa/traffic-game-lax-regional-flight.png');
 }
 report.requests=b.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url).filter(u=>/traffic-(v1|region-v1)/.test(u));
 report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'&&e.params.timestamp>=started||e.method==='Log.entryAdded'&&e.params.entry.level==='error'&&e.params.entry.timestamp>=started||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'&&e.params.timestamp>=started);assert.deepEqual(report.errors,[]);report.passed=true;console.log('Actual '+airport+' UI: road preparation, cinematic traffic, pause, view reversal and resume passed',JSON.stringify(report.resumed));
}catch(e){report.failure=e.message;await b.screenshot('qa/traffic-game-'+airport+'-failure.png').catch(()=>{});throw e;}
finally{await writeFile('qa/traffic-game-'+airport+'.json',JSON.stringify(report,null,2));await b.close();}
