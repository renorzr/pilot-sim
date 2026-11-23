import {GROUND_LAYERS as G,surfaceDepth,groundPaint} from './ground-layers.js';
// Geometry-native, deliberately simplified exterior model of Daxing's terminal.
// This is an original game mesh; no architectural photographs or commercial
// airport models are bundled. When supplied, OSM footprints anchor its plan.
// Roof height, glazing, gate equipment and static aircraft are visual estimates.
export function buildDaxingScenery({THREE, group, project, terrainHeight=()=>0, features=[], terminal=null, materials={}}) {
  const root=new THREE.Group();root.name='daxing-terminal-and-aprons';group.add(root);
  const material=(key,color,extra={})=>materials[key]||new THREE.MeshStandardMaterial({color,roughness:.78,...extra});
  // User-selected CCTV / China Daily aerial references: orange-copper roof,
  // golden highlights and red-brown shade, rather than a grey-beige finish.
  const bronze=materials.daxingBronze||new THREE.MeshPhysicalMaterial({color:'#d58743',metalness:.66,roughness:.30,clearcoat:.25,clearcoatRoughness:.24,envMapIntensity:1.4,side:THREE.DoubleSide});
  const pale=material('daxingStone','#c5cbd0',{side:THREE.DoubleSide});
  const glass=material('daxingGlass','#293e4c',{metalness:.48,roughness:.24,side:THREE.DoubleSide});
  const dark=material('daxingDark','#4b5556');
  const white=material('daxingWhite','#e0e2df');
  const apron=material('daxingApron','#b8b6a8',surfaceDepth(1));
  const paint=groundPaint(material('daxingPaint','#c4a854'));
  const blue=material('daxingTail','#4b6984');
  const red=material('daxingRed','#a95b49');
  const unitBox=new THREE.BoxGeometry(1,1,1);
  function box(w,h,d,mat,x,y,z,parent=root) {
    const m=new THREE.Mesh(unitBox,mat);m.scale.set(w,h,d);m.position.set(x,y+h/2,z);parent.add(m);return m;
  }
  const tags=f=>f?.properties?.tags||f?.properties||f?.tags||{};
  function outlineOf(f) {
    if(!f)return null;
    let p=f.outline||f.coordinates||f.geometry?.coordinates||f.geometry;
    if(f.geometry?.type==='MultiPolygon')p=p[0][0];
    else if(f.geometry?.type==='Polygon'||Array.isArray(p?.[0]?.[0]))p=p[0];
    if(!Array.isArray(p)||p.length<3)return null;
    return p.map(v=>Array.isArray(v)?v:[v.lon,v.lat]).filter(v=>Number.isFinite(v[0])&&Number.isFinite(v[1]));
  }
  function area(p) {let n=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];n+=a[0]*b[1]-b[0]*a[1];}return Math.abs(n);}
  const terminalFeature=terminal||features.filter(f=>tags(f).aeroway==='terminal'||tags(f).building==='terminal').filter(f=>outlineOf(f)).sort((a,b)=>area(outlineOf(b))-area(outlineOf(a)))[0];
  let sourceOutline=outlineOf(terminalFeature);
  let center=terminal?.center;
  if(!center&&sourceOutline){
    // The area centroid is stable even for heavily sampled, concave footprints.
    let a=0,cx=0,cz=0;const p=sourceOutline.map(v=>project(v[0],v[1]));
    for(let i=0;i<p.length;i++){const q=p[i],r=p[(i+1)%p.length],k=q.x*r.z-r.x*q.z;a+=k;cx+=(q.x+r.x)*k;cz+=(q.z+r.z)*k;}
    if(Math.abs(a)>1e-5)center={x:cx/(3*a),z:cz/(3*a)};
  }
  // Fallback is an explicitly approximate model location, only used until the
  // downloaded footprint is provided. Production data supplies the real outline.
  center=Array.isArray(center)?project(center[0],center[1]):center||project(116.410806,39.509881);
  const origin=project(116.410806,39.509881),northPoint=project(116.410806,39.510881),eastPoint=project(116.411806,39.509881);
  const north=new THREE.Vector2(northPoint.x-origin.x,northPoint.z-origin.z).normalize();
  const east=new THREE.Vector2(eastPoint.x-origin.x,eastPoint.z-origin.z).normalize();
  const bearingVector=b=>new THREE.Vector2(north.x*Math.cos(b)+east.x*Math.sin(b),north.y*Math.cos(b)+east.y*Math.sin(b));
  const pierBearings=[45,110,172,242,295].map(v=>v*Math.PI/180);
  let plan=sourceOutline?.map(v=>{const p=project(v[0],v[1]);return{x:p.x-center.x,z:p.z-center.z};});
  if(!plan){
    plan=Array.from({length:240},(_,i)=>{
      const a=i/240*Math.PI*2,dir=bearingVector(a),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
      const r=220+Math.max(...pierBearings.map(b=>420*Math.exp(-Math.pow(wrap(a-b)/.18,2))),190*Math.exp(-Math.pow(wrap(a)/.45,2)));
      return{x:dir.x*r,z:dir.y*r};
    });
  }
  if(Math.hypot(plan[0].x-plan.at(-1).x,plan[0].z-plan.at(-1).z)<.01)plan.pop();
  const base=terrainHeight(center.x,center.z),terminalGroup=new THREE.Group();
  terminalGroup.name='daxing-radial-terminal';terminalGroup.position.set(center.x,base,center.z);root.add(terminalGroup);
  function polygon(points,mat,y,parent=root){
    const shape=new THREE.Shape();points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
    const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat);mesh.rotation.x=-Math.PI/2;mesh.position.y=y;parent.add(mesh);return mesh;
  }
  const apronFeatures=features.filter(f=>tags(f).aeroway==='apron'&&outlineOf(f));
  if(apronFeatures.length){for(const f of apronFeatures)polygon(outlineOf(f).map(v=>project(v[0],v[1])),apron,base+G.apron);}
  else polygon(plan.map(p=>({x:center.x+p.x*1.23,z:center.z+p.z*1.23})),apron,base+G.apron);
  polygon(plan,pale,.2,terminalGroup);
  function wallStrip(y0,y1,mat){
    const positions=[];
    for(let i=0;i<plan.length;i++){
      const a=plan[i],b=plan[(i+1)%plan.length];positions.push(a.x,y0,a.z,b.x,y0,b.z,a.x,y1,a.z,b.x,y0,b.z,b.x,y1,b.z,a.x,y1,a.z);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);terminalGroup.add(m);return m;
  }
  wallStrip(.2,6,pale);wallStrip(6,15,glass);wallStrip(14.2,15.2,bronze);
  // Rays recover the terminal's radial silhouette from its real plan. Re-sample
  // this roof into a smooth surface, rather than stacking rectangular slabs.
  function radiusAt(angle){
    const dx=Math.cos(angle),dz=Math.sin(angle);let radius=0;
    for(let i=0;i<plan.length;i++){
      const a=plan[i],b=plan[(i+1)%plan.length],ex=b.x-a.x,ez=b.z-a.z,den=dx*ez-dz*ex;
      if(Math.abs(den)<1e-9)continue;
      const t=(a.x*ez-a.z*ex)/den,u=(a.x*dz-a.z*dx)/den;
      if(t>0&&u>=0&&u<=1)radius=Math.max(radius,t);
    }
    return radius||220;
  }
  const roofHeight=(r,t)=>15+28*Math.exp(-Math.pow(r/250,2))*(1-Math.pow(t,6))+8*Math.sin(Math.PI*t)*Math.min(1,r/180);
  const ringCount=20,segments=240,positions=[0,43,0],indices=[];
  for(let ring=1;ring<=ringCount;ring++)for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,t=ring/ringCount,r=radiusAt(a)*t;
    positions.push(Math.cos(a)*r,roofHeight(r,t),Math.sin(a)*r);
  }
  for(let i=0;i<segments;i++)indices.push(0,1+(i+1)%segments,1+i);
  for(let ring=1;ring<ringCount;ring++)for(let i=0;i<segments;i++){
    const a=1+(ring-1)*segments+i,b=1+(ring-1)*segments+(i+1)%segments,c=1+ring*segments+i,d=1+ring*segments+(i+1)%segments;
    indices.push(a,b,c,b,d,c);
  }
  const roofGeometry=new THREE.BufferGeometry();roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));roofGeometry.setIndex(indices);roofGeometry.computeVertexNormals();
  const roof=new THREE.Mesh(roofGeometry,bronze);roof.name='flowing-bronze-roof';terminalGroup.add(roof);
  const seamPositions=[];
  for(let i=0;i<60;i++){
    const a=i/60*Math.PI*2,R=radiusAt(a);
    for(let j=1;j<20;j++)for(const t of[j/20,(j+1)/20]){const r=R*t;seamPositions.push(Math.cos(a)*r,roofHeight(r,t)+.08,Math.sin(a)*r);}
  }
  const seamGeometry=new THREE.BufferGeometry();seamGeometry.setAttribute('position',new THREE.Float32BufferAttribute(seamPositions,3));
  terminalGroup.add(new THREE.LineSegments(seamGeometry,new THREE.LineBasicMaterial({color:'#96542e',transparent:true,opacity:.5})));
  for(const bearing of [...pierBearings,0]){
    const dir=bearingVector(bearing),a=Math.atan2(dir.y,dir.x),R=radiusAt(a),vertices=[],tri=[];
    for(let j=0;j<=24;j++){
      const t=.11+.79*j/24,r=R*t,w=3+3*Math.sin(t*Math.PI);
      for(const sign of[-1,1])vertices.push(dir.x*r-sign*dir.y*w,roofHeight(r,t)+.22,dir.y*r+sign*dir.x*w);
      if(j<24){const k=j*2;tri.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(tri);g.computeVertexNormals();terminalGroup.add(new THREE.Mesh(g,glass));
  }
  const oculus=new THREE.Mesh(new THREE.CircleGeometry(22,32),glass);oculus.rotation.x=-Math.PI/2;oculus.position.y=43.15;terminalGroup.add(oculus);
  // Narrow mullions and horizontal floor bands read as glazing from the runway.
  for(let i=0;i<plan.length;i++){
    const a=plan[i],b=plan[(i+1)%plan.length],length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.ceil(length/18);
    for(let j=0;j<n;j++){const t=j/n;box(.8,9,.8,pale,a.x+(b.x-a.x)*t,6,a.z+(b.z-a.z)*t,terminalGroup);}
  }
  function beam(a,b,width,height,mat,y,parent=root){
    const mesh=box(width,height,Math.hypot(b.x-a.x,b.z-a.z),mat,(a.x+b.x)/2,y,(a.z+b.z)/2,parent);mesh.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);return mesh;
  }
  const aircraftGeo=new THREE.CapsuleGeometry(1.9,31,5,12),engineGeo=new THREE.CylinderGeometry(1.05,.95,3.7,10);
  const wingGeo=new THREE.BufferGeometry();wingGeo.setAttribute('position',new THREE.Float32BufferAttribute([-17.5,0,6,-2,0,-5,2,0,-5,-17.5,0,6,2,0,-5,17.5,0,6,-17.5,0,6,17.5,0,6,2,0,2],3));wingGeo.computeVertexNormals();
  const wingMat=new THREE.MeshStandardMaterial({color:'#c8cccb',roughness:.65,side:THREE.DoubleSide});
  function aircraft(x,z,outward,index){
    const p=new THREE.Group();p.position.set(x,base+4.6,z);p.rotation.y=Math.atan2(outward.x,outward.z);root.add(p);
    const fuselage=new THREE.Mesh(aircraftGeo,white);fuselage.rotation.x=Math.PI/2;p.add(fuselage);p.add(new THREE.Mesh(wingGeo,wingMat));
    const tail=box(.4,7,5.4,index%3?blue:red,0,1,13,p);tail.rotation.x=-.25;
    box(12,.3,3.5,white,0,1,12,p);
    for(const x of[-5.4,5.4]){const e=new THREE.Mesh(engineGeo,dark);e.rotation.x=Math.PI/2;e.position.set(x,-1.3,.6);p.add(e);}
    for(const x of[-2.4,2.4])box(.65,2.3,1.5,dark,x,-4.6,5,p);
    box(.5,2.5,.8,dark,0,-4.6,-12,p);
  }
  let gates=0;
  for(let arm=0;arm<pierBearings.length;arm++){
    const dir=bearingVector(pierBearings[arm]),a=Math.atan2(dir.y,dir.x),R=radiusAt(a);
    for(const t of[.54,.73,.9])for(const sign of[-1,1]){
      const x=dir.x*R*t,z=dir.y*R*t,side={x:-dir.y*sign,z:dir.x*sign};
      // Find the real footprint edge from the gate's radial position.
      let distance=20;
      for(let d=20;d<160;d+=4){
        const px=x+side.x*d,pz=z+side.z*d,edge=radiusAt(Math.atan2(pz,px));
        if(Math.hypot(px,pz)>edge){distance=d;break;}
      }
      const start={x:center.x+x+side.x*(distance-2),z:center.z+z+side.z*(distance-2)},end={x:start.x+side.x*28,z:start.z+side.z*28};
      beam(start,end,4.4,3.3,pale,base+5.3);box(7,3.8,7,glass,end.x,base+5,end.z);
      box(1.3,5,1.3,pale,end.x,base,end.z);
      beam({x:end.x+side.x*12,z:end.z+side.z*12},{x:end.x+side.x*65,z:end.z+side.z*65},.7,.002,paint,base+G.paint);
      if(gates%4===0)aircraft(end.x+side.x*39,end.z+side.z*39,side,gates);
      gates++;
    }
  }
  function tower(x,z,height){
    const t=new THREE.Group();t.position.set(x,terrainHeight(x,z),z);root.add(t);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(5,8,height,8),pale);stem.position.y=height/2;t.add(stem);
    const shoulder=new THREE.Mesh(new THREE.CylinderGeometry(16,5,8,8),white);shoulder.position.y=height-1;t.add(shoulder);
    const cab=new THREE.Mesh(new THREE.CylinderGeometry(17,14,7,8),glass);cab.position.y=height+5;t.add(cab);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(19,19,1.5,8),pale);cap.position.y=height+9;t.add(cap);
    box(.4,12,.4,dark,0,height+9,0,t);box(25,.5,.8,dark,0,height+10,0,t);
  }
  const towerFeatures=features.filter(f=>tags(f).aeroway==='control_tower'||tags(f)['tower:type']==='observation'&&/塔台|control/i.test(tags(f).name||''));
  if(towerFeatures.length){
    for(const f of towerFeatures.slice(0,2)){
      let p=f.center||f.coordinates||f.geometry?.coordinates||f.geometry||[f.lon,f.lat];
      if(Array.isArray(p?.[0])){while(Array.isArray(p[0]?.[0]))p=p[0];p=[p.reduce((a,v)=>a+v[0],0)/p.length,p.reduce((a,v)=>a+v[1],0)/p.length];}
      const q=Array.isArray(p)&&Number.isFinite(p[0])?project(p[0],p[1]):null;if(q)tower(q.x,q.z,60);
    }
  }else{
    // Approximate supporting objects, not surveyed obstacle coordinates.
    for(const sign of[-1,1])tower(center.x+east.x*sign*850+north.x*130,center.z+east.y*sign*850+north.y*130,60);
  }
  // All meshes use compatible attributes/indexing for the world's per-material
  // batching. Plain generated surfaces have no texture, but still need UVs to
  // merge with boxes/cylinders that use the same material.
  const normalized=new Set();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.castShadow=mesh.material!==apron&&mesh.material!==paint;mesh.receiveShadow=mesh.material!==paint;
    if(normalized.has(mesh.geometry))return;
    const g=mesh.geometry,n=g.attributes.position.count;
    if(!g.index)g.setIndex(Array.from({length:n},(_,i)=>i));
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(n*2),2));
    normalized.add(g);
  });
  return {group:root,terminalCenter:{...center,y:base},footprintBased:!!sourceOutline,gates,staticAircraft:Math.ceil(gates/4)};
}
