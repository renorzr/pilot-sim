import {useCallback,useEffect,useLayoutEffect,useRef} from 'react';
import {FastForward} from '@phosphor-icons/react';

export function FastForwardButton({scale=1,onChange,disabled=false,cancelKey=0}){
 const held=useRef(null),button=useRef(null),change=useRef(onChange);change.current=onChange;
 const finish=useCallback(event=>{
  const drag=held.current;if(!drag||event?.pointerId!==undefined&&event.pointerId!==drag.id)return;
  held.current=null;
  try{if(button.current?.hasPointerCapture(drag.id))button.current.releasePointerCapture(drag.id);}catch{}
  change.current(1);
 },[]);
 useLayoutEffect(()=>{finish();},[disabled,cancelKey,finish]);
 useEffect(()=>{
  const blur=()=>finish(),hidden=()=>{if(document.hidden)finish();};
  window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);finish();};
 },[finish]);
 function begin(event){
  if(disabled||event.button!==0||held.current)return;
  event.preventDefault();
  // Use a short upward drag, capped by the available viewport space.
  held.current={id:event.pointerId,y:event.clientY,threshold:Math.min(20,Math.max(3,event.clientY-3)),scale:2};
  event.currentTarget.setPointerCapture(event.pointerId);change.current(2);
 }
 function move(event){
  const drag=held.current;if(disabled||!drag||drag.id!==event.pointerId)return;
  const next=drag.y-event.clientY>=drag.threshold?4:2;
  if(next!==drag.scale){drag.scale=next;change.current(next);}
 }
 return <button ref={button} className={`icon-button fast-forward-button ${scale>1?'active':''}`} data-speed={scale} disabled={disabled} aria-pressed={scale>1} aria-label={scale>1?`快进 ${scale} 倍，松开恢复正常速度`:'按住快进，向上拖动至四倍速'} title="按住 2× · 上拖 4× · 松开恢复" onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
  {scale>1?<output className="fast-forward-value" aria-hidden="true">{scale}×</output>:<FastForward weight="fill" aria-hidden="true"/>}
 </button>;
}
