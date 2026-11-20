import {CommsPlayback} from './comms/playback.js';
import {FlightSoundscape} from './audio/soundscape.js';
export class EngineAudio {
  constructor() { this.context = null; this.muted = false;this.comms=new CommsPlayback(); }
  async start() {
    this.comms.resume();
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();this.comms.connect(this.context);
      this.soundscape=new FlightSoundscape(this.context);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  update(state, playing,rate=1) {
    this.comms.update(state,playing,this.muted,rate);
    if (!this.context) return;
    const safety=!this.comms.callout.paused&&!this.comms.callout.ended;
    const radio=!this.comms.radio.paused&&!this.comms.radio.ended;
    this.soundscape.update(state,playing&&!this.muted,{duck:safety?.42:radio?.72:1});
  }
  say(text) {
    if(this.comms.say(text))return;
    if(!text||this.muted||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
    if(!window.speechSynthesis.getVoices().length)return;
    const voice=new SpeechSynthesisUtterance(text);voice.lang='en-US';voice.rate=1;voice.volume=.65;
    window.speechSynthesis.speak(voice);
  }
  cancelSpeech(){this.comms.pause();this.soundscape?.silence();window.speechSynthesis?.cancel();}
  resetSpeech(){this.comms.reset();this.soundscape?.reset();window.speechSynthesis?.cancel();}
  stats(){return {...this.comms.stats(),soundscape:this.soundscape?.stats()};}
  dispose() { this.comms.dispose();this.soundscape?.dispose();this.cancelSpeech();this.context?.close(); }
}
