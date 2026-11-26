import {ditchingGuide} from './ditching-guide.js';
export function DitchingGuide({state}){
 const guide=ditchingGuide(state);if(!guide)return null;
 return <aside className="ditching-guide" data-entry-phase={guide.phase} aria-label="水上迫降参数提示">
  <header><strong>入水建议范围</strong><span>{guide.context}</span></header>
  <div className="entry-grid">{guide.rows.map(row=><div key={row.id} className="entry-metric" data-entry-metric={row.id} data-state={row.state}>
   <div className="entry-label"><span>{row.label}</span><em>{row.status}</em></div>
   <strong><span className="entry-current">{row.value}</span><span className="entry-symbol" aria-label={row.status}>{row.symbol}</span></strong>
   <small className="entry-target">{row.target}</small>{row.secondary&&<small className="entry-secondary">{row.secondary}</small>}
  </div>)}</div><p>{guide.note}</p>
 </aside>;
}
