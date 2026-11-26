export function HistoricalPresentationOverlay({presentation,playing,onSkip,onPause}){
 const intro=presentation.kind==='history-intro';
 return <section className="historical-presentation" aria-label={intro?'历史事件开场演示':'随后 · 撤离与救援演出'}>
  <div><p>{intro?'15 JAN 2009 · NEW YORK':'随后 · 撤离与救援演出'}</p><h2>{intro?'全美航空 1549':'保持漂浮，等待救援'}</h2><span>{intro?'开场演示 · 鸟击前的正常爬升':'此段为时间压缩的演出 · 不代表真实救援耗时'}</span></div>
  <nav><button className="text-button history-presentation-pause" onClick={onPause}>{playing?'暂停':'继续'}</button><button className="text-button skip-intro" onClick={onSkip}>{intro?'跳过开场':'跳过救援演出'}</button></nav>
 </section>;
}
