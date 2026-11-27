import {chooseAirportPractice} from './airport-selection.mjs';
import assert from 'node:assert/strict';
import {writeFile}from 'node:fs/promises';
import {connect}from './cdp.mjs';
const b=await connect(process.argv[2]||'http://127.0.0.1:18084/',800,500),samples={},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const snap=()=>b.evaluate('window.__flightSim.snapshot()'),tap=async(code,key)=>{await b.key(code,key);await b.key(code,key,'keyUp');};
try{
 await b.waitFor('!!window.__flightSim&&!!document.querySelector(".stage-tabs")',60000);if(await b.evaluate('document.documentElement.lang!=="zh-CN"'))await b.click('.language-switch');
 await chooseAirportPractice(b,'daxing-takeoff');
 await b.waitFor('!!document.querySelector(".flight-card .primary-button")&&!document.querySelector(".flight-card .primary-button").disabled',60000);await b.evaluate('document.querySelector(".flight-card .primary-button").scrollIntoView({block:"nearest"})');await b.click('.flight-card .primary-button');await b.waitFor('window.__flightSim.snapshot().time>1');
 samples.chinese=await snap();await b.screenshot('qa/ground-intro-zh-live.png');assert.equal(samples.chinese.ground.stage,'gate');assert(samples.chinese.engines.every(e=>e.status==='off'));assert(await b.evaluate('window.__flightSim.audioStats().radioClip?.startsWith("ground-preparation-")'));
 await tap('KeyP','p');const paused=(await snap()).time;await sleep(600);assert.equal((await snap()).time,paused);assert(await b.evaluate('window.__flightSim.audioStats().radioPaused'));
 await b.click('.language-switch');await b.click('.skip-intro');await tap('KeyP','p');await b.waitFor('window.__flightSim.snapshot().ground.stage==="taxi"',60000);await b.waitFor('window.__flightSim.audioStats().radioClip?.startsWith("ground-taxi-")',10000);
 await b.key('KeyW','w');await b.waitFor('window.__flightSim.snapshot().throttle>=.16');await b.key('KeyW','w','keyUp');await b.waitFor('window.__flightSim.snapshot().airData.groundSpeed>.5');await b.key('ArrowRight','ArrowRight');await b.waitFor('window.__flightSim.snapshot().stickRoll>.3');await b.key('ArrowRight','ArrowRight','keyUp');await b.waitFor('Math.abs(window.__flightSim.snapshot().stickRoll)<.01');await tap('KeyZ','z');await b.key('Space',' ');await b.waitFor('window.__flightSim.snapshot().airData.groundSpeed<.1');
 samples.taxi=await snap();assert(samples.taxi.yaw>1.57);assert(!samples.taxi.result);assert.deepEqual(await b.evaluate('window.__flightSim.missingTranslations()'),[]);assert.deepEqual(await b.evaluate('document.body.innerText.split("\\n").filter(s=>/\\p{Script=Han}/u.test(s))'),[]);
 await b.screenshot('qa/ground-nav-en.png');await b.click('.toolbar-actions button');await b.screenshot('qa/ground-nav-clear.png');await b.key('Space',' ','keyUp');await tap('KeyP','p');
 samples.errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(samples.errors,[]);console.log('Production ground UI, bilingual audio, pause and keyboard controls passed');
}catch(e){samples.failure={message:e.message,state:await snap().catch(()=>null)};await b.screenshot('qa/ground-ui-failure.png').catch(()=>{});throw e;}
finally{await writeFile('qa/ground-ui-browser.json',JSON.stringify(samples,null,2));await b.close();}
