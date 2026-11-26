import {AIRPORTS} from './airports/registry.js';
import {AirlineSelect} from './AirlineSelect.jsx';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowCounterClockwise,CheckCircle,Star,X,Play} from '@phosphor-icons/react';
import {LEVELS,AIRPORT_MISSIONS,AIRLINE_ROUTES,HISTORICAL_MISSIONS,getLevel,nextLevel,starsFor} from './missions/catalog.js';
import {recommendedLevel} from './missions/progress.js';
import {radioAltitude,KT} from './flight.js';
import {siteUrl} from './urls.js';
import {HistoryResult} from './history/HistoryResult.jsx';
import {historicalMediaReady} from './history/media.js';
export function LevelSelect({progress,historyProgress={records:{}},currentId,onChoose,onClose}){
 const recommended=recommendedLevel(progress),[selected,setSelected]=useState(currentId||recommended.id),title=useRef(null),panel=useRef(null);
 const [stage,setStage]=useState(getLevel(currentId)?.stage||'training');
 const levels=stage==='history'?HISTORICAL_MISSIONS:stage==='airline'?AIRLINE_ROUTES:LEVELS,level=getLevel(selected)||recommended,count=levels.filter(l=>progress.levels[l.id]).length;
 const historyReady=historicalMediaReady('zh')&&historicalMediaReady('en');
 const historicalBest=l=>{const records=['guided','challenge'].map(mode=>historyProgress.records[`${l.id}:${mode}:${l.revision}`]).filter(Boolean);if(!records.length)return null;const best=records.reduce((a,b)=>a.bestScore>b.bestScore?a:b);return{...best,stars:starsFor(best.bestScore)};};
 const bestFor=l=>l.stage==='history'?historicalBest(l):progress.levels[l.id];
 const record=bestFor(level);
 const stages=[{id:'training',name:'飞行训练',english:'FLIGHT TRAINING'},{id:'airline',name:'航线执飞',english:'AIRLINE OPERATIONS'},{id:'history',name:'历史重现',english:historyReady?'HISTORICAL EVENTS':'COMING SOON'}];
 const chooseStage=id=>{setStage(id);setSelected(id==='history'?HISTORICAL_MISSIONS[0].id:id==='airline'?AIRLINE_ROUTES[0].id:recommended.id);};
 const selectLevel=id=>{setSelected(id);if(window.matchMedia('(max-width:600px) and (orientation:portrait)').matches)requestAnimationFrame(()=>panel.current?.querySelector('.level-detail')?.scrollIntoView({block:'nearest',behavior:'smooth'}));};
 useEffect(()=>{title.current?.focus();panel.current?.querySelector(`[data-level-id="${selected}"]`)?.scrollIntoView({block:'nearest'});},[]);
 const trapFocus=e=>{if(e.key!=='Tab')return;const items=[...panel.current.querySelectorAll('a[href],input:not(:disabled),[tabindex="0"]')],first=items[0],last=items.at(-1);if(!items.length){e.preventDefault();title.current?.focus();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===title.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};
 return <div className="level-select-backdrop"><section className="level-select" ref={panel} onKeyDown={trapFocus} role="dialog" aria-modal="true" aria-labelledby="levels-title">
  <header className="levels-header"><div><p className="eyebrow">云际 / FLIGHT EXPERIENCE</p><h1 id="levels-title" ref={title} tabIndex={-1}>{stages.find(s=>s.id===stage).name}{stage!=='history'&&<span>{count} / {levels.length} {stage==='airline'?'航班已完成':'已完成'}</span>}</h1><p>{stage==='training'?'按推荐顺序练习，也可以直接挑战任意一关。':stage==='airline'?'在地图上选择起点与终点 · 巡航阶段可略过':'回到关键时刻，面对真实航班中的抉择。'}</p></div><button className="icon-button" aria-label="关闭关卡选择" onClick={onClose}><X/></button></header>
  <div className="stage-tabs" role="tablist" aria-label="飞行阶段">{stages.map((s,i)=><button key={s.id} role="tab" aria-selected={stage===s.id} data-stage-id={s.id} className={stage===s.id?'selected':''} onClick={()=>chooseStage(s.id)}><span>{String(i+1).padStart(2,'0')} · {s.name}</span><small>{s.english}</small></button>)}</div>
  {stage==='history'&&!historyReady&&!import.meta.env.DEV?<div className="history-coming-soon" role="tabpanel"><span>COMING SOON</span><h2>历史重现</h2><p>体验关键时刻的判断、机组协作与应急处置。</p><p>历史事件阶段正在规划，暂未开放。</p><button className="text-button" onClick={()=>chooseStage('airline')}>选择真实机场航线</button></div>:stage==='airline'?<AirlineSelect progress={progress} selectedId={selected} onSelect={setSelected} onChoose={onChoose}/>:<>
  <div className="levels-body"><div className="level-grid" role="group" aria-label="从简单到困难的关卡">
   {levels.map(l=>{const best=bestFor(l);return <button key={l.id} data-level-id={l.id} className={`level-tile ${l.id===level.id?'selected':''} ${best?'completed':''}`} aria-pressed={l.id===level.id} onClick={()=>selectLevel(l.id)}>
    <span className="level-tile-top"><span className="level-number">{String(l.order).padStart(2,'0')}</span><span>{l.category}</span><span className="difficulty" aria-label={`难度 ${l.difficulty} / 3`}>{[1,2,3].map(n=><i key={n} className={n<=l.difficulty?'filled':''}/>)}</span></span>
    <strong>{l.title}</strong><span className="level-focus">{l.focus}</span><span className="level-tile-bottom"><span>{l.duration}</span><span className={best?'record':''}>{best?<><Star weight="fill"/>{best.stars} · {best.bestScore} 分</>:l.id===recommended.id?'推荐下一关':'未完成'}<ArrowRight/></span></span>
   </button>;})}
  </div><aside className="level-detail"><p className="eyebrow">{level.id===recommended.id?'推荐下一关':`关卡 ${String(level.order).padStart(2,'0')}`} / {level.category}</p><h2>{level.title}</h2><p className="level-goal">{level.goal}</p>{stage==='history'&&<div className="historical-records">{[['guided','引导'],['challenge','挑战']].map(([mode,label])=>{const r=historyProgress.records[`${level.id}:${mode}:${level.revision}`];return <span key={mode}>{label}<b>{r?`${r.bestScore} 分`:'未完成'}</b></span>;})}</div>}<ol>{level.objectives.map(o=><li key={o}><CheckCircle/>{o}</li>)}</ol><div className="level-detail-bottom"><p>{record?`本机最高 ${record.bestScore} 分 · ${record.stars} 星`:'完成后记录本机最高分与星级。'}</p><button className="primary-button enter-level" onClick={()=>onChoose(level.id)}><Play weight="fill"/>进入简报<ArrowRight/></button></div></aside></div>
  <footer className="levels-footer"><span>所有关卡均可体验 · 阶段重试适合练习，整关完成后记录成绩</span><span>进度保存在当前浏览器</span></footer>

  </>}
 {stage==='airline'&&<p className="map-attribution">© OpenStreetMap contributors / ODbL · OurAirports · Mapzen / USGS · Natural Earth · {AIRPORTS.map((ap,i)=><span key={ap.id}>{i>0?' · ':''}<a href={siteUrl(`assets/maps/${ap.id}-source.json`)} target="_blank" rel="noreferrer">{ap.shortName}</a></span>)}</p>}
 </section></div>;
}
export function LevelResult({state:s,onRetry,onRestart,onNext,onMenu,onClose,onPractice}){
 if(s.historical)return <HistoryResult state={s} onRestart={onRestart} onPractice={onPractice} onMenu={onMenu} onClose={onClose}/>;
 const level=getLevel(s.levelId),next=nextLevel(s.levelId),cleared=s.result.levelCleared&&!s.mission?.practice;
 return <section className={`flight-card result-card level-result ${s.result.success?'success':''}`} role="dialog" aria-modal="false" aria-labelledby="result-title">
  <button className="icon-button close-result" onClick={onClose} aria-label="收起结算窗口"><X/></button>
  <p className="eyebrow">{cleared?<CheckCircle weight="fill"/>:<ArrowCounterClockwise/>}{cleared?`关卡 ${level.order} 已完成`:s.mission.practice?'阶段练习 · 不计整关成绩':'复盘与练习'}</p>
  <h1 id="result-title">{s.result.title}{s.result.success&&<span className="score">{s.result.score}<small>分</small></span>}</h1>
  {cleared&&<div className="result-stars" aria-label={`${starsFor(s.result.score)} 星`}>{[1,2,3].map(n=><Star key={n} weight={n<=starsFor(s.result.score)?'fill':'regular'}/>)}</div>}
  <p className="card-description">{s.result.detail}</p>
  {s.touchdown?<div className="result-metrics"><span>接地下降率<b>{Math.round(s.touchdown.descent*196.85)} ft/min</b></span><span>中心线偏差<b>{s.touchdown.offset.toFixed(1)} m</b></span><span>稳定检查点<b>{s.gates.filter(g=>g.passed).length} / {s.gates.length}</b></span></div>:<div className="result-metrics"><span>当前高度<b>{Math.round(radioAltitude(s))} ft</b></span><span>空速<b>{Math.round(s.speed*KT)} kt</b></span><span>关卡<b>{String(level.order).padStart(2,'0')} / {level.kind==='airline'?AIRLINE_ROUTES.length:level.stage==='airline'?AIRPORT_MISSIONS.length:LEVELS.length}</b></span></div>}
  <div className="card-actions">{cleared?<button className="primary-button next-level" onClick={next?onNext:onMenu}>{next?`下一关 · ${next.title}`:'返回关卡选择'}<ArrowRight/></button>:<button className="primary-button" onClick={onRetry}><ArrowCounterClockwise/>重试本阶段</button>}<button className="text-button restart-level" onClick={onRestart}>重试整关</button></div>
  {(!cleared||!!next)&&<button className="text-button back-to-levels" onClick={onMenu}>返回关卡选择</button>}
 </section>;
}
