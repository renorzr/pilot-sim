// Spherical navigation in metres. Aircraft motion is still integrated by the
// force model; these functions interpret the observed horizontal displacement.
const R=6371000,rad=Math.PI/180,deg=180/Math.PI;
export const longitudeWrapped=lon=>((lon+180)%360+360)%360-180;
export function geoDistance(a,b){const p=a.latitude*rad,q=b.latitude*rad,dp=q-p,dl=(b.longitude-a.longitude)*rad,h=Math.sin(dp/2)**2+Math.cos(p)*Math.cos(q)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function geoBearing(a,b){const p=a.latitude*rad,q=b.latitude*rad,d=(b.longitude-a.longitude)*rad;return(Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))*deg+360)%360;}
export function geoMove(a,bearing,distance){const p=a.latitude*rad,l=a.longitude*rad,b=bearing*rad,d=distance/R,q=Math.asin(Math.max(-1,Math.min(1,Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(b))));return{latitude:q*deg,longitude:longitudeWrapped((l+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(q)))*deg)};}
export function geoTrack(start,end,position,lookahead=12000){
 const total=geoDistance(start,end),d=geoDistance(start,position)/R,b=geoBearing(start,end)*rad,relative=geoBearing(start,position)*rad-b,cross=R*Math.asin(Math.max(-1,Math.min(1,Math.sin(d)*Math.sin(relative)))),along=R*Math.atan2(Math.sin(d)*Math.cos(relative),Math.cos(d)),target=geoMove(start,b*deg,Math.max(0,Math.min(total,along+lookahead)));
 return{total,cross,along,target,bearing:geoBearing(position,target),remaining:geoDistance(position,end)};
}
// Heading-frame change: x is runway-right and -z is runway-forward.
export function rotateFlightVector(p,angle){const c=Math.cos(angle),s=Math.sin(angle);return{...p,x:p.x*c+p.z*s,z:-p.x*s+p.z*c};}
