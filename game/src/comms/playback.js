import {clipUrl,calloutClip} from './radio.js';
import {RadioPresets} from './radio-presets.js';
import {radioVoiceFor} from './pilot-voices.js';
import {radioPhrasePlan,radioPhrasePrefetch,phraseSourceUrl,RADIO_PHRASE_VERSION} from './phrases.js';
import {PhraseAudioCache} from './phrase-audio.js';
import {siteUrl} from '../urls.js';
export class CommsPlayback {
 constructor(){this.radio=new Audio();this.callout=new Audio();this.radio.preload=this.callout.preload='auto';this.key=null;this.blocked=false;this.played=0;this.running=false;this.requests=new WeakSet();
  this.mediaEvents=['playing','pause','ended','emptied','loadeddata','canplay','waiting'];this.onRadioEvent=()=>this.updateEffects();
  for(const event of this.mediaEvents)this.radio.addEventListener?.(event,this.onRadioEvent);
 }
 connect(context){if(!this.effects){this.effects=new RadioPresets(context,this.radio);this.effects.setPreset('vhf');this.phrases=new PhraseAudioCache();}}
 sourceFor(line,actor,{replay=false}={}){
  const original=clipUrl(line.clip,this.language,actor,line.role==='pilot'?'clean':'radio');
  this.assembly='original';this.phraseCount=0;this.sourceUrl=original;
  const plan=this.phrases&&radioPhrasePlan(line.clip,this.language,actor);
  if(!plan)return original;
  const recorded=replay&&line.audioSource?.language===this.language&&line.audioSource?.actor===plan.actor?line.audioSource:null;
  if(recorded?.kind==='whole'){
   this.assembly='recorded-whole';this.sourceUrl=siteUrl(`${recorded.file}?v=${recorded.sha256.slice(0,16)}`);return this.sourceUrl;
  }
  const ready=plan.parts.length?this.phrases.ready(plan):null;
  const backup=plan.fallback??plan.source;
  this.sourceUrl=phraseSourceUrl({...plan,source:backup});this.phraseCount=plan.parts.length;
  if(plan.parts.length)this.phrases.warm([plan]);
  this.assembly=ready?'phrases':plan.fallback?'phrases-file':plan.parts.length?'source-loading':'shared-whole';
  // Record only the audio choice, without changing any flight state or timing.
  // Replays keep the original whole take if it played during a cold download.
  if(!replay)line.audioSource={...(!ready?backup:{}),kind:ready?'phrases':'whole',version:RADIO_PHRASE_VERSION,language:this.language,actor:plan.actor};
  return ready||this.sourceUrl;
 }
 updateEffects(){this.effects?.update(this.running&&this.hasRadioLine&&!this.radio.paused&&!this.radio.ended&&this.radio.readyState>=2,this.running,this.radio.volume/.7);}
 play(media){
  if(!media.paused||media.ended||this.requests.has(media)||this.blocked)return;
  this.requests.add(media);const p=media.play();
  p?.then(()=>{this.played++;}).catch(e=>{if(e.name==='NotAllowedError')this.blocked=true;}).finally(()=>this.requests.delete(media));
 }
 update(s,playing,muted,rate=1,{exterior=false,replay=false}={}){
  const domain=replay?`${s.replayAudio?.segment}:${s.replayAudio?.attempt}:${s.replayAudio?.cycle??0}:${s.replayAudio?.epoch??0}`:null;
  const seek=replay&&(this.replayDomain!==domain||playing&&!muted&&!this.running||this.simTime!==undefined&&(s.time<this.simTime-1e-5||s.time-this.simTime>.8));
  this.replayDomain=domain;
  this.simTime=s.time;this.running=playing&&!muted;
  this.language=s.radio?.language||'zh';
  this.pilotVoice=s.radio?.pilotVoice??null;
  this.towerVoice=s.radio?.towerVoice??null;
  this.copilotVoice=s.radio?.copilotVoice??null;
  if(this.phrases&&!s.historical){
   const warmKey=[this.language,this.pilotVoice,this.towerVoice,s.airportId,!!s.airline].join(':');
   const imminent=[s.radio?.active,...s.radio?.pending?.slice(0,4)||[]].filter(Boolean).map(l=>radioPhrasePlan(l.clip,this.language,this.language==='zh'?l.speakerVoice??radioVoiceFor(s.radio,l.role):null));
   this.phrases.warm(imminent);
   if(this.warmKey!==warmKey){this.warmKey=warmKey;this.phrases.warm(radioPhrasePrefetch(s));}
  }
  const line=s.radio?.active,actor=this.language==='zh'?line?.speakerVoice??radioVoiceFor(s.radio,line?.role):null;
  const internal=line?.channel==='intercom'||line?.role==='copilot',pa=line?.channel==='pa';
  this.hasRadioLine=!!line;this.cleanPilot=internal||line?.role==='pilot'&&!exterior&&!pa;
  const preset=pa?'pa':'vhf';if(this.effects?.preset!==preset)this.effects?.setPreset?.(preset);this.effects?.setDry?.(this.cleanPilot);this.radioEmergencyPilot=!!line?.emergency&&line.role==='pilot';const key=line?`${this.language}:${actor??''}:${line.id}:${line.clip}:${line.started}`:null;
  this.radioLine=line?{clip:line.clip,started:line.started}:null;
  if(key!==this.key||seek){this.radio.pause();this.key=key;this.mediaMissing=false;if(line){const url=this.sourceFor(line,actor,{replay});this.phrases?.protect(url);if(url){this.radio.src=url;this.radio.currentTime=replay?Math.max(0,s.time-line.started)*(s.radio?.presentationRate||1):0;}else{this.mediaMissing=true;this.radio.removeAttribute('src');}}else{this.radio.removeAttribute('src');this.phrases?.protect(null);this.assembly=null;this.sourceUrl=null;this.phraseCount=0;}}
  this.radio.playbackRate=rate*(s.radio?.presentationRate||1);this.callout.playbackRate=rate;
  this.radio.muted=this.callout.muted=muted;
  if(this.callout.src.includes('/call-stall.mp3')&&!s.stallWarning?.active){this.callout.pause();this.callout.removeAttribute('src');this.callout.load?.();this.calloutPriority=0;}
  this.radio.volume=((this.callout.paused||this.callout.ended)?0.7:0.15)*(internal&&exterior&&!replay?(s.historical?.mode==='challenge'?0:.55):1);this.callout.volume=.85;
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
 reset(){this.pause();this.key=null;this.replayDomain=null;this.simTime=undefined;this.hasRadioLine=false;this.radioLine=null;this.calloutPriority=0;this.assembly=null;this.sourceUrl=null;this.phraseCount=0;this.warmKey=null;this.phrases?.protect(null);this.radio.removeAttribute('src');this.callout.removeAttribute('src');this.radio.load?.();this.callout.load?.();}
 stats(){return{language:this.language,pilotVoice:this.pilotVoice,towerVoice:this.towerVoice,copilotVoice:this.copilotVoice,mediaMissing:!!this.mediaMissing,radioClip:this.radioLine?.clip??null,radioAssembly:this.assembly??null,radioPhraseCount:this.phraseCount||0,radioSourceUrl:this.sourceUrl??null,radioPhraseCache:this.phrases?.stats()??null,radioEffect:!!this.effects&&!this.cleanPilot,radioPreset:this.cleanPilot?'dry':this.effects?.preset??null,radioSignalRms:this.effects?.level()||0,radioVolume:this.radio.volume,calloutPriority:this.calloutPriority||0,calloutTime:this.callout.currentTime,calloutDuration:Number.isFinite(this.callout.duration)?this.callout.duration:0,calloutPaused:this.callout.paused,carrierGain:this.effects?.carrierGain.gain.value||0,crackleGain:this.effects?.crackleGain.gain.value||0,pttClicks:this.effects?.clicks||0,radioSrc:this.radio.currentSrc,radioTime:this.radio.currentTime,radioPlaybackRate:this.radio.playbackRate,radioDuration:Number.isFinite(this.radio.duration)?this.radio.duration:0,radioPaused:this.radio.paused,radioReadyState:this.radio.readyState,radioEnded:this.radio.ended,contextState:this.effects?.context.state,calloutSrc:this.callout.currentSrc,played:this.played,blocked:this.blocked};}
 dispose(){this.reset();for(const event of this.mediaEvents)this.radio.removeEventListener?.(event,this.onRadioEvent);this.effects?.dispose();this.phrases?.dispose();}
}
