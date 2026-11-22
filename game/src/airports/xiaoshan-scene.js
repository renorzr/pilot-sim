import {GROUND_LAYERS as G,surfaceDepth,groundPaint,orderGroundPaint} from './ground-layers.js';

// Original lightweight exterior asset. OSM supplies plans and locations; roof
// profiles, facade divisions, heights and bridge equipment are visual estimates.
// White undulating roofs and dark diamond rooflights follow CSCEC's T4 aerial
// photograph, not a copied architectural model or a distributed photo texture.
export function buildXiaoshanScenery({THREE,group,project,terrainHeight=()=>0,features=[],materials={}}){
 const root=new THREE.Group();root.name='ZSHC-Xiaoshan-terminal-complex';group.add(root);
 const material=(key,color,extra={})=>materials[key]||new THREE.MeshStandardMaterial({color,roughness:.72,...extra});
 const roof=materials.xiaoshanRoof||new THREE.MeshPhysicalMaterial({color:'#dce0e2',metalness:.38,roughness:.42,clearcoat:.12,side:THREE.DoubleSide});
 const frame=material('xiaoshanFrame','#c8cdd0',{side:THREE.DoubleSide});
 const glass=material('xiaoshanGlass','#304b59',{metalness:.48,roughness:.26,side:THREE.DoubleSide});
 const dark=material('xiaoshanDark','#5b666b');
 const apron=material('xiaoshanApron','#b5b7af',surfaceDepth(1));
 const paint=groundPaint(new THREE.MeshBasicMaterial({color:'#d1b35a'}));
 const rooflight=material('xiaoshanRooflight','#3f5964',{metalness:.55,roughness:.3,side:THREE.DoubleSide});
 const unitBox=new THREE.BoxGeometry(1,1,1),seams=[];
 const tag=f=>f?.tags||f?.properties?.tags||f?.properties||{};
 function ringOf(f){
  let a=f?.geometry?.coordinates||f?.geometry||f?.outline||f?.coordinates;
  while(Array.isArray(a?.[0]?.[0]))a=a[0];
  if(!Array.isArray(a))return[];
  const p=a.map(v=>Array.isArray(v)?v:[v.lon,v.lat]).filter(v=>Number.isFinite(v[0])&&Number.isFinite(v[1])).map(v=>project(v[0],v[1]));
  if(p.length>1&&Math.hypot(p[0].x-p.at(-1).x,p[0].z-p.at(-1).z)<.01)p.pop();
  return p;
 }
 const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.z-b.x*a.z;},0)/2;
 function centroid(p){
  let sum=0,x=0,z=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],k=a.x*b.z-b.x*a.z;sum+=k;x+=(a.x+b.x)*k;z+=(a.z+b.z)*k;}
  return Math.abs(sum)>1e-8?{x:x/(3*sum),z:z/(3*sum)}:{x:p.reduce((s,v)=>s+v.x,0)/p.length,z:p.reduce((s,v)=>s+v.z,0)/p.length};
 }
 const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
 function segmentDistance(p,a,b){const x=b.x-a.x,z=b.z-a.z,l=x*x+z*z,t=l?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/l)):0;return Math.hypot(p.x-a.x-t*x,p.z-a.z-t*z);}
 function box(w,h,d,mat,x,y,z,parent=root){const mesh=new THREE.Mesh(unitBox,mat);mesh.scale.set(w,h,d);mesh.position.set(x,y+h/2,z);parent.add(mesh);return mesh;}
 function beam(a,b,w,h,mat,y){const m=box(w,h,Math.hypot(b.x-a.x,b.z-a.z),mat,(a.x+b.x)/2,y,(a.z+b.z)/2);m.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);return m;}
 function polygon(p,holes,mat,height){
  const all=[...p,...holes.flat()],indices=THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(v.x,-v.z)),holes.map(h=>h.map(v=>new THREE.Vector2(v.x,-v.z)))),positions=[];
  for(const t of indices)for(const i of t){const v=all[i];positions.push(v.x,height(v),v.z);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();root.add(new THREE.Mesh(g,mat));
 }
 const terminals=features.filter(f=>tag(f).aeroway==='terminal'||tag(f).building==='terminal').map(f=>({f,p:ringOf(f)})).filter(v=>v.p.length>=3).map(v=>({...v,area:Math.abs(signedArea(v.p)),center:centroid(v.p)})).filter(v=>v.area>150).sort((a,b)=>b.area-a.area);
 const unique=[];for(const t of terminals)if(!unique.some(a=>Math.hypot(a.center.x-t.center.x,a.center.z-t.center.z)<5&&Math.abs(a.area-t.area)<a.area*.05))unique.push(t);
 const apronFeatures=features.filter(f=>tag(f).aeroway==='apron');
 for(const f of apronFeatures){const p=ringOf(f);if(p.length>=3)polygon(p,[],apron,v=>terrainHeight(v.x,v.z)+G.apron);}
 let roofTriangles=0,rooflights=0;
 for(const {f,p,area,center}of unique){
  const holes=(f.holes||[]).map(h=>ringOf({geometry:h})).filter(h=>h.length>=3);
  const label=[tag(f).name,tag(f).ref,tag(f)['name:en']].filter(Boolean).join(' '),isT4=/T\s*4|Terminal\s*4|4号|四号/i.test(label)||area>120000;
  const base=terrainHeight(center.x,center.z),eave=isT4?21:15,rise=isT4?12:6;
  let xx=0,xz=0,zz=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],w=Math.hypot(b.x-a.x,b.z-a.z),x=(a.x+b.x)/2-center.x,z=(a.z+b.z)/2-center.z;xx+=x*x*w;xz+=x*z*w;zz+=z*z*w;}
  const theta=.5*Math.atan2(2*xz,xx-zz),u={x:Math.cos(theta),z:Math.sin(theta)},v={x:-Math.sin(theta),z:Math.cos(theta)};
  const uv=q=>({u:(q.x-center.x)*u.x+(q.z-center.z)*u.z,v:(q.x-center.x)*v.x+(q.z-center.z)*v.z});
  const point=(a,b)=>({x:center.x+u.x*a+v.x*b,z:center.z+u.z*a+v.z*b});
  const boundary=q=>Math.min(...p.map((a,i)=>segmentDistance(q,a,p[(i+1)%p.length])));
  const heightCache=new WeakMap();
  const roofHeight=q=>{if(heightCache.has(q))return heightCache.get(q);const a=uv(q),d=boundary(q),interior=1-Math.exp(-d/22),height=base+eave+rise*interior+1.3*Math.sin(a.u/95)*Math.sin(a.v/105);heightCache.set(q,height);return height;};
  const local=root;
  const wallPositions=[];
  for(const ring of[p,...holes])for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],h0=roofHeight(a)-1,h1=roofHeight(b)-1;
   wallPositions.push(a.x,base+.2,a.z,b.x,base+.2,b.z,a.x,h0,a.z,b.x,base+.2,b.z,b.x,h1,b.z,a.x,h0,a.z);
   const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/22);
   for(let j=0;j<n;j++){const t=j/n,q={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};box(.7,roofHeight(q)-base,.7,frame,q.x,base,q.z,local);}
   beam(a,b,.55,.65,frame,base+7);beam(a,b,.65,.65,frame,base+14);
  }
  const walls=new THREE.BufferGeometry();walls.setAttribute('position',new THREE.Float32BufferAttribute(wallPositions,3));walls.computeVertexNormals();root.add(new THREE.Mesh(walls,glass));
  const all=[...p,...holes.flat()],triangles=THREE.ShapeUtils.triangulateShape(p.map(q=>new THREE.Vector2(q.x,-q.z)),holes.map(r=>r.map(q=>new THREE.Vector2(q.x,-q.z)))),positions=[];
  const middle=(a,b)=>({x:(a.x+b.x)/2,z:(a.z+b.z)/2});
  function split(a,b,c,depth=0){
   const ab=Math.hypot(a.x-b.x,a.z-b.z),bc=Math.hypot(b.x-c.x,b.z-c.z),ca=Math.hypot(c.x-a.x,c.z-a.z),longest=Math.max(ab,bc,ca);
   if(longest>24&&depth<14){if(ab===longest){const m=middle(a,b);split(a,m,c,depth+1);split(m,b,c,depth+1);}else if(bc===longest){const m=middle(b,c);split(a,b,m,depth+1);split(a,m,c,depth+1);}else{const m=middle(c,a);split(a,b,m,depth+1);split(m,b,c,depth+1);}return;}
   for(const q of[a,b,c])positions.push(q.x,roofHeight(q),q.z);
  }
  for(const t of triangles)split(...t.map(i=>all[i]));
  // Float32 rounding can reverse a few extremely thin source triangles. Keep
  // the actual uploaded roof faces upward and drop zero-area map slivers.
  const raw=new Float32Array(positions),upward=[];for(let i=0;i<raw.length;i+=9){const sign=(raw[i+5]-raw[i+2])*(raw[i+6]-raw[i])-(raw[i+3]-raw[i])*(raw[i+8]-raw[i+2]);if(Math.abs(sign)<1e-5)continue;const order=sign>0?[0,3,6]:[0,6,3];for(const k of order)upward.push(raw[i+k],raw[i+k+1],raw[i+k+2]);}
  roofTriangles+=upward.length/9;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(upward,3));g.computeVertexNormals();const roofMesh=new THREE.Mesh(g,roof);roofMesh.name='source-footprint-white-wave-roof';root.add(roofMesh);
  const a=p.map(uv),minU=Math.min(...a.map(q=>q.u)),maxU=Math.max(...a.map(q=>q.u)),minV=Math.min(...a.map(q=>q.v)),maxV=Math.max(...a.map(q=>q.v));
  const skyPositions=[];
  // T4's large, regular dark diamond rooflights are an aerial recognition cue.
  for(let x=Math.ceil(minU/42)*42;x<maxU;x+=42)for(let z=Math.ceil(minV/42)*42;z<maxV;z+=42){
   const q=point(x,z);if(!inside(q,p)||holes.some(h=>inside(q,h))||boundary(q)<32)continue;
   const corners=[point(x-8,z),point(x,z-5),point(x+8,z),point(x,z+5)];
   for(const i of[0,2,1,0,3,2]){const k=corners[i];skyPositions.push(k.x,roofHeight(k)+.35,k.z);}rooflights++;
  }
  if(skyPositions.length){const sky=new THREE.BufferGeometry();sky.setAttribute('position',new THREE.Float32BufferAttribute(skyPositions,3));sky.computeVertexNormals();root.add(new THREE.Mesh(sky,rooflight));}
  // A restrained edge cap remains visible along the white glazed facades.
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];seams.push(a.x,roofHeight(a)+.08,a.z,b.x,roofHeight(b)+.08,b.z);}
 }
 // Source jet-bridge lines are preferred over invented gate positions. Their
 // equipment size and elevation are approximations, while plan locations stay.
 const bridges=features.filter(f=>['jet_bridge','jetbridge'].includes(tag(f).aeroway));let gates=0;
 for(const f of bridges){const p=ringOf(f);if(p.length<2)continue;for(let i=1;i<p.length;i++)beam(p[i-1],p[i],3.7,2.8,frame,terrainHeight(p[i].x,p[i].z)+4.8);const end=p.at(-1),base=terrainHeight(end.x,end.z);box(5.5,3.3,5.5,glass,end.x,base+4.5,end.z);box(.8,4.7,.8,frame,end.x,base,end.z);gates++;}
 // Many OSM snapshots map only parking lead-ins. Add a short bridge at the
 // terminal-side end of those real lines, never a static aircraft on the stand.
 if(!gates){
  for(const f of features.filter(f=>tag(f).aeroway==='parking_position').slice(0,160)){
   const p=ringOf(f);if(p.length<2)continue;
   const near=q=>Math.min(...unique.map(t=>Math.min(...t.p.map((a,i)=>segmentDistance(q,a,t.p[(i+1)%t.p.length])))));
   const a=near(p[0])<near(p.at(-1))?p[0]:p.at(-1);if(near(a)>25)continue;
   const candidate=p.filter(b=>Math.hypot(b.x-a.x,b.z-a.z)>10).sort((b,c)=>Math.hypot(b.x-a.x,b.z-a.z)-Math.hypot(c.x-a.x,c.z-a.z))[0];if(!candidate)continue;
   const distance=Math.hypot(candidate.x-a.x,candidate.z-a.z),length=Math.min(18,distance*.4),end={x:a.x+(candidate.x-a.x)/distance*length,z:a.z+(candidate.z-a.z)/distance*length},base=terrainHeight(a.x,a.z);
   beam(a,end,3.7,2.8,frame,base+4.8);box(5,3,5,glass,end.x,base+4.5,end.z);gates++;
  }
 }
 let towerCount=0;
 for(const f of features.filter(f=>tag(f).aeroway==='control_tower'||/塔台|control tower|ATC tower/i.test(tag(f).name||''))){
  const p=ringOf(f);if(!p.length)continue;const q=p.length>2?centroid(p):p[0],base=terrainHeight(q.x,q.z),height=Math.min(90,Math.max(40,parseFloat(tag(f).height)||56));
  const tower=new THREE.Group();tower.position.set(q.x,base,q.z);root.add(tower);const stem=new THREE.Mesh(new THREE.CylinderGeometry(4.8,6.5,height,12),frame);stem.position.y=height/2;tower.add(stem);
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(12,5.2,6,12),roof);collar.position.y=height-1;tower.add(collar);const cab=new THREE.Mesh(new THREE.CylinderGeometry(12.5,12,5.7,12),glass);cab.position.y=height+4;tower.add(cab);const cap=new THREE.Mesh(new THREE.CylinderGeometry(14,14,1.2,12),roof);cap.position.y=height+7.3;tower.add(cap);box(.4,6,.4,dark,0,height+8,0,tower);towerCount++;
 }
 if(seams.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(seams,3));root.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#8b969d',transparent:true,opacity:.35})));}
 // Buildings and raised bridges cast real local sun shadows; apron/paint
 // remain receiving surfaces. The original terminal plan is unchanged.
 root.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=mesh.material!==apron&&mesh.material!==paint;mesh.receiveShadow=true;}});
 // Geometry attributes remain compatible with the shared material batching.
 const normalized=new Set();root.traverse(mesh=>{if(!mesh.isMesh||normalized.has(mesh.geometry))return;const g=mesh.geometry,n=g.attributes.position.count;if(!g.index)g.setIndex(Array.from({length:n},(_,i)=>i));if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(n*2),2));normalized.add(g);});
 orderGroundPaint(root);
 const center=unique[0]?.center||{x:0,z:0};
 return{group:root,terminalCenter:{...center,y:terrainHeight(center.x,center.z)},footprintBased:unique.length>0,terminalCount:unique.length,roofTriangles,rooflights,gates,towerCount,staticAircraft:0,terminalSourceIds:unique.map(t=>t.f.id)};
}
