import {advanceSimulation} from '../flight.js';

// Keep every 100 Hz physics tick: advanceSimulation intentionally caps one
// incoming batch at .5 s, so a slow frame at 4x needs several ordinary batches.
export function advanceAtRate(state,input,elapsed,scale=1,options){
 if(!Number.isFinite(elapsed)||elapsed<=0||state.result)return;
 const airport=state.airportId;
 let remaining=Math.min(elapsed,.5)*([1,2,4].includes(scale)?scale:1);
 while(remaining>1e-10&&!state.result){const batch=Math.min(remaining,.5);if(advanceSimulation(state,input,batch,options)==='cruise-transition')return 'cruise-transition';remaining-=batch;if(state.airportId!==airport)break;}
}
