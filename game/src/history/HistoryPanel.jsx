import {historicalQuestion,chooseHistorical,takeHistoricalControl,historicalCandidates,historyHeight,selectHistoricalTarget,historyReferenceSpeed,historicalApproach} from './us1549.js';
import {eventProject,eventRunways,eventRunwayStrips} from './event-world.js';
import {US1549_PROFILE as P} from './us1549-profile.js';
import {selectedHistoricalRunway,runwayKey,runwayGeometry} from './navigation.js';
import {KT} from '../sim/constants.js';
import {DitchingGuide} from './DitchingGuide.jsx';
const anchors=P.riverTargets.map(p=>eventProject(...p));
export function HistoryPanel({state:s,onAction}){
 const runway=selectedHistoricalRunway(s),nav=runway?runwayGeometry(s,runway):null;
 const h=s.historical,q=historicalQuestion(s),candidates=historicalCandidates(s),x=17000,z=-2000,size=19000;
 return <><DitchingGuide state={s}/><aside className={`history-panel ${h.controlSource==='player'?'history-panel-manual':''}`} aria-label="历史关卡机组决策">
  <header><strong>{h.controlSource==='copilot'?'副驾驶操纵':'你来操纵'}</strong><small>{s.mission.practice?'练习':h.mode==='guided'?'引导':'挑战'}</small></header>
  <div className="history-metrics"><span>水面高度 <b>{Math.round(historyHeight(s))} ft</b></span><span>空速 <b>{Math.round(s.speed*KT)} kt</b></span></div>
  <svg viewBox={`${x} ${z} ${size} ${size}`} role="img" aria-label="纽约事件区域地图示意"><polyline points={anchors.map(p=>`${p.x},${p.z}`).join(' ')} fill="none" stroke="#77a1b5" strokeWidth="950" strokeLinejoin="round"/>{eventRunwayStrips.map(r=><g key={r.airport+r.id}><line x1={r.a.x} y1={r.a.z} x2={r.b.x} y2={r.b.z} stroke="#e5e4d7" strokeWidth="110"/><text x={r.a.x+350} y={r.a.z} fontSize="600" fill="#e5e4d7">{r.airport} {r.id}/{r.opposite}</text></g>)}<circle cx={s.x} cy={s.z} r="250" fill="#f1cd8a"/></svg>
  {h.mode==='guided'&&<><ul className="history-candidates">{candidates.map(c=><li key={c.airport+c.runway}><span>{c.airport} {c.runway}</span><span>{c.status==='estimated-reachable'?'预计可达':c.status==='marginal'?'余量偏小':'预计不可达'}</span></li>)}</ul>
  <small>可达性为估算，包含风、转弯与对正余量。</small></>}
  {q&&<div className="history-question">{q.runway&&<strong>{q.runway}</strong>}<h3>{q.title}</h3>{q.options.map(o=><button key={o.id} data-history-option={o.id} onPointerDown={e=>e.preventDefault()} onClick={e=>{e.currentTarget.blur();onAction(f=>chooseHistorical(f,o.id));}}>{o.text}</button>)}</div>}
  {h.lastDecision&&h.controlSource==='copilot'&&<p className="history-decision-feedback" role="status">{h.lastDecision.text}</p>}
  {h.controlSource==='copilot'&&!s.water&&<button className="history-practice" data-history-early onPointerDown={e=>e.preventDefault()} onClick={e=>{e.currentTarget.blur();onAction(f=>takeHistoricalControl(f,{early:true}));}}>提前接管 · 练习<small>本次不计完整关卡完成</small></button>}
  {h.controlSource==='player'&&!s.water&&!h.alternate&&<div className="history-manual-nav"><label><span className="history-target-label">导航目标</span><select data-history-target aria-label="手动飞行导航目标" value={h.manualTarget||'free'} onKeyDown={e=>e.stopPropagation()} onChange={e=>{const value=e.target.value;e.target.blur();onAction(f=>selectHistoricalTarget(f,value));}}><option value="free">自由操纵</option><option value="river">哈德逊河水面</option>{eventRunways.map(r=><option key={runwayKey(r)} value={runwayKey(r)}>{r.airport} {r.id}</option>)}</select></label>
   <p>{nav?`跑道头 ${(nav.distance/1000).toFixed(1)} km · 侧偏 ${Math.round(Math.abs(nav.cross))} m`:'空速稳定仍在消耗高度'}</p>
   {h.mode==='guided'&&<p>{`参考 ${Math.round(historyReferenceSpeed(s,{approach:historicalApproach(s)}))} kt · 下降率 ${Math.max(0,-s.verticalSpeed).toFixed(1)} m/s`}</p>}
   {runway&&<small>备降可记录安全结果；不计哈德逊河通关。</small>}
  </div>}
  {s.water&&<p>{s.water.phase==='evacuation'?'漂浮稳定 · 机组组织撤离':'水面减速 · 保持机翼平稳'}</p>}
 </aside></>;
}
