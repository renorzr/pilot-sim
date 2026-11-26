import {KT} from './constants.js';
import {criticalAlpha} from './aerodynamics.js';
export const createStallWarning=()=>({level:0,active:false,ratio:0,clearSeconds:0,lastSpoken:-100,since:null});
// A game AoA warning, ahead of the synthetic lift peak. Hysteresis prevents
// flicker; neither altitude nor landing configuration disables an airborne alert.
export function updateStallWarning(s,dt,emit){
 const w=s.stallWarning??=createStallWarning(),critical=criticalAlpha(s.flapPosition,s.aerodynamics);
 w.ratio=s.airData.alpha/critical;
 if(!s.airborne||s.landed||s.result||s.speed*KT<45){w.active=false;w.level=0;w.clearSeconds=0;w.since=null;return;}
 if(w.ratio>=.95||s.airData.stalled){if(!w.active){w.since=s.time;w.lastSpoken=-100;}w.active=true;w.clearSeconds=0;}
 else if(w.active){w.clearSeconds=w.ratio<.78?w.clearSeconds+dt:0;if(w.clearSeconds>=.6){w.active=false;w.since=null;}}
 w.level=w.active?2:w.ratio>=.85?1:0;
 if(w.active&&s.time-w.lastSpoken>=3){w.lastSpoken=s.time;emit(s,'STALL · 失速警告 · 前推侧杆降低迎角','Stall, stall','warning');}
}
