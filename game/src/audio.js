import {CommsPlayback} from './comms/playback.js';
import {FlightSoundscape} from './audio/soundscape.js';
import {FailureAudio} from './audio/failure-audio.js';
export class EngineAudio {
  constructor() { this.context = null; this.muted = false;this.comms=new CommsPlayback();this.failure=new FailureAudio(); }
  async start() {
    this.comms.resume();
    this.failure.blocked=false;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();this.comms.connect(this.context);this.failure.connect(this.context);
      this.soundscape=new FlightSoundscape(this.context);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  update(state, playing,rate=1,listener={}) {
    if(!listener.replay)this.comms.update(state,playing,this.muted,rate,{exterior:listener.radioExterior??listener.exterior??false});
    if (!this.context) return;
    const safety=!this.comms.callout.paused&&!this.comms.callout.ended;
    const radio=!this.comms.radio.paused&&!this.comms.radio.ended;
    this.soundscape.update(state,playing&&!this.muted,{duck:safety?.42:radio?.72:1,...listener});
  }
  say(text) {
    if(this.comms.say(text))return;
    if(!text||this.muted||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
    if(!window.speechSynthesis.getVoices().length)return;
    const voice=new SpeechSynthesisUtterance(text);voice.lang='en-US';voice.rate=1;voice.volume=.65;
    window.speechSynthesis.speak(voice);
  }
  cancelSpeech(){this.comms.pause();this.soundscape?.silence();this.failure.pause();window.speechSynthesis?.cancel();}
  resetSpeech(){this.comms.reset();this.soundscape?.reset();this.failure.stop();window.speechSynthesis?.cancel();}
  prepareFailure(plan){this.failure.prepare(plan);}
  updateFailure(plan,visible=true){this.failure.update(plan,{audible:visible,muted:this.muted});}
  failurePlaybackState(){return this.failure.state(this.muted);}
  stopFailure(){this.failure.stop();}
  radioPlaybackState(){const media=this.comms.radioPlaybackState();return{...media,bypass:this.muted||this.context?.state!=='running'||this.comms.blocked||media.failed};}
  stats(){return {...this.comms.stats(),soundscape:this.soundscape?.stats(),failure:this.failure.stats()};}
  dispose() { this.comms.dispose();this.soundscape?.dispose();this.cancelSpeech();this.failure.dispose();this.context?.close(); }
}
