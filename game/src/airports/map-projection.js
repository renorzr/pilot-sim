// Offline equirectangular map. Longitudes unwrap around the displayed meridian
// so trans-Pacific routes cross the Pacific and source land rings keep seams.
const rad=Math.PI/180,deg=180/Math.PI;
export const longitudeNear=(longitude,center)=>center+((longitude-center+180)%360+360)%360-180;
export function greatCircle(a,b,steps=72){
 const vector=p=>{const lon=p.longitude*rad,lat=p.latitude*rad;return[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];},u=vector(a),v=vector(b),angle=Math.acos(Math.max(-1,Math.min(1,u.reduce((s,x,i)=>s+x*v[i],0)))),sin=Math.sin(angle);
 return Array.from({length:steps+1},(_,i)=>{const t=i/steps,p=sin>1e-7?u.map((x,j)=>(Math.sin((1-t)*angle)*x+Math.sin(t*angle)*v[j])/sin):u.map((x,j)=>x*(1-t)+v[j]*t);return[Math.atan2(p[1],p[0])*deg,Math.atan2(p[2],Math.hypot(p[0],p[1]))*deg];});
}
function unwrap(points,center){let previous=center;return points.map(([lon,lat])=>{const x=longitudeNear(lon,previous);previous=x;return[x,lat];});}
function clipEdge(points,boundary,lower){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],ia=lower?a[0]>=boundary:a[0]<=boundary,ib=lower?b[0]>=boundary:b[0]<=boundary;if(ia)out.push(a);if(ia!==ib){const t=(boundary-a[0])/(b[0]-a[0]);out.push([boundary,a[1]+(b[1]-a[1])*t]);}}return out;}
export function mapLandRings(rings,west,east){const center=(west+east)/2,out=[];for(const ring of rings){const p=unwrap(ring,center);for(const shift of[-360,0,360]){const moved=p.map(([lon,lat])=>[lon+shift,lat]);if(Math.max(...moved.map(p=>p[0]))<west||Math.min(...moved.map(p=>p[0]))>east)continue;const clipped=clipEdge(clipEdge(moved,west,true),east,false);if(clipped.length>=3)out.push(clipped);}}return out;}
export function mapRouteSegments(points,center){const west=center-180,east=center+180,p=unwrap(points,center),out=[];for(const shift of[-360,0,360]){let line=[];for(let i=1;i<p.length;i++){const a=[p[i-1][0]+shift,p[i-1][1]],b=[p[i][0]+shift,p[i][1]],lo=Math.min(a[0],b[0]),hi=Math.max(a[0],b[0]);if(hi<west||lo>east){if(line.length>1)out.push(line);line=[];continue;}const at=x=>[x,a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])],start=a[0]<west?at(west):a[0]>east?at(east):a,end=b[0]<west?at(west):b[0]>east?at(east):b;if(!line.length)line.push(start);line.push(end);}if(line.length>1)out.push(line);}return out;}
export function routeMapBounds(points,focus){
 if(!focus)return{west:0,east:360,south:-60,north:90};
 const unwrapped=unwrap(points,points[0][0]),xs=unwrapped.map(p=>p[0]),ys=unwrapped.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),padX=Math.max(7,(maxX-minX)*.12),padY=Math.max(6,(maxY-minY)*.18);
 return{west:minX-padX,east:maxX+padX,south:Math.max(-90,minY-padY),north:Math.min(90,maxY+padY)};
}
export function placeMapLabels(markers,width,height,{widthFor=()=>35,heightFor=()=>15}={}){
 const occupied=markers.map(p=>({left:p.x-8,right:p.x+8,top:p.y-8,bottom:p.y+8})),labels={};
 for(const m of markers){const w=widthFor(m),h=heightFor(m),candidates=[[12,-9],[12,h+4],[-w-12,-9],[-w-12,h+4],[-w/2,-h-4],[-w/2,h+14],[20,5],[-w-20,5],[12,-h-22],[-w-12,h+24]];let best;
  for(const[dx,dy]of candidates){const x=Math.max(2,Math.min(width-w-2,m.x+dx)),y=Math.max(h,Math.min(height-2,m.y+dy)),box={left:x-2,right:x+w+2,top:y-h,bottom:y+3},overlaps=occupied.filter(o=>box.left<o.right&&box.right>o.left&&box.top<o.bottom&&box.bottom>o.top).length;if(!best||overlaps<best.overlaps)best={x,y,box,overlaps};if(!overlaps)break;}
  labels[m.id]={x:best.x,y:best.y};occupied.push(best.box);
 }
 return labels;
}
// Shrink clustered hit circles so a later airport never steals its neighbour's
// centre on compact screens. Labels and the city buttons remain clickable.
export function mapMarkerRadii(markers){return Object.fromEntries(markers.map(p=>{const nearest=Math.min(...markers.filter(q=>q.id!==p.id).map(q=>Math.hypot(q.x-p.x,q.y-p.y)));return[p.id,{hit:Math.min(13,nearest*.45),dot:Math.min(6,nearest*.35)}];}));}
