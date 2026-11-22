import {LOADING_STAGES}from './loading-progress.js';
export function LoadingProgress({progress}){
 const{percent=0,stage='assets',loadedBytes,totalBytes,completed,total}=progress||{};
 return <div className="airport-loading" data-loading-stage={stage}>
  <div className="airport-loading-heading"><span aria-live="polite">{LOADING_STAGES[stage]||LOADING_STAGES.assets}</span><b>{percent}%</b></div>
  <progress max="100" value={percent} aria-label="机场数据加载进度"/>
  {stage==='download'&&loadedBytes!=null?<small>{(loadedBytes/1048576).toFixed(1)}{totalBytes?` / ${(totalBytes/1048576).toFixed(1)}`:''} MiB</small>:['models','cache'].includes(stage)&&total>0?<small>{stage==='cache'?`${completed} / ${total}`:`已准备 ${completed} / ${total} 个模型`}</small>:<small>正在载入，请稍候…</small>}
 </div>;
}
