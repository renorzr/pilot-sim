const RATE=24000,DURATION=6.2;
// Original synthetic dull strikes and two decelerating shafts. No recordings,
// physics setters or changes to the established continuous engine bed.
export function birdStrikeWave(rate=RATE){
 const channels=[new Float32Array(Math.ceil(rate*DURATION)),new Float32Array(Math.ceil(rate*DURATION))];
 for(let side=0;side<2;side++){
  let seed=1909+side*1549,noise=0,phase=0;
  for(let i=0;i<channels[side].length;i++){
   const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise+=(seed/2147483648-1-noise)*.09;
   let hit=0;for(const at of[.025+side*.045,.145+side*.025,.265-side*.02]){const a=t-at;if(a>=0&&a<.3)hit+=(Math.sin(2*Math.PI*(80*a-35*a*a))*.68+noise*.6)*Math.min(1,a/.003)*Math.exp(-a/0.065);}
   const spin=Math.exp(-Math.max(0,t-.10)/1.35),frequency=32+(360+side*38)*spin;phase+=2*Math.PI*frequency/rate;
   const winddown=(Math.sin(phase)*.24+Math.sin(phase*2)*.055+noise*.3)*spin*Math.min(1,t/.13)*Math.min(1,(DURATION-t)/.8);
   channels[side][i]=Math.tanh(hit+winddown)*.8;
  }
 }
 return{channels,rate,duration:DURATION};
}
export function birdStrikeAge(s){
 if(!s.historical||s.historical.finalPractice||s.presentationKind||!s.engines?.some(e=>e.status==='failed'&&e.damageCause==='bird-ingestion'))return null;
 const age=s.time-(s.historical.crew?.birdAt??0);return age>=0&&age<DURATION?age:null;
}
export class BirdStrikeAudio{
 constructor(context,destination){this.context=context;this.gain=context.createGain();this.gain.gain.value=0;this.filter=context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=2400;this.analyser=context.createAnalyser();this.analyser.fftSize=512;this.samples=new Float32Array(512);this.filter.connect(this.gain);this.gain.connect(this.analyser);this.analyser.connect(destination);this.starts=0;}
 prepare(){if(!this.buffer){const wave=birdStrikeWave();this.buffer=this.context.createBuffer(2,wave.channels[0].length,wave.rate);wave.channels.forEach((data,i)=>this.buffer.getChannelData(i).set(data));}}
 update(s,audible,{exterior=false}={}){
  if(s.historical&&!s.historical.finalPractice&&s.presentationKind==='intro')this.prepare();
  const age=birdStrikeAge(s);this.age=age;this.gain.gain.value=audible&&age!==null?.9:0;this.filter.frequency.setTargetAtTime(exterior?2400:1150,this.context.currentTime,.15);
  if(!audible||age===null){this.pause();return;}
  if(this.source&&Math.abs(age-this.offset-(this.context.currentTime-this.started))>.35)this.pause();
  if(!this.source){
   this.prepare();
   const source=this.context.createBufferSource();source.buffer=this.buffer;source.connect(this.filter);this.source=source;this.started=this.context.currentTime;this.offset=age;this.starts++;source.onended=()=>{if(this.source===source)this.source=null;source.disconnect();};source.start(0,age);
  }
  this.gain.gain.value=.9;
 }
 pause(){if(this.source){const source=this.source;this.source=null;source.stop();}this.gain.gain.value=0;}
 stats(){this.analyser.getFloatTimeDomainData(this.samples);return{active:!!this.source,age:this.age,starts:this.starts,offset:this.offset,rms:Math.sqrt(this.samples.reduce((sum,v)=>sum+v*v,0)/this.samples.length)};}
 dispose(){this.pause();this.filter.disconnect();this.gain.disconnect();this.analyser.disconnect();this.buffer=null;}
}
