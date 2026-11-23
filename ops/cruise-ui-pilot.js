async function installCruiseUIPilot(cutMode,pointerId){
 const{groundTarget,departureOf}=await import('/src/missions/ground.js');
 const{canSkipCruise}=await import('/src/missions/airline.js');
 const origin=window.__flightSim.snapshot().airline.origin;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),held=new Set();let released=false,eligible=0;
 const key=(code,on)=>{if(on===held.has(code))return;if(on)held.add(code);else held.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code,bubbles:true,cancelable:true}));};
 const tap=code=>{key(code,true);key(code,false);};
 const range=value=>{const e=document.querySelector('#throttle'),v=String(Math.round(clamp(value,0,.18)*100));if(e&&!e.disabled&&e.value!==v){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}};
 const stick=(pitch,roll)=>{const e=document.querySelector('.stick-pad');if(!e)return;const r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointermove',{pointerId,pointerType:'mouse',clientX:r.x+(roll+1)*r.width/2,clientY:r.y+(pitch+1)*r.height/2,buttons:1,bubbles:true}));};
 const release=()=>{if(released)return;released=true;document.querySelector('.stick-pad')?.dispatchEvent(new PointerEvent('pointerup',{pointerId,pointerType:'mouse',bubbles:true}));};
 window.__uiCruisePilot={active:true,actions:0};
 function tick(){const q=window.__uiCruisePilot,api=window.__flightSim;if(!q.active||!api)return;const s=api.snapshot();
  if(api.cruiseTransition()||s.result||s.airportId!==origin){release();key('Space',false);q.active=false;return;}
  if(s.playing){q.actions++;const g=s.ground,ra=(s.y-2.8)*3.28084,kt=s.speed*1.94384;
   if(g&&!g.takeoffCleared){
    if(g.stage==='lineup'){
     const d=departureOf(s),t=groundTarget(s),distance=Math.hypot(d.lineup.x-s.x,d.lineup.z-s.z),speed=s.airData.groundSpeed,desired=distance<12?0:Math.atan2(t.x-s.x,-(t.z-s.z)),error=Math.atan2(Math.sin(desired-s.yaw),Math.cos(desired-s.yaw)),target=Math.min(6/1.94384,Math.sqrt(Math.max(0,distance-4)*.65));
     range((.25+speed*.006+clamp((target-speed)*.65,-1,1))*s.weight*1000/Math.max(s.propulsion.availableThrustN,1));key('Space',distance<8||speed>target+.8);stick(0,clamp(error*1.9-s.yawRate*1.2,-.85,.85));
    }else{key('Space',true);stick(0,0);}
   }else if(!s.airborne){key('Space',false);if(s.throttle<.9)tap('KeyT');key('ArrowDown',kt>=125&&s.pitch<.2);stick(kt>=125&&s.pitch<.2?1:0,clamp(-s.x*.035-s.velocity.x*.12-s.yaw*.8,-.5,.5));}
   else{key('Space',false);key('ArrowDown',false);if(s.gear&&s.verticalSpeed>.5&&ra>70)tap('KeyG');if(ra>500&&s.throttle>.845)tap('KeyL');if(!s.autoThrust&&s.systems.autoThrustAvailable)tap('KeyU');if(ra>200&&!s.autoPilot){release();tap('KeyA');}else if(!s.autoPilot)stick(clamp((s.guidance.pitch-s.pitch)*8-s.pitchRate*3,-.5,.5),clamp((s.guidance.roll-s.roll)*3-s.rollRate*2,-.4,.4));
    if(cutMode==='manual'&&canSkipCruise(s)&&api.prefetch()){if(++eligible>=2)document.querySelector('.skip-cruise')?.click();}else eligible=0;
   }
  }
  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
}
