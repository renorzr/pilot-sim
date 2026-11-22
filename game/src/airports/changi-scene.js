import {GROUND_LAYERS as G,surfaceDepth,orderGroundPaint} from './ground-layers.js';

// Original native game geometry. OSM anchors outlines and positions; facade
// divisions, heights, roof construction and Jewel's roof section are estimates.
// Reference photographs inform the palette only, and are never shipped as assets.
export function buildChangiScenery({THREE,group,project,terrainHeight=()=>0,features=[],materials={}}){
 const root=new THREE.Group();root.name='WSSS-Changi-terminal-complex';group.add(root);
 const material=(key,color,extra={})=>materials[key]||new THREE.MeshStandardMaterial({color,roughness:.68,...extra});
 const roof=material('changiRoof','#bfc7c7',{metalness:.38,roughness:.43,side:THREE.DoubleSide});
 const stone=material('changiStone','#c4c5bc',{side:THREE.DoubleSide});
 const frame=material('changiFrame','#d3d9d6',{metalness:.38,roughness:.42});
 const glass=material('changiGlass','#395660',{metalness:.48,roughness:.27,side:THREE.DoubleSide});
 const skylight=material('changiSkylight','#6d8990',{metalness:.48,roughness:.3,side:THREE.DoubleSide});
 const dark=material('changiDark','#344a50');
 const green=material('changiGarden','#37643e');
 const jewelGlass=[
  material('changiJewelGlass','#92aeb3',{metalness:.46,roughness:.27,side:THREE.DoubleSide}),
  material('changiJewelLight','#bdccca',{metalness:.38,roughness:.29,side:THREE.DoubleSide}),
  material('changiJewelShade','#6d8d96',{metalness:.5,roughness:.25,side:THREE.DoubleSide})
 ];
 const apron=material('changiApron','#afb3aa',surfaceDepth(1));
 const unitBox=new THREE.BoxGeometry(1,1,1),ribPositions=[];
 const tags=f=>f?.tags||f?.properties?.tags||f?.properties||{};
 const label=f=>[tags(f).name,tags(f)['name:en'],tags(f).ref].filter(Boolean).join(' ');
 function ringOf(f){
  let a=f?.geometry?.coordinates||f?.geometry||f?.outline||f?.coordinates;
  while(Array.isArray(a?.[0]?.[0]))a=a[0];
  if(!Array.isArray(a))return[];
  const ring=a.map(v=>Array.isArray(v)?v:[v.lon,v.lat]).filter(v=>Number.isFinite(v[0])&&Number.isFinite(v[1])).map(v=>project(v[0],v[1]));
  if(ring.length>1&&Math.hypot(ring[0].x-ring.at(-1).x,ring[0].z-ring.at(-1).z)<.01)ring.pop();
  return ring;
 }
 const holesOf=f=>(f.holes||(f.geometry?.type==='Polygon'?f.geometry.coordinates.slice(1):[])).map(h=>ringOf({geometry:h})).filter(h=>h.length>=3);
 const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.z-b.x*a.z;},0)/2;
 function centroid(p){
  let sum=0,x=0,z=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],k=a.x*b.z-b.x*a.z;sum+=k;x+=(a.x+b.x)*k;z+=(a.z+b.z)*k;}
  return Math.abs(sum)>1e-8?{x:x/(3*sum),z:z/(3*sum)}:{x:p.reduce((s,v)=>s+v.x,0)/p.length,z:p.reduce((s,v)=>s+v.z,0)/p.length};
 }
 const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
 const segmentDistance=(p,a,b)=>{const x=b.x-a.x,z=b.z-a.z,l=x*x+z*z,t=l?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/l)):0;return Math.hypot(p.x-a.x-t*x,p.z-a.z-t*z);};
 function box(w,h,d,mat,x,y,z,parent=root){const m=new THREE.Mesh(unitBox,mat);m.scale.set(w,h,d);m.position.set(x,y+h/2,z);parent.add(m);return m;}
 function beam(a,b,w,h,mat,y,parent=root){const m=box(w,h,Math.hypot(b.x-a.x,b.z-a.z),mat,(a.x+b.x)/2,y,(a.z+b.z)/2,parent);m.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);return m;}
 function mesh(positions,mat,name){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);if(name)m.name=name;root.add(m);return m;
 }
 // Use the uploaded Float32 positions to reject slivers and ensure every roof
 // triangle really faces upward, even at long-distance airport coordinates.
 function upward(positions){
  const raw=new Float32Array(positions),result=[];
  for(let i=0;i<raw.length;i+=9){const cross=(raw[i+5]-raw[i+2])*(raw[i+6]-raw[i])-(raw[i+3]-raw[i])*(raw[i+8]-raw[i+2]);if(Math.abs(cross)<1e-5)continue;for(const k of(cross>0?[0,3,6]:[0,6,3]))result.push(raw[i+k],raw[i+k+1],raw[i+k+2]);}
  return result;
 }
 function polygon(p,holes,mat,height,name){
  const all=[...p,...holes.flat()],triangles=THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(v.x,-v.z)),holes.map(h=>h.map(v=>new THREE.Vector2(v.x,-v.z)))),positions=[];
  for(const t of triangles)for(const i of t){const v=all[i];positions.push(v.x,height(v),v.z);}
  return mesh(upward(positions),mat,name);
 }
 // Slim native strips, not LineSegments, remain part of the material batch.
 function ribbon(a,b,width=.45){
  const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<1e-6)return;
  const x=-dz/d*width/2,z=dx/d*width/2;
  for(const v of[[a.x+x,a.y,a.z+z],[b.x+x,b.y,b.z+z],[a.x-x,a.y,a.z-z],[b.x+x,b.y,b.z+z],[b.x-x,b.y,b.z-z],[a.x-x,a.y,a.z-z]])ribPositions.push(...v);
 }
 const airportCenter=project(103.994003,1.35019);
 const terminalCandidates=features.filter(f=>(tags(f).aeroway==='terminal'||tags(f).building==='terminal')&&!/jewel/i.test(label(f))&&tags(f).building!=='construction'&&!tags(f).construction&&!tags(f).proposed&&f.id!=='way/744653030').map(f=>({f,p:ringOf(f),holes:holesOf(f)})).filter(t=>t.p.length>=3).map(t=>({...t,area:Math.abs(signedArea(t.p)),center:centroid(t.p)})).filter(t=>t.area>150&&Math.hypot(t.center.x-airportCenter.x,t.center.z-airportCenter.z)<6500).sort((a,b)=>b.area-a.area);
 const terminals=[];
 for(const t of terminalCandidates)if(!terminals.some(a=>Math.hypot(a.center.x-t.center.x,a.center.z-t.center.z)<5&&Math.abs(a.area-t.area)<a.area*.05))terminals.push(t);
 for(const f of features.filter(f=>tags(f).aeroway==='apron')){const p=ringOf(f);if(p.length<3)continue;const q=centroid(p);if(Math.hypot(q.x-airportCenter.x,q.z-airportCenter.z)<6500)polygon(p,holesOf(f),apron,v=>terrainHeight(v.x,v.z)+G.apron,'source-apron');}
 let roofTriangles=0,rooflights=0;
 for(const {f,p,holes,area,center}of terminals){
  const text=label(f),isT3=/Terminal\s*3\b|\bT3\b/i.test(text),isT4=/Terminal\s*4\b|\bT4\b/i.test(text);
  const base=terrainHeight(center.x,center.z),heightTag=parseFloat(tags(f).height),eave=Number.isFinite(heightTag)?Math.max(9,Math.min(32,heightTag-2)):(area>80000?21:isT4?18:14);
  const boundary=q=>Math.min(...[p,...holes].flatMap(r=>r.map((a,i)=>segmentDistance(q,a,r[(i+1)%r.length]))));
  const roofHeight=q=>base+eave+(isT3?.35:Math.min(2.3,boundary(q)*.045));
  const walls=[];
  for(const ring of[p,...holes])for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b.x-a.x,b.z-a.z);
   walls.push(a.x,base+3,a.z,b.x,base+3,b.z,a.x,base+eave,a.z,b.x,base+3,b.z,b.x,base+eave,b.z,a.x,base+eave,a.z);
   beam(a,b,.6,3,stone,base);beam(a,b,.55,.6,frame,base+7.5);
   const divisions=Math.ceil(length/18);
   for(let j=0;j<divisions;j++){const t=j/divisions;box(.6,eave,.6,frame,a.x+(b.x-a.x)*t,base,a.z+(b.z-a.z)*t);}
   ribbon({...a,y:roofHeight(a)+.12},{...b,y:roofHeight(b)+.12},1);
  }
  mesh(walls,glass,`source-terminal-glazing-${f.id}`);
  const all=[...p,...holes.flat()],triangles=THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(v.x,-v.z)),holes.map(h=>h.map(v=>new THREE.Vector2(v.x,-v.z)))),positions=[];
  function split(a,b,c,depth=0){
   const edges=[Math.hypot(a.x-b.x,a.z-b.z),Math.hypot(b.x-c.x,b.z-c.z),Math.hypot(c.x-a.x,c.z-a.z)],longest=Math.max(...edges);
   if(longest>34&&depth<14){const midpoint=(a,b)=>({x:(a.x+b.x)/2,z:(a.z+b.z)/2});if(edges[0]===longest){const m=midpoint(a,b);split(a,m,c,depth+1);split(m,b,c,depth+1);}else if(edges[1]===longest){const m=midpoint(b,c);split(a,b,m,depth+1);split(a,m,c,depth+1);}else{const m=midpoint(c,a);split(a,b,m,depth+1);split(m,b,c,depth+1);}return;}
   for(const q of[a,b,c])positions.push(q.x,roofHeight(q),q.z);
  }
  for(const t of triangles)split(...t.map(i=>all[i]));
  const top=upward(positions);roofTriangles+=top.length/9;mesh(top,roof,`source-terminal-roof-${f.id}`);
  // Changi has horizontal terminal masses. Rectangular rooflight/baffle groups
  // stay inside the real footprint and its courtyards, unlike HGH's wave roof.
  let xx=0,xz=0,zz=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],w=Math.hypot(b.x-a.x,b.z-a.z),x=(a.x+b.x)/2-center.x,z=(a.z+b.z)/2-center.z;xx+=x*x*w;xz+=x*z*w;zz+=z*z*w;}
  const theta=.5*Math.atan2(2*xz,xx-zz),u={x:Math.cos(theta),z:Math.sin(theta)},v={x:-Math.sin(theta),z:Math.cos(theta)},point=(a,b)=>({x:center.x+u.x*a+v.x*b,z:center.z+u.z*a+v.z*b});
  const uv=p.map(q=>({u:(q.x-center.x)*u.x+(q.z-center.z)*u.z,v:(q.x-center.x)*v.x+(q.z-center.z)*v.z})),minU=Math.min(...uv.map(q=>q.u)),maxU=Math.max(...uv.map(q=>q.u)),minV=Math.min(...uv.map(q=>q.v)),maxV=Math.max(...uv.map(q=>q.v)),lights=[];
  const step=isT3?25:38;
  for(let a=Math.ceil(minU/step)*step;a<maxU;a+=step)for(let b=Math.ceil(minV/step)*step;b<maxV;b+=step){
   const corners=[point(a-6,b-2.8),point(a+6,b-2.8),point(a+6,b+2.8),point(a-6,b+2.8)];
   if(corners.some(q=>!inside(q,p)||holes.some(h=>inside(q,h))||boundary(q)<8))continue;
   for(const k of[0,1,2,0,2,3]){const q=corners[k];lights.push(q.x,roofHeight(q)+.16,q.z);}rooflights++;
   if(isT3){const start=point(a-6,b+3.5),end=point(a+6,b+3.5);ribbon({...start,y:roofHeight(start)+.5},{...end,y:roofHeight(end)+.5},.8);}
  }
  if(lights.length)mesh(upward(lights),skylight,'source-clipped-rooflights');
 }
 // Original glazed bridge sections share geometry/material batches. The source
 // paths and active stand stay intact; engineering subdivision is estimated.
 function passengerBridge(a,b,base){
  const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.1)return;
  beam(a,b,3.2,2.5,glass,base+4.9);beam(a,b,3.6,.25,frame,base+4.7);beam(a,b,3.6,.22,roof,base+7.4);
  const nx=(b.z-a.z)/length*1.65,nz=-(b.x-a.x)/length*1.65;
  for(let i=0;i<=Math.ceil(length/4);i++){const t=i/Math.ceil(length/4),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;for(const sign of[-1,1])box(.16,2.5,.16,frame,x+nx*sign,base+4.9,z+nz*sign);}
  if(length>12){const x=a.x+(b.x-a.x)*.65,z=a.z+(b.z-a.z)*.65;box(.7,4.7,.7,stone,x,base,z);}
 }
 let gates=0;
 const bridges=features.filter(f=>['jet_bridge','jetbridge'].includes(tags(f).aeroway));
 for(const f of bridges){const p=ringOf(f);if(p.length<2||Math.hypot(p[0].x-airportCenter.x,p[0].z-airportCenter.z)>6500)continue;for(let i=1;i<p.length;i++)passengerBridge(p[i-1],p[i],terrainHeight(p[i].x,p[i].z));const end=p.at(-1),base=terrainHeight(end.x,end.z);box(4.5,3.1,4.5,glass,end.x,base+4.6,end.z);box(.7,4.6,.7,stone,end.x,base,end.z);gates++;}
 // An unoccupied gate is intentional: the active stand belongs to the player.
 // Where bridges are not mapped, use only the terminal end of mapped stand lines.
 if(!gates&&terminals.length)for(const f of features.filter(f=>tags(f).aeroway==='parking_position').slice(0,220)){
  const p=ringOf(f);if(p.length<2)continue;
  const near=q=>Math.min(...terminals.map(t=>Math.min(...t.p.map((a,i)=>segmentDistance(q,a,t.p[(i+1)%t.p.length])))));
  const a=near(p[0])<near(p.at(-1))?p[0]:p.at(-1);if(near(a)>22)continue;
  const b=p.filter(q=>Math.hypot(q.x-a.x,q.z-a.z)>10).sort((b,c)=>Math.hypot(b.x-a.x,b.z-a.z)-Math.hypot(c.x-a.x,c.z-a.z))[0];if(!b)continue;
  const d=Math.hypot(b.x-a.x,b.z-a.z),length=Math.min(16,d*.35),end={x:a.x+(b.x-a.x)/d*length,z:a.z+(b.z-a.z)/d*length},base=terrainHeight(a.x,a.z);
  passengerBridge(a,end,base);box(4.5,3.1,4.5,glass,end.x,base+4.6,end.z);gates++;
 }
 let jewelCount=0,jewelTriangles=0;
 const jewels=features.filter(f=>/Jewel Changi Airport|星耀樟宜/i.test(label(f))&&!/basement/i.test(label(f))&&ringOf(f).length>=3).map(f=>({f,p:ringOf(f)})).map(t=>({...t,area:Math.abs(signedArea(t.p)),center:centroid(t.p)})).filter(t=>t.area>10000).sort((a,b)=>b.area-a.area);
 const jewel=jewels[0];
 if(jewel){
  const {p,center,f}=jewel,base=terrainHeight(center.x,center.z),segments=96,rings=14,inner=.085,topHeight=parseFloat(tags(f).height)||37;
  const profile=t=>Math.sqrt(Math.max(0,1-t*t))*(1-Math.exp(-t/.11));
  const maxProfile=Math.max(...Array.from({length:1000},(_,i)=>profile(i/999)));
  // Ray intersection preserves the actual source outer boundary. Only the
  // vertical roof section and oculus size are interpreted from official photos.
  function radius(angle){const dx=Math.cos(angle),dz=Math.sin(angle);let result=0;for(let i=0;i<p.length;i++){const a={x:p[i].x-center.x,z:p[i].z-center.z},b={x:p[(i+1)%p.length].x-center.x,z:p[(i+1)%p.length].z-center.z},ex=b.x-a.x,ez=b.z-a.z,den=dx*ez-dz*ex;if(Math.abs(den)<1e-8)continue;const t=(a.x*ez-a.z*ex)/den,u=(a.x*dz-a.z*dx)/den;if(t>0&&u>=0&&u<=1)result=Math.max(result,t);}return result;}
  const point=(ring,index)=>{const t=inner+(1-inner)*ring/rings,angle=(index+(ring%2)*.5)/segments*Math.PI*2,r=radius(angle)*t;return{x:center.x+Math.cos(angle)*r,y:base+8+(topHeight-8)*profile(t)/maxProfile,z:center.z+Math.sin(angle)*r};};
  const positions=[[],[],[]];
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
   const a=point(j,i),b=point(j,i+1),c=point(j+1,i),d=point(j+1,i+1),palette=(i*7+j*3)%17;
   for(const [triangle,shade]of[[[a,c,b],palette<3?2:palette<8?1:0],[[b,c,d],palette>13?2:palette<5?1:0]])for(const q of triangle)positions[shade].push(q.x,q.y,q.z);
   ribbon({...a,y:a.y+.11},{...b,y:b.y+.11},.43);ribbon({...a,y:a.y+.11},{...c,y:c.y+.11},.43);ribbon({...b,y:b.y+.11},{...c,y:c.y+.11},.35);
  }
  for(let k=0;k<positions.length;k++){const top=upward(positions[k]);jewelTriangles+=top.length/9;mesh(top,jewelGlass[k],`Jewel-source-dome-${f.id}-${k}`);}
  const outer=[];for(let i=0;i<segments;i++){const a=point(rings,i),b=point(rings,i+1);outer.push(a.x,base,a.z,b.x,base,b.z,a.x,a.y,a.z,b.x,base,b.z,b.x,b.y,b.z,a.x,a.y,a.z);}mesh(outer,glass,'Jewel-glazed-base');
  const gardenRing=[];for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,r=radius(a)*.26;gardenRing.push({x:center.x+Math.cos(a)*r,z:center.z+Math.sin(a)*r});}polygon(gardenRing,[],green,()=>base+8,'Jewel-interior-garden');
  // A restrained green valley and dark central pool remain visible in the
  // oculus. Indoor shops/waterfall simulation are outside the exterior asset.
  const pool=new THREE.Mesh(new THREE.CircleGeometry(9,32),dark);pool.rotation.x=-Math.PI/2;pool.position.set(center.x,base+8.1,center.z);root.add(pool);
  for(let i=0;i<20;i++){const a=i/20*Math.PI*2,r=26+(i%3)*7,q={x:center.x+Math.cos(a)*r,z:center.z+Math.sin(a)*r};const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(3.8+(i%3),0),green);crown.position.set(q.x,base+12+(i%3)*1.5,q.z);root.add(crown);}
  jewelCount=1;
 }
 let towerCount=0;const towers=[];
 for(const f of features.filter(f=>f.id==='way/173010406'||/^Changi Control Tower(?:\s+Changi Control Tower)?$/i.test(label(f)))){
  const p=ringOf(f);if(!p.length)continue;const q=p.length>2?centroid(p):p[0];if(towers.some(t=>Math.hypot(t.x-q.x,t.z-q.z)<45))continue;towers.push(q);
  const base=terrainHeight(q.x,q.z),tower=new THREE.Group();tower.name=`Changi-control-tower-${f.id}`;tower.position.set(q.x,base,q.z);root.add(tower);
  // Main tower's source footprint, iconic flared circular cab and light shaft.
  // Source height is 78 m. The fallback is an 80 m visual estimate; CAAS's
  // approximately 81 m AMSL description uses a different vertical datum.
  const sourceHeight=parseFloat(tags(f).height),height=Number.isFinite(sourceHeight)?Math.max(30,Math.min(95,sourceHeight)):80,scale=height/85.8;
  function cylinder(rt,rb,h,y,mat){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt*scale,rb*scale,h*scale,20),mat);m.position.y=(y+h/2)*scale;tower.add(m);return m;}
  cylinder(4.3,5,60,0,stone);cylinder(12,6,4.5,60,stone);cylinder(13.5,12,4.5,64.5,glass);cylinder(14,14,1,68.6,frame);cylinder(11.7,13.5,3.1,69.5,glass);cylinder(13,13,1.1,72.6,stone);cylinder(6.6,6,3.6,74,glass);cylinder(7.2,7.2,.8,77.6,frame);
  const dome=new THREE.Mesh(new THREE.IcosahedronGeometry(3.8*scale,1),stone);dome.position.y=82*scale;tower.add(dome);
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;box(.55*scale,9*scale,.55*scale,stone,Math.cos(a)*12.4*scale,64*scale,Math.sin(a)*12.4*scale,tower);}
  box(.6*scale,59*scale,.28*scale,dark,0,.5*scale,4.55*scale,tower);towerCount++;
 }
 root.traverse(m=>{if(m.isMesh){m.castShadow=m.material!==apron;m.receiveShadow=true;}});
 if(ribPositions.length)mesh(upward(ribPositions),frame,'Changi-shared-roof-ribs');
 // Shared material batches need the same indexed attributes. No private update
 // hooks, runtime textures or transparent sorting are required for this asset.
 const normalized=new Set();root.traverse(m=>{if(!m.isMesh||normalized.has(m.geometry))return;const g=m.geometry,n=g.attributes.position.count;if(!g.index)g.setIndex(Array.from({length:n},(_,i)=>i));if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(n*2),2));normalized.add(g);});
 orderGroundPaint(root);
 const center=terminals[0]?.center||jewel?.center||{x:0,z:0};
 return{group:root,terminalCenter:{...center,y:terrainHeight(center.x,center.z)},footprintBased:terminals.length>0,terminalCount:terminals.length,terminalSourceIds:terminals.map(t=>t.f.id),roofTriangles,rooflights,gates,towerCount,jewelCount,jewelTriangles,jewelSourceId:jewel?.f.id||null,staticAircraft:0};
}
