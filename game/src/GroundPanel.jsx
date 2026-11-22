import {ArrowCounterClockwise} from '@phosphor-icons/react';
import {PHASES,KT} from './flight.js';
import {runwayHeading} from './airports/registry.js';
import {departureOf,taxiPoints,entryPoints,groundTarget,remainingTaxiDistance,skipTaxi} from './missions/ground.js';
import {canSkipTaxiIn,skipTaxiIn} from './missions/taxi-in.js';

export function GroundPanel({state:s,onAction,onRetry}){
 if(s.ground.arrival)return <ArrivalGroundPanel state={s} onAction={onAction} onRetry={onRetry}/>;
 const DEPARTURE=departureOf(s),TAXI_POINTS=taxiPoints(s),ENTRY_POINTS=entryPoints(s),g=s.ground,entry=['lineup','takeoff-clearance'].includes(g.stage),points=entry?ENTRY_POINTS:TAXI_POINTS;
 const all=entry?ENTRY_POINTS:[...TAXI_POINTS,...ENTRY_POINTS],xs=all.map(p=>p.x),zs=all.map(p=>p.z),minX=Math.min(...xs)-40,minZ=Math.min(...zs)-40;
 const bounds={x:minX,z:minZ,w:Math.max(140,Math.max(...xs)-minX+50),h:Math.max(160,Math.max(...zs)-minZ+50)};
 const map=p=>({x:24+(p.x-bounds.x)/bounds.w*252,y:16+(p.z-bounds.z)/bounds.h*180});
 const path=ps=>ps.map(p=>{const v=map(p);return`${v.x},${v.y}`;}).join(' '),p=map(s),hold=map(DEPARTURE.hold),target=groundTarget(s),aim=map(target);
 const distance=entry?Math.hypot(s.x-DEPARTURE.lineup.x,s.z-DEPARTURE.lineup.z):remainingTaxiDistance(s);
 const gate=['gate','leaving','skip'].includes(g.stage);
 return <aside className="procedure-panel ground-panel" aria-label="地面滑行导航">
  <div className="procedure-heading"><span>{DEPARTURE.routeReferences.slice(0,4).join(' → ')} → {DEPARTURE.runwayId}</span><b>{PHASES[g.stage]}</b></div>
  <div className="ground-data"><span>GS <b>{(s.airData.groundSpeed*KT).toFixed(1)}</b> kt</span><span>{entry?'对正目标':'等待点'} <b>{Math.round(distance)}</b> m</span></div>
  {g.stage==='taxi'&&<button className="checklist-button skip-taxi" onClick={()=>onAction(skipTaxi)}>跳至跑道外等待点</button>}
  {!gate&&<svg className="ground-map" viewBox="0 0 300 212" role="img" aria-label="滑行路线、等待点和飞机位置">
   <rect width="300" height="212" rx="6" fill="#10232d"/>
   <path d={`M ${map({x:0,z:bounds.z}).x} 5 V 207`} stroke="#52616a" strokeWidth={entry?40:13}/>
   <polyline points={path(points)} fill="none" stroke="#edc56a" strokeWidth="3" strokeLinejoin="round"/>
   <polyline points={path(ENTRY_POINTS)} fill="none" stroke={g.entryCleared?'#87dcaa':'#687783'} strokeWidth="2" strokeDasharray="4 4"/>
   <circle cx={aim.x} cy={aim.y} r="4" fill="#e8c873"/>
   <path d={`M ${hold.x} ${hold.y-7} V ${hold.y+7}`} stroke={g.entryCleared?'#87dcaa':'#ff8a78'} strokeWidth="4"/>
   <text x={hold.x-9} y={hold.y-10} textAnchor="end" fill="#dce9ed" fontSize="11">HOLD</text>
   <text x={map({x:0,z:0}).x+10} y="26" fill="#c5d6db" fontSize="12">{DEPARTURE.runwayId}</text>
   {!entry&&<><text x="30" y="175" fill="#c5d6db" fontSize="11">{DEPARTURE.routeReferences[1]}</text><text x="133" y="104" fill="#c5d6db" fontSize="11">{DEPARTURE.routeReferences[2]}</text></>}
   <g transform={`translate(${p.x} ${p.y}) rotate(${s.yaw*180/Math.PI})`}><path d="M 0 -9 L 6 7 L 0 4 L -6 7 Z" fill="#b7eeff" stroke="#10232d" strokeWidth="1"/></g>
  </svg>}
  <p className="ground-hint">{gate?'发动机、构型与离位由机组自动完成。':entry?'低速进入 · 对正中心线后停稳':'滑行约 10–15 kt · 转弯提前减速'}</p>
  <div className={`ground-permission ${g.entryCleared?'cleared':''}`}>{g.entryCleared?'已获进入许可 · 尚无起飞许可':'跑道外等待 · 尚无进入许可'}</div>
  {!gate&&<p className="ground-keys">W / S 推力 · ← / → 前轮转向<br/>空格刹车 · 松键转向回中</p>}
  <button className="stage-retry" onClick={onRetry}><ArrowCounterClockwise/>重试本阶段</button>
 </aside>;
}

function ArrivalGroundPanel({state:s,onAction,onRetry}){
 const g=s.ground,ps=g.points,remaining=remainingTaxiDistance(s),parking=['parking','parked'].includes(g.stage),standHeading=Math.round((runwayHeading(s)+g.stop.yaw*180/Math.PI+360)%360);
 const xs=ps.map(p=>p.x),zs=ps.map(p=>p.z),minX=Math.min(...xs)-60,minZ=Math.min(...zs)-60,w=Math.max(150,Math.max(...xs)-minX+60),h=Math.max(150,Math.max(...zs)-minZ+60);
 const map=p=>({x:20+(p.x-minX)/w*260,y:15+(p.z-minZ)/h*180}),plane=map(s),stand=map(g.stop),target=map(groundTarget(s));
 return <aside className="procedure-panel ground-panel arrival-ground-panel" aria-label="到港滑行导航">
  <div className="procedure-heading"><span>{`出口 ${g.exit} · 机位 ${g.stand}`}</span><b>{PHASES[g.stage]}</b></div>
  <div className="ground-data"><span>GS <b>{(s.airData.groundSpeed*KT).toFixed(1)}</b> kt</span><span>{'剩余'} <b>{Math.round(remaining)}</b> m</span></div>
  {!parking&&<svg className="ground-map" viewBox="0 0 300 212" role="img" aria-label="到港滑行路线与停机位">
   <rect width="300" height="212" rx="6" fill="#10232d"/>
   <polyline points={ps.map(p=>{const v=map(p);return`${v.x},${v.y}`;}).join(' ')} fill="none" stroke="#edc56a" strokeWidth="3" strokeLinejoin="round"/>
   <circle cx={target.x} cy={target.y} r="4" fill="#87dcaa"/>
   <rect x={stand.x-5} y={stand.y-5} width="10" height="10" fill="none" stroke="#87dcaa" strokeWidth="2"/>
   <g transform={`translate(${stand.x} ${stand.y}) rotate(${g.stop.yaw*180/Math.PI})`}><path d="M 0 13 V -13 M -4 -8 L 0 -13 L 4 -8" fill="none" stroke="#87dcaa" strokeWidth="2"/></g>
   <text x={stand.x+8} y={stand.y} fill="#dce9ed" fontSize="11">{g.stand}</text>
   <g transform={`translate(${plane.x} ${plane.y}) rotate(${s.yaw*180/Math.PI})`}><path d="M 0 -9 L 6 7 L 0 4 L -6 7 Z" fill="#b7eeff"/></g>
  </svg>}
  <p className="ground-hint">{parking?'机位停稳 · 机组自动关车':g.runwayVacated?'沿导航滑行 · 接近机位减速并停稳':'先低速脱离跑道 · 再滑行至机位'}</p>
  {!parking&&<p className="ground-keys">{`机位目标航向 ${standHeading}° · 对正后刹车停稳`}</p>}
  <div className={`ground-permission ${g.runwayVacated?'cleared':''}`}>{g.runwayVacated?'跑道已脱离 · 已获滑行许可':'按指定出口脱离跑道'}</div>
  {!parking&&<><button className="checklist-button skip-arrival-taxi" disabled={!canSkipTaxiIn(s)} onClick={()=>onAction(skipTaxiIn)}>跳过剩余滑行 · 停靠机位</button><p className="ground-keys">W / S 推力 · ← / → 前轮转向<br/>空格刹车 · 松键转向回中</p><button className="stage-retry" onClick={onRetry}><ArrowCounterClockwise/>重试本阶段</button></>}
 </aside>;
}
