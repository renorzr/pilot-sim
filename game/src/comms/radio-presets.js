import {RadioEffects} from './radio-effects.js?v=pilot-clean-1';

// Radio presets: the game selects VHF for radio transmissions.
const PRESETS={
 radio:{high:20,low:20000,threshold:0,ratio:1,drive:0,level:1,noise:1,crackle:0,flutter:0,ptt:1},
 vhf:{high:550,low:2400,threshold:-25,ratio:8,drive:2.4,level:.72,noise:3.2,crackle:.017,flutter:0,ptt:1.8},
 static:{high:700,low:2100,threshold:-30,ratio:12,drive:3.6,level:.64,noise:6,crackle:.045,flutter:.08,ptt:2.6},
 pa:{high:180,low:6200,threshold:-18,ratio:3,drive:.6,level:.82,noise:0,crackle:0,flutter:0,ptt:0},
};

export class RadioPresets extends RadioEffects{
 constructor(context,media){
  super(context,media);this.transients=new Set();
  this.high=context.createBiquadFilter();this.high.type='highpass';this.high.Q.value=.707;
  this.low=context.createBiquadFilter();this.low.type='lowpass';this.low.Q.value=.707;
  this.squeeze=context.createDynamicsCompressor();this.squeeze.knee.value=5;this.squeeze.attack.value=.002;this.squeeze.release.value=.08;
  this.saturate=context.createWaveShaper();this.saturate.oversample='2x';
  this.flutter=context.createGain();this.master=context.createGain();
  this.output.disconnect();
  this.output.connect(this.high);this.high.connect(this.low);this.low.connect(this.squeeze);this.squeeze.connect(this.saturate);this.saturate.connect(this.flutter);this.flutter.connect(this.master);this.master.connect(context.destination);this.master.connect(this.analyser);
  this.dryOutput=context.createGain();this.dryOutput.gain.value=0;this.source.connect(this.dryOutput);this.dryOutput.connect(context.destination);this.dryOutput.connect(this.analyser);
  this.wobble=context.createOscillator();this.wobble.frequency.value=11.3;
  this.wobbleDepth=context.createGain();this.wobble.connect(this.wobbleDepth);this.wobbleDepth.connect(this.flutter.gain);this.wobble.start();
  const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);let seed=20261123;
  for(let i=0;i<data.length;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   if(seed/4294967296<.00025){
    const length=Math.min(160,data.length-i);
    for(let j=0;j<length;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i+j]=(seed/2147483648-1)*(1-j/length);}
    i+=length-1;
   }
  }
  this.crackle=context.createBufferSource();this.crackle.buffer=buffer;this.crackle.loop=true;
  this.crackleFilter=context.createBiquadFilter();this.crackleFilter.type='bandpass';this.crackleFilter.frequency.value=1700;this.crackleFilter.Q.value=.7;
  this.crackleGain=context.createGain();this.crackleGain.gain.value=0;
  this.crackle.connect(this.crackleFilter);this.crackleFilter.connect(this.crackleGain);this.crackleGain.connect(context.destination);this.crackleGain.connect(this.analyser);this.crackle.start();
  this.setPreset('radio');
 }
 setPreset(name){
  this.preset=PRESETS[name]?name:'radio';const p=PRESETS[this.preset];
  this.high.frequency.value=p.high;this.low.frequency.value=p.low;this.squeeze.threshold.value=p.threshold;this.squeeze.ratio.value=p.ratio;
  let curve=null;
  if(p.drive){curve=new Float32Array(2048);for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((i/(curve.length-1)*2-1)*p.drive)/Math.tanh(p.drive);}
  this.saturate.curve=curve;this.master.gain.value=this.isDry?0:p.level;
  this.flutter.gain.value=1-p.flutter;this.wobbleDepth.gain.value=p.flutter;
 }
 setDry(value){
  if(this.isDry===!!value)return;
  this.silence();this.isDry=!!value;this.dryOutput.gain.value=this.isDry?.9:0;this.master.gain.value=this.isDry?0:PRESETS[this.preset].level;
 }
 click(end=false){
  if(this.duck===0||this.isDry||this.preset==='pa')return;
  if(this.preset==='radio'||!this.preset){super.click(end);return;}
  const c=this.context,t=c.currentTime,p=PRESETS[this.preset],source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
  source.buffer=this.buffer;filter.type='bandpass';filter.frequency.value=1800;filter.Q.value=.65;
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime((end ? .055 : .075)*p.ptt*(this.duck??1),t+.003);gain.gain.exponentialRampToValueAtTime(.0001,t+(end ? .14 : .10));
  const transient={source,filter,gain};this.transients.add(transient);
  source.connect(filter);filter.connect(gain);gain.connect(c.destination);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();this.transients.delete(transient);};source.start(t,end ? .6 : .2,end ? .16 : .12);this.clicks++;
 }
 update(live,audible,duck=1){
  if(this.isDry){this.duck=duck;this.silence();return;}
  this.duck=duck;super.update(live,audible,duck);
  const p=PRESETS[this.preset];this.carrierGain.gain.value=live ? .018*p.noise*duck : 0;this.crackleGain.gain.value=live ? p.crackle*duck : 0;
 }
 silence(){super.silence();if(this.crackleGain)this.crackleGain.gain.value=0;for(const transient of this.transients??[]){transient.gain.gain.value=0;transient.gain.disconnect();}}
 dispose(){this.silence();this.wobble.stop();this.crackle.stop();this.master.disconnect();this.dryOutput.disconnect();this.crackleGain.disconnect();super.dispose();}
}
