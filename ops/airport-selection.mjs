import {AIRPORTS} from '../game/src/airports/registry.js';
// Drive the same city -> airport -> practice flow as the player. No pose or
// result mutation; callers retain their own loading and flight checks.
export async function chooseAirportPractice(browser,levelId){
 const airportId=levelId.replace(/-(takeoff|landing)$/,''),airport=AIRPORTS.find(a=>a.id===airportId);
 if(!airport)throw new Error('Unknown practice airport: '+airportId);
 async function click(selector){
  await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
  await browser.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await browser.click(selector);
 }
 await click('[data-stage-id="airline"]');
 await browser.waitFor('!!document.querySelector(".world-route-map")');
 const marker=`[data-city-id="${airport.cityId||airport.id}"] circle:last-of-type`;
 if(!await browser.evaluate(`!!document.querySelector(${JSON.stringify(marker)})`))await click('.map-zoom');
 const alreadySelected=await browser.evaluate(`document.querySelector('.map-airport-card')?.dataset.selectedAirport===${JSON.stringify(airportId)}`);
 if(!alreadySelected)await click(marker);
 const option=`[data-airport-option="${airportId}"]`;
 if(await browser.evaluate(`!!document.querySelector(${JSON.stringify(option)})`))await click(option);
 const mission=`[data-level-id="${levelId}"]`;
 await browser.waitFor(`!!document.querySelector(${JSON.stringify(mission)})`);
 await click(mission);
}

export async function chooseMapAirport(browser,airportId){
 const airport=AIRPORTS.find(a=>a.id===airportId);if(!airport)throw Error('Unknown airport: '+airportId);
 const settle=()=>browser.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 async function click(selector){await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);await settle();await browser.click(selector);await settle();}
 const marker=`[data-city-id="${airport.cityId||airport.id}"] circle:last-of-type`;await click(marker);
 const option=`[data-airport-option="${airportId}"]`;if(await browser.evaluate(`!!document.querySelector(${JSON.stringify(option)})`))await click(option);
}
