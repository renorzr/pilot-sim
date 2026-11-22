// Original recognition geometry, in metres. Geographic plans and heights come
// from the city pack; architectural subdivisions are documented visual estimates.
// The layout/envelope functions deliberately do not depend on THREE so physics
// and rendering can use exactly the same positions and top heights.
const finite=value=>Number.isFinite(Number(value));
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

function convexHull(points){
 const ordered=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z),unique=[];
 for(const p of ordered)if(!unique.length||Math.hypot(p.x-unique.at(-1).x,p.z-unique.at(-1).z)>.01)unique.push(p);
 if(unique.length<3)return unique;
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),lower=[],upper=[];
 for(const p of unique){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
 for(const p of unique.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}

function rectangle(points,anchor,width,depth){
 if(points.length<3)return{cx:anchor.x,cz:anchor.z,width,depth,yaw:0};
 const hull=convexHull(points);let best=null;
 for(let i=0;i<hull.length;i++){
  const a=hull[i],b=hull[(i+1)%hull.length],yaw=Math.atan2(b.z-a.z,b.x-a.x),co=Math.cos(yaw),si=Math.sin(yaw);
  const u=hull.map(p=>p.x*co+p.z*si),v=hull.map(p=>-p.x*si+p.z*co),minU=Math.min(...u),maxU=Math.max(...u),minV=Math.min(...v),maxV=Math.max(...v),area=(maxU-minU)*(maxV-minV);
  if(!best||area<best.area){const cu=(minU+maxU)/2,cv=(minV+maxV)/2;best={cx:cu*co-cv*si,cz:cu*si+cv*co,width:maxU-minU,depth:maxV-minV,yaw,area};}
 }
 if(best.width>best.depth){const oldWidth=best.width;best.width=best.depth;best.depth=oldWidth;best.yaw+=Math.PI/2;}
 return best;
}

export function landmarkLayout({project,heightAt=()=>0,landmarks={}}){
 const records=[...(landmarks.sofi?[{...landmarks.sofi,kind:'sofi'}]:[]),...(landmarks.forum?[{...landmarks.forum,kind:'forum'}]:[]),...(landmarks.downtown||[]).map(record=>({...record,kind:'tower'}))];
 return records.map((record,index)=>{
  const geometry=(record.geometry||[]).filter(v=>Array.isArray(v)&&finite(v[0])&&finite(v[1])),points=geometry.map(([lon,lat])=>project(lon,lat));
  const anchor=finite(record.longitude)&&finite(record.latitude)?project(Number(record.longitude),Number(record.latitude)):points.length?{x:points.reduce((n,p)=>n+p.x,0)/points.length,z:points.reduce((n,p)=>n+p.z,0)/points.length}:null;
  if(!anchor)return null;
  const fallback=record.kind==='sofi'?[300,430,55]:record.kind==='forum'?[136,136,34]:[48,62,140];
  const frame=rectangle(points,anchor,Number(record.widthM)||fallback[0],Number(record.depthM)||fallback[1]);
  if(record.kind==='sofi'&&finite(record.longitude)&&finite(record.latitude)){
   const north=project(Number(record.longitude),Number(record.latitude)+.00001),co=Math.cos(frame.yaw),si=Math.sin(frame.yaw);
   if(-(north.x-anchor.x)*si+(north.z-anchor.z)*co<0)frame.yaw+=Math.PI;
  }
  frame.width=Math.max(5,frame.width);frame.depth=Math.max(5,frame.depth);
  const height=clamp(Number(record.heightM)||Number(record.tags?.height)||fallback[2],5,450),gradeY=heightAt(frame.cx,frame.cz),co=Math.cos(frame.yaw),si=Math.sin(frame.yaw);
  const world=(x,z)=>({x:frame.cx+x*co-z*si,z:frame.cz+x*si+z*co});
  const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>world(u*frame.width,v*frame.depth));
  const baseY=Math.min(gradeY,...corners.map(p=>heightAt(p.x,p.z)))-.15;
  return{...frame,record,id:record.id||`lax-city-landmark-${index}`,name:record.name||record.tags?.name||record.kind,kind:record.kind,points,gradeY,baseY,height,topY:gradeY+height};
 }).filter(Boolean);
}

export function landmarkEnvelopes(options){
 return landmarkLayout(options).map(f=>{
  const co=Math.abs(Math.cos(f.yaw)),si=Math.abs(Math.sin(f.yaw));
  return{id:f.id,name:f.name,cx:f.cx,cz:f.cz,width:co*f.width+si*f.depth,depth:si*f.width+co*f.depth,baseY:f.baseY,height:f.topY-f.baseY,topY:f.topY,yaw:0};
 });
}

export function buildLaxCityLandmarks({THREE,group,project,heightAt=()=>0,landmarks={}}){
 const root=new THREE.Group();root.name='LAX-city-landmarks';group.add(root);
 const layouts=landmarkLayout({project,heightAt,landmarks}),colliders=landmarkEnvelopes({project,heightAt,landmarks});
 const material=(name,color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.63,...extra});m.name=name;return m;};
 const palette={
  concrete:material('LA-city-concrete','#c2c4bf'),white:material('LA-city-warm-white','#e1e1d7',{roughness:.5}),
  roof:material('LA-SoFi-fritted-canopy','#d4dedc',{roughness:.44,metalness:.18,side:THREE.DoubleSide,vertexColors:true}),
  roofRim:material('LA-SoFi-canopy-rim','#d2d2c7',{roughness:.43,metalness:.23,side:THREE.DoubleSide}),
  dark:material('LA-city-shadow','#485158'),glass:material('LA-city-blue-glass','#698a99',{metalness:.33,roughness:.36}),
  paleGlass:material('LA-city-silver-glass','#a0b0b5',{metalness:.27,roughness:.4}),
  forumRed:material('LA-Forum-red','#a44434',{roughness:.7}),field:material('LA-SoFi-field','#557554',{roughness:1}),
 };
 const facade=cityPattern('office');for(const key of['glass','paleGlass']){palette[key].map=facade;palette[key].color.set('#cbd9d9');palette[key].roughness=.42;}
 palette.darkGlass=palette.glass.clone();palette.darkGlass.name='LA-city-charcoal-glass';palette.darkGlass.color.set('#6e7e85');
 const lineMaterial=new THREE.LineBasicMaterial({color:'#aab9b8'}),unit=new THREE.BoxGeometry(1,1,1);
 function mesh(parent,geometry,mat,name){const m=new THREE.Mesh(geometry,mat);m.name=name;parent.add(m);return m;}
 function box(parent,w,h,d,x,y,z,mat,name){let g=unit;if(mat.map){g=new THREE.BoxGeometry(w,h,d);const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/8,(p.getY(i)+h/2)/3.6);}const m=mesh(parent,g,mat,name);if(!mat.map)m.scale.set(w,Math.max(.01,h),d);m.position.set(x,y+h/2,z);return m;}
 function cylinder(parent,rTop,rBottom,h,y,mat,name,segments=48){const g=new THREE.CylinderGeometry(rTop,rBottom,Math.max(.01,h),segments);if(mat.map){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*2*rBottom/8,uv.getY(i)*h/3.6);}const m=mesh(parent,g,mat,name);m.position.y=y+h/2;return m;}
 function radial(parent,rx,rz,inner,outer,height,mat,name,{rings=8,segments=72,colors=false,taper=false}={}){
  const p=[],c=[],indices=[],white=new THREE.Color('#d8e0de'),green=new THREE.Color('#8faba0');
  for(let j=0;j<=rings;j++){const r=inner+(outer-inner)*j/rings;for(let i=0;i<=segments;i++){
   const a=i/segments*Math.PI*2,u=r*Math.cos(a),v=r*Math.sin(a),x=rx*u*(taper?1-.11*Math.max(0,-v):1),z=rz*v;p.push(x,height(u,v),z);
   if(colors){const field=Math.max(0,1-Math.abs(u)/.32)*Math.max(0,1-Math.abs(v-.12)/.58)*.4,color=white.clone().lerp(green,field);c.push(color.r,color.g,color.b);}
  }}
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b+1,b);if(j>0||inner>0)indices.push(a,a+1,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,mat,name);
 }
 function flatRing(parent,rx,rz,inner,outer,y,mat,name){return radial(parent,rx,rz,inner,outer,()=>y,mat,name,{rings:1});}
 function sourcePrism(parent,f,height,mat,name,scale=1){
  const co=Math.cos(f.yaw),si=Math.sin(f.yaw),p=f.points.length>=3?f.points.map(q=>({x:((q.x-f.cx)*co+(q.z-f.cz)*si)*scale,z:(-(q.x-f.cx)*si+(q.z-f.cz)*co)*scale})):[{x:-f.width/2*scale,z:-f.depth/2*scale},{x:f.width/2*scale,z:-f.depth/2*scale},{x:f.width/2*scale,z:f.depth/2*scale},{x:-f.width/2*scale,z:f.depth/2*scale}];
  if(p.length>1&&Math.hypot(p[0].x-p.at(-1).x,p[0].z-p.at(-1).z)<.01)p.pop();
  if(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.z-b.x*a.z;},0)>0)p.reverse();
  const positions=[],uv=[],top=THREE.ShapeUtils.triangulateShape(p.map(q=>new THREE.Vector2(q.x,-q.z)),[]);
  for(const t of top)for(const i of t){const v=p[i];positions.push(v.x,height,v.z);uv.push(v.x/8,v.z/8);}
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],len=Math.hypot(b.x-a.x,b.z-a.z)/8;positions.push(a.x,0,a.z,b.x,0,b.z,a.x,height,a.z,b.x,0,b.z,b.x,height,b.z,a.x,height,a.z);uv.push(0,0,len,0,0,height/3.6,len,0,len,height/3.6,0,height/3.6);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return mesh(parent,g,mat,name);
 }
 function buildSofi(parent,f){
  const rx=f.width/2,rz=f.depth/2,h=f.height,foundation=f.baseY-f.gradeY;
  // The real seating bowl is sunken. Terrain remains unchanged; the compact
  // visible concourse and field are recognition geometry below the canopy.
  box(parent,f.width*.62,h*.18-foundation,f.depth*.58,0,foundation,f.depth*.10,palette.dark,'SoFi-sunken-bowl-concourse');
  box(parent,53,.35,112,0,h*.18,f.depth*.10,palette.field,'SoFi-football-field');
  const bowl=cylinder(parent,rx*.72,rx*.68,h*.16,h*.13,palette.concrete,'SoFi-bowl-rim',64);bowl.scale.z=rz*.66/(rx*.72);bowl.position.z=f.depth*.10;
  const roofAt=(u,v)=>h*(1-(u*u+v*v)*(.35-.08*v));
  radial(parent,rx,rz,0,.87,roofAt,palette.roof,'SoFi-frosted-translucent-looking-canopy',{rings:15,segments:80,colors:true,taper:true});
  radial(parent,rx,rz,.87,1,roofAt,palette.roofRim,'SoFi-sweeping-canopy-rim',{rings:4,segments:80,taper:true});
  const seams=[];
  function point(u,v){return[rx*u*(1-.11*Math.max(0,-v)),Math.min(h,roofAt(u,v)+.13),rz*v];}
  for(let j=-7;j<=7;j++){const u=j/9,extent=Math.sqrt(1-u*u)*.85;for(let i=0;i<20;i++){const v=-extent+2*extent*i/20,w=-extent+2*extent*(i+1)/20;seams.push(...point(u,v),...point(u,w));}}
  for(let j=-8;j<=8;j++){const v=j/10,extent=Math.sqrt(1-v*v)*.84;for(let i=0;i<14;i++){const u=-extent+2*extent*i/14,w=-extent+2*extent*(i+1)/14;seams.push(...point(u,v),...point(w,v));}}
  const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(seams,3));const line=new THREE.LineSegments(lineGeometry,lineMaterial);line.name='SoFi-canopy-panel-seams';parent.add(line);
  for(let i=0;i<20;i++){
   const a=i/20*Math.PI*2,u=.78*Math.cos(a),v=.78*Math.sin(a),x=rx*u,z=rz*v,y=roofAt(u,v)-h*.04;
   const m=cylinder(parent,1.7,2.1,y,0,palette.white,'SoFi-canopy-column',8);m.position.x=x;m.position.z=z;
  }
 }
 function buildForum(parent,f){
  const r=Math.min(f.width,f.depth)/2,h=f.height,foundation=f.baseY-f.gradeY;
  cylinder(parent,r*.92,r*.92,h*.75-foundation,foundation,palette.forumRed,'Forum-red-arena-wall',72);
  cylinder(parent,r*.995,r*.995,h*.075,h*.76,palette.white,'Forum-white-entablature',72);
  cylinder(parent,r*.975,r*.975,h*.025,h*.84,palette.dark,'Forum-roof-shadow-line',72);
  radial(parent,r*.97,r*.97,.92,1,(u,v)=>h*(.86+.11*(1-u*u-v*v)),palette.forumRed,'Forum-red-roof-perimeter',{rings:1,segments:72});
  radial(parent,r*.97,r*.97,0,.92,(u,v)=>h*(.86+.11*(1-u*u-v*v)),palette.white,'Forum-light-shallow-domed-roof',{rings:8,segments:72});
  cylinder(parent,r*.13,r*.16,h*.03,h*.97,palette.concrete,'Forum-low-central-roof-cap',36);
  for(let i=0;i<72;i++){const a=i/72*Math.PI*2,x=Math.cos(a)*r*.965,z=Math.sin(a)*r*.965,post=box(parent,2.1,h*.69,2.1,x,h*.07,z,palette.white,'Forum-precast-colonnade');post.rotation.y=-a;}
  flatRing(parent,r*.99,r*.99,.93,1,h*.055,palette.white,'Forum-column-plinth');
 }
 function buildTower(parent,f,index){
  const h=f.height,w=f.width,d=f.depth,name=f.name,glass=index%3===0?palette.paleGlass:palette.glass;
  const wilshire=/wilshire grand/i.test(name),bank=/u\.?\s*s\.?\s*bank|library tower/i.test(name),gas=/gas company/i.test(name),aon=/aon/i.test(name);
  if(wilshire){
   sourcePrism(parent,f,h*.065,palette.concrete,'Wilshire-Grand-podium');
   box(parent,w*.72,h*.78,d*.70,0,0,0,glass,'Wilshire-Grand-tower');
   for(let y=h*.12;y<h*.77;y+=14.4)box(parent,w*.724,.35,d*.704,0,y,0,palette.white,'Wilshire-Grand-floor-belt');
   const x=w*.36,z=d*.35,y=h*.78,peak=h*.90,ps=[-x,y,-z,x,y,-z,-x,peak,-z,x,y,-z,x,h*.83,-z,-x,peak,-z,-x,y,z,-x,peak,z,x,y,z,x,y,z,-x,peak,z,x,h*.83,z,-x,peak,-z,x,h*.83,-z,-x,peak,z,x,h*.83,-z,x,h*.83,z,-x,peak,z];
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(ps.flatMap((v,i)=>i%3===0?[v/8,ps[i+1]/3.6]:[]),2));g.computeVertexNormals();mesh(parent,g,palette.paleGlass,'Wilshire-Grand-asymmetric-sail');
   const spire=cylinder(parent,.22,1.0,h*.10,h*.90,palette.white,'Wilshire-Grand-architectural-spire',8);spire.position.x=-w*.29;
  }else if(bank){
   const r=Math.min(w,d)*.49;
   cylinder(parent,r,r,h*.85,0,palette.paleGlass,'US-Bank-faceted-shaft',16);
   cylinder(parent,r*.94,r*.97,h*.045,h*.85,palette.white,'US-Bank-crown-step-1',16);
   cylinder(parent,r*.80,r*.86,h*.045,h*.895,palette.paleGlass,'US-Bank-crown-step-2',16);
   cylinder(parent,r*.61,r*.72,h*.045,h*.94,palette.white,'US-Bank-crown-step-3',16);
   cylinder(parent,r*.59,r*.59,h*.015,h*.985,palette.dark,'US-Bank-flat-crown',16);
   for(let i=0;i<8;i++){const a=i/8*Math.PI*2,post=box(parent,.9,h*.82,.9,Math.cos(a)*r*.94,h*.025,Math.sin(a)*r*.94,palette.white,'US-Bank-vertical-rib');post.rotation.y=-a;}
  }else{
   sourcePrism(parent,f,h*.94,aon?palette.darkGlass:glass,`${name}-source-footprint-shaft`,.996);
   for(let y=14.4;y<h*.93;y+=14.4){const band=sourcePrism(parent,f,.32,aon?palette.dark:palette.white,`${name}-recessed-floor-belt`);band.position.y=y;}
   sourcePrism(parent,f,h*.045,palette.concrete,`${name}-street-podium`);
   const capH=h*.06;
   if(gas){box(parent,w*.87,capH*.45,d*.87,0,h*.94,0,palette.white,'Gas-Company-shoulder');box(parent,w*.70,capH*.55,d*.70,0,h*.967,0,glass,'Gas-Company-crown');}
   else box(parent,w*.85,capH,d*.85,0,h*.94,0,palette.concrete,`${name}-roof-crown`);
  }
 }
 for(const [index,f]of layouts.entries()){
  const building=new THREE.Group();building.name=f.kind==='sofi'?'SoFi-Stadium':f.kind==='forum'?'Kia-Forum':f.name.replace(/\s+/g,'-');building.position.set(f.cx,f.gradeY,f.cz);building.rotation.y=-f.yaw;building.userData={sourceId:f.id,name:f.name,heightM:f.height,architecturalTopY:f.topY,estimatedArchitecture:true};root.add(building);
  if(f.kind==='sofi')buildSofi(building,f);else if(f.kind==='forum')buildForum(building,f);else buildTower(building,f,index);
 }
 root.updateMatrixWorld(true);
 let triangles=0,vertices=0,meshCount=0;root.traverse(o=>{if(o.isMesh){meshCount++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;}if(o.geometry?.attributes.position)vertices+=o.geometry.attributes.position.count;});
 const stats={landmarks:layouts.length,sofi:layouts.some(f=>f.kind==='sofi'),forum:layouts.some(f=>f.kind==='forum'),downtown:layouts.filter(f=>f.kind==='tower').length,triangles,vertices,meshCount,materials:Object.keys(palette).length+1};root.userData.landmarkStats=stats;
 return{group:root,colliders,stats};
}
import {cityPattern}from './lax-city-buildings.js';
