import {airportOf,runwayOf} from './airports/registry.js';
import {canSkipCruise,cruiseConditions} from './missions/airline.js';
import {radioAltitude,KT} from './flight.js';
import {airlineTarget} from './missions/airline-navigation.js';
export function FlightJourneyPanel({state:s,onAction,onSkipCruise}){
 const a=s.airline,to=airportOf(a.destination),ready=canSkipCruise(s),n=a.navigation,target=airlineTarget(s),arrival=n.kind==='arrival',from=n.index?n.points[n.index-1]:n.origin,leg=n.points[n.index],legCourse=(runwayOf(s).heading+Math.atan2(leg.x-from.x,-(leg.z-from.z))*180/Math.PI+360)%360,checks=[
  {label:'正爬升后收起落架',ok:s.gearPosition<.02},
  {label:'空速 165–225 kt · 机翼平稳',ok:s.speed*KT>=165&&s.speed*KT<=225&&Math.abs(s.roll)<.175},
  {label:'转入目的地航路',ok:n.index===n.points.length-1&&n.visited?.length>=n.points.length-1&&Math.abs(n.crossTrack)<1500},
  {label:`${n.altitude} ft 附近稳定平飞`,ok:cruiseConditions(s)},
  {label:'保持稳定 3 秒',ok:a.stableSeconds>=3},
 ];
 return <aside className="procedure-panel journey-panel" aria-label="航班进度">
  <div className="procedure-heading"><span>{airportOf(a.origin).iata} → {to.iata}</span><b>{arrival?'到港引导':ready?'巡航已就绪':'离场爬升'}</b></div>
  <p className="journey-destination">{to.name}</p><div className="ground-data"><span>ALT <b>{Math.round(radioAltitude(s))}</b> ft</span><span>SPD <b>{Math.round(s.speed*KT)}</b> kt</span></div>
  <p className="ground-keys">{n.points[n.index].name} · {Math.round(target?.altitude??n.altitude)} ft<br/>{n.endPassed?`已越过末航点 ${((target?.distance??0)/1000).toFixed(1)} km`:`本段航迹 ${Math.round(legCourse)}° · 下一点 ${((target?.distance??0)/1000).toFixed(1)} km`}</p>
  {arrival?<><p className="ground-hint">从始发城市方向到港 · 按 ND / FD 转弯</p><p className="ground-keys">A 可选辅助 · 最后进近提示后 I 预位<br/>减速、构型与着陆检查由你完成</p></>:<>
  <ul>{checks.map(c=><li key={c.label} className={c.ok?'checked':''}><span>{c.ok?'✓':'○'}</span><span>{c.label}</span></li>)}</ul>
  <p className="ground-keys">G 收轮 · L 选择 CL<br/>按 ND / FD 转入航路 · A 可选辅助</p>
  <p className="ground-hint">{n.endPassed?'末航点已通过 · 等待离场条件满足':'飞过末航点后自动跳过巡航'}</p>
  <button className="checklist-button skip-cruise" disabled={!ready} onClick={onSkipCruise}>提前跳过巡航 · 开始目的机场进近</button></>}
  <p className="journey-note">巡航路程约 {Math.round(a.distanceKm)} km · 此段自动略过</p>
 </aside>;
}
