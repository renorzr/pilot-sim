// Runs only in browser QA. Reads telemetry and sends normal control events to
// the captured sidestick/keyboard; never writes flight pose, velocity or result.
export function installHistoricalUiPilot(options={}){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const q=window.__us1549Pilot={active:true,samples:[],events:[]},runway=options.runway;
 function key(code){window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true,cancelable:true}));q.events.push({time:window.__flightSim.snapshot().time,code});}
 function geometry(s){const f={x:Math.sin(runway.heading),z:-Math.cos(runway.heading)},dx=s.x-runway.a.x,dz=s.z-runway.a.z;return{distance:Math.hypot(dx,dz),along:dx*f.x+dz*f.z,cross:dx*Math.cos(runway.heading)+dz*Math.sin(runway.heading)};}
 function trim(s){const cl=s.weight*1000*9.80665/(.5*1.225*Math.max(s.speed,20)**2*122.6*Math.max(.65,Math.cos(s.roll))),values=s.aerodynamics?.liftZero,f=clamp(s.flapPosition,0,4),i=Math.min(3,Math.floor(f)),zero=values?values[i]+(values[i+1]-values[i])*(f-i):.30+.175*f;return clamp((cl-zero)/(s.aerodynamics?.liftSlope||5.8),-.04,.25);}
 function tick(){
  const s=window.__flightSim.snapshot();if(!q.active||s.result){q.active=false;return;}
  if(s.playing){
   const g=runway?geometry(s):null;
   if(g&&g.distance<(options.configurationDistance||3500)&&g.along<0){if(!s.gear)key('KeyG');if(s.flaps<(options.maxFlaps||2)&&s.speed*1.94384<([229,199,184,176][s.flaps]))key('KeyF');}
   if(!g&&s.flaps===1&&s.speed*1.94384<199)key('KeyF');
   let pitch=0,roll=0;
   if(!s.water&&!s.historical.alternate){
    let target=s.guidance.pitch,height=s.y-(runway?.elevationM||0),flaring=false;
    if(height<(runway?32:28)&&(!g||g.along<runway.length&&Math.abs(g.cross)<100)){
     flaring=true;const sink=runway?-Math.max(.7,Math.min(2,height*.15)):-Math.max(.8,Math.min(2.5,height*.15));
     target=Math.min(.20,trim(s)+Math.atan2(sink,s.airData.horizontal)+(sink-s.verticalSpeed)*.008);
    }
    pitch=clamp((target-s.pitch)*(runway&&flaring?6.4:3.2)-s.pitchRate*2,-1,1);roll=clamp((s.guidance.roll-s.roll)*2.3-s.rollRate*.7,-1,1);
   }
   if(s.historical.alternate&&g){roll=clamp(-g.cross*.04-wrap(s.yaw-runway.heading)*4-s.yawRate*3,-1,1);if(!q.braking){window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}));q.braking=true;q.events.push({time:s.time,code:'Space'});}}
   const el=document.querySelector('.stick-pad');if(el){const r=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.__us1549Pointer,pointerType:'mouse',clientX:r.x+(roll+1)*r.width/2,clientY:r.y+(pitch+1)*r.height/2,buttons:1,bubbles:true}));}
   if(!q.samples.length||s.time-q.samples.at(-1).time>=1)q.samples.push({time:s.time,x:s.x,y:s.y,z:s.z,pitch:s.pitch,roll:s.roll,speed:s.speed,water:s.water?.phase,alternate:s.historical.alternate?.runway,flaps:s.flaps,gear:s.gear,input:s.recordedInput});
  }
  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
}
