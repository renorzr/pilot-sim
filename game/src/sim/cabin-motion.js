import {clamp,FT,KT} from './constants.js';
// Seeded air pockets are shared by the wind field and the head-motion effect.
const hash=n=>{n=Math.imul(n^0x320,1664525)+1013904223;return(n>>>0)/4294967296;};
export function airPocket(time,seed=27){
 const cycle=Math.floor(time/55),start=cycle*55+27+hash(seed+cycle*7919)*17,duration=2.5+hash(seed+cycle*17)*1.2;
 const phase=(time-start)/duration;return phase>0&&phase<1?Math.sin(Math.PI*phase)**2:0;
}
const impulse=(age,decay,frequency)=>age>=0&&age<3?Math.exp(-age*decay)*Math.sin(age*frequency):0;
export function sampleCabinMotion(s,scale=1){
 scale=clamp(scale,0,1);const t=s.time,w=s.weather,a=s.airData;
 const ground=!s.airborne?clamp(a.groundSpeed/70,0,1):0;
 const touchdown=s.touchdown?clamp(s.touchdown.descent/3,.18,1.4)*impulse(t-s.touchdown.time,2.7,34):0;
 const nose=s.cabin?.noseAt!==null&&s.cabin?.noseAt!==undefined?impulse(t-s.cabin.noseAt,5,43)*.23:0;
 const airborne=s.airborne&&!s.landed;
 const weather=airborne?clamp((w.gust.amplitude||0)*.45+(a.disturbanceStrength||0)*1.4+Math.abs(a.wind.y)*.12,0,1):0;
 const level=airborne&&(s.y-2.8)*FT>1000&&Math.abs(s.verticalSpeed)<2&&Math.abs(s.roll)<.18;
 const ambient=level?airPocket(t,w.gust.seed)*Math.min(1,(w.ambientTurbulence||0)/.2):0;
 const wave=(f,p=0)=>Math.sin(t*f+p),soft=weather*.0015+ambient*.0007;
 const x=scale*(soft*(wave(17)+.35*wave(29,1))+ground*.00055*wave(67));
 const y=scale*(soft*(.7*wave(21,2)+.3*wave(33))+ground*.0007*wave(89)+touchdown*.0035+nose*.002);
 const roll=scale*(soft*.7*wave(13,1)+touchdown*.0005+ground*.0002*wave(53));
 return{x,y,roll,cameraY:scale*(touchdown*.075+nose*.045+weather*.018*wave(19)+ambient*.01*wave(17)),cameraPitch:scale*(weather*.0012*wave(15)+ambient*.0005*wave(14)+touchdown*.0018),sources:{ground,weather,ambient,touchdown:Math.abs(touchdown),nose:Math.abs(nose)},scale};
}
