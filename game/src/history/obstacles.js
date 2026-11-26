import {eventProject} from './event-world.js';
// Schematic 2009 obstacle envelopes. Positions, member dimensions and colours
// are scene estimates; rendering and swept contact consume these same records.
const west=eventProject(-73.9630,40.8506),east=eventProject(-73.9445,40.8531);
const length=Math.hypot(east.x-west.x,east.z-west.z),angle=Math.atan2(east.z-west.z,east.x-west.x);
const make=(id,cx,cz,width,depth,baseY,height,kind='bridge')=>({id,name:id,kind,cx,cz,width,depth,angle,baseY,topY:baseY+height,height});
export const historicalObstacles=[make('GWB-deck',(east.x+west.x)/2,(east.z+west.z)/2,length,36,60,6)];
for(const u of [.21,.79])for(const side of[-1,1]){
 const x=west.x+(east.x-west.x)*u-Math.sin(angle)*side*17,z=west.z+(east.z-west.z)*u+Math.cos(angle)*side*17;
 historicalObstacles.push(make('GWB-tower-'+u+'-'+side,x,z,9,8,-2,184));
}
for(const [i,geo]of[[-73.9970,40.7850],[-73.9635,40.8353]].entries()){
 const p=eventProject(...geo);historicalObstacles.push({...make('Hudson-ferry-'+i,p.x,p.z,26,9,0,8,'ship'),angle:.7});
}
export function* historicalObstacleCandidates(a,b,margin=0,vertical=0){
 for(const o of historicalObstacles){const radius=Math.hypot(o.width,o.depth)/2+margin;if(o.cx+radius<Math.min(a.x,b.x)||o.cx-radius>Math.max(a.x,b.x)||o.cz+radius<Math.min(a.z,b.z)||o.cz-radius>Math.max(a.z,b.z)||o.topY<Math.min(a.y,b.y)-vertical||o.baseY>Math.max(a.y,b.y)+vertical)continue;yield o;}
}
