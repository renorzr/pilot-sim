import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18083/';
const b=await connect(url,1280,800),samples={};
const snap=()=>b.evaluate('window.__flightSim.snapshot()');
const marker=()=>b.evaluate('parseFloat(document.querySelector(".stick-pad-position").style.top)');
const point=(selector,x=.5,y=.5)=>b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width*${x},y:r.top+r.height*${y}};})()`);
const centred=()=>b.waitFor('window.__flightSim.snapshot().stickPitch===0');
const push=()=>b.waitFor('window.__flightSim.snapshot().stickPitch<-.15 && window.__flightSim.snapshot().pitch<.015');
const pull=()=>b.waitFor('window.__flightSim.snapshot().stickPitch>.15 && window.__flightSim.snapshot().pitch>.035');
try{
  await b.waitFor('window.__flightSim && !document.querySelector(".primary-button").disabled',30000);
  await b.click('.flight-card .primary-button');
  await b.key('ArrowUp','ArrowUp');await push();
  assert((await marker())<50);samples.keyboardForward=await snap();
  await b.key('ArrowUp','ArrowUp','keyUp');await centred();
  await b.click('.retry-button');
  await b.key('ArrowDown','ArrowDown');await pull();
  assert((await marker())>50);samples.keyboardBack=await snap();
  await b.key('ArrowDown','ArrowDown','keyUp');await centred();
  console.log('Keyboard: forward lowers nose; back raises nose; marker agrees.');

  await b.click('.retry-button');
  const top=await point('.stick-pad',.5,.2),bottom=await point('.stick-pad',.5,.8);
  await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...top,button:'left',clickCount:1});
  await push();assert((await marker())<50);samples.mouseForward=await snap();
  await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...bottom,button:'left',buttons:1});
  await b.waitFor('window.__flightSim.snapshot().stickPitch>.3 && window.__flightSim.snapshot().pitchRate>0');
  assert((await marker())>50);samples.mouseBack=await snap();
  await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...bottom,button:'left',clickCount:1});await centred();

  await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await b.waitFor('getComputedStyle(document.querySelector(".touch-controls")).display!=="none"');
  for(const [label,condition,name] of [['前推压机头',push,'buttonForward'],['后拉抬机头',pull,'buttonBack']]){
    await b.click('.retry-button');
    const p=await point(`.touch-buttons [aria-label="${label}"]`);
    await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await condition();samples[name]=await snap();
    await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await centred();
  }
  await b.click('.retry-button');
  const touchTop=await point('.stick-pad',.5,.2),touchBottom=await point('.stick-pad',.5,.8);
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchTop,id:12}]});
  await push();samples.touchForward=await snap();
  await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touchBottom,id:12}]});
  await b.waitFor('window.__flightSim.snapshot().stickPitch>.3 && window.__flightSim.snapshot().pitchRate>0');
  samples.touchBack=await snap();
  await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await centred();
  await b.click('.toolbar-actions button[aria-label="操作说明"]');
  assert(await b.evaluate('document.querySelector(".help-panel").textContent.includes("前推压头 / 后拉抬头")'));
  await b.screenshot('qa/pitch-direction.png');
  const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Log.entryAdded'&&e.params.entry.level==='error'));
  assert.deepEqual(errors,[]);
  await writeFile('qa/pitch-direction.json',JSON.stringify({url,viewport:{width:1280,height:800},samples,errors},null,2));
  console.log('Forward/back mapping verified for keyboard, mouse, touch, buttons, indicator and help.');
}finally{await b.close();}
