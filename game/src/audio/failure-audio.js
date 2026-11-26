// The overlap, carrier distortion and siren are baked at normal speech speed.
// One media element gives exact pause/seek, bounded memory and no timed sources
// left playing after retry, menu navigation or a replay loop.
export class FailureAudio{
 constructor(){this.media=typeof Audio==='undefined'?null:new Audio();if(this.media){this.media.preload='auto';this.media.crossOrigin='anonymous';}this.id=null;this.plan=null;this.sourceChanges=0;this.playRequests=0;this.blocked=false;this.failed=false;this.pending=false;this.serial=0;}
 connect(context){if(!this.media||this.source)return;this.context=context;this.source=context.createMediaElementSource(this.media);this.gain=context.createGain();this.gain.gain.value=0;this.analyser=context.createAnalyser();this.analyser.fftSize=512;this.samples=new Float32Array(512);this.source.connect(this.gain);this.gain.connect(this.analyser);this.analyser.connect(context.destination);}
 prepare(plan){
  if(!this.media||!plan||this.id===plan.id)return;
  this.stop();this.id=plan.id;this.plan=plan;this.failed=false;this.blocked=false;this.sourceChanges++;
  const serial=++this.serial;this.media.onerror=()=>{if(this.serial===serial)this.failed=true;};this.media.src=plan.src;this.media.playbackRate=1;this.media.volume=this.context?1:.8;this.media.load();
 }
 update(plan,{audible=true,muted=false}={}){
  if(!plan?.active){this.stop();return;}this.prepare(plan);if(!this.media)return;
  const want=audible&&!muted&&!plan.paused&&!plan.mediaBypass&&plan.started&&plan.elapsed<plan.asset.duration&&!this.failed&&!this.blocked;
  if(this.gain)this.gain.gain.value=want?.88:0;
  this.media.muted=muted;
  if(!want){this.pause();return;}
  if(this.media.paused&&!this.pending&&this.media.readyState>=2){
   if(Math.abs(this.media.currentTime-plan.elapsed)>.12)this.media.currentTime=Math.min(plan.elapsed,Math.max(0,plan.asset.duration-.03));
   this.media.playbackRate=1;this.pending=true;this.playRequests++;const serial=this.serial;
   this.media.play()?.then(()=>{if(this.serial===serial){this.pending=false;this.blocked=false;}}).catch(error=>{if(this.serial===serial){this.pending=false;this.blocked=error?.name!=='AbortError';}});
  }
 }
 pause(){if(this.gain)this.gain.gain.value=0;this.media?.pause();}
 stop(){if(!this.id)return;this.id=null;this.plan=null;this.pending=false;this.serial++;this.pause();this.media.onerror=null;this.media.removeAttribute('src');this.media.load();}
 state(muted=false){const a=this.media;return{ready:!!a&&a.readyState>=2,playing:!!a&&!a.paused&&!a.ended,elapsed:a?.currentTime||0,ended:!!a?.ended,bypass:muted||!a||this.failed||this.blocked||!!this.context&&this.context.state!=='running'};}
 stats(){let rms=0;if(this.analyser){this.analyser.getFloatTimeDomainData(this.samples);rms=Math.sqrt(this.samples.reduce((n,v)=>n+v*v,0)/this.samples.length);}const elapsed=this.media?.currentTime||0;return{...this.state(),id:this.id,key:this.plan?.key,src:this.media?.currentSrc||'',sourceChanges:this.sourceChanges,playRequests:this.playRequests,rate:this.media?.playbackRate||1,rms,failed:this.failed,blocked:this.blocked,activeVoices:this.plan?.asset.events.filter(e=>elapsed>=e.at&&elapsed<e.at+e.duration).map(e=>({id:e.id,voice:e.voice,role:e.role,profile:e.profile}))||[]};}
 dispose(){this.stop();this.source?.disconnect();this.gain?.disconnect();this.analyser?.disconnect();}
}
