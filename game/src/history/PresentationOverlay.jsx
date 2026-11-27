import {rescueLine} from './rescue-media.js';
const roles={tower:'纽约空管',police:'警方现场单位',dispatch:'应急调度',marine:'水上巡逻',copilot:'副驾驶 · 机内协作'};
export function HistoricalPresentationOverlay({presentation,playing,onSkip,onPause}){
 const intro=presentation.kind==='history-intro',line=intro?null:rescueLine(presentation);
 return <><section className="historical-presentation" aria-label={intro?'历史事件开场演示':'随后 · 撤离与救援演出'}>
  <div><p>{intro?'15 JAN 2009 · NEW YORK':'随后 · 撤离与救援演出'}</p><h2>{intro?'全美航空 1549':'保持漂浮，等待救援'}</h2><span>{intro?(presentation.struck?'鸟击 · 两秒后进入驾驶舱':'开场演示 · 正常爬升与塔台通话'):'此段为时间压缩的演出 · 不代表真实救援耗时'}</span></div>
  <nav><button className="text-button history-presentation-pause" onClick={onPause}>{playing?'暂停':'继续'}</button>{!(intro&&presentation.struck)&&<button className="text-button skip-intro" onClick={onSkip}>{intro?'跳过开场':'跳过救援演出'}</button>}</nav>
 </section>{line&&<aside className={`radio-caption ${line.role}`} aria-label="自动无线电通话"><span>{roles[line.role]}<small>{line.profile==='intercom'?'机内通话':'应急无线电'}</small></span><p>{line.text}</p></aside>}</>;
}
