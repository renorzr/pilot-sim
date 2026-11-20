// Sound follows actual engine/contact state; it never changes flight dynamics.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function soundTargets(s){
 const speed=Math.max(0,s.airData?.tas??s.speed??0),groundSpeed=Math.max(0,s.airData?.groundSpeed??0);
 return {
  wind:.055*clamp(speed/100,0,1.6)**1.4,
  ground:!s.airborne&&!s.impact ? .095*clamp(groundSpeed/75,0,1.3):0,
  engines:s.engines.map(e=>{
   const running=e.status==='running',spool=clamp(e.spool),reverse=running&&s.reverse&&s.landed&&s.throttle<.025&&e.thrustN<0;
   return {running,rumble:running?.10+.18*spool:0,fan:running?.010+.022*Math.sqrt(spool):0,
    frequency:45+clamp(e.n1,0,110)*1.1,cutoff:140+spool*420,reverse:reverse?.30*Math.sqrt(spool):0};
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

export class FlightSoundscape {
 constructor(context){
  this.context=context;this.contacts=new ContactSounds();this.impacts=new Set();this.counts={main:0,nose:0};this.sources=[];
  this.master=context.createGain();this.master.gain.value=0;
  this.limiter=context.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.ratio.value=5;
  this.master.connect(this.limiter);this.output=meter(context,context.destination);this.limiter.connect(this.output);
  this.buffer=noiseBuffer(context);
  this.wind=this.noise('highpass',480,this.master);this.ground=this.noise('lowpass',170,this.master);
  this.engines=[-.55,.55].map((pan,i)=>{
   const panner=context.createStereoPanner();panner.pan.value=pan;
   const output=meter(context,this.master);panner.connect(output);
   const rumble=this.noise('lowpass',200,panner,i*.73);
   const reverse=this.noise('bandpass',950,panner,i*.41+.2);reverse.filter.Q.value=.55;
   const osc=context.createOscillator(),fan=context.createGain();osc.type='sine';fan.gain.value=0;
   osc.connect(fan);fan.connect(panner);osc.start();this.sources.push(osc);
   return {panner,output,rumble,reverse,osc,fan};
  });
 }
 noise(type,frequency,destination,offset=0){
  const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
  source.buffer=this.buffer;source.loop=true;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.6;gain.gain.value=0;
  const output=meter(c,destination);source.connect(filter);filter.connect(gain);gain.connect(output);source.start(0,offset);this.sources.push(source);
  return {source,filter,gain,output};
 }
 impact({kind,strength}){
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
 update(s,audible,{duck=1}={}){
  const t=this.context.currentTime,previousTime=this.contacts.last?.time;
  if(previousTime!==undefined&&s.time<previousTime)this.stopImpacts();
  const events=this.contacts.update(s);this.targets=soundTargets(s);this.audible=audible;
  target(this.master.gain,audible?.7*duck:0,t,.025);
  target(this.wind.gain.gain,this.targets.wind,t);target(this.ground.gain.gain,this.targets.ground,t);
  target(this.wind.filter.frequency,400+Math.max(0,s.speed||0)*5,t);
  this.engines.forEach((v,i)=>{const e=this.targets.engines[i];
   target(v.rumble.gain.gain,e.rumble,t,e.running?.18:.08);target(v.rumble.filter.frequency,e.cutoff,t,.2);
   target(v.fan.gain,e.fan,t,e.running?.18:.08);target(v.osc.frequency,e.frequency,t,.2);
   target(v.reverse.gain.gain,e.reverse,t,.18);
  });
  if(!audible)this.stopImpacts();else events.forEach(event=>this.impact(event));
 }
 stopImpacts(){for(const voice of this.impacts)voice.stop();this.impacts.clear();}
 reset(){this.contacts.reset();this.stopImpacts();this.counts={main:0,nose:0};}
 stats(){return {audible:!!this.audible,masterGain:this.master.gain.value,outputRms:rms(this.output),
  windRms:rms(this.wind.output),groundRms:rms(this.ground.output),targets:this.targets,
  engines:this.engines.map(v=>({rms:rms(v.output),reverseRms:rms(v.reverse.output),rumbleGain:v.rumble.gain.gain.value,fanGain:v.fan.gain.value})),
  contacts:{...this.counts},activeImpacts:this.impacts.size};}
 dispose(){this.reset();for(const source of this.sources){source.stop();source.disconnect();}this.master.disconnect();this.limiter.disconnect();this.output.disconnect();}
}
