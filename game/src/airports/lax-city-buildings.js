import * as THREE from 'three';

// Original procedural architecture. UV lengths are metres, so a warehouse
// never receives the same stretched single window as a small house.
export function cityPattern(kind){
 const width=256,height=128,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/width,v=y/height,n=((x*73+y*137)%29)/29-0.5;let c;
  if(kind==='home'){
   const pane=u%0.5>.14&&u%0.5<.36&&v>.30&&v<.79;
   c=pane?(Math.abs(u%0.5-.25)<.009||Math.abs(v-.54)<.012?[187,185,171]:[61+n*6,80+n*6,86+n*6]):[222+n*8,218+n*8,205+n*8];
   if(u%0.5>.125&&u%0.5<.375&&v>.27&&v<.30)c=[150,148,135];
   if(v<.045)c=[182,177,164];
  }else if(kind==='office'){
   const bay=Math.floor(u*4),pane=u*4%1>.055&&u*4%1<.945&&v>.19&&v<.94,shade=[0,12,-6,5][bay]+(v>.65?5:0);
   c=pane?[86+shade+n*2,113+shade+n*2,125+shade+n*2]:v<.13?[172,176,173]:[205,208,201];
  }else if(kind==='industrial'){
   const door=u>.16&&u<.53&&v<.67,window=u>.71&&u<.94&&v>.53&&v<.76,seam=x%8<1;
   c=door?[123+(y%7===0?-22:0),132+(y%7===0?-22:0),133+(y%7===0?-22:0)]:window?[65,89,98]:[211+n*6-(seam?15:0),214+n*6-(seam?15:0),208+n*6-(seam?15:0)];
   if(v<.06)c=[148,152,146];
  }else if(kind==='tile'){
   const row=Math.floor(y/8),seam=(x+(row%2)*8)%16<2||y%8<1,a=seam?-29:Math.sin((y%8)/8*Math.PI)*15;
   c=[205+a+n*7,191+a+n*7,178+a+n*7];
  }else{
   const seam=x%64<1||y%64<1,a=seam?-19:n*11;c=[216+a,218+a,211+a];
  }
  data.set([...c,255],(y*width+x)*4);
 }
 const texture=new THREE.DataTexture(data,width,height);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

export function buildUrbanBlocks(root,{blocks,roofColor=()=>null}){
 const materials={},buffers=new Map(),stats={count:blocks.length,pitchedRoofs:0,flatRoofs:0,roofUnits:0,triangles:0,materialBatches:0,textureBytes:5*256*128*4};
 for(const kind of['home','office','industrial','roof','tile','trim','service']){
  const mapped=!['trim','service'].includes(kind),m=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:kind==='office'?.45:.88,metalness:kind==='office'?.3:kind==='service'?.25:0,...(mapped?{map:cityPattern(kind)}:{})});m.name='LA-urban-'+kind;materials[kind]=m;buffers.set(kind,{p:[],uv:[],c:[],ranges:[]});
 }
 let building,color,co,si,facadeHeight;
 function face(kind,vertices,uv){
  const buffer=buffers.get(kind),order=vertices.length===3?[0,1,2]:[0,1,2,0,2,3];
  for(const i of order){const[x,y,z]=vertices[i];buffer.p.push(building.cx+x*co-z*si,building.baseY+y,building.cz+x*si+z*co);buffer.uv.push(...uv[i]);buffer.c.push(color.r,color.g,color.b);}
 }
 function box(kind,w,h,d,x,y,z,tint,top=true){
  color=tint;const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2,t=y+h,floorHeight=facadeHeight/Math.max(1,Math.round(facadeHeight/(kind==='home'?3.1:3.6))),unit=kind==='industrial'?[12,facadeHeight]:[8,floorHeight],uv=(length)=>{const repeats=kind==='home'?Math.max(1,Math.round(length/4))/2:kind==='office'?Math.max(1,Math.round(length/2))/4:length/unit[0];return[[0,y/unit[1]],[repeats,y/unit[1]],[repeats,t/unit[1]],[0,t/unit[1]]];};
  face(kind,[[a,y,e],[b,y,e],[b,t,e],[a,t,e]],uv(w));face(kind,[[b,y,c],[a,y,c],[a,t,c],[b,t,c]],uv(w));face(kind,[[b,y,e],[b,y,c],[b,t,c],[b,t,e]],uv(d));face(kind,[[a,y,c],[a,y,e],[a,t,e],[a,t,c]],uv(d));
  if(top)face(kind,[[a,t,e],[b,t,e],[b,t,c],[a,t,c]],[[a/8,e/8],[b/8,e/8],[b/8,c/8],[a/8,c/8]]);
 }
 const tint=c=>new THREE.Color(c),wallPalette=['#ddd1b9','#d4c8b2','#d9d5c8','#bdc4bf','#cfb6a0','#c6bca9'],tilePalette=['#a57861','#8b766b','#9a6650','#8f9691','#716c65'];
 for(const b of blocks){
  building=b;co=Math.cos(b.angle);si=Math.sin(b.angle);const starts=new Map([...buffers].map(([k,v])=>[k,v.p.length/3])),seed=[...b.id].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7),w=b.width,d=b.depth,h=b.height,small=Math.min(w,d),pitched=b.kind==='home'&&w*d<520&&h<12,wallKind=b.kind==='home'?'home':b.kind==='industrial'?'industrial':'office',wallTint=tint(wallPalette[seed%wallPalette.length]);
  if(pitched){
   stats.pitchedRoofs++;const rise=Math.min(h*.28,small*.24,3.2),eave=h-rise;
   facadeHeight=eave;box(wallKind,w-.06,eave,d-.06,0,0,0,wallTint,false);
   box('trim',w,.18,d,0,eave-.18,0,tint('#d5cfbf'),false);
   color=tint(tilePalette[seed%tilePalette.length]);const x=w/2,z=d/2;
   // Hipped roof, ridge along the longer axis. Every vertex stays within the
   // authoritative building envelope, including the architectural top.
   const ridge=w>=d?[[Math.min(0,-x+z),h,0],[Math.max(0,x-z),h,0]]:[[0,h,Math.min(0,-z+x)],[0,h,Math.max(0,z-x)]];
   const a=[-x,eave,-z],c=[x,eave,z],p=[x,eave,-z],q=[-x,eave,z],r=ridge[0],s=ridge[1],polys=w>=d?[[a,r,s,p],[p,s,c],[c,s,r,q],[q,r,a]]:[[a,r,p],[p,r,s,c],[c,s,q],[q,s,r,a]];
   for(const poly of polys)face('tile',poly,poly.map(v=>[v[0]/8,(v[2]+v[1]*.8)/8]));
  }else{
   stats.flatRoofs++;const parapet=Math.min(.6,h*.06),deck=h-Math.min(1.6,h*.15),roofTint=roofColor(b)||tint(b.kind==='industrial'?'#b9bcb4':'#bdb8ab');
   facadeHeight=h-parapet;box(wallKind,w-(b.kind==='home'?.06:0),facadeHeight,d-(b.kind==='home'?.06:0),0,0,0,wallTint,false);
   color=roofTint;face('roof',[[-w/2,deck,d/2],[w/2,deck,d/2],[w/2,deck,-d/2],[-w/2,deck,-d/2]],[[-w/16,d/16],[w/16,d/16],[w/16,-d/16],[-w/16,-d/16]]);
   // The upper facade encloses the recessed roof. Parapet coping reaches the
   // same height as the contact roof; equipment never protrudes above it.
   const rim=Math.min(.35,small*.035),trim=tint('#c9c7b9');
   box('trim',w,parapet,rim,0,h-parapet,(d-rim)/2,trim);box('trim',w,parapet,rim,0,h-parapet,-(d-rim)/2,trim);box('trim',rim,parapet,d-rim*2,(w-rim)/2,h-parapet,0,trim);box('trim',rim,parapet,d-rim*2,-(w-rim)/2,h-parapet,0,trim);
   const units=Math.min(b.kind==='industrial'?8:3,Math.max(1,Math.floor(w*d/650))),unitH=(h-deck)*.68;
   for(let j=0;j<units;j++){
    const ux=((j+.5)/units-.5)*w*.65,uz=((seed+j)%3-1)*d*.18,uw=Math.min(3.5,w*.13),ud=Math.min(2.5,d*.14);
    box('service',uw,unitH,ud,ux,deck,uz,tint('#939e9c'));box('trim',uw*.72,.07,ud*.68,ux,deck+unitH,uz,tint('#48595c'));stats.roofUnits++;
   }
   if(b.kind==='industrial'&&small>22){for(let j=0;j<Math.min(5,Math.floor(w/25));j++)box('office',Math.min(3,w*.07),.17,d*.32,(-.35+j*.18)*w,deck,d*.22,tint('#899da1'));}
   if(b.kind==='home'&&h>10){for(let y=3.1;y<h-1;y+=3.1)box('trim',w,.12,d,0,y,0,tint('#b4ad9e'),false);}
  }
  if(b.kind==='home'){
   const doorH=Math.min(2.3,facadeHeight*.85),doorW=Math.min(1.4,w*.18);
   box('trim',doorW+.18,doorH+.12,.02,0,0,d/2-.02,tint('#b8ae98'));
   box('trim',doorW,doorH,.015,0,0,d/2-.009,tint('#485b60'));
  }
  for(const[k,buffer]of buffers){const start=starts.get(k),count=buffer.p.length/3-start;if(count)buffer.ranges.push({id:b.id,start,count});}
 }
 for(const[k,b]of buffers){if(!b.p.length){materials[k].map?.dispose();materials[k].dispose();continue;}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));g.computeVertexNormals();g.userData.buildingRanges=b.ranges;g.computeBoundingSphere();const m=new THREE.Mesh(g,materials[k]);m.name='LAX-source-city-'+k;m.castShadow=true;root.add(m);stats.triangles+=b.p.length/9;stats.materialBatches++;}
 root.userData.urbanStats=stats;return stats;
}
