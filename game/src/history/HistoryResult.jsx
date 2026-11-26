import {X,ArrowCounterClockwise,Star} from '@phosphor-icons/react';
import {KT,RAD} from '../sim/constants.js';
import {starsFor} from '../missions/catalog.js';
export function HistoryResult({state:s,onRestart,onPractice,onMenu,onClose}){
 const r=s.result,w=s.water,impact=w?.firstImpact||s.historical.runwayContact||s.historical.alternate?.touchdown,cleared=r.levelCleared&&!s.mission.practice&&!s.historical.earlyTakeover;
 return <section className={`flight-card result-card level-result history-result ${r.success?'success':''}`} role="dialog" aria-modal="false" aria-labelledby="result-title">
  <button className="icon-button close-result" onClick={onClose} aria-label="收起结算窗口"><X/></button>
  <p className="eyebrow">{s.mission.practice?'练习反馈 · 不计正式成绩':s.historical.mode==='guided'?'历史重现 · 引导模式':'历史重现 · 挑战模式'}</p>
  <h1 id="result-title">{r.title}</h1>
  {cleared&&<div className="result-stars" aria-label={`${starsFor(r.score)} 星`}>{[1,2,3].map(n=><Star key={n} weight={n<=starsFor(r.score)?'fill':'regular'}/>)}<strong>{r.score}<small>分</small></strong></div>}
  <p className="card-description">{r.detail}</p>
  {impact&&<div className="result-metrics"><span>{w?'首次入水空速':'接地空速'}<b>{Math.round(impact.ias*KT)} kt</b></span><span>{w?'首次入水下降率':'接地下降率'}<b>{impact.sinkMps.toFixed(1)} m/s</b></span><span>俯仰 / 横滚<b>{(impact.pitch/RAD).toFixed(1)}° / {(impact.roll/RAD).toFixed(1)}°</b></span>{w&&<span>水相对速度<b>{Math.round(impact.waterSpeed*KT)} kt</b></span>}</div>}
  {r.scores&&<div className="history-score-breakdown">{[['decision','决策与协作',30],['energy','手动能量管理',20],['configuration','迫降构型',15],['survival','入水与漂浮',35]].map(([key,label,max])=><div key={key}><span>{label}</span><b>{r.scores[key]} / {max}</b></div>)}</div>}
  {r.scores&&s.historical.decisionExposure&&Object.values(s.historical.decisionExposure).some(v=>v>.5)&&<p className="assist-note">{`决策代价：过早放轮 ${Math.round(s.historical.decisionExposure.gearSeconds)} s · 大坡度 ${Math.round(s.historical.decisionExposure.steepSeconds)} s · 不利等待 ${Math.round(s.historical.decisionExposure.waitSeconds)} s`}</p>}
  {s.mission.practice&&<p className="assist-note">以上为练习反馈，不更新正式历史成绩或星级。</p>}
  {!r.success&&<p className="assist-note">复盘使用首次接触和实际轨迹，不以减速后的数值替代入水表现。</p>}
  <div className="card-actions"><button className="primary-button restart-level" onClick={onRestart}><ArrowCounterClockwise/>重试完整关卡</button><button className="text-button history-final-practice" onClick={onPractice}>末进近练习</button></div>
  <button className="text-button back-to-levels" onClick={onMenu}>返回关卡选择</button>
 </section>;
}
