import {airportOf,runwayOf} from './airports/registry.js';
import {canSkipCruise,cruiseConditions} from './missions/airline.js';
import {radioAltitude,KT} from './flight.js';
import {airlineTarget,airportAltitude,departureConstraintText} from './missions/airline-navigation.js';
export function FlightJourneyPanel({state:s,onAction,onSkipCruise}){
 const a=s.airline,to=airportOf(a.destination),ready=canSkipCruise(s),n=a.navigation,target=airlineTarget(s),arrival=n.kind==='arrival',enroute=n.kind==='enroute',from=n.index?n.points[n.index-1]:n.origin,leg=n.points[n.index],legCourse=(runwayOf(s).heading+Math.atan2(leg.x-from.x,-(leg.z-from.z))*180/Math.PI+360)%360,checks=[
  {label:'正爬升后收轮并收起襟翼',ok:s.gearPosition<.02&&s.flapPosition<.02},
  {label:'空速 165–225 kt · 机翼平稳',ok:s.speed*KT>=165&&s.speed*KT<=225&&Math.abs(s.roll)<.175},
  {label:'完成初始离场并建立航迹',ok:n.index===n.points.length-1&&n.visited?.length>=n.points.length-1&&Math.abs(n.crossTrack)<1500},
  {label:`海拔 ${Math.round(n.altitude+(n.elevationFt||0))} ft 附近稳定平飞`,ok:cruiseConditions(s)},
  {label:'保持稳定 3 秒',ok:a.stableSeconds>=3},
 ];
 return <aside className="procedure-panel journey-panel" aria-label="航班进度">
  <div className="procedure-heading"><span>{airportOf(a.origin).iata} → {to.iata}</span><b>{arrival?'到港引导':enroute?(a.profile.short?'同城转场':a.phase==='enroute-descent'?'到港下降':'航路飞行'):'离场爬升'}</b></div>
  <p className="journey-destination">{to.name}</p><div className="ground-data"><span>{n.procedure||enroute?'MSL':'ALT'} <b>{Math.round(n.procedure||enroute?airportAltitude(s):radioAltitude(s))}</b> ft</span><span>SPD <b>{Math.round(s.speed*KT)}</b> kt</span></div>
  {n.procedure&&<p className="ground-hint">{n.procedure.name}</p>}
  <p className="ground-keys">{leg.name} · {n.procedure||enroute?`许可海拔 ${Math.round((target?.altitude??n.altitude)+n.elevationFt)} ft`:`${Math.round(target?.altitude??n.altitude)} ft`}<br/>{leg.kind==='altitude'?departureConstraintText(leg):n.endPassed?`已越过离场段终点 ${((target?.distance??0)/1000).toFixed(1)} km`:leg.headingMag!==undefined?`管制航向 ${Math.round(leg.headingMag)}°M · 剩余 ${((target?.distance??0)/1000).toFixed(1)} km`:`本段航迹 ${Math.round(legCourse)}°T · 下一点 ${((target?.distance??0)/1000).toFixed(1)} km`}</p>
  {n.procedure&&leg.kind!=='altitude'&&<p className="ground-hint">{departureConstraintText(leg)} · {`限速 ${n.speedLimit} kt`}</p>}
  {arrival?<><p className="ground-hint">按 ND / FD 衔接目的机场进近</p><p className="ground-keys">A 可选辅助 · 最后进近提示后 I 预位<br/>减速、构型与着陆检查由你完成</p></>:<>
  {enroute?<><p className="ground-hint">{a.waitingForArrival?'保持航路 · 等待进近引导':'默认继续飞行，跳过由你选择'}</p><p className="ground-keys">A 可选辅助 · 按许可高度飞行<br/>临近目的机场后衔接到港与进近</p></>:<>
  <ul>{checks.map(c=><li key={c.label} className={c.ok?'checked':''}><span>{c.ok?'✓':'○'}</span><span>{c.label}</span></li>)}</ul>
  <p className="ground-keys">G 收轮 · ⇧F 收襟翼 · L 选择 CL<br/>按 ND / FD 执行离场 · A 可选辅助</p>
  <p className="ground-hint">{n.endPassed?'离场段已完成 · 继续飞往目的机场':'初始离场稳定后可继续飞行或跳过'}</p></>}
  <button className="checklist-button skip-cruise" disabled={!ready} onClick={onSkipCruise}>跳过剩余航程</button></>}
  <p className="journey-note">{enroute?`距到港入口约 ${Math.round(n.remaining/1000)} km`:`机场间距离约 ${Math.round(a.distanceKm)} km`}</p>
 </aside>;
}
