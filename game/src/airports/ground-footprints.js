// Convex runway reservations, including their paved shoulders. Lower roads,
// taxi surfaces and their centreline decals must not compete with this area.
export function runwayFootprints(airport){
 return airport.data.runways.map(runway=>{
  const a=airport.project(runway.ends[0].longitude,runway.ends[0].latitude),b=airport.project(runway.ends[1].longitude,runway.ends[1].latitude),length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  const point=(along,cross)=>({x:a.x+dx*along-dz*cross,z:a.z+dz*along+dx*cross});
  return[point(-40,-runway.widthM/2-9),point(length+40,-runway.widthM/2-9),point(length+40,runway.widthM/2+9),point(-40,runway.widthM/2+9)];
 });
}

function splitPolygon(polygon,a,b){
 const inside=[],outside=[],side=p=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
 for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length],s=side(p),t=side(q),pin=s>=0,qin=t>=0;
  (pin?inside:outside).push(p);
  if(pin!==qin){const u=s/(s-t),v={x:p.x+(q.x-p.x)*u,y:p.y+(q.y-p.y)*u,z:p.z+(q.z-p.z)*u};inside.push(v);outside.push(v);}
 }
 return{inside,outside};
}

// Subtract convex footprints from a triangle. Each cut emits disjoint convex
// fragments; interpolated Y preserves the original surface outside the cut.
// Input triangles keep their winding, including non-horizontal road segments.
export function clipGroundTriangle(triangle,footprints){
 let polygons=[triangle];
 for(const footprint of footprints){
  const next=[];
  for(const polygon of polygons){
   let remaining=polygon;
   for(let i=0;i<footprint.length&&remaining.length>=3;i++){
    const split=splitPolygon(remaining,footprint[i],footprint[(i+1)%footprint.length]);
    if(split.outside.length>=3)next.push(split.outside);remaining=split.inside;
   }
  }
  polygons=next;
 }
 const triangles=[];
 for(const p of polygons)for(let i=1;i<p.length-1;i++){
  const a=p[0],b=p[i],c=p[i+1];if(Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))>1e-8)triangles.push([a,b,c]);
 }
 return triangles;
}
