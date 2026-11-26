const roles={tower:'空管',dispatch:'应急调度',police:'警方现场单位',marine:'水上巡逻',rescue:'救援单位',instructor:'教员'};
export function FailureOverlay({status}){
 if(!status?.active)return null;
 return <aside className={`failure-caption ${status.line?.confirmation?'confirmation':''}`} aria-label="事故声音演出字幕">
  <small>{status.kind==='procedural'?'训练结束':status.line?.confirmation?'稍后 · 应急频道':'应急无线电'}{status.paused?' · 已暂停':''}</small>
  {status.line&&<><span>{roles[status.line.role]}</span><p>{status.line.text}</p></>}
  {status.waiting&&<p className="failure-wait">正在准备回放场景…</p>}
 </aside>;
}
