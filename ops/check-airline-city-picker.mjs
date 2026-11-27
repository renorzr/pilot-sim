// Real component fixture, separate from flight/gameplay evidence. Nothing is
// added to the shipped airport registry or published as a preview page.
import assert from 'node:assert/strict';
import {build} from '../game/node_modules/esbuild/lib/main.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {connect} from './cdp.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),game=root+'game';
await mkdir(root+'qa/airline-map-pair',{recursive:true});
const entry=`import{createRoot}from'react-dom/client';import{AirlineSelect}from'./src/AirlineSelect.jsx';import{AIRPORTS}from'./src/airports/registry.js';const jfk=AIRPORTS.find(a=>a.id==='jfk'),airports=[...AIRPORTS,{...jfk,id:'lga-fixture',iata:'LGA',name:'LaGuardia Airport',city:'纽约'}];createRoot(document.getElementById('root')).render(<AirlineSelect airports={airports} progress={{levels:{}}} selectedId="pkx-hgh" onChoose={id=>{window.fixtureChoice=id}}/>);`;
const built=await build({stdin:{contents:entry,loader:'jsx',resolveDir:game},bundle:true,format:'iife',write:false,jsx:'automatic',jsxImportSource:game+'/src/i18n',define:{'import.meta.env':'{"BASE_URL":"/","DEV":false}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const b=await connect('about:blank',1100,700);let report={};
const click=s=>b.click(s),route=()=>b.evaluate('document.querySelector(".enter-flight").dataset.routeId');
try{
 await b.evaluate(`document.body.innerHTML='<div style="height:650px;padding:20px;display:flex" id="root"></div>';const style=document.createElement('style');style.textContent=${JSON.stringify(await readFile(root+'game/src/prototype.css','utf8'))};document.head.append(style);`);
 await b.evaluate(built.outputFiles[0].text);await b.waitFor('!!document.querySelector(".world-route-map")');
 const before=await route();await click('[data-city-id=new-york] circle:last-of-type');await b.waitFor('!!document.querySelector("[role=listbox]")');assert.equal(await b.evaluate('document.querySelectorAll("[role=option]").length'),2);assert.equal(await b.evaluate('document.querySelector(".map-airport-card").dataset.selectedAirport'),undefined);assert.equal(await route(),before);await b.screenshot(root+'qa/airline-map-pair/multi-city-open-fixture.png');
 await b.key('ArrowDown','ArrowDown');await b.key('ArrowDown','ArrowDown','keyUp');assert.equal(await b.evaluate('document.activeElement.dataset.airportOption'),'lga-fixture');await b.key('Enter','Enter');await b.key('Enter','Enter','keyUp');await b.waitFor('document.querySelector(".map-airport-card").dataset.selectedAirport==="lga-fixture"');assert.equal(await b.evaluate('document.querySelector("[data-route-slot=origin] strong").textContent'),'LGA');assert.equal(await b.evaluate('document.querySelector("[data-route-slot=destination]").getAttribute("aria-pressed")'),'true');assert.equal(await b.evaluate('!!document.querySelector("[role=listbox]")'),false);
 assert.equal(await b.evaluate('document.querySelector("[data-route-slot=origin] strong").textContent'),'LGA');assert.equal(await b.evaluate('document.querySelector(".enter-flight").disabled'),true);
 await click('[data-route-slot=destination]');await click('[data-city-id=new-york] circle:last-of-type');assert.equal(await b.evaluate('document.querySelector("[data-route-slot=destination] strong").textContent'),'HGH');await click('[data-airport-option=jfk]');assert.equal(await b.evaluate('document.querySelector("[data-route-slot=destination] strong").textContent'),'JFK');
 await click('.airport-picker-trigger');await b.key('Escape','Escape');await b.key('Escape','Escape','keyUp');assert.equal(await b.evaluate('!!document.querySelector("[role=listbox]")'),false);assert.equal(await b.evaluate('document.activeElement.className'),'airport-picker-trigger');
 await click('[data-city-id=los-angeles] circle:last-of-type');assert.equal(await b.evaluate('document.querySelector(".map-airport-card").dataset.selectedAirport'),'lax');assert.equal(await b.evaluate('!!document.querySelector(".airport-picker-trigger")'),false);
 report={passed:true,fixtureOnly:true,note:'JFK + LGA fixture checks real component pointer/keyboard/dropdown; no fixture airport shipped',errors:b.events.filter(e=>e.method==='Runtime.exceptionThrown')};assert.deepEqual(report.errors,[]);console.log('Multi-airport city real component: explicit selection, keyboard arrows/Enter/Escape, same-city IDs and disabled unknown route passed');
}catch(e){report.error=e.message;await b.screenshot(root+'qa/airline-map-pair/picker-fixture-failed.png');throw e;}finally{await writeFile(root+'qa/airline-map-pair/picker-fixture.json',JSON.stringify(report,null,2));await b.close();}
