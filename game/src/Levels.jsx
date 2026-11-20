import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowCounterClockwise,CheckCircle,Star,X,Play} from '@phosphor-icons/react';
import {LEVELS,getLevel,nextLevel,starsFor} from './missions/catalog.js';
import {recommendedLevel} from './missions/progress.js';
import {radioAltitude,KT} from './flight.js';
export function LevelSelect({progress,currentId,onChoose,onClose}){
 const recommended=recommendedLevel(progress),[selected,setSelected]=useState(currentId||recommended.id),title=useRef(null),panel=useRef(null);
 const level=getLevel(selected)||recommended,record=progress.levels[level.id],count=Object.keys(progress.levels).length;
 const selectLevel=id=>{setSelected(id);if(window.matchMedia('(max-width:600px) and (orientation:portrait)').matches)requestAnimationFrame(()=>panel.current?.querySelector('.level-detail')?.scrollIntoView({block:'nearest',behavior:'smooth'}));};
 useEffect(()=>{title.current?.focus();panel.current?.querySelector(`[data-level-id="${selected}"]`)?.scrollIntoView({block:'nearest'});return()=>document.querySelector('.level-menu-button')?.focus();},[]);
 const trapFocus=e=>{if(e.key!=='Tab')return;const items=[...panel.current.querySelectorAll('button:not(:disabled)')],first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===title.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};
 return <div className="level-select-backdrop"><section className="level-select" ref={panel} onKeyDown={trapFocus} role="dialog" aria-modal="true" aria-labelledby="levels-title">
  <header className="levels-header"><div><p className="eyebrow">云际 / FLIGHT TRAINING</p><h1 id="levels-title" ref={title} tabIndex={-1}>飞行关卡<span>{count} / {LEVELS.length} 已完成</span></h1><p>按推荐顺序练习，也可以直接挑战任意一关。</p></div><button className="icon-button" aria-label="关闭关卡选择" onClick={onClose}><X/></button></header>
  <div className="levels-body"><div className="level-grid" role="group" aria-label="从简单到困难的关卡">
   {LEVELS.map(l=>{const best=progress.levels[l.id];return <button key={l.id} data-level-id={l.id} className={`level-tile ${l.id===level.id?'selected':''} ${best?'completed':''}`} aria-pressed={l.id===level.id} onClick={()=>selectLevel(l.id)}>
    <span className="level-tile-top"><span className="level-number">{String(l.order).padStart(2,'0')}</span><span>{l.category}</span><span className="difficulty" aria-label={`难度 ${l.difficulty} / 3`}>{[1,2,3].map(n=><i key={n} className={n<=l.difficulty?'filled':''}/>)}</span></span>
    <strong>{l.title}</strong><span className="level-focus">{l.focus}</span><span className="level-tile-bottom"><span>{l.duration}</span><span className={best?'record':''}>{best?<><Star weight="fill"/>{best.stars} · {best.bestScore} 分</>:l.id===recommended.id?'推荐下一关':'未完成'}<ArrowRight/></span></span>
   </button>;})}
  </div><aside className="level-detail"><p className="eyebrow">{level.id===recommended.id?'推荐下一关':`关卡 ${String(level.order).padStart(2,'0')}`} / {level.category}</p><h2>{level.title}</h2><p className="level-goal">{level.goal}</p><ol>{level.objectives.map(o=><li key={o}><CheckCircle/>{o}</li>)}</ol><div className="level-detail-bottom"><p>{record?`本机最高 ${record.bestScore} 分 · ${record.stars} 星`:'完成后记录本机最高分与星级。'}</p><button className="primary-button enter-level" onClick={()=>onChoose(level.id)}><Play weight="fill"/>进入简报<ArrowRight/></button></div></aside></div>
  <footer className="levels-footer"><span>所有关卡均可体验 · 阶段重试适合练习，整关完成后记录成绩</span><span>进度保存在当前浏览器</span></footer>
 </section></div>;
}
export function LevelResult({state:s,onRetry,onRestart,onNext,onMenu}){
 const level=getLevel(s.levelId),next=nextLevel(s.levelId),cleared=s.result.levelCleared&&!s.mission?.practice;
 return <section className={`flight-card result-card level-result ${s.result.success?'success':''}`} role="dialog" aria-modal="true" aria-labelledby="result-title">
  <p className="eyebrow">{cleared?<CheckCircle weight="fill"/>:<ArrowCounterClockwise/>}{cleared?`关卡 ${level.order} 已完成`:s.mission.practice?'阶段练习 · 不计整关成绩':'复盘与练习'}</p>
  <h1 id="result-title">{s.result.title}{s.result.success&&<span className="score">{s.result.score}<small>分</small></span>}</h1>
  {cleared&&<div className="result-stars" aria-label={`${starsFor(s.result.score)} 星`}>{[1,2,3].map(n=><Star key={n} weight={n<=starsFor(s.result.score)?'fill':'regular'}/>)}</div>}
  <p className="card-description">{s.result.detail}</p>
  {s.touchdown?<div className="result-metrics"><span>接地下降率<b>{Math.round(s.touchdown.descent*196.85)} ft/min</b></span><span>中心线偏差<b>{s.touchdown.offset.toFixed(1)} m</b></span><span>稳定检查点<b>{s.gates.filter(g=>g.passed).length} / {s.gates.length}</b></span></div>:<div className="result-metrics"><span>当前高度<b>{Math.round(radioAltitude(s))} ft</b></span><span>空速<b>{Math.round(s.speed*KT)} kt</b></span><span>关卡<b>{String(level.order).padStart(2,'0')} / {LEVELS.length}</b></span></div>}
  <div className="card-actions">{cleared?<button className="primary-button next-level" onClick={next?onNext:onMenu}>{next?`下一关 · ${next.title}`:'返回关卡选择'}<ArrowRight/></button>:<button className="primary-button" onClick={onRetry}><ArrowCounterClockwise/>重试本阶段</button>}<button className="text-button restart-level" onClick={onRestart}>重试整关</button></div>
  {(!cleared||!!next)&&<button className="text-button back-to-levels" onClick={onMenu}>返回关卡选择</button>}
 </section>;
}
