// Optional visual-only assets. No factories are registered by the current game.
// Addons use the base aircraft's local frame, joint names and recorded state.
const factories=new Map();
export function registerReplayDetail(part,factory){if(!['wheel','tail'].includes(part)||typeof factory.load!=='function'||!(factory.bytes>0))throw Error('Invalid replay detail asset');if(factories.has(part))throw Error('Replay detail already registered');factories.set(part,factory);return()=>factories.delete(part);}
export function createReplayDetailLayer(visual,{maxBytes=64*1024*1024,maxParts=2,onChange=()=>{}}={}){
 const cache=new Map(),failed=new Set();let pending=null,disposed=false,hidden=[],failures=0,serial=0;
 function beforeBase(){for(const[n,v]of hidden)n.visible=v;hidden=[];for(const e of cache.values())e.asset.group.visible=false;}
 function release(part){const e=cache.get(part);if(e){e.asset.dispose();e.asset.group.removeFromParent();cache.delete(part);}}
 function clear(){if(pending){pending.abort.abort();pending=null;}beforeBase();for(const part of [...cache.keys()])release(part);failed.clear();}
 function request(part){
  const f=factories.get(part);if(!f||f.bytes>maxBytes||failed.has(part)||cache.has(part)||pending?.part===part)return;
  if(pending)pending.abort.abort();const token={part,abort:new AbortController()};pending=token;
  Promise.resolve().then(()=>f.load({signal:token.abort.signal})).then(asset=>{
   if(disposed||pending!==token||token.abort.signal.aborted){asset.dispose();return;}
   if(!asset.group||typeof asset.update!=='function'||typeof asset.dispose!=='function'||!(asset.bytes>0)||asset.bytes>maxBytes){asset.dispose?.();failed.add(part);failures++;return;}
   while(cache.size>=maxParts||[...cache.values()].reduce((n,e)=>n+e.asset.bytes,0)+asset.bytes>maxBytes){const old=[...cache].sort((a,b)=>a[1].used-b[1].used)[0];if(!old)break;release(old[0]);}
   visual.group.add(asset.group);asset.group.visible=false;cache.set(part,{asset,used:++serial});onChange();
  }).catch(()=>{if(!token.abort.signal.aborted){failed.add(part);failures++;}}).finally(()=>{if(pending===token)pending=null;});
 }
 return{beforeBase,update(part,s,dt){if(disposed)return;if(!part){clear();return;}if(!['wheel','tail'].includes(part)){if(pending){pending.abort.abort();pending=null;}return;}request(part);const e=cache.get(part);if(!e)return;e.used=++serial;e.asset.update(s,dt);e.asset.group.visible=true;for(const n of visual.detailParts?.(part)||[]){hidden.push([n,n.visible]);n.visible=false;}},stats:()=>({parts:[...cache.keys()],bytes:[...cache.values()].reduce((n,e)=>n+e.asset.bytes,0),pending:pending?.part??null,failures}),dispose(){clear();disposed=true;}};
}
