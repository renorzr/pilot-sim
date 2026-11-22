import {FCU,AircraftControls}from './CockpitPanels.jsx';
import {Instruments}from './Instruments.jsx';
import {KT,FT,radioAltitude}from './flight.js';
import {runwayHeading}from './airports/registry.js';
import {terrainRadioAltitude}from './terrain/heightfield.js';
export function ViewSelector({mode,onSelect,expanded,onToggle}){
 return <nav className="view-selector" aria-label="观察视角">{[['cockpit','1','驾驶舱'],['exterior','2','机外']].map(([id,key,label])=><button key={id} data-view-mode={id} aria-pressed={mode===id} onClick={()=>onSelect(id)}><kbd>{key}</kbd>{label}</button>)}{mode!=='cockpit'&&<button className="external-instruments-toggle" aria-pressed={expanded} onClick={onToggle}>仪表</button>}</nav>;
}
export function ExternalView({state:s,onAction,brakePointer,stick,expanded}){
 const heading=(runwayHeading(s)+s.yaw*180/Math.PI+360)%360,vs=Math.round(s.verticalSpeed*196.85),metrics=[['IAS',Math.round(s.speed*KT),'kt'],['ALT',Math.round(radioAltitude(s)),'ft'],['RA',Math.round(terrainRadioAltitude(s)*FT),'ft'],['V/S',(vs>0?'+':'')+vs,'ft/min'],['HDG',String(Math.round(heading)%360).padStart(3,'0'),'°'],['GS',Math.round(s.airData.groundSpeed*KT),'kt'],['俯仰',(s.pitch*180/Math.PI).toFixed(1),'°'],['坡度',(s.roll*180/Math.PI).toFixed(1),'°']];
 return <>
  {!expanded&&<section className="external-flight-data" aria-label="机外飞行数据"><div className="external-metrics">{metrics.map(([label,value,unit])=><div key={label}><small>{label}</small><output data-external-metric={label}>{value}</output><span>{unit}</span></div>)}</div><div className="external-status"><span>{s.autoPilot?'AP1':'手动'} · {s.thrustMode}</span>{s.engines.map((e,i)=><span key={i} className={e.status==='running'?'':'fault'}>ENG {i+1} {e.status==='failed'?'FAIL':e.status==='off'?'OFF':e.n1.toFixed(0)+'%'}</span>)}<span>CONF {s.flapPosition.toFixed(1)}{s.systems.flapsJammed?' JAM':''}</span></div><p className="external-camera-hint">拖动环绕 · 滚轮 / 双指缩放 · 双击回到机尾 · 松键回杆</p></section>}
  <section className="external-control-deck" aria-label="机外操纵面板">{stick}<AircraftControls state={s} onAction={onAction} brakePointer={brakePointer}/></section>
  {expanded&&<section className="external-instruments" aria-label="机外展开仪表"><FCU state={s} onAction={onAction}/><div className="external-canvases"><Instruments state={s}/></div></section>}
 </>;
}
