// Sound follows actual engine/contact state; it never changes flight dynamics.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function soundTargets(s){
 const speed=Math.max(0,s.airData?.tas??s.speed??0),groundSpeed=Math.max(0,s.airData?.groundSpeed??0);
 const running=s.engines.filter(e=>e.status==='running').length,thrust=s.thrust??s.throttle;
 const reversing=s.engines.filter(e=>e.status==='running'&&s.reverse&&s.landed&&s.throttle<.025&&e.thrustN<0);
 return {
  // The old normal sound already contains speed-dependent airflow. A separate
  // wind layer only replaces that airflow as the engine bed shuts down.
  wind:.032*clamp(speed/100,0,1.6)**1.4*(1-running/2),
  engineGain:.11+thrust*.25,engineCutoff:350+thrust*1100+(s.speed||0)*4,engineNoise:running/2,
  reverseBoost:1+Math.max(0,...reversing.map(e=>1.4*Math.sqrt(clamp(e.spool)))),
  ground:!s.airborne&&!s.impact ? .095*clamp(groundSpeed/75,0,1.3):0,
  engines:s.engines.map(e=>{
   const running=e.status==='running',spool=clamp(e.spool),reverse=running&&s.reverse&&s.landed&&s.throttle<.025&&e.thrustN<0;
   return {running,rumble:running?.5:0,fan:running?.015+e.spool*.035:0,
    frequency:48+e.n1*.75,reverse:reverse?1.4*Math.sqrt(spool):0};
  }),
 };
}

// Consume transitions even while muted/paused. Restoring a checkpoint must not
// replay an old impact; a new touchdown after a touch-and-go gets a fresh sound.
export class ContactSounds {
 constructor(){this.reset();}
 reset(){this.last=null;}
 update(s){
  const current={time:s.time,touchdown:s.touchdown?.time??null,nose:s.cabin?.noseAt??null};
  const last=this.last;this.last=current;
  if(!last||current.time<last.time)return [];
  const events=[];
  if(current.touchdown!==null&&current.touchdown!==last.touchdown&&s.time-current.touchdown<.6)
   events.push({kind:'main',strength:clamp((s.touchdown.descent||0)/3,.22,1.3)});
  if(current.nose!==null&&current.nose!==last.nose&&s.time-current.nose<.6)events.push({kind:'nose',strength:.24});
  return events;
 }
}

function noiseBuffer(context){
 const buffer=context.createBuffer(1,context.sampleRate*3,context.sampleRate),data=buffer.getChannelData(0);
 let seed=320;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
 return buffer;
}
function meter(context,destination){const node=context.createAnalyser();node.fftSize=1024;node.connect(destination);return node;}
function rms(node){const data=new Float32Array(node.fftSize);node.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length);}
const target=(param,value,time,lag=.12)=>param.setTargetAtTime(value,time,lag);
function originalNoiseBuffer(context){
 const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),samples=buffer.getChannelData(0);
 let last=0;
 // Restored verbatim from before touchdown/reverse effects were introduced.
 for(let i=0;i<samples.length;i++){last=(last+(Math.random()*2-1)*.035)/1.02;samples[i]=last*3.5;}
 return buffer;
}

export class FlightSoundscape {
 constructor(context){
  this.context=context;this.contacts=new ContactSounds();this.impacts=new Set();this.counts={main:0,nose:0};this.sources=[];
  this.master=context.createGain();this.master.gain.value=0;
  this.limiter=context.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.ratio.value=5;
  this.master.connect(this.limiter);this.output=meter(context,context.destination);this.limiter.connect(this.output);
  this.buffer=noiseBuffer(context);
  this.engineGain=context.createGain();this.engineGain.gain.value=0;
  this.reverseGain=context.createGain();this.reverseGain.gain.value=1;
  this.engineGain.connect(this.reverseGain);this.reverseGain.connect(this.output);
  this.engineNoise=this.noise('lowpass',600,this.engineGain,0,originalNoiseBuffer(context));
  this.engineNoise.filter.Q.value=1; // Original BiquadFilter default.
  this.engineNoise.gain.gain.value=1;
  this.wind=this.noise('highpass',480,this.master);this.ground=this.noise('lowpass',170,this.master);
  this.engines=[0,1].map(i=>{
   const panner=context.createStereoPanner();panner.pan.value=i?.65:-.65;
   const output=meter(context,this.engineGain);panner.connect(output);
   const osc=context.createOscillator(),tone=context.createGain();osc.type='sine';osc.frequency.value=55;tone.gain.value=0;
   osc.connect(tone);tone.connect(panner);osc.start();this.sources.push(osc);
   return {panner,output,osc,tone};
  });
 }
 noise(type,frequency,destination,offset=0,buffer=this.buffer){
  const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
  source.buffer=buffer;source.loop=true;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.6;gain.gain.value=0;
  const output=meter(c,destination);source.connect(filter);filter.connect(gain);gain.connect(output);source.start(0,offset);this.sources.push(source);
  return {source,filter,gain,output};
 }
 impact({kind,strength}){
  strength*=2;
  const c=this.context,t=c.currentTime,duration=kind==='main'?.7:.32;
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),envelope=c.createGain(),osc=c.createOscillator(),tone=c.createGain();
  source.buffer=this.buffer;filter.type='lowpass';filter.frequency.value=kind==='main'?850:420;
  envelope.gain.setValueAtTime(.001,t);envelope.gain.linearRampToValueAtTime(strength*.65,t+.008);envelope.gain.exponentialRampToValueAtTime(.001,t+duration);
  source.connect(filter);filter.connect(envelope);envelope.connect(this.master);
  osc.frequency.setValueAtTime(kind==='main'?90:110,t);osc.frequency.exponentialRampToValueAtTime(34,t+duration);
  tone.gain.setValueAtTime(strength*.15,t);tone.gain.exponentialRampToValueAtTime(.001,t+duration);
  osc.connect(tone);tone.connect(this.master);
  const voice={source,osc,envelope,tone,stop:()=>{source.stop();osc.stop();}};this.impacts.add(voice);this.counts[kind]++;
  source.onended=()=>{this.impacts.delete(voice);source.disconnect();filter.disconnect();envelope.disconnect();osc.disconnect();tone.disconnect();};
  source.start(t);osc.start(t);source.stop(t+duration);osc.stop(t+duration);
 }
 update(s,audible,{duck=1,exterior=false,distance=85,pan=1}={}){
  const t=this.context.currentTime,previousTime=this.contacts.last?.time;
  if(previousTime!==undefined&&s.time<previousTime)this.stopImpacts();
  const events=this.contacts.update(s);this.targets=soundTargets(s);this.audible=audible;const distanceGain=exterior?Math.min(1.35,80/Math.max(45,distance)):1;this.listener={exterior,distance,gain:distanceGain};
  target(this.master.gain,audible?.7*duck:0,t,.025);
  target(this.engineGain.gain,audible?this.targets.engineGain*duck*distanceGain:0,t,audible?.2:.008);
  target(this.reverseGain.gain,this.targets.reverseBoost,t,.2);
  target(this.engineNoise.gain.gain,this.targets.engineNoise,t,this.targets.engineNoise<1?.08:.2);
  target(this.engineNoise.filter.frequency,this.targets.engineCutoff,t,.25);
  target(this.wind.gain.gain,this.targets.wind,t);target(this.ground.gain.gain,this.targets.ground,t);
  target(this.wind.filter.frequency,400+Math.max(0,s.speed||0)*5,t);
  this.engines.forEach((v,i)=>{const e=this.targets.engines[i];
   target(v.panner.pan,(i?.65:-.65)*(exterior?pan:1),t,.1);target(v.tone.gain,e.fan,t,e.running?.3:.08);target(v.osc.frequency,e.frequency,t,.2);
  });
  if(!audible)this.stopImpacts();else events.forEach(event=>this.impact(event));
 }
 stopImpacts(){for(const voice of this.impacts)voice.stop();this.impacts.clear();}
 silence(){
  // User mute/pause should not wait for the next (possibly slow WebGL) frame.
  const t=this.context.currentTime;this.audible=false;
  this.master.gain.cancelScheduledValues(t);this.master.gain.setTargetAtTime(0,t,.008);this.stopImpacts();
  this.engineGain.gain.cancelScheduledValues(t);this.engineGain.gain.setTargetAtTime(0,t,.008);
 }
 reset(){this.contacts.reset();this.silence();this.targets=null;this.counts={main:0,nose:0};}
 stats(){return {audible:!!this.audible,masterGain:this.master.gain.value,outputRms:rms(this.output),
  windRms:rms(this.wind.output),groundRms:rms(this.ground.output),engineNoiseRms:rms(this.engineNoise.output),engineGain:this.engineGain.gain.value,reverseBoost:this.reverseGain.gain.value,targets:this.targets,
  engines:this.engines.map(v=>({rms:rms(v.output),fanGain:v.tone.gain.value})),
  listener:this.listener,contacts:{...this.counts},activeImpacts:this.impacts.size};}
 dispose(){this.reset();for(const source of this.sources){source.stop();source.disconnect();}this.engineGain.disconnect();this.reverseGain.disconnect();this.master.disconnect();this.limiter.disconnect();this.output.disconnect();}
}
