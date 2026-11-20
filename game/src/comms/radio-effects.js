// Radio-only signal chain: callouts stay clean. Carrier opens only during a
// transmission; pause/mute/menus cannot leave a hiss running in the cockpit.
export class RadioEffects{
 constructor(context,media){
  this.context=context;this.open=false;this.clicks=0;
  const source=context.createMediaElementSource(media),band=context.createBiquadFilter(),compressor=context.createDynamicsCompressor();
  band.type='bandpass';band.frequency.value=1550;band.Q.value=.65;
  compressor.threshold.value=-28;compressor.knee.value=10;compressor.ratio.value=5;compressor.attack.value=.003;compressor.release.value=.12;
  const shaper=context.createWaveShaper(),curve=new Float32Array(1024);for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((i/(curve.length-1)*2-1)*2.1)*.7;shaper.curve=curve;
  this.output=context.createGain();this.output.gain.value=.9;source.connect(band);band.connect(compressor);compressor.connect(shaper);shaper.connect(this.output);this.output.connect(context.destination);
  const buffer=context.createBuffer(1,context.sampleRate,context.sampleRate),data=buffer.getChannelData(0);let seed=0x320;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
  this.analyser=context.createAnalyser();this.analyser.fftSize=512;this.samples=new Float32Array(512);this.output.connect(this.analyser);
  this.buffer=buffer;this.carrier=context.createBufferSource();this.carrier.buffer=buffer;this.carrier.loop=true;
  const filter=context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=2100;filter.Q.value=.8;
  this.carrierGain=context.createGain();this.carrierGain.gain.value=0;this.carrier.connect(filter);filter.connect(this.carrierGain);this.carrierGain.connect(context.destination);this.carrierGain.connect(this.analyser);this.carrier.start();
 }
 click(end=false){
  const c=this.context,t=c.currentTime,source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter();source.buffer=this.buffer;
  filter.type='highpass';filter.frequency.value=900;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(end ? .055 : .075,t+.004);gain.gain.exponentialRampToValueAtTime(.0001,t+.07);
  source.connect(filter);filter.connect(gain);gain.connect(c.destination);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start(t,end ? .6 : .2,.08);this.clicks++;
 }
 update(live,audible,duck=1){
  const t=this.context.currentTime;
  if(live&&!this.open)this.click();if(!live&&this.open&&audible)this.click(true);
  this.open=live;
  // A paused carrier must discard its old zero-value automation before a new
  // transmission. PTT transients provide the intentional gate transition.
  this.carrierGain.gain.cancelScheduledValues(0);this.carrierGain.gain.value=live ? .018*duck : 0;
 }
 level(){this.analyser.getFloatTimeDomainData(this.samples);return Math.sqrt(this.samples.reduce((sum,x)=>sum+x*x,0)/this.samples.length);}
 silence(){this.open=false;this.carrierGain.gain.cancelScheduledValues(0);this.carrierGain.gain.value=0;}
 dispose(){this.silence();this.carrier.stop();this.output.disconnect();this.carrierGain.disconnect();}
}
