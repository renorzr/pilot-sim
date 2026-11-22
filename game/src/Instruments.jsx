import {groundActive,groundRoute,departureOf,remainingTaxiDistance} from './missions/ground.js';
import {airlineNavigationActive,airlineTarget} from './missions/airline-navigation.js';
import {terrainRadioAltitude} from './terrain/heightfield.js';
import {glideInfo} from './missions/expanded.js';
import {windReadout} from './sim/weather.js';
import { useEffect, useRef } from 'react';
import {t} from './i18n/index.js';
import {runwayOf,runwayHeading} from './airports/registry.js';
import {useLanguage} from './i18n/hooks.js';
import {clamp,FLAPS,FLAP_LIMITS,KT,FT,NM,radioAltitude,targetSpeed,minimumSelectableSpeed} from './flight.js';
const DEG=180/Math.PI;
const green='#7de862', white='#e2eaf1', muted='#9aabbc', yellow='#f6d64a';
function text(c,value,x,y,size=17,color=white,align='left',weight=500) {
  c.font=`${weight} ${size}px "SFMono-Regular",Consolas,"Liberation Mono",monospace`;
  c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(t(value),x,y);
}
function line(c,x1,y1,x2,y2,color=white,width=1) {c.beginPath();c.strokeStyle=color;c.lineWidth=width;c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
function polygon(c,points,color) {c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();}
function Canvas({className,label,width,height,state,draw}) {
  const language=useLanguage();
  const ref=useRef();
  useEffect(()=>{
    const el=ref.current;const dpr=Math.min(window.devicePixelRatio||1,2);
    el.width=width*dpr;el.height=height*dpr;
    const c=el.getContext('2d');c.scale(dpr,dpr);draw(c,state,width,height);
  },[state,width,height,draw,language]);
  return <canvas ref={ref} className={className} role="img" aria-label={label}/>;
}
function pfd(c,s,w,h) {
  c.fillStyle='#080f16';c.fillRect(0,0,w,h);
  const speed=Math.round(s.speed*1.94384),alt=Math.round(Math.max(0,s.y-2.8)*3.28084);
  const route=s.route?.active,glide=s.mission?.kind==='dual-glide'&&s.mission.triggered;
  const vs=Math.round(s.verticalSpeed*196.85/10)*10;
  text(c,s.thrustMode,10,13,12,green);text(c,glide?'GLIDE':s.goAround?'SRS':s.gsCaptured?'G/S':route?'PATH':'ALT',145,13,13,green);text(c,s.goAround?'GA TRK':s.locCaptured?'LOC':route?'NAV':'HDG',218,13,13,green);text(c,s.autoPilot?'AP1':'AP OFF',w-12,13,12,s.autoPilot?green:muted,'right');
  text(c,'SPD '+Math.round(targetSpeed(s)),10,33,12,'#79d3f6');text(c,'V/S '+(vs>0?'+':'')+vs,166,33,12,white);text(c,(s.flightDirector?'FD ':'')+(s.autoThrustActive?'A/THR':'')+(s.guidance.limited?' LIM':''),w-12,33,12,muted,'right');
  const left=81,right=w-81,top=49,bottom=h-43,cx=w/2,cy=(top+bottom)/2;
  c.save();c.beginPath();c.rect(left,top,right-left,bottom-top);c.clip();
  c.translate(cx,cy);c.rotate(-s.roll);c.translate(0,s.pitch*DEG*4.2);
  c.fillStyle='#126ec3';c.fillRect(-600,-1000,1200,1000);
  c.fillStyle='#78583a';c.fillRect(-600,0,1200,1000);
  line(c,-600,0,600,0,'#e2edf5',2);
  for(let angle=-30;angle<=30;angle+=5) {
    if(angle===0)continue;
    const y=-angle*4.2,length=angle%10===0?64:32;
    line(c,-length/2,y,length/2,y,'#f4f8fb',angle%10===0?1.5:1);
    if(angle%10===0) {text(c,Math.abs(angle),-length/2-15,y,15,white,'right');text(c,Math.abs(angle),length/2+15,y,15);}
  }
  c.restore();
  polygon(c,[[cx-5,top+1],[cx+5,top+1],[cx,top+10]],white);
  for(const a of [-60,-30,-20,-10,0,10,20,30,60]) {
    const rad=a/DEG;const r=100;
    line(c,cx+Math.sin(rad)*r,top+110-Math.cos(rad)*r,cx+Math.sin(rad)*(r+7),top+110-Math.cos(rad)*(r+7),white,1.5);
  }
  if(s.flightDirector&&s.airborne){const dx=clamp((s.guidance.roll-s.roll)/.25,-1,1)*65,dy=clamp((s.guidance.pitch-s.pitch)/.10,-1,1)*65;line(c,cx+dx,cy-54,cx+dx,cy+54,'#68ef79',2);line(c,cx-65,cy-dy,cx+65,cy-dy,'#68ef79',2);}
  polygon(c,[[cx,cy-9],[cx-11,cy+9],[cx+11,cy+9]],yellow);
  line(c,cx-69,cy,cx-20,cy,yellow,4);line(c,cx+20,cy,cx+69,cy,yellow,4);
  line(c,cx-20,cy,cx-20,cy+8,yellow,4);line(c,cx+20,cy,cx+20,cy+8,yellow,4);
  // The speed and altitude tapes move continuously with the simulation.
  text(c,'空速',35,53,16,white,'center');text(c,'KT',35,73,12,muted,'center');
  text(c,'高度',w-34,53,16,white,'center');text(c,'FT',w-34,73,12,muted,'center');
  c.save();c.beginPath();c.rect(2,88,75,h-103);c.clip();
  const speedStart=Math.floor((speed-50)/10)*10;
  for(let v=speedStart;v<speed+65;v+=10){if(v<0)continue;const y=cy-(v-speed)*3.1;line(c,63,y,74,y,muted);text(c,v,57,y,16,white,'right');}
  const vls=minimumSelectableSpeed(s),vmax=Math.min(FLAP_LIMITS[Math.ceil(s.flapPosition)],s.gearPosition>.1?250:350);
  line(c,7,cy-(vls-speed)*3.1,7,cy+140,'#e9ad52',4);
  line(c,7,cy-140,7,cy-(vmax-speed)*3.1,'#e97871',4);
  const targetY=cy-(targetSpeed(s)-speed)*3.1;
  polygon(c,[[74,targetY],[65,targetY-5],[65,targetY+5]],'#79d3f6');c.restore();
  c.save();c.beginPath();c.rect(w-77,88,75,h-103);c.clip();
  const step=alt>1000?200:100;
  for(let v=Math.floor((alt-500)/step)*step;v<=alt+600;v+=step){if(v<0)continue;const y=cy-(v-alt)*.28;line(c,w-74,y,w-64,y,muted);text(c,v.toLocaleString('en-US'),w-60,y,15);}
  c.restore();
  c.fillStyle='#0c1721';c.strokeStyle=white;c.lineWidth=1.5;
  c.beginPath();c.moveTo(12,cy-18);c.lineTo(63,cy-18);c.lineTo(76,cy);c.lineTo(63,cy+18);c.lineTo(12,cy+18);c.closePath();c.fill();c.stroke();
  text(c,speed,40,cy,26,white,'center',600);
  c.fillStyle='#0c1721';
  c.beginPath();c.moveTo(w-12,cy-18);c.lineTo(w-63,cy-18);c.lineTo(w-76,cy);c.lineTo(w-63,cy+18);c.lineTo(w-12,cy+18);c.closePath();c.fill();c.stroke();
  text(c,alt,w-40,cy,23,white,'center',600);
  if(s.mode==='landing'&&!s.goAround&&s.systems.ils.localizer&&s.systems.ils.glideSlope&&s.mission?.kind!=='dual-glide'){for(const dx of[-60,-30,0,30,60]){c.beginPath();c.strokeStyle=muted;c.arc(cx+dx,h-24,2,0,Math.PI*2);c.stroke();}const lx=cx-clamp(s.locDeviation,-1.2,1.2)*60;polygon(c,[[lx,h-30],[lx+5,h-24],[lx,h-18],[lx-5,h-24]],'#ef91ed');for(const dy of[-60,-30,0,30,60]){c.beginPath();c.strokeStyle=muted;c.arc(right-10,cy+dy,2,0,Math.PI*2);c.stroke();}const gy=cy+clamp(s.glideDeviation,-1.2,1.2)*60;polygon(c,[[right-15,gy],[right-10,gy-5],[right-5,gy],[right-10,gy+5]],'#ef91ed');}
  text(c,'RUD '+Math.round(s.controls.rudderApplied*100)+'%',12,h-6,10,muted);
  text(c,'β '+(s.airData.beta*DEG).toFixed(1)+'°',w-12,h-6,10,Math.abs(s.airData.beta)>.08?'#ffbf78':muted,'right');
  text(c,'RA '+Math.round(terrainRadioAltitude(s)*FT)+' FT',cx,h-6,11,terrainRadioAltitude(s)*FT<100?'#f6d64a':white,'center');
  if(s.mission?.kind==='windshear'&&s.mission.triggered&&!s.mission.clear)text(c,'WINDSHEAR',cx,top+40,18,'#ff6b67','center',700);
  if(!s.systems.ils.localizer)text(c,'ILS LOST',cx,top+39,16,'#ffbf78','center',700);
  if(s.systems.thrustLocked)text(c,'THR LK',cx,top+39,16,'#ffbf78','center',700);
  if(s.terrain?.level)text(c,s.terrain.level===2?'PULL UP':'TERRAIN',cx,cy+76,21,s.terrain.level===2?'#ff7368':'#ffce85','center',700);
  if(s.stallWarning?.level){const active=s.stallWarning.active;c.fillStyle=active?'#741c22':'#49331a';c.fillRect(cx-69,cy+37,138,29);text(c,active?'STALL':'HIGH AOA',cx,cy+52,22,active?'#ff9a91':'#ffce85','center',700);}
  text(c,s.mode==='takeoff'?'VR 125':'VAPP '+s.vapp,left+5,top+14,11,'#79d3f6');
}
function heading(c,s,w,h) {
  if(groundActive(s)){groundNavigation(c,s,w,h);return;}
  c.fillStyle='#080f16';c.fillRect(0,0,w,h);
  const runway=runwayOf(s),airlineNav=airlineNavigationActive(s)?s.airline.navigation:null;
  text(c,airlineNav?'导航 · 航班航路':s.route?.active?'导航 · 训练航线':s.mission?.kind==='dual-glide'?'导航 · 滑翔':`导航 · ILS ${runway.id}`,12,22,15);text(c,String(Math.round((runwayHeading(s)+s.yaw*DEG+360)%360)).padStart(3,'0')+'°',w-12,22,17,green,'right');
  const cx=w/2,py=243,range=airlineNav?20:s.route?.active?12:s.z/NM>5?12:5,scale=190/range;
  function map(x,z){const dx=x-s.x,dz=s.z-z;return[cx+(dx*Math.cos(s.yaw)-dz*Math.sin(s.yaw))/NM*scale,py-(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/NM*scale];}
  c.save();c.beginPath();c.rect(8,45,w-16,218);c.clip();
  for(const r of [95,190]){c.beginPath();c.strokeStyle='#30414d';c.lineWidth=1;c.arc(cx,py,r,Math.PI,Math.PI*2);c.stroke();}
  for(const x of [cx-70,cx,cx+70])line(c,x,48,x,258,'#172b37');
  c.setLineDash([5,4]);const from=map(0,24000),to=map(0,0);line(c,...from,...to,s.locCaptured?'#84d993':'#d785de',1.5);c.setLineDash([]);
  const rw0=map(0,0),rw1=map(0,-runway.length);line(c,...rw0,...rw1,white,5);text(c,'RW'+runway.id,rw0[0]+10,rw0[1],12,white);
  for(const[z,label]of [[18000,'IF'],[10000,'FAP'],[3700,'2 NM']]){const p=map(0,z);polygon(c,[[p[0],p[1]-4],[p[0]+4,p[1]],[p[0],p[1]+4],[p[0]-4,p[1]]],'#cf8bdb');text(c,label,p[0]+9,p[1],10,muted);}
  if(s.route?.active){const points=[s.route.origin,...s.route.points];for(let i=0;i<points.length-1;i++){line(c,...map(points[i].x,points[i].z),...map(points[i+1].x,points[i+1].z),i<s.route.index?'#7de862':i===s.route.index?'#79d3f6':'#687d91',2);const p=map(points[i+1].x,points[i+1].z);text(c,String(i+1),p[0]+6,p[1],11,'#79d3f6');}}
  if(airlineNav){const ps=[airlineNav.origin,...airlineNav.points];for(let i=1;i<ps.length;i++){line(c,...map(ps[i-1].x,ps[i-1].z),...map(ps[i].x,ps[i].z),i-1<airlineNav.index?'#7de862':i-1===airlineNav.index?'#79d3f6':'#687d91',2);const p=map(ps[i].x,ps[i].z);text(c,String(i),p[0]+6,p[1],11,'#79d3f6');}}
  if(s.goAround){const p=map(s.x+Math.sin(s.goAroundHeading)*8000,s.z-Math.cos(s.goAroundHeading)*8000);c.setLineDash([5,3]);line(c,cx,py,...p,'#79d3f6',2);c.setLineDash([]);}
  polygon(c,[[cx,py-13],[cx-9,py+8],[cx,py+3],[cx+9,py+8]],yellow);
  c.restore();text(c,range+' NM',14,60,11,muted);
  text(c,'GS '+Math.round(s.airData.groundSpeed*KT)+' / TAS '+Math.round(s.airData.tas*KT),w-12,60,10,white,'right');
  const localWind=windReadout(s.airData.wind,runwayHeading(s));
  text(c,'WIND '+Math.round(localWind.directionDeg)+'° / '+Math.round(localWind.speedKt)+' KT',w-12,77,10,s.airData.disturbanceStrength>.045?'#ffbf78':muted,'right');
  if(Math.abs(localWind.verticalFpm)>30)text(c,'W/V '+Math.round(localWind.verticalFpm)+' FT/MIN',w-12,93,10,'#ffbf78','right');
  const drift=s.airData.groundTrack-s.yaw;line(c,cx,py,cx+Math.sin(drift)*35,py-Math.cos(drift)*35,'#79d3f6',1);
  line(c,12,271,w-12,271,'#2c3b47');
  text(c,'DIST',14,289,10,muted);text(c,s.z>0?(s.z/NM).toFixed(1)+' NM':s.landed?'滑跑':'跑道上空',w-14,289,16,green,'right');
  if(s.terrain?.level)text(c,'TERR '+Math.round(s.terrain.clearanceFt)+' FT / '+(s.terrain.timeToImpact?`${s.terrain.timeToImpact} S`:'AHEAD'),14,309,12,s.terrain.level===2?'#ff7368':'#ffce85');
  else if(s.mission?.kind==='dual-glide'){const reach=glideInfo(s);text(c,'估算可达 '+(reach.range/1000).toFixed(1)+' km',14,309,11,reach.margin>=0?green:'#ffbf78');}
  else if(airlineNav){const t=airlineTarget(s);text(c,`${t.name} / ${Math.round(t.altitude)} FT`,14,309,10,'#79d3f6');}
  else if(s.route?.active)text(c,`${s.route.points[s.route.index].name} / ${Math.round(s.route.targetAltitude)} FT`,14,309,10,'#79d3f6');
  else{ text(c,s.systems.ils.localizer?'LOC '+s.locDeviation.toFixed(2):'LOC --',14,309,10,Math.abs(s.locDeviation)<.4?green:'#ffbf78');text(c,s.systems.ils.glideSlope?'G/S '+s.glideDeviation.toFixed(2):'G/S --',w-14,309,10,Math.abs(s.glideDeviation)<.6?green:'#ffbf78','right');}
}
function groundNavigation(c,s,w,h){
  c.fillStyle='#080f16';c.fillRect(0,0,w,h);
  const DEPARTURE=departureOf(s),rw=runwayOf(s).id,g=s.ground,entry=['lineup','takeoff-clearance'].includes(g.stage),range=entry?300:600,cx=w/2,py=242,scale=185/range;
  text(c,'TAXI / '+rw,12,22,15);text(c,String(Math.round((runwayHeading(s)+s.yaw*DEG+360)%360)).padStart(3,'0')+'°',w-12,22,17,green,'right');
  text(c,'GS '+(s.airData.groundSpeed*KT).toFixed(1)+' KT',12,53,14,green);text(c,range+' M',w-12,53,11,muted,'right');
  const map=p=>{const dx=p.x-s.x,dz=s.z-p.z;return[cx+(dx*Math.cos(s.yaw)-dz*Math.sin(s.yaw))*scale,py-(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))*scale];};
  c.save();c.beginPath();c.rect(8,75,w-16,187);c.clip();
  for(const r of[90,180]){c.beginPath();c.strokeStyle='#30414d';c.arc(cx,py,r,Math.PI,Math.PI*2);c.stroke();}
  line(c,...map({x:0,z:100}),...map({x:0,z:-3810}),muted,9);
  const points=groundRoute(s);for(let i=1;i<points.length;i++)line(c,...map(points[i-1]),...map(points[i]),'#e7c26b',3);
  const hold=map(g.arrival?g.stop:DEPARTURE.hold);c.strokeStyle=g.arrival||g.entryCleared?green:'#f19c7d';c.lineWidth=3;c.beginPath();c.arc(...hold,6,0,Math.PI*2);c.stroke();text(c,g.arrival?g.stand:'HOLD',hold[0]+10,hold[1],10,white);
  if(entry){const p=map(DEPARTURE.lineup);line(c,p[0]-7,p[1],p[0]+7,p[1],green,3);text(c,rw,p[0]+9,p[1],11,green);}
  polygon(c,[[cx,py-13],[cx-9,py+8],[cx,py+3],[cx+9,py+8]],yellow);c.restore();
  line(c,12,271,w-12,271,'#2c3b47');text(c,g.arrival?'TAXI TO STAND':entry?'LINE UP':'HOLD SHORT',12,289,12,g.arrival||g.entryCleared?green:'#ffbf78');
  const distance=entry?Math.hypot(s.x-DEPARTURE.lineup.x,s.z-DEPARTURE.lineup.z):remainingTaxiDistance(s);text(c,Math.round(distance)+' M',w-12,289,14,green,'right');
  text(c,g.arrival?g.runwayVacated?'RUNWAY VACATED':'VACATE VIA '+g.exit:g.entryCleared?'ENTRY CLEARED':'HOLD SHORT OF '+rw,12,309,10,g.arrival||g.entryCleared?green:'#ffbf78');
}
function engine(c,s,w,h) {
  c.fillStyle='#080f16';c.fillRect(0,0,w,h);text(c,'发动机 / 构型',w/2,20,16,white,'center');
  for(const[index,[cx,name]]of [[65,'ENG 1'],[194,'ENG 2']].entries()){
    const engine=s.engines[index],n1=engine.n1,engineColor=engine.status==='running'?green:'#ffbf78';
    text(c,name+(engine.status==='running'?'':engine.status==='failed'?' FAIL':' OFF'),cx,47,11,engine.status==='running'?muted:engineColor,'center');c.lineWidth=7;c.strokeStyle='#34414e';c.beginPath();c.arc(cx,110,43,Math.PI,2*Math.PI);c.stroke();c.strokeStyle=engineColor;c.beginPath();c.arc(cx,110,43,Math.PI,Math.PI+Math.PI*n1/100);c.stroke();
    text(c,n1.toFixed(1),cx,101,24,white,'center',600);text(c,'N1 %',cx,127,10,muted,'center');
  }
  line(c,12,145,w-12,145,'#2c3b47');
  const gearMoving=Math.abs(s.gearPosition-(s.gear?1:0))>.02;
  text(c,'GEAR',14,169,13);text(c,gearMoving?'移动中':s.gearPosition>.98?'DOWN':'UP',w-14,169,13,gearMoving?'#ffbf78':s.gearPosition>.98?green:muted,'right');
  for(let i=0;i<3;i++){c.beginPath();c.fillStyle=gearMoving?'#ffbf78':s.gearPosition>.98?green:'#35414a';c.arc(w/2-16+i*16,188,4,0,2*Math.PI);c.fill();}
  text(c,'FLAPS',14,214,13);text(c,s.systems.flapsJammed?'CONF '+FLAPS[Math.round(s.flapPosition)]+' JAM':'CONF '+FLAPS[s.flaps]+(Math.abs(s.flapPosition-s.flaps)>.05?' …':''),w-14,214,13,green,'right');
  text(c,'SPLRS',14,245,13);text(c,s.spoilersDeployed?'DEPLOY':s.spoilersArmed?'ARM':'OFF',w-14,245,13,s.spoilersArmed?green:muted,'right');
  text(c,'A/BRK',14,274,13);text(c,s.autoBrake+(s.autoBrakeActive?' ON':''),w-14,274,13,s.autoBrake!=='OFF'?green:muted,'right');
  text(c,s.systems.emergencyPower?'EMER ELEC':s.reverse?'REV ACTIVE':s.thrustMode,w/2,302,11,s.reverse?green:muted,'center');
}
export function Instruments({state}) {
  return <>
    <Canvas className="instrument pfd" label={`主飞行仪表：空速 ${Math.round(state.speed*1.94384)} 节，高度 ${Math.round((state.y-2.8)*3.28084)} 英尺`} width={514} height={316} state={state} draw={pfd}/>
    <Canvas className="instrument heading-display" label={`航向 ${Math.round((runwayHeading(state)+state.yaw*DEG+360)%360)} 度`} width={256} height={316} state={state} draw={heading}/>
    <Canvas className="instrument engine-display" label={`发动机推力 ${Math.round(state.thrust*100)}%，起落架${state.gear?'放下':'收起'}`} width={259} height={316} state={state} draw={engine}/>
  </>;
}
