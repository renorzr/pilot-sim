// Shared authored-model coordinates. Hull and nacelle points derive from the
// loft stations in ops/build-aircraft.py; they are not manufacturer CG data.
export const AIRCRAFT_CONTACTS=Object.freeze({
 main:[{x:-2.85,y:-2.8,z:2.5},{x:-2.35,y:-2.8,z:2.5},{x:2.35,y:-2.8,z:2.5},{x:2.85,y:-2.8,z:2.5}],
 nose:[{x:-.24,y:-2.8,z:-12.3},{x:.24,y:-2.8,z:-12.3}],
 wing:[{x:-17.9,y:2.28,z:6},{x:17.9,y:2.28,z:6}],
 water:[
  {id:'belly-aft',x:0,y:-.93,z:10.9,area:12},
  {id:'belly-mid',x:0,y:-1.17,z:2.6,area:18},
  {id:'belly-front',x:0,y:-.93,z:-11.8,area:10},
  {id:'engine-left',x:-5.35,y:-2.12,z:-4.38,area:2.6},
  {id:'engine-right',x:5.35,y:-2.12,z:-4.38,area:2.6},
  {id:'wing-left',x:-16.7,y:.6,z:5.6,area:2},
  {id:'wing-right',x:16.7,y:.6,z:5.6,area:2},
  ...[-2.85,-2.35,2.35,2.85].map((x,i)=>({id:'main-'+i,x,y:-2.8,z:2.5,area:.45,gear:true})),
  ...[-.24,.24].map((x,i)=>({id:'nose-gear-'+i,x,y:-2.8,z:-12.3,area:.35,gear:true})),
 ],
});
