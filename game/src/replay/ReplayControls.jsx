import {ArrowLeft,ArrowRight,ArrowCounterClockwise,ListChecks,Pause,Play,ChartBar} from '@phosphor-icons/react';
export function ReplayControls({status,panel,onPanel,onPause,onStep,onMenu,onRestart,prelude,onSkipPrelude,onPausePrelude}){
 const intro=!!prelude?.active,accident=prelude&&prelude.kind!=='procedural',elapsed=intro?prelude.elapsed:status?.elapsed||0,duration=intro?prelude.duration:status?.duration||1;
 return <footer className="replay-footer" aria-label="回放操作">
  <div className="replay-caption"><span className="replay-dot"/><span>{intro?accident?'事故声音演出':'训练结束':prelude?accident?'事故复盘':'任务复盘':'精彩回放'}</span>{!intro&&<small>{String((status?.index??0)+1).padStart(2,'0')} / {String(status?.count||1).padStart(2,'0')}</small>}<strong>{intro?prelude.paused?'声音已暂停':'无线电通话':status?.label||'飞行片段'}</strong>{status?.loading&&(!intro||prelude.waiting)&&<em role="status">{status.error?'回放场景载入失败，正在重试…':'正在准备回放场景…'}</em>}</div>
  <div className="replay-progress" role="progressbar" aria-label={intro?'声音序章进度':'当前片段进度'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.round(100*elapsed/duration))}><i style={{width:`${Math.min(100,100*elapsed/duration)}%`}}/></div>
  <nav className="replay-actions" aria-label="结算操作">
   <button className="replay-panel-toggle" onClick={onPanel} aria-expanded={panel}><ChartBar/><kbd>Tab</kbd><span>{panel?'收起结算':'打开结算'}</span></button>
   {intro?<><button className="failure-skip" onClick={onSkipPrelude}><Play weight="fill"/><kbd>空格</kbd><span>进入回放</span></button><button className="failure-pause" onClick={onPausePrelude} aria-label={prelude.paused?'继续声音':'暂停声音'}>{prelude.paused?<Play weight="fill"/>:<Pause weight="fill"/>}<kbd>P</kbd><span>{prelude.paused?'继续声音':'暂停声音'}</span></button></>:<><button className="replay-pause" onClick={onPause} aria-label={status?.paused?'继续回放':'暂停回放'} disabled={!status?.count}>{status?.paused?<Play weight="fill"/>:<Pause weight="fill"/>}<kbd>空格</kbd><span>{status?.paused?'继续回放':'暂停回放'}</span></button><button className="replay-previous" onClick={()=>onStep(-1)} aria-label="上一个片段" disabled={!status?.count}><ArrowLeft/><kbd>←</kbd><span>上一段</span></button><button className="replay-next" onClick={()=>onStep(1)} aria-label="下一个片段" disabled={!status?.count}><ArrowRight/><kbd>→</kbd><span>下一段</span></button></>}
   <button className="replay-menu" onClick={onMenu}><ListChecks/><kbd>Esc</kbd><span>关卡选择</span></button>
   <button className="replay-restart" onClick={onRestart}><ArrowCounterClockwise/><kbd>R</kbd><span>重试整关</span></button>
  </nav>
 </footer>;
}
