import * as THREE from 'three';
const rotation=new THREE.Euler(0,0,0,'YXZ');
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10);};
export function aircraftRotation(s){return rotation.set(s.pitch||0,-(s.yaw||0),-(s.roll||0),'YXZ');}
export function aircraftPoint(s,p,offset=0){const v=new THREE.Vector3(...p).applyEuler(aircraftRotation(s));return[v.x+s.x,v.y+s.y+offset,v.z+s.z];}
export function aircraftVector(s,p){return new THREE.Vector3(...p).applyEuler(aircraftRotation(s)).toArray();}
// Authored Skyline320 joint pivots; these match the visual animation, including
// the main gear's rotation. Contact anchors are intentionally not used as foci.
export function aircraftFocusLocal(part,s,side=1){
 if(part==='wheel'||part==='main-tyre'){
  const angle=-side*(1-clamp(s.gearPosition??1))*1.66,x=-side*.4+(part==='main-tyre'?side*.25:0),y=-1.65,c=Math.cos(angle),n=Math.sin(angle);
  return[side*3+x*c-y*n,-.5+x*n+y*c,2.5];
 }
 if(part==='nose-wheel'){
  const a=(1-clamp(s.gearPosition??1))*1.74,c=Math.cos(a),n=Math.sin(a),steer=-clamp(s.ground?.steering??s.controls?.rudderApplied??s.controls?.rudder??0,-1,1)*.56;
  const x=-.8*Math.sin(steer),z=-.8*Math.cos(steer);
  return[x,-.45-1.95*c-z*n,-11.5-1.95*n+z*c];
 }
 if(part==='tail')return[0,5.5,17.7];
 return[0,1,0];
}
export function aircraftFocus(part,s,side=1,offset=0){return aircraftPoint(s,aircraftFocusLocal(part,s,side),offset);}
export function rayBox(a,b,box,padding=0){
 let lo=0,hi=1;
 for(let i=0;i<3;i++){const min=box.min[i]-padding,max=box.max[i]+padding,d=b[i]-a[i];if(Math.abs(d)<1e-8){if(a[i]<min||a[i]>max)return false;}else{let u=(min-a[i])/d,v=(max-a[i])/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>hi)return false;}}
 return hi>.015&&lo<.985;
}
export function aircraftSelfBlocked(s,position,target,part){
 if(!['wheel','tail','airframe'].includes(part))return false;
 const inverse=new THREE.Quaternion().setFromEuler(aircraftRotation(s)).invert(),local=p=>new THREE.Vector3(p[0]-s.x,p[1]-s.y,p[2]-s.z).applyQuaternion(inverse).toArray(),a=local(position),b=local(target);
 // Cheap, conservative pressure-shell and nacelle proxies. Precise world
 // geometry is checked separately by the live camera constraint.
 const shell={min:[-1.65,-1.35,-15.5],max:[1.65,1.4,12]};
 if(rayBox(a,b,shell))return true;
 if(part==='wheel')for(const side of[-1,1])if(rayBox(a,b,{min:[side*5.35-1,-2.1,-5.1],max:[side*5.35+1,.1,-.7]}))return true;
 return false;
}
export function viewBasis(pose){const forward=new THREE.Vector3(...pose.target).sub(new THREE.Vector3(...pose.position)).normalize(),up=new THREE.Vector3(...(pose.up||[0,1,0])),right=forward.clone().cross(up).normalize(),vertical=right.clone().cross(forward).normalize();return{forward,right,vertical};}
export function projected(point,pose,aspect=1.6,basis=viewBasis(pose)){const {forward,right,vertical}=basis,delta=new THREE.Vector3(...point).sub(new THREE.Vector3(...pose.position)),depth=delta.dot(forward),tan=Math.tan(pose.fov*Math.PI/360);return{x:delta.dot(right)/(Math.max(.001,depth)*tan*aspect),y:delta.dot(vertical)/(Math.max(.001,depth)*tan),depth};}
// Refine metadata AABBs with their source footprint where available. Concave
// terminal courtyards are open space, not solid rectangular buildings.
export function rayObstacle(a,b,box){
 if(!rayBox(a,b,box))return false;if(!box.polygons?.length)return true;
 let lo=.015,hi=.985;const dy=b[1]-a[1];if(Math.abs(dy)<1e-8){if(a[1]<box.min[1]||a[1]>box.max[1])return false;}else{const u=(box.min[1]-a[1])/dy,v=(box.max[1]-a[1])/dy;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return false;}
 const p=[a[0]+(b[0]-a[0])*lo,a[2]+(b[2]-a[2])*lo],q=[a[0]+(b[0]-a[0])*hi,a[2]+(b[2]-a[2])*hi],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),inside=(p,poly)=>{let value=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])value=!value;}return value;};
 for(const poly of box.polygons){if(inside(p,poly)||inside(q,poly))return true;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],u=cross(p,q,a),v=cross(p,q,b),w=cross(a,b,p),x=cross(a,b,q);if(u*v<0&&w*x<0)return true;}}
 return false;
}
