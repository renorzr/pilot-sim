import {clipUrl,calloutClip} from './radio.js';
import {RadioPresets} from './radio-presets.js';
import {radioVoiceFor} from './pilot-voices.js';
export class CommsPlayback {
 constructor(){this.radio=new Audio();this.callout=new Audio();this.radio.preload=this.callout.preload='auto';this.key=null;this.blocked=false;this.played=0;this.running=false;this.requests=new WeakSet();
  this.mediaEvents=['playing','pause','ended','emptied','loadeddata','canplay','waiting'];this.onRadioEvent=()=>this.updateEffects();
  for(const event of this.mediaEvents)this.radio.addEventListener?.(event,this.onRadioEvent);
 }
 connect(context){if(!this.effects){this.effects=new RadioPresets(context,this.radio);this.effects.setPreset('vhf');}}
 updateEffects(){this.effects?.update(this.running&&this.hasRadioLine&&!this.radio.paused&&!this.radio.ended&&this.radio.readyState>=2,this.running,this.radio.volume/.7);}
 play(media){
  if(!media.paused||media.ended||this.requests.has(media)||this.blocked)return;
  this.requests.add(media);const p=media.play();
  p?.then(()=>{this.played++;}).catch(e=>{if(e.name==='NotAllowedError')this.blocked=true;}).finally(()=>this.requests.delete(media));
 }
 update(s,playing,muted,rate=1,{exterior=false}={}){
  this.simTime=s.time;this.running=playing&&!muted;
  this.language=s.radio?.language||'zh';
  this.pilotVoice=s.radio?.pilotVoice??null;
  this.towerVoice=s.radio?.towerVoice??null;
  this.copilotVoice=s.radio?.copilotVoice??null;
  const line=s.radio?.active,actor=this.language==='zh'?radioVoiceFor(s.radio,line?.role):null;
  const internal=line?.channel==='intercom'||line?.role==='copilot',pa=line?.channel==='pa';
  this.hasRadioLine=!!line;this.cleanPilot=internal||line?.role==='pilot'&&!exterior&&!pa;
  const preset=pa?'pa':'vhf';if(this.effects?.preset!==preset)this.effects?.setPreset?.(preset);this.effects?.setDry?.(this.cleanPilot);this.radioEmergencyPilot=!!line?.emergency&&line.role==='pilot';const key=line?`${this.language}:${actor??''}:${line.id}:${line.clip}:${line.started}`:null;
  this.radioLine=line?{clip:line.clip,started:line.started}:null;
  if(key!==this.key){this.radio.pause();this.key=key;this.mediaMissing=false;if(line){const url=clipUrl(line.clip,this.language,actor,line.role==='pilot'?'clean':'radio');if(url){this.radio.src=url;this.radio.currentTime=0;}else{this.mediaMissing=true;this.radio.removeAttribute('src');}}else this.radio.removeAttribute('src');}
  this.radio.playbackRate=rate*(s.radio?.presentationRate||1);this.callout.playbackRate=rate;
  this.radio.muted=this.callout.muted=muted;
  if(this.callout.src.includes('/call-stall.mp3')&&!s.stallWarning?.active){this.callout.pause();this.callout.removeAttribute('src');this.callout.load?.();this.calloutPriority=0;}
  this.radio.volume=((this.callout.paused||this.callout.ended)?0.7:0.15)*(internal&&exterior?(s.historical?.mode==='challenge'?0:.55):1);this.callout.volume=.85;
  if(!this.running){this.radio.pause();this.callout.pause();this.effects?.silence();return;}
  // Let the media clock run. Chasing the simulation with a seek each frame
  // can repeatedly reset MP3 decoding after pause (notably without HTTP Range).
  // Pause/rate control keep normal playback aligned; stale lines are discarded
  // by the event queue instead of seeking inside an active transmission.
  if(line&&!this.mediaMissing)this.play(this.radio);
  if(this.calloutPriority>=2&&this.callout.src&&!this.callout.ended&&s.time-this.calloutStarted<Math.max(this.callout.duration||5,5))this.play(this.callout);
  this.updateEffects();
 }
 say(text){const clip=calloutClip(text);if(!clip||!this.running)return false;const priority=/call-stall/.test(clip)?4:/pull-up|wind-shear|all-engines/.test(clip)?3:/terrain|engine-one/.test(clip)?2:1;if(this.radioEmergencyPilot&&/^(call-h[0-9]|call-ap-on|call-checklist)/.test(clip))return true;if(!this.callout.paused&&!this.callout.ended&&priority<(this.calloutPriority||0))return true;this.calloutPriority=priority;this.calloutStarted=this.simTime||0;this.callout.pause();this.callout.src=clipUrl(clip);this.callout.currentTime=0;this.play(this.callout);return true;}
 resume(){this.blocked=false;}
 radioPlaybackState(){return{...this.radioLine,ended:this.radio.ended,failed:!!this.radio.error,rate:this.radio.playbackRate};}
 pause(){this.radio.pause();this.callout.pause();this.effects?.silence();}
 reset(){this.pause();this.key=null;this.hasRadioLine=false;this.radioLine=null;this.calloutPriority=0;this.radio.removeAttribute('src');this.callout.removeAttribute('src');this.radio.load?.();this.callout.load?.();}
 stats(){return{language:this.language,pilotVoice:this.pilotVoice,towerVoice:this.towerVoice,copilotVoice:this.copilotVoice,mediaMissing:!!this.mediaMissing,radioEffect:!!this.effects&&!this.cleanPilot,radioPreset:this.cleanPilot?'dry':this.effects?.preset??null,radioSignalRms:this.effects?.level()||0,radioVolume:this.radio.volume,calloutPriority:this.calloutPriority||0,calloutTime:this.callout.currentTime,calloutDuration:Number.isFinite(this.callout.duration)?this.callout.duration:0,calloutPaused:this.callout.paused,carrierGain:this.effects?.carrierGain.gain.value||0,crackleGain:this.effects?.crackleGain.gain.value||0,pttClicks:this.effects?.clicks||0,radioSrc:this.radio.currentSrc,radioTime:this.radio.currentTime,radioPlaybackRate:this.radio.playbackRate,radioDuration:Number.isFinite(this.radio.duration)?this.radio.duration:0,radioPaused:this.radio.paused,radioReadyState:this.radio.readyState,radioEnded:this.radio.ended,contextState:this.effects?.context.state,calloutSrc:this.callout.currentSrc,played:this.played,blocked:this.blocked};}
 dispose(){this.reset();for(const event of this.mediaEvents)this.radio.removeEventListener?.(event,this.onRadioEvent);this.effects?.dispose();}
}
