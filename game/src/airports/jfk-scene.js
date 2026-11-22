import {GROUND_LAYERS as G,surfaceDepth,orderGroundPaint} from './ground-layers.js';

// Original exterior geometry anchored to the bundled OSM source plans. Heights,
// facade divisions, shell sections and roof bays are game visual estimates.
export function buildJfkScenery({THREE,group,project,terrainHeight=()=>0,features=[],materials={}}){
 const root=new THREE.Group();root.name='KJFK-terminal-complex';group.add(root);
 const material=(name,color,extra={})=>materials[name]||new THREE.MeshStandardMaterial({color,roughness:.7,...extra});
 const silver=material('jfkSilver','#d0d3cf',{metalness:.28,roughness:.48,side:THREE.DoubleSide}),white=material('jfkWhite','#eee9da',{side:THREE.DoubleSide}),glass=material('jfkGlass','#36555c',{metalness:.42,roughness:.28,side:THREE.DoubleSide}),concrete=material('jfkConcrete','#aaa79c'),dark=material('jfkDark','#3b4a4e'),red=material('jfkRed','#a32b2c'),apron=material('jfkApron','#aeb0a8',surfaceDepth(1));
 const rooflight=material('jfkRooflight','#6f8d94',{metalness:.35,roughness:.38}),equipment=material('jfkEquipment','#9aa5a5');
 const unit=new THREE.BoxGeometry(1,1,1),excluded=[],up=[];
 function box(w,h,d,mat,x,y,z,parent=root){const m=new THREE.Mesh(unit,mat);m.scale.set(w,h,d);m.position.set(x,y+h/2,z);parent.add(m);return m;}
 function beam(a,b,w,h,mat,y,parent=root){const m=box(w,h,Math.hypot(b.x-a.x,b.z-a.z),mat,(a.x+b.x)/2,y,(a.z+b.z)/2,parent);m.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);return m;}
 function ring(coords){const p=coords.map(v=>project(v[0],v[1]));if(p.length>1&&Math.hypot(p[0].x-p.at(-1).x,p[0].z-p.at(-1).z)<.01)p.pop();return p;}
 function centroid(p){return{x:p.reduce((s,v)=>s+v.x,0)/p.length,z:p.reduce((s,v)=>s+v.z,0)/p.length};}
 function shape(f){return{p:ring(f.geometry),holes:(f.holes||[]).map(ring)};}
 function mesh(ps,mat,name){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.name=name;root.add(m);return m;}
 function upward(ps){const q=[];for(let i=0;i<ps.length;i+=9){const d=(ps[i+5]-ps[i+2])*(ps[i+6]-ps[i])-(ps[i+3]-ps[i])*(ps[i+8]-ps[i+2]);if(Math.abs(d)<1e-6)continue;for(const j of d>0?[0,3,6]:[0,6,3])q.push(ps[i+j],ps[i+j+1],ps[i+j+2]);}return q;}
 function polygon(p,holes,mat,height,name,refine=false){
  const all=[...p,...holes.flat()],triangles=THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(v.x,-v.z)),holes.map(h=>h.map(v=>new THREE.Vector2(v.x,-v.z)))),positions=[];
  function triangle(a,b,c,depth=0){const edges=[Math.hypot(a.x-b.x,a.z-b.z),Math.hypot(b.x-c.x,b.z-c.z),Math.hypot(c.x-a.x,c.z-a.z)];if(refine&&depth<6&&Math.max(...edges)>35){const ab={x:(a.x+b.x)/2,z:(a.z+b.z)/2},bc={x:(b.x+c.x)/2,z:(b.z+c.z)/2},ca={x:(c.x+a.x)/2,z:(c.z+a.z)/2};triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);}else for(const v of[a,b,c])positions.push(v.x,height(v),v.z);}
  for(const t of triangles)triangle(...t.map(i=>all[i]));return mesh(upward(positions),mat,name);
 }
 const terminals=features.filter(f=>f.tags?.aeroway==='terminal'&&f.geometry.length>=4&&!f.tags.construction&&!f.tags.proposed&&!/new terminal/i.test(f.tags.name||''));let terminalCount=0,bridgeCount=0,towerCount=0,twaCount=0;
 for(const f of features.filter(f=>f.tags?.aeroway==='apron'&&f.geometry.length>=4)){const{p,holes}=shape(f);polygon(p,holes,apron,v=>terrainHeight(v.x,v.z)+G.apron,'source-JFK-apron');}
 for(const f of terminals){
  const {p,holes}=shape(f),c=centroid(p),isT4=/Terminal 4/.test(f.tags.name||''),h=Math.min(32,parseFloat(f.tags.height)||15),base=terrainHeight(c.x,c.z);excluded.push(f.id);
  // Shallow repeating silver barrel bays distinguish T4's roof. Concourses
  // remain within their source plans; no simplified bounding-box roof crosses aprons.
  const roofAt=v=>base+h+(isT4?Math.sin((v.x-c.x)*.027)**2*2.7:1.1*Math.sin((v.z-c.z)*.025)**2);
  polygon(p,holes,silver,roofAt,'source-JFK-terminal-roof',isT4);
  for(const boundary of[p,...holes])for(let i=0;i<boundary.length;i++){
   const a=boundary[i],b=boundary[(i+1)%boundary.length],len=Math.hypot(a.x-b.x,a.z-b.z);if(len<.3)continue;
   const wall=[a.x,base,a.z,b.x,base,b.z,a.x,roofAt(a)-.4,a.z,b.x,base,b.z,b.x,roofAt(b)-.4,b.z,a.x,roofAt(a)-.4,a.z];mesh(wall,glass,'JFK-terminal-glass');
   beam(a,b,.65,.65,white,base+2);beam(a,b,.8,.7,silver,Math.min(roofAt(a),roofAt(b))-.1);
   const n=Math.floor(len/16);for(let j=1;j<=n;j++){const t=j/(n+1);box(.5,h-.5,.5,white,a.x+(b.x-a.x)*t,base+.2,a.z+(b.z-a.z)*t);}
  }
  // Source-clipped roof services and rooflights are estimated construction
  // detail, with no extra terminal footprint or ground surface.
  const inside=(x,z,r)=>{let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
  const onRoof=(x,z)=>inside(x,z,p)&&!holes.some(r=>inside(x,z,r)),xs=p.map(q=>q.x),zs=p.map(q=>q.z);
  for(let x=Math.ceil(Math.min(...xs)/90)*90;x<Math.max(...xs);x+=90)for(let z=Math.ceil(Math.min(...zs)/90)*90;z<Math.max(...zs);z+=90){
   if(![[x-9,z-9],[x-9,z+9],[x+9,z-9],[x+9,z+9]].every(([x,z])=>onRoof(x,z)))continue;
   const y=roofAt({x,z});polygon([{x:x-4.5,z:z-2},{x:x+4.5,z:z-2},{x:x+4.5,z:z+2},{x:x-4.5,z:z+2}],[],rooflight,v=>roofAt(v)+.15,'JFK-source-rooflight');box(3,1.2,2.4,equipment,x+6,y+.1,z+5);box(1.5,.35,8,concrete,x+6,y+.1,z);
  }
  terminalCount++;
 }
 for(const f of features.filter(f=>f.tags?.aeroway==='jet_bridge'&&f.geometry.length>=2)){
  const p=ring(f.geometry);for(let i=1;i<p.length;i++)if(Math.hypot(p[i].x-p[i-1].x,p[i].z-p[i-1].z)>2){const c=centroid([p[i],p[i-1]]),base=terrainHeight(c.x,c.z);beam(p[i-1],p[i],3.1,2.5,glass,base+3.9);beam(p[i-1],p[i],3.4,.25,concrete,base+3.65);beam(p[i-1],p[i],3.4,.2,silver,base+6.4);const length=Math.hypot(p[i].x-p[i-1].x,p[i].z-p[i-1].z),nx=(p[i].z-p[i-1].z)/length*1.56,nz=-(p[i].x-p[i-1].x)/length*1.56;for(let j=0;j<=Math.ceil(length/4);j++){const t=j/Math.ceil(length/4),x=p[i-1].x+(p[i].x-p[i-1].x)*t,z=p[i-1].z+(p[i].z-p[i-1].z)*t;for(const sign of[-1,1])box(.16,2.5,.16,silver,x+nx*sign,base+3.9,z+nz*sign);}box(2.5,3.7,2.5,dark,p[i].x,base,p[i].z);bridgeCount++;}
 }
 // JFK's tall concrete shaft supports two offset rectangular glazed cabins.
 const towers=features.filter(f=>(f.tags?.aeroway==='control_tower'||f.tags?.man_made==='tower'&&/control|air traffic/i.test(f.tags.name||''))&&f.geometry.length);
 for(const f of towers.slice(0,1)){const p=ring(f.geometry),c=centroid(p),base=terrainHeight(c.x,c.z),h=Math.max(80,Math.min(110,parseFloat(f.tags.height)||98));excluded.push(f.id);const t=new THREE.Group();t.position.set(c.x,base,c.z);root.add(t);box(11,h-20,11,concrete,0,0,0,t);box(20,9,19,concrete,0,h-20,0,t);box(22,6,21,glass,0,h-11,0,t);box(24,1.5,23,silver,0,h-5,0,t);box(15,10,15,glass,10,h-25,-6,t);box(17,1.2,17,silver,10,h-15,-6,t);box(5,4,5,concrete,0,h-3,0,t);box(.7,7,.7,dark,0,h+1,0,t);towerCount++;}
 // Saarinen's TWA Flight Center: four upturned white shell lobes and dark
 // glazing. Native geometry follows the actual footprint and never ships photos.
 const twa=features.find(f=>/TWA Flight Center|Trans World Flight Center|TWA Terminal Building/i.test(f.tags?.name||'')&&f.geometry.length>=4);
 if(twa){const {p,holes}=shape(twa),c=centroid(p),base=terrainHeight(c.x,c.z),xmin=Math.min(...p.map(v=>v.x)),xmax=Math.max(...p.map(v=>v.x)),zmin=Math.min(...p.map(v=>v.z)),zmax=Math.max(...p.map(v=>v.z)),sx=Math.max(1,(xmax-xmin)/2),sz=Math.max(1,(zmax-zmin)/2);excluded.push(twa.id);
  const shellHeight=parseFloat(twa.tags.height)||16;const roofAt=v=>{const x=(v.x-c.x)/sx,z=(v.z-c.z)/sz;return base+shellHeight*(.55+.35*Math.min(1,Math.abs(x)*.75+Math.abs(z)*.6)+.10*Math.cos(x*2)*Math.cos(z*2));};polygon(p,holes,white,roofAt,'TWA-white-shell-roof',true);
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];mesh([a.x,base,a.z,b.x,base,b.z,a.x,roofAt(a)-1,a.z,b.x,base,b.z,b.x,roofAt(b)-1,b.z,a.x,roofAt(a)-1,a.z],glass,'TWA-dark-glazing');}
  box(8,.8,2,red,c.x,roofAt(c)+.1,c.z);twaCount++;
 }
 // Uniform attributes allow the owning world to merge all static geometry into
 // its material batches. No animation hooks or extra aircraft are introduced.
 root.traverse(m=>{if(m.isMesh){m.castShadow=m.material!==apron;m.receiveShadow=true;}});
 const normalized=new Set();root.traverse(m=>{if(!m.isMesh||normalized.has(m.geometry))return;const g=m.geometry,n=g.attributes.position.count;if(!g.index)g.setIndex(Array.from({length:n},(_,i)=>i));if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(n*2),2));normalized.add(g);});orderGroundPaint(root);
 return{group:root,terminalCount,terminalSourceIds:terminals.map(f=>f.id),bridgeCount,towerCount,twaCount,excludeFeatureIds:excluded,staticAircraft:0};
}
