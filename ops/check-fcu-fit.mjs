// Browser checks of the actual cockpit components against source-art bounds.
// This isolated UI fixture never creates or changes a running game's pose.
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const fixture=new URL('../game/qa/fcu-fit.html',import.meta.url);
await mkdir(new URL('../game/qa/',import.meta.url),{recursive:true});
await writeFile(fixture,`<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="/assets/sky.jpg"></head><body><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ExternalView}from'/src/ExternalView.jsx';import{FCU,AircraftControls}from'/src/CockpitPanels.jsx';import{Instruments}from'/src/Instruments.jsx';import{StickReadout}from'/src/StickReadout.jsx';import{createFlight}from'/src/flight.js';
import{FCU_LAYOUT,FCU_FRAME_ASSET}from'/src/views/fcu-layout.js';import{getLanguage,setLanguage,missingTranslations}from'/src/i18n/index.js';import'/src/prototype.css';
const h=React.createElement;
function Fixture(){const[s,set]=useState(()=>createFlight(null,{levelId:'ils-approach'})),[version,refresh]=useState(0),[outside,setOutside]=useState(false);const act=fn=>set(old=>{const next=structuredClone(old);fn(next);return next});
window.__fcuFit={ready:true,layout:FCU_LAYOUT,exterior:()=>setOutside(true),snapshot:()=>structuredClone(s),language:l=>{setLanguage(l);refresh(n=>n+1)},missing:missingTranslations};
if(outside)return h('main',{className:'sim-shell'},h('div',{className:'stage view-exterior instruments-expanded'},h(ExternalView,{state:s,onAction:act,brakePointer:{},expanded:true,stick:h(StickReadout,{pitch:s.stickPitch,roll:s.stickRoll,pointer:{}})})));
return h('main',{className:'sim-shell'},h('div',{className:'stage'},h('div',{className:'cockpit-rig'},h('img',{className:'cockpit-frame',src:FCU_FRAME_ASSET,alt:''}),h(Instruments,{state:s}),h(FCU,{state:s,onAction:act,physical:true}),h(AircraftControls,{state:s,onAction:act,brakePointer:{}})),h('div',{className:'cockpit-stick-panel'},h(StickReadout,{pitch:s.stickPitch,roll:s.stickRoll,pointer:{}}))));}
createRoot(document.querySelector('#root')).render(h(Fixture));
</script></body></html>`);
const base=process.argv[2]||'http://127.0.0.1:18083/',b=await connect(base+'qa/fcu-fit.html',1280,800),report=[];
const inside=(r,box)=>r.left>=box.left-.5&&r.right<=box.right+.5&&r.top>=box.top-.5&&r.bottom<=box.bottom+.5;
try{
 await b.waitFor('!!window.__fcuFit?.ready&&document.querySelector(".cockpit-frame").complete');
 for(const language of['en','zh']){
  await b.evaluate(`window.__fcuFit.language(${JSON.stringify(language)})`);
  for(const[width,height]of[[1585,992],[1280,800],[850,532],[844,390],[640,400]]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   const r=await b.evaluate(`(()=>{const q=s=>document.querySelector(s),rect=e=>e.getBoundingClientRect().toJSON(),f=rect(q('.cockpit-frame')),l=window.__fcuFit.layout,project=r=>({left:f.left+r.x/l.artboard.width*f.width,top:f.top+r.y/l.artboard.height*f.height,right:f.left+(r.x+r.width)/l.artboard.width*f.width,bottom:f.top+(r.y+r.height)/l.artboard.height*f.height});return{aperture:project(l.aperture),targets:project(l.targets),modes:project(l.modes),interior:project(l.interior),surface:project(l.surface),steps:[...document.querySelectorAll('.fcu-selection')].map(e=>({number:rect(e.querySelector('output')),plus:rect(e.querySelector('.fcu-step-buttons button:first-child')),minus:rect(e.querySelector('.fcu-step-buttons button:last-child'))})),focusable:[...document.querySelectorAll('button,[role=button]')].filter(e=>e.tabIndex!==-1).length,targetRects:[...document.querySelectorAll('.fcu-target-bank button,.fcu-target-bank output')].map(rect),modeRects:[...document.querySelectorAll('.fcu-mode')].map(rect),overflow:[...document.querySelectorAll('.fcu-physical button,.fcu-physical output')].filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>({text:e.textContent,scroll:[e.scrollWidth,e.scrollHeight],client:[e.clientWidth,e.clientHeight]})),stick:rect(q('.cockpit-stick-panel')),pad:rect(q('.stick-pad')),pitch:rect(q('[data-stick-axis="pitch"]')),roll:rect(q('[data-stick-axis="roll"]')),pfd:rect(q('.pfd')),stage:rect(q('.stage')),stickAlpha:Number(getComputedStyle(q('.cockpit-stick-panel')).backgroundColor.match(/[\\d.]+/g).at(-1)),missing:window.__fcuFit.missing()}})()`);
   assert.equal(r.focusable,0);assert(r.steps.every(s=>s.plus.left>=s.number.right-.5&&s.minus.left>=s.number.right-.5&&s.plus.bottom<=s.minus.top+.5&&Math.abs(s.plus.left-s.minus.left)<.5));assert(inside(r.aperture,r.surface));assert(inside(r.targets,r.interior));assert(inside(r.modes,r.interior));assert(r.targetRects.every(v=>inside(v,r.targets)),JSON.stringify(r));assert(r.modeRects.every(v=>inside(v,r.modes)),JSON.stringify(r));assert.deepEqual(r.overflow,[],JSON.stringify({width,height,language,overflow:r.overflow}));
   assert(r.stick.right<r.pfd.left);assert(r.pad.bottom<r.pitch.top&&r.pitch.bottom<r.roll.top);assert(r.stick.bottom<r.stage.bottom);assert(r.stickAlpha<.35);assert.deepEqual(r.missing,[]);report.push({width,height,language,...r});
   if([1585,640].includes(width))await b.screenshot('qa/fcu-fit-'+language+'-'+width+'.png');
  }
 }
 await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await b.evaluate('window.__fcuFit.language("en")');
 const snapshot=()=>b.evaluate('window.__fcuFit.snapshot()'),before=await snapshot();
 await b.click('[aria-label="Increase target speed"]');assert.equal((await snapshot()).selectedSpeed,before.selectedSpeed+5);assert(!await b.evaluate('document.activeElement.matches("button,[role=button]")'));await b.evaluate('document.querySelector(".fcu-mode").focus()');assert(!await b.evaluate('document.activeElement.matches("button,[role=button]")'));
 await b.click('[aria-label="Increase target heading"]');assert.equal((await snapshot()).selectedHeading,(before.selectedHeading+5)%360);
 await b.click('[aria-label="Increase target altitude"]');assert.equal((await snapshot()).selectedAltitude,before.selectedAltitude+500);
 const lamp=()=>b.evaluate('getComputedStyle(document.querySelector(".fcu-mode-bank button:nth-child(2)"),"::before").backgroundColor');
 const initial=await lamp();await b.click('[aria-label="Flight director FD"]');assert.equal((await snapshot()).flightDirector,!before.flightDirector);assert.notEqual(await lamp(),initial);await b.click('[aria-label="Flight director FD"]');assert.equal(await lamp(),initial);
 for(const[label,key]of[['Autopilot AP1','autoPilot'],['Arm approach APPR','apprArmed'],['Autothrust A/THR','autoThrust']]){
  const button=await b.evaluate(`!!document.querySelector('[aria-label="${label}"]')`);assert(button,label);const old=(await snapshot())[key];await b.click('[aria-label="'+label+'"]');assert.equal((await snapshot())[key],!old,label);
 }
 await b.evaluate('window.__fcuFit.language("zh")');
 await b.send('Emulation.setDeviceMetricsOverride',{width:1585,height:992,deviceScaleFactor:1,mobile:false});
 const detail=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{x:350,y:490,width:940,height:100,scale:2}});await writeFile('qa/fcu-fit-detail.png',Buffer.from(detail.data,'base64'));
 await b.evaluate('window.__fcuFit.exterior()');await b.waitFor('!!document.querySelector(".external-instruments")');
 for(const[width,height]of[[1280,800],[640,400]]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const ext=await b.evaluate(`(()=>{const p=document.querySelector('.external-instruments'),r=p.getBoundingClientRect().toJSON();return{pane:r,physical:!!p.querySelector('.fcu-physical'),banks:[...p.querySelectorAll('.fcu-target-bank,.fcu-mode-bank')].map(e=>getComputedStyle(e).display),buttons:[...p.querySelectorAll('button')].map(e=>e.getBoundingClientRect().toJSON())}})()`);
  assert(!ext.physical);assert(ext.banks.every(v=>v==='contents'));assert(ext.buttons.every(r=>r.width>0&&r.height>0&&inside(r,ext.pane)));
 }
 const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error');assert.deepEqual(errors,[]);
 console.log('FCU: 10 source-art containment cases, stacked +/- keys, non-focusing buttons, mode LEDs and vertical stick: passed.');
}finally{await writeFile('qa/fcu-fit-browser.json',JSON.stringify(report,null,2));await b.close();await rm(fixture,{force:true});}
