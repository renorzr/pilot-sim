import {GROUND_LAYERS as G,surfaceDepth,orderGroundPaint} from './ground-layers.js';
import {createLaxTerminalDetails}from './lax-terminal-details.js';

// Original game meshes. OSM supplies plans and landmark anchors; the curved
// roofs, facade divisions and structural sections are documented estimates.
export function buildLaxScenery({THREE,group,project,terrainHeight=()=>0,features=[],materials={}}){
 const root=new THREE.Group();root.name='KLAX-Los-Angeles-terminal-complex';group.add(root);
 const details=createLaxTerminalDetails({THREE,root});
 const mat=(name,color,extra={})=>materials[name]||new THREE.MeshStandardMaterial({color,roughness:.63,...extra});
 const roof=details.palette.roof,white=mat('laxWhite','#dedfd5',{side:THREE.DoubleSide}),glass=mat('laxGlass','#38585f',{metalness:.4,roughness:.3,side:THREE.DoubleSide}),steel=mat('laxSteel','#a8b2ad',{metalness:.45,roughness:.38}),blue=mat('laxBlue','#225591'),apron=mat('laxApron','#a1a59b',surfaceDepth(1));
 const stats={terminals:0,serviceBuildings:0,bridges:0,landmarks:0};
 const tags=f=>f.tags||{},label=f=>[tags(f).name,tags(f)['name:en'],tags(f).ref].filter(Boolean).join(' ');
 function ring(f){const p=(f.geometry||[]).map(v=>project(v[0],v[1]));if(p.length>1&&Math.hypot(p[0].x-p.at(-1).x,p[0].z-p.at(-1).z)<.01)p.pop();return p;}
 const holes=f=>(f.holes||[]).map(p=>ring({geometry:p}));
 const centroid=p=>({x:p.reduce((s,v)=>s+v.x,0)/p.length,z:p.reduce((s,v)=>s+v.z,0)/p.length});
 const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.z-b.x*a.z},0)/2);
 function cylinderAt(r1,r2,h,material,x,y,z){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,24),material);m.position.set(x,y+h/2,z);root.add(m);return m;}
 function mesh(ps,material,name){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));if(material.map){const uv=[];for(let i=0;i<ps.length;i+=3)uv.push(ps[i]/4,ps[i+2]/6);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}g.computeVertexNormals();const m=new THREE.Mesh(g,material);m.name=name;root.add(m);return m;}
 function upward(ps){const a=new Float32Array(ps),out=[];for(let i=0;i<a.length;i+=9){const cross=(a[i+5]-a[i+2])*(a[i+6]-a[i])-(a[i+3]-a[i])*(a[i+8]-a[i+2]);if(Math.abs(cross)<1e-5)continue;for(const j of cross>0?[0,3,6]:[0,6,3])out.push(a[i+j],a[i+j+1],a[i+j+2]);}return out;}
 function surface(p,hs,material,height,name,subdivide=false){
  const all=[...p,...hs.flat()],tri=THREE.ShapeUtils.triangulateShape(p.map(p=>new THREE.Vector2(p.x,-p.z)),hs.map(h=>h.map(p=>new THREE.Vector2(p.x,-p.z)))),ps=[];
  const vertex=p=>[p.x,height(p),p.z];
  const mix=(a,b,c,u,v)=>({x:a.x+(b.x-a.x)*u+(c.x-a.x)*v,z:a.z+(b.z-a.z)*u+(c.z-a.z)*v});
  for(const t of tri){const[a,b,c]=t.map(i=>all[i]),n=subdivide?Math.min(32,Math.max(1,Math.ceil(Math.max(Math.hypot(a.x-b.x,a.z-b.z),Math.hypot(a.x-c.x,a.z-c.z),Math.hypot(b.x-c.x,b.z-c.z))/14))):1;for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){const A=mix(a,b,c,i/n,j/n),B=mix(a,b,c,(i+1)/n,j/n),C=mix(a,b,c,i/n,(j+1)/n);ps.push(...vertex(A),...vertex(B),...vertex(C));if(i+j<n-1){const D=mix(a,b,c,(i+1)/n,(j+1)/n);ps.push(...vertex(B),...vertex(D),...vertex(C));}}}
  return mesh(upward(ps),material,name);
 }
 const center=project(-118.408,33.9425),near=p=>Math.hypot(p.x-center.x,p.z-center.z)<5000;
 for(const f of features.filter(f=>tags(f).aeroway==='apron')){const p=ring(f);if(p.length>=3&&near(centroid(p)))surface(p,holes(f),apron,v=>terrainHeight(v.x,v.z)+G.apron,'source-apron');}
 const candidates=features.filter(f=>(tags(f).aeroway==='terminal'||tags(f).building==='terminal')&&!tags(f).construction&&!tags(f).proposed&&tags(f).building!=='construction').map(f=>({f,p:ring(f),h:holes(f)})).filter(t=>t.p.length>=3&&area(t.p)>120&&near(centroid(t.p))).sort((a,b)=>area(b.p)-area(a.p));
 const rendered=[];
 for(const t of candidates){const c=centroid(t.p);if(rendered.some(v=>Math.hypot(v.x-c.x,v.z-c.z)<5))continue;rendered.push(c);const name=label(t.f),wave=/Bradley|West Gates|Satellite|Terminal B/i.test(name),base=terrainHeight(c.x,c.z),h=Math.min(45,parseFloat(tags(t.f).height)||16),minX=Math.min(...t.p.map(p=>p.x)),minZ=Math.min(...t.p.map(p=>p.z));
  const height=p=>base+h+(wave?3.5*(.5+.5*Math.sin((p.x-minX)/75*Math.PI))+1.5*Math.sin((p.z-minZ)/80*Math.PI):.8);
  surface(t.p,t.h,roof,height,'LAX-terminal-'+t.f.id,wave);details.facade(t.p,height,base,stats.terminals);for(const hole of t.h)details.facade(hole,height,base,stats.terminals,true);
  details.roofDetails(t.p,t.h,height,stats.terminals);
  stats.terminals++;
 }
 // The stand86B foreground includes support buildings. Keep their source
 // outlines instead of allowing featureless generic bounding boxes to hide
 // the detailed passenger terminal in the normal exterior camera.
 const stand=project(-118.3974889,33.9404048),serviceIds=[],inside=(q,p)=>{let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a.z>q.z)!==(b.z>q.z)&&q.x<(b.x-a.x)*(q.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
 for(const f of features){
  const t=tags(f);if(!t.building||t.aeroway||t.construction||t.proposed||t.building==='construction')continue;const p=ring(f);if(p.length<3)continue;const c=centroid(p),h=parseFloat(t.height)||Number(t['building:levels'])*3.2||8;
  if(Math.hypot(c.x-stand.x,c.z-stand.z)>750||h<5||h>18||area(p)<100||Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x))>160||Math.max(...p.map(v=>v.z))-Math.min(...p.map(v=>v.z))>160||candidates.some(v=>inside(c,v.p)))continue;
  const hs=holes(f),base=terrainHeight(c.x,c.z),height=()=>base+h;
  surface(p,hs,roof,height,'LAX-support-building-'+f.id);details.facade(p,height,base,stats.serviceBuildings);for(const hole of hs)details.facade(hole,height,base,stats.serviceBuildings,true);details.roofDetails(p,hs,height,stats.serviceBuildings);
  serviceIds.push(f.id);stats.serviceBuildings++;
 }
 // Source jet bridges follow their original plan; no static airliners occupy gates.
 for(const f of features.filter(f=>tags(f).aeroway==='jet_bridge')){const p=ring(f);if(p.length<2||!near(p[0]))continue;for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],y=terrainHeight(a.x,a.z);details.bridge(a,b,y,{end:i===p.length-1,index:stats.bridges});}stats.bridges++;}
 // Theme Building uses the actual source anchor when available. The two long
 // parabolic arches and floating glazed saucer are recognition geometry.
 const theme=features.find(f=>/Theme Building/i.test(label(f))),themeP=theme?centroid(ring(theme)):project(-118.4025,33.9443),themeY=terrainHeight(themeP.x,themeP.z);
 const themeRoot=new THREE.Group();themeRoot.position.set(themeP.x,themeY,themeP.z);root.add(themeRoot);themeRoot.name='LAX-Theme-Building';
 const localCylinder=(r1,r2,h,y,material)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,48),material);m.position.y=y+h/2;themeRoot.add(m);return m;};
 localCylinder(14,18,9,0,white);localCylinder(5,5,9,9,blue);localCylinder(21,16,6,17,glass);localCylinder(25,22,2,23,white);localCylinder(8,9,2,25,blue);
 for(const angle of[0,Math.PI/2]){
  const ps=[],steps=48;for(let i=0;i<steps;i++){const x0=-45+90*i/steps,x1=-45+90*(i+1)/steps,y0=41*(1-(x0/45)**2),y1=41*(1-(x1/45)**2),width=2.1;
   const corners=[[x0,y0,-width],[x0,y0,width],[x1,y1,-width],[x1,y1,width]];
   for(const j of[0,2,1,1,2,3]){const[x,y,z]=corners[j];ps.push(x*Math.cos(angle)+z*Math.sin(angle),y,-x*Math.sin(angle)+z*Math.cos(angle));}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.computeVertexNormals();themeRoot.add(new THREE.Mesh(g,white));
 }
 stats.landmarks++;
 // FAA central tower is distinct from the much lower terminal/ramp towers.
 const towerCandidates=features.filter(f=>(['control_tower','tower'].includes(tags(f).aeroway)||tags(f).man_made==='tower'&&tags(f)['tower:type']==='observation')&&f.geometry?.length).map(f=>({f,p:centroid(ring(f))}));
 const main=towerCandidates.filter(t=>Math.hypot(t.p.x-themeP.x,t.p.z-themeP.z)<650).sort((a,b)=>Math.hypot(a.p.x-themeP.x,a.p.z-themeP.z)-Math.hypot(b.p.x-themeP.x,b.p.z-themeP.z))[0];
 const towerP=main?.p||project(-118.4087,33.9431),towerY=terrainHeight(towerP.x,towerP.z),towerH=parseFloat(main?.f.tags?.height)||85.8;
 cylinderAt(5,8,towerH-14,white,towerP.x,towerY,towerP.z);cylinderAt(12,9,5,steel,towerP.x,towerY+towerH-14,towerP.z);cylinderAt(13,12,7,glass,towerP.x,towerY+towerH-9,towerP.z);cylinderAt(14,13,2,white,towerP.x,towerY+towerH-2,towerP.z);
 const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.25,.35,10,6),steel);antenna.position.set(towerP.x,towerY+towerH+5,towerP.z);root.add(antenna);stats.landmarks++;
 // Keep ground contact shadows; thin roof sheets and recessed facade layers
 // do not self-shadow through a kilometre-scale shadow map.
 root.traverse(o=>{if(o.isMesh){o.castShadow=o.name!=='source-apron';o.receiveShadow=o.name==='source-apron';}});
 root.excludeFeatureIds=[theme?.id,main?.f.id,'way/413226266',...serviceIds].filter(Boolean);orderGroundPaint(root);root.userData.sceneryStats={...stats,...details.stats};return root;
}
