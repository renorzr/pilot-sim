// Bounded residency for self-hosted image levels. Camera prioritisation is
// independent of the physical DEM; no external map provider is contacted.
export function selectImageryTiles(tiles,airport,position,focus,limit=3){
 const points=[airport.unproject(position.x,position.z),airport.unproject(focus.x,focus.z)];
 const distance=(p,bounds)=>{
  const[s,w,n,e]=bounds,dx=Math.max(w-p.longitude,0,p.longitude-e)*92200,dz=Math.max(s-p.latitude,0,p.latitude-n)*111320;
  return dx*dx+dz*dz;
 };
 return tiles.map(tile=>{const a=distance(points[0],tile.bounds),b=distance(points[1],tile.bounds),[s,w,n,e]=tile.bounds;
  const center=Math.hypot((points[1].longitude-(w+e)/2)*92200,(points[1].latitude-(s+n)/2)*111320);
  return{tile,score:Math.min(a,b*.8)+center*10,near:Math.min(a,b)};
 }).filter(o=>o.near<8000**2).sort((a,b)=>a.score-b.score||a.tile.id.localeCompare(b.tile.id)).slice(0,limit).map(o=>o.tile);
}

export function createImageryStream({load,onChange=()=>{},onError=()=>{},slots=3,capacity=4,concurrency=2}){
 const cache=new Map(),pending=new Map(),failed=new Set();let wanted=[],active=[],disposed=false;
 function refresh(){
  const available=wanted.filter(t=>cache.has(t.id)),ids=new Set(available.map(t=>t.id));
  active=[...available,...active.filter(t=>!ids.has(t.id)&&cache.has(t.id))].slice(0,slots);
  const keep=new Set([...wanted,...active].map(t=>t.id));
  for(const[id,entry]of cache){if(cache.size<=capacity)break;if(!keep.has(id)){entry.texture.dispose();cache.delete(id);}}
  onChange();
 }
 function pump(){
  if(disposed)return;
  for(const tile of wanted){
   if(pending.size>=concurrency)break;
   if(cache.has(tile.id)||pending.has(tile.id)||failed.has(tile.id))continue;
   const request=Promise.resolve().then(()=>load(tile)).then(texture=>{
    if(disposed){texture.dispose();return;}
    cache.set(tile.id,{tile,texture});refresh();
   },error=>{if(!disposed){failed.add(tile.id);onError(error,tile);}}).finally(()=>{pending.delete(tile.id);pump();});
   pending.set(tile.id,request);
  }
 }
 return{
  update(tiles){
   if(disposed)return;
   const next=tiles.slice(0,slots);if(next.map(t=>t.id).join('|')===wanted.map(t=>t.id).join('|'))return;
   wanted=next;refresh();pump();
  },
  active(){return active.map(tile=>({...cache.get(tile.id)}));},
  stats(){return{activeDetailIds:active.map(t=>t.id),cachedDetailIds:[...cache.keys()],pendingDetails:pending.size,failedDetails:[...failed],detailSlots:slots,detailCapacity:capacity};},
  async settled(){while(pending.size)await Promise.all([...pending.values()]);},
  dispose(){disposed=true;for(const entry of cache.values())entry.texture.dispose();cache.clear();active=[];wanted=[];},
 };
}
