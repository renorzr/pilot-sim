// Index shoreline edges by north/south band. A point only visits edges that
// can cross its horizontal ray; hole bounds reject distant islands cheaply.
function indexRing(points){
 const xs=points.map(p=>p.x),zs=points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),count=Math.max(8,Math.min(128,Math.ceil(Math.sqrt(points.length)))),scale=count/(maxZ-minZ||1),bands=Array.from({length:count},()=>[]),band=z=>Math.max(0,Math.min(count-1,Math.floor((z-minZ)*scale)));
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if(a.z===b.z)continue;
  const edge={x:a.x,z:a.z,endZ:b.z,slope:(b.x-a.x)/(b.z-a.z)},first=band(Math.min(a.z,b.z)),last=band(Math.max(a.z,b.z));for(let k=first;k<=last;k++)bands[k].push(edge);
 }
 return{xMin:minX,xMax:maxX,zMin:minZ,zMax:maxZ,band,bands};
}
function inside(ring,x,z){
 if(x<ring.xMin||x>ring.xMax||z<ring.zMin||z>ring.zMax)return false;
 let hit=false;for(const edge of ring.bands[ring.band(z)])if((edge.z>z)!==(edge.endZ>z)&&x<edge.slope*(z-edge.z)+edge.x)hit=!hit;return hit;
}
export function createPolygonMask(polygons){
 const indexed=polygons.map(p=>({outer:indexRing(p.outer),holes:(p.holes||[]).map(indexRing)}));
 return(x,z)=>indexed.some(p=>inside(p.outer,x,z)&&!p.holes.some(h=>inside(h,x,z)));
}
