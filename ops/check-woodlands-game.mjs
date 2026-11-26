import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';

const url=process.argv[2]||'https://flight.awsdev.renorzr.top/',airport=process.argv[3]||'daxing',b=await connect(url,960,600),report={airport};
async function click(selector){await b.evaluate('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"nearest"})');await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await b.click(selector);}
try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',90000);
 await b.send('Emulation.setDeviceMetricsOverride',{width:960,height:600,deviceScaleFactor:.6,mobile:false});
 await click('[data-stage-id="airline"]');await click('[data-airline-mode="practice"]');await click('[data-level-id="'+airport+'-landing"]');await click('.enter-level');
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled&&window.__flightSim.stats()?.city?.airportId==='+JSON.stringify(airport)+'&&window.__flightSim.stats().city.woodlandStats.estimatedTrees>1000',300000);
 report.before=await b.evaluate('window.__flightSim.snapshot()');report.stats=await b.evaluate('window.__flightSim.stats()');assert.equal(report.before.airportId,airport);assert(report.stats.city.woodlandStats.estimatedTrees>1000);
 await click('[data-view-mode="exterior"]');await click('.flight-card .primary-button');
 await b.waitFor('!!window.__flightSim.airportPresentation()?.active',20000);
 const current=await b.evaluate('window.__flightSim.snapshot()');assert.equal(current.time,report.before.time);assert.deepEqual([current.x,current.y,current.z],[report.before.x,report.before.y,report.before.z]);
 await b.screenshot('qa/woodlands-game-'+airport+'.png');
 report.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(report.errors,[]);report.passed=true;console.log('Actual game woodland integration passed',airport,JSON.stringify(report.stats.city.woodlandStats));
}catch(e){report.failure=e.message;await b.screenshot('qa/woodlands-game-'+airport+'-failure.png').catch(()=>{});throw e;}
finally{await writeFile('qa/woodlands-game-'+airport+'.json',JSON.stringify(report,null,2));await b.close();}
