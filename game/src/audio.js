import {AlertAudio} from './audio/alerts.js';
import {CommsPlayback} from './comms/playback.js';
import {FlightSoundscape} from './audio/soundscape.js';
import {FailureAudio} from './audio/failure-audio.js';
export class EngineAudio {
  constructor() { this.context = null; this.muted = false;this.comms=new CommsPlayback();this.failure=new FailureAudio();this.rescue=new FailureAudio(); }
  async start() {
    this.comms.resume();
    this.failure.blocked=false;
    this.rescue.blocked=false;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();this.comms.connect(this.context);this.failure.connect(this.context);this.rescue.connect(this.context);
      this.soundscape=new FlightSoundscape(this.context);this.alerts=new AlertAudio(this.context,this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  update(state, playing,rate=1,listener={}) {
    if(listener.rescue)this.comms.pause();else this.comms.update(state,playing,this.muted,rate,{exterior:listener.replay||(listener.radioExterior??listener.exterior??false),replay:!!listener.replay});
    if (!this.context) return;
    const safety=!this.comms.callout.paused&&!this.comms.callout.ended;
    const radio=!this.comms.radio.paused&&!this.comms.radio.ended;
    this.alerts.update(state,playing&&!this.muted&&!listener.rescue,{duck:safety?.3:radio?.6:1,rate});
    this.soundscape.update(state,playing&&!this.muted,{duck:safety?.42:radio?.72:1,...listener});
  }
  say(text) {
    if(this.comms.say(text))return;
    if(!text||this.muted||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
    if(!window.speechSynthesis.getVoices().length)return;
    const voice=new SpeechSynthesisUtterance(text);voice.lang='en-US';voice.rate=1;voice.volume=.65;
    window.speechSynthesis.speak(voice);
  }
  cancelSpeech(){this.comms.pause();this.alerts?.pause();this.soundscape?.silence();this.failure.pause();this.rescue.pause();window.speechSynthesis?.cancel();}
  resetSpeech(){this.comms.reset();this.alerts?.pause();this.soundscape?.reset();this.failure.stop();this.rescue.stop();window.speechSynthesis?.cancel();}
  prepareRescue(plan){this.comms.reset();this.rescue.prepare(plan);window.speechSynthesis?.cancel();}
  updateRescue(plan,visible=true){this.rescue.update(plan,{audible:visible,muted:this.muted});}
  rescuePlaybackState(){return this.rescue.state(this.muted);}
  stopRescue(){this.rescue.stop();}
  prepareFailure(plan){this.failure.prepare(plan);}
  updateFailure(plan,visible=true){this.failure.update(plan,{audible:visible,muted:this.muted});}
  failurePlaybackState(){return this.failure.state(this.muted);}
  stopFailure(){this.failure.stop();}
  radioPlaybackState(){const media=this.comms.radioPlaybackState();return{...media,bypass:this.muted||this.context?.state!=='running'||this.comms.blocked||media.failed};}
  stats(){return {...this.comms.stats(),soundscape:this.soundscape?.stats(),alerts:this.alerts?.stats(),failure:this.failure.stats(),rescue:this.rescue.stats()};}
  dispose() { this.comms.dispose();this.alerts?.dispose();this.soundscape?.dispose();this.cancelSpeech();this.failure.dispose();this.rescue.dispose();this.context?.close(); }
}
