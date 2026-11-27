import test from 'node:test';import assert from 'node:assert/strict';
import {groupAirports,initialPlanner,setPlannerEndpoint,pickPlannerAirport,pickCityAirport,readPlanner,savePlanner,PLANNER_KEY} from '../src/airports/airline-planner.js';
import {AIRPORTS} from '../src/airports/registry.js';import {AIRLINE_ROUTES,AIRPORT_MISSIONS} from '../src/missions/catalog.js';import {t} from '../src/i18n/index.js';
const jfk=AIRPORTS.find(a=>a.id==='jfk'),future=[jfk,{...jfk,id:'lga-fixture',iata:'LGA',name:'LaGuardia Airport',city:'Queens'},{...jfk,id:'ewr-fixture',iata:'EWR',name:'Newark Liberty Airport',city:'Newark'}];
test('city IDs group future airports across municipal names without changing airport or mission identity',()=>{
 const groups=groupAirports([...AIRPORTS,...future.slice(1)]),ny=groups.find(c=>c.id==='new-york');assert.equal(groups.length,6);assert.deepEqual(ny.airports.map(a=>a.id),['jfk','lga','lga-fixture','ewr-fixture']);assert.equal(ny.name,'纽约');assert.equal(ny.longitude,jfk.data.airport.longitude);assert.equal(new Set(AIRPORT_MISSIONS.map(m=>m.id)).size,14);assert.equal(AIRLINE_ROUTES.length,42);
});
test('one airport resolves immediately; a multi-airport city cannot silently choose an endpoint',()=>{
 const state=initialPlanner(AIRPORTS,null),single=groupAirports(AIRPORTS).find(c=>c.id==='los-angeles'),multi=groupAirports(future)[0];const one=pickCityAirport(single,'origin',state);assert.equal(one.airport.id,'lax');assert.equal(one.state.origin,'lax');assert.equal(one.nextSlot,'destination');assert.equal(one.state.destination,state.destination);assert.equal(one.state.focused,'lax');
 const more=pickCityAirport(multi,'origin',state);assert.equal(more.airport,null);assert(more.pickerOpen);assert.equal(more.state,state);
});
test('endpoint selection keeps concrete IDs, swaps duplicate endpoints and leaves the viewport unchanged',()=>{
 const state={origin:'jfk',destination:'lax',focused:'jfk',bounds:{west:110,east:300,south:-10,north:70}},next=setPlannerEndpoint(state,'origin','lax');assert.deepEqual([next.origin,next.destination],['lax','jfk']);assert.equal(next.bounds,state.bounds);assert.equal(state.origin,'jfk');assert.equal(setPlannerEndpoint(state,'browse','daxing'),state);
 const sameCity=setPlannerEndpoint({...state,destination:'lga-fixture'},'origin','ewr-fixture');assert.deepEqual([sameCity.origin,sameCity.destination],['ewr-fixture','lga-fixture']);
});
test('returning from practice retains the planned flight; corrupt or unavailable storage stays usable',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},saved={origin:'lax',destination:'jfk',focused:'kansai',bounds:null};savePlanner(storage,saved);const restored=initialPlanner(AIRPORTS,AIRPORT_MISSIONS.find(m=>m.id==='kansai-landing'),readPlanner(storage));assert.deepEqual(restored,saved);
 data.set(PLANNER_KEY,'{bad');assert.deepEqual(readPlanner(storage),{});const deny={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};assert.deepEqual(readPlanner(deny),{});assert.doesNotThrow(()=>savePlanner(deny,saved));
 const invalid=initialPlanner(AIRPORTS,null,{origin:'gone',destination:'gone',focused:'gone',bounds:{west:0,east:0,south:0,north:0}});assert(AIRPORTS.some(a=>a.id===invalid.origin));assert.notEqual(invalid.origin,invalid.destination);assert.equal(invalid.bounds,null);
});
test('variable-width city names have English labels and all new action text is translated',()=>{for(const text of['点击城市，选择航班或机场练习','选择始发机场 · 点击地图上的城市','选择目的机场 · 点击地图上的城市','3 个机场','选择具体机场后，可安排航班或进入机场练习。','进近着陆练习','最高 80 分','当前航线','该航线尚未开放','巡航阶段可跳过'])assert(!/\p{Script=Han}/u.test(t(text,'en')),text);});

test('two consecutive airport picks set origin then destination and restart for the next route',()=>{
 const initial=initialPlanner(AIRPORTS,null),first=pickPlannerAirport(initial,'origin','jfk'),second=pickPlannerAirport(first.state,first.nextSlot,'lax');
 assert.deepEqual([first.state.origin,first.nextSlot],['jfk','destination']);assert.deepEqual([second.state.origin,second.state.destination,second.nextSlot],['jfk','lax','origin']);
 const third=pickPlannerAirport(second.state,second.nextSlot,'changi');assert.equal(third.state.origin,'changi');assert.equal(third.state.destination,'lax');
 const pending=pickCityAirport(groupAirports(future)[0],'destination',first.state);assert.equal(pending.nextSlot,'destination');assert.equal(pending.state,first.state);
});
