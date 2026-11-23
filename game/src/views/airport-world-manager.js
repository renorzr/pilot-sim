// One visible airport and at most one prepared destination. Background worlds
// cannot install collision data or replace the active camera/audio listener.
export function createAirportWorldManager({host,createWorld,onReady=()=>{},onError=()=>{},onProgress=()=>{},onPrefetch=()=>{}}){
 let active=null,pending=null,disposed=false;
 const ready=r=>!!r?.ready&&!r.error&&(!r.requiresWarm||r.warmed);
 function notify(record){if(record.disposed)return;if(record.foreground){onProgress(record.progress);if(ready(record))onReady();}else onPrefetch({...record.progress,airportId:record.id,error:record.error});}
 function release(record){if(!record)return;record.disposed=true;record.view?.dispose();record.host.remove();}
 function create(id,foreground,requiresWarm=!foreground){
  const node=host.ownerDocument.createElement('div');node.className='airport-world';node.style.cssText='position:absolute;inset:0;visibility:'+(foreground?'visible':'hidden');node.setAttribute('aria-hidden',String(!foreground));host.appendChild(node);
  const record={id,host:node,view:null,foreground,requiresWarm,ready:false,error:'',disposed:false,progress:{stage:'assets',percent:0},warmed:false,warming:null};
  record.view=createWorld(node,()=>{if(record.disposed)return;record.ready=true;record.progress={stage:requiresWarm?'models':'ready',percent:requiresWarm?99:100};notify(record);},message=>{if(record.disposed)return;record.error=message;if(record.foreground)onError(message);else onPrefetch({...record.progress,airportId:id,error:message});},id,value=>{if(record.disposed)return;record.progress=requiresWarm&&!record.warmed&&value.percent===100?{...value,stage:'models',percent:99}:value;if(record.foreground)onProgress(record.progress);else onPrefetch({...record.progress,airportId:id});},{activate:foreground});
  return record;
 }
 return{
  useAirport(id){
   if(disposed)return;
   if(active?.id===id)return active;
   release(active);active=null;
   if(pending?.id===id){active=pending;pending=null;active.foreground=true;active.host.style.visibility='visible';active.host.setAttribute('aria-hidden','false');active.view.activate?.();if(active.error)onError(active.error);notify(active);}
   else{release(pending);pending=null;active=create(id,true);}
   return active;
  },
  prefetch(id){if(disposed||id===active?.id||pending?.id===id)return;release(pending);pending=create(id,false);onPrefetch({...pending.progress,airportId:id,error:pending.error});},
  retainDestination(id){if(pending&&pending.id!==id){release(pending);pending=null;}},
  warmPrepared(state,options){
   const r=pending||(active?.requiresWarm?active:null);if(!r?.ready||r.warmed)return Promise.resolve();if(r.warming)return r.warming;
   r.view.update(state,{},options);
   r.warming=Promise.resolve(r.view.settled?.()).then(()=>{if(r.disposed)return;r.view.update(state,{},options);r.warmed=true;r.progress={stage:'ready',percent:100};notify(r);}).catch(error=>{if(r.disposed)return;r.error=error.message||String(error);if(r.foreground)onError(r.error);else onPrefetch({...r.progress,airportId:r.id,error:r.error});});
   return r.warming;
  },
  retry(){if(!active?.error)return;const{id,requiresWarm}=active;release(active);active=create(id,true,requiresWarm);},
  update(...args){active?.view.update(...args);},
  ready:()=>ready(active),
  current:()=>active,
  prepared:()=>pending,
  dispose(){disposed=true;release(active);release(pending);active=pending=null;},
 };
}
