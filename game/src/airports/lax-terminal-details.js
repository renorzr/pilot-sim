// Original, metre-scaled architectural detail. All textures are generated from
// deterministic patterns; no photograph, commercial model or external service.
export function createLaxTerminalDetails({THREE,root}){
 const textures=[],materials=[],stats={facadeBays:0,roofUnits:0,skylights:0,bridgeSupports:0};
 function pattern(width,height,pixel,color=true){
  const data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set([...pixel(x,y),255],(y*width+x)*4);
  const t=new THREE.DataTexture(data,width,height);t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;t.anisotropy=4;textures.push(t);return t;
 }
 const noise=(x,y)=>(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
 const facade=pattern(256,128,(x,y)=>{
  const column=Math.floor(x/51.2),local=x%51.2,pane=local>2.4&&local<49.2&&y>9&&y<119;
  if(!pane)return y<5?[105,115,115]:[167,175,171];
  const shade=6*Math.sin(column*2.9)+noise(x,y)*1.3,ceiling=y>100?9:0,blind=column===3&&y>58&&y<89?9:0;
  return[70+shade+ceiling+blind,94+shade+ceiling+blind,101+shade+ceiling+blind];
 });
 const glazingRoughness=pattern(256,128,(x,y)=>{const pane=x%51.2>2.4&&x%51.2<49.2&&y>9&&y<119,v=pane?64:160;return[v,v,v];},false);
 const panels=pattern(128,128,(x,y)=>{const seam=x<2||y<2,dirt=y<8?(8-y)*.7:0,v=seam?100:191-dirt+noise(x,y)*2;return[v,v+2,v];});
 const roofMap=pattern(128,128,(x,y)=>{const seam=x<2,v=seam?117:x<5?177:182+Math.sin(x/128*Math.PI)*7+noise(x,y)*2;return[v,v+5,v+6];});
 const roofRoughness=pattern(128,128,(x,y)=>{const v=x<3?140:111+noise(x,y)*5;return[v,v,v];},false);
 function material(name,color,extra={}){const m=new THREE.MeshStandardMaterial({color,roughness:.7,...extra});m.name=name;materials.push(m);return m;}
 const palette={
  glass:material('LAX-curtain-wall-glass','#d7e4e6',{map:facade,roughnessMap:glazingRoughness,metalness:.58,roughness:.72,envMapIntensity:1.8,side:THREE.DoubleSide}),
  panel:material('LAX-metal-panel-cladding','#e4e3db',{map:panels,metalness:.18,roughness:.62,side:THREE.DoubleSide}),
  roof:material('LAX-standing-seam-roof','#d0d6d6',{map:roofMap,roughnessMap:roofRoughness,metalness:.38,roughness:1,side:THREE.DoubleSide}),
  frame:material('LAX-aluminium-framing','#bdc4c1',{metalness:.35,roughness:.4}),
  concrete:material('LAX-concrete-plinth','#b0ada3',{map:panels,roughness:.94,side:THREE.DoubleSide}),
  shadow:material('LAX-recess-and-bellows','#303d43',{roughness:.92,side:THREE.DoubleSide}),
  service:material('LAX-rooftop-services','#8b999b',{map:panels,metalness:.35,roughness:.56}),
  skylight:material('LAX-rooflight-glass','#536e78',{metalness:.38,roughness:.24}),
  tyre:material('LAX-jetbridge-tyres','#303334',{roughness:.95}),
  safety:material('LAX-service-safety-rails','#b6a36b',{metalness:.15,roughness:.7}),
 };
 const cube=new THREE.BoxGeometry(1,1,1),wheel=new THREE.CylinderGeometry(.42,.42,.22,12),fan=new THREE.CylinderGeometry(.56,.56,.12,16);
 function box(w,h,d,x,y,z,mat,name,parent=root){
  let geometry=cube;
  if(mat.map){geometry=new THREE.BoxGeometry(w,h,d);const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;for(let i=0;i<p.count;i++){const horizontal=Math.abs(n.getY(i))>.5;uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/8,(horizontal?p.getZ(i):p.getY(i))/3.4);}}
  const mesh=new THREE.Mesh(geometry,mat);if(!mat.map)mesh.scale.set(w,h,d);mesh.position.set(x,y+h/2,z);mesh.name=name;parent.add(mesh);return mesh;
 }
 function facadeRing(points,height,base,seed=0,hole=false){
  const buffers=new Map(),signed=points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a.x*b.z-b.x*a.z;},0),side=(signed>=0?1:-1)*(hole?-1:1);let distance=0;
  function quad(a,b,bottom,top,mat,offset=0){
   const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),nx=dz/len*side,nz=-dx/len*side,vertices=[[a.x+nx*offset,bottom(a),a.z+nz*offset],[b.x+nx*offset,bottom(b),b.z+nz*offset],[a.x+nx*offset,top(a),a.z+nz*offset],[b.x+nx*offset,top(b),b.z+nz*offset]];
   if(!buffers.has(mat))buffers.set(mat,{p:[],uv:[]});const buffer=buffers.get(mat);
   for(const i of[0,1,2,1,3,2]){buffer.p.push(...vertices[i]);buffer.uv.push((distance+(i===1||i===3?len:0))/8,(vertices[i][1]-base)/3.4);}
  }
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.2)continue;
   const h=p=>height(p)-base,windowTop=p=>base+Math.max(3.5,h(p)*.76),floor=()=>base+2.1;
   quad(a,b,()=>base,floor,palette.concrete,.06);quad(a,b,floor,windowTop,palette.glass,-.24);
   quad(a,b,windowTop,p=>height(p)-.55,palette.panel,.03);quad(a,b,p=>height(p)-.55,height,palette.frame,.25);
   quad(a,b,p=>height(p)-.8,p=>height(p)-.55,palette.shadow,.14);
   if(length>5){
    const nx=(b.z-a.z)/length*side,nz=-(b.x-a.x)/length*side,bays=Math.ceil(length/9);
    for(let j=0;j<bays;j++){const t=(j+.5)/bays,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,top=height({x,z}),pier=(j+seed)%5===0;box(pier?1.25:.26,top-base-.6,pier?.8:.38,x+nx*(pier?.26:.1),base,z+nz*(pier?.26:.1),palette.frame,'LAX-facade-structural-mullion').rotation.y=Math.atan2(nx,nz);stats.facadeBays++;}
    if(length>24&&!hole&&Math.min(height(a),height(b))-base>10){
     const canopy=box(length-.6,.28,2.8,(a.x+b.x)/2+nx*1.25,base+7.1,(a.z+b.z)/2+nz*1.25,palette.frame,'LAX-recessed-gate-canopy');canopy.rotation.y=Math.atan2(-(b.z-a.z),b.x-a.x);
     const shadow=box(length-.6,.12,2.6,(a.x+b.x)/2+nx*1.2,base+6.98,(a.z+b.z)/2+nz*1.2,palette.shadow,'LAX-canopy-underside');shadow.rotation.copy(canopy.rotation);
    }
   }
   distance+=length;
  }
  for(const[mat,b]of buffers){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,mat);mesh.name='LAX-articulated-facade-'+mat.name;root.add(mesh);}
 }
 const inside=(x,z,p)=>{let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
 function roofDetails(points,holes,height,seed=0){
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  const candidates=[];
  for(let z=minZ+9;z<maxZ-6;z+=19)for(let x=minX+9;x<maxX-6;x+=23){
   if(![[0,0],[-5,-5],[-5,5],[5,-5],[5,5]].every(([dx,dz])=>inside(x+dx,z+dz,points)&&!holes.some(p=>inside(x+dx,z+dz,p))))continue;
   candidates.push({x,z,rank:Math.sin(x*.13+z*.27+seed)});
  }
  candidates.sort((a,b)=>a.rank-b.rank);
  for(const[i,p]of candidates.slice(0,Math.min(14,Math.max(1,Math.ceil(candidates.length/5)))).entries()){
   const y=Math.max(...[[-2,-1.5],[-2,1.5],[2,-1.5],[2,1.5]].map(([x,z])=>height({x:p.x+x,z:p.z+z})))+.16;
   box(4,1.2,3,p.x,y,p.z,palette.service,'LAX-roof-HVAC');box(4.2,.16,3.2,p.x,y+1.2,p.z,palette.frame,'LAX-roof-HVAC-cap');
   for(const dx of[-1,1]){const m=new THREE.Mesh(fan,palette.shadow);m.position.set(p.x+dx,y+1.42,p.z);m.name='LAX-roof-HVAC-fan';root.add(m);}
   box(1.6,.5,3,p.x,y+.1,p.z+2.5,palette.service,'LAX-roof-duct');stats.roofUnits++;
   if(i%2===0){const q=candidates[candidates.length-1-i];if(q){box(2.5,.35,5,q.x,height(q)+.18,q.z,palette.frame,'LAX-rooflight-curb');box(2.2,.2,4.7,q.x,height(q)+.53,q.z,palette.skylight,'LAX-rooflight');stats.skylights++;}}
  }
 }
 function bridge(a,b,ground,{end=false,index=0}={}){
  const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.8)return;
  const parent=new THREE.Group();parent.name='LAX-detailed-jetbridge';parent.position.set((a.x+b.x)/2,ground,(a.z+b.z)/2);parent.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);root.add(parent);
  box(3.3,.38,length,0,3.65,0,palette.shadow,'LAX-bridge-floor',parent);
  for(const side of[-1,1]){box(.16,1.25,length,side*1.58,4.05,0,palette.panel,'LAX-bridge-spandrel',parent);box(.11,1.05,length,side*1.61,5.3,0,palette.glass,'LAX-bridge-window-band',parent);}
  box(3.6,.25,length+.2,0,6.35,0,palette.frame,'LAX-bridge-roof-cap',parent);
  for(let z=-length/2+1.5;z<length/2;z+=3)for(const side of[-1,1])box(.12,2.25,.14,side*1.68,4.05,z,palette.frame,'LAX-bridge-window-frame',parent);
  if(length>6){
   const z=length*.2;box(1,2.8,1.4,0,.7,z,palette.frame,'LAX-bridge-lifting-column',parent);box(2.8,.45,1.4,0,.5,z,palette.shadow,'LAX-bridge-wheel-carriage',parent);
   for(const side of[-1,1]){const tyre=new THREE.Mesh(wheel,palette.tyre);tyre.rotation.z=Math.PI/2;tyre.position.set(side*1.2,.43,z);tyre.name='LAX-bridge-wheel';parent.add(tyre);}stats.bridgeSupports++;
  }
  if(end){
   for(let i=0;i<5;i++){const z=length/2-.8+i*.22;for(const side of[-1,1])box(.15,2.5,.12,side*1.7,3.9,z,palette.shadow,'LAX-bridge-accordion-bellows',parent);box(3.5,.14,.12,0,6.4,z,palette.shadow,'LAX-bridge-bellows-top',parent);}
   box(3.55,.3,1.6,0,3.65,length/2,palette.shadow,'LAX-bridge-docking-bumper',parent);
   if(index%3===0&&length>10){
    for(let i=0;i<12;i++)box(1.1,.16,.42,2.3,.1+i*.3,-3+i*.38,palette.frame,'LAX-bridge-service-stair',parent);
    for(const side of[1.8,2.8]){const m=box(.07,.08,5.4,side,3.05,-.8,palette.safety,'LAX-bridge-stair-handrail',parent);m.rotation.x=-.65;}
   }
  }
  // Thin shell pieces still obstruct the exterior observer. Their retained
  // source meshes are ray-tested before/after the world's render batching.
  parent.traverse(o=>{if(o.isMesh&&['LAX-bridge-floor','LAX-bridge-spandrel','LAX-bridge-window-band','LAX-bridge-roof-cap'].includes(o.name))o.userData.cameraObstacle=true;});
 }
 return{palette,textures,materials,stats,facade:facadeRing,roofDetails,bridge};
}
