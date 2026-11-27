// A soft electronic double pulse. One shared buffer and one active source.
export function alertWave(rate=24000){
 const data=new Float32Array(Math.ceil(rate*.7));
 for(let i=0;i<data.length;i++){const t=i/rate;for(const at of[0,.23]){const u=t-at;if(u>=0&&u<.2){const envelope=Math.min(1,u/.009)*Math.min(1,(.2-u)/.04);data[i]+=(Math.sin(2*Math.PI*880*u)*.27+Math.sin(2*Math.PI*660*u)*.1)*envelope;}}}
 return{data,rate,duration:data.length/rate};
}
export function audibleAlert(s){
 if(s.result||s.water||s.presentationKind)return null;
 const candidates=(s.alerts?.items||[]).filter(v=>!v.acknowledged&&s.time>=v.started).sort((a,b)=>(b.level==='warning')-(a.level==='warning')||b.started-a.started);
 const item=candidates[0];if(!item)return null;
 const age=s.time-item.started,cycle=item.repeat?Math.floor(age/item.repeat):0,offset=age-(item.repeat?cycle*item.repeat:0);
 return offset<.7?{key:item.id+':'+cycle,item,offset}:null;
}
export class AlertAudio{
 constructor(context,destination){this.context=context;this.gain=context.createGain();this.gain.gain.value=.65;this.gain.connect(destination);this.starts=0;}
 update(s,audible,{duck=1,rate=1}={}){
  const domain=s.replayAudio?`${s.replayAudio.segment}:${s.replayAudio.attempt}:${s.replayAudio.cycle}:${s.replayAudio.epoch??0}`:null;
  if(domain!==this.domain||this.lastTime!==undefined&&s.time<this.lastTime)this.pause();
  this.domain=domain;this.lastTime=s.time;
  const cue=audible?audibleAlert(s):null;this.cue=cue;this.gain.gain.value=.65*duck;
  if(!cue){this.pause();return;}
  if(this.key===cue.key)return;
  this.pause();this.key=cue.key;
  if(!this.buffer){const w=alertWave();this.buffer=this.context.createBuffer(1,w.data.length,w.rate);this.buffer.getChannelData(0).set(w.data);}
  const source=this.context.createBufferSource();source.buffer=this.buffer;source.playbackRate.value=rate;source.connect(this.gain);this.source=source;this.starts++;
  source.onended=()=>{source.disconnect();if(this.source===source)this.source=null;};source.start(0,cue.offset);
 }
 pause(){if(this.source){const source=this.source;this.source=null;source.stop();}this.key=null;}
 stats(){return{active:!!this.source,starts:this.starts,key:this.key,alert:this.cue?.item.key??null};}
 dispose(){this.pause();this.gain.disconnect();this.buffer=null;}
}
