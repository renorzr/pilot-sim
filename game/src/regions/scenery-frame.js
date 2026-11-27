// Affine bridge between runway-relative flight and shared regional geography.
// Both are tangent projections; using basis vectors preserves the small scale
// difference as well as heading/translation, without copying source arrays.
export function sceneryFrame(from,to){
 const point=p=>{const q=from.unproject(p.x,p.z);return{...p,...to.project(q.longitude,q.latitude)};},origin=point({x:0,z:0}),a=point({x:1,z:0}),b=point({x:0,z:1});
 const xx=a.x-origin.x,xz=b.x-origin.x,zx=a.z-origin.z,zz=b.z-origin.z,scale=Math.max(Math.hypot(xx,zx),Math.hypot(xz,zz));
 const transform=p=>({...p,x:origin.x+xx*p.x+xz*p.z,z:origin.z+zx*p.x+zz*p.z});
 const vector=p=>({...p,x:xx*p.x+xz*p.z,z:zx*p.x+zz*p.z});
 return{point:transform,vector,scale,elements:[xx,0,zx,0,0,1,0,0,xz,0,zz,0,origin.x,0,origin.z,1]};
}
export function transformObstacle(o,frame){
 const co=Math.cos(o.angle||0),si=Math.sin(o.angle||0),corners=[[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([x,z])=>[o.cx+x*o.width/2*co-z*o.depth/2*si,o.cz+x*o.width/2*si+z*o.depth/2*co]);
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 const rings=(o.rings||[corners]).map(r=>{const out=new Float32Array(r.length);for(let i=0;i<r.length;i+=2){const p=frame.point({x:r[i],z:r[i+1]});out[i]=p.x;out[i+1]=p.z;minX=Math.min(minX,out[i]);maxX=Math.max(maxX,out[i]);minZ=Math.min(minZ,out[i+1]);maxZ=Math.max(maxZ,out[i+1]);}return out;});
 return{...o,cx:(minX+maxX)/2,cz:(minZ+maxZ)/2,minX,maxX,minZ,maxZ,angle:0,width:maxX-minX,depth:maxZ-minZ,rings};
}
export function bridgeObstacleIndex(index,toSource,toLocal){
 return{...index,*candidates(a,b,margin=0,vertical=0,...args){for(const o of index.candidates(toSource.point(a),toSource.point(b),margin*toSource.scale,vertical,...args))yield transformObstacle(o,toLocal);}};
}
