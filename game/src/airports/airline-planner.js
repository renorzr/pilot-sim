// Cities group map choices. Missions, routes and records always retain airport IDs.
export function groupAirports(airports){
 const groups=new Map();for(const airport of airports){const id=airport.cityId||airport.id;if(!groups.has(id)){const p=airport.cityLocation||airport.data.airport;groups.set(id,{id,name:airport.city,longitude:p.longitude,latitude:p.latitude,airports:[]});}groups.get(id).airports.push(airport);}return[...groups.values()];
}
export function initialPlanner(airports,level,saved={}){
 const valid=id=>airports.some(a=>a.id===id),origin=valid(saved?.origin)?saved.origin:valid(level?.origin||level?.airportId)?level.origin||level.airportId:airports[0].id;
 const destination=valid(saved?.destination)&&saved.destination!==origin?saved.destination:valid(level?.destination)&&level.destination!==origin?level.destination:airports.find(a=>a.id!==origin).id;
 const focused=valid(saved?.focused)?saved.focused:valid(level?.airportId)?level.airportId:origin;
 const b=saved?.bounds,bounds=b&&['west','east','south','north'].every(k=>Number.isFinite(b[k]))&&b.east>b.west&&b.north>b.south&&b.east-b.west<=360&&b.south>=-90&&b.north<=90?{...b}:null;
 return{origin,destination,focused,bounds};
}
export function setPlannerEndpoint(state,slot,id){
 if(!['origin','destination'].includes(slot))return state;
 const other=slot==='origin'?'destination':'origin';return{...state,[slot]:id,[other]:state[other]===id?state[slot]:state[other],focused:id};
}
export function pickPlannerAirport(previous,slot,id){
 const target=slot==='destination'?'destination':'origin';
 return{state:setPlannerEndpoint(previous,target,id),nextSlot:target==='origin'?'destination':'origin'};
}
export function pickCityAirport(city,slot,previous){
 // A city containing several airports is intentionally unresolved until the
 // player chooses one. Do not silently turn a city into a particular airport.
 if(city.airports.length!==1)return{state:previous,airport:null,pickerOpen:true,nextSlot:slot};
 const airport=city.airports[0];return{...pickPlannerAirport(previous,slot,airport.id),airport,pickerOpen:false};
}
export const PLANNER_KEY='pilot-sim.airline-map.v1';
export function readPlanner(storage){try{return JSON.parse(storage?.getItem(PLANNER_KEY)||'null')||{};}catch{return{};}}
export function savePlanner(storage,state){try{storage?.setItem(PLANNER_KEY,JSON.stringify(state));}catch{/* Storage denial does not block choosing a mission. */}}
