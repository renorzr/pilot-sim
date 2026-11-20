import {CommsPlayback} from './comms/playback.js';
export class EngineAudio {
  constructor() { this.context = null; this.muted = false;this.comms=new CommsPlayback(); }
  async start() {
    this.comms.resume();
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();this.comms.connect(this.context);
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const samples = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < samples.length; i++) { last = (last + (Math.random() * 2 - 1) * .035) / 1.02; samples[i] = last * 3.5; }
      this.noise = this.context.createBufferSource();
      this.noise.buffer = buffer; this.noise.loop = true;
      this.filter = this.context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 600;
      this.noise.connect(this.filter); this.filter.connect(this.gain); this.noise.start();
      this.engines=[-0.65,0.65].map(pan=>{
        const osc=this.context.createOscillator(),tone=this.context.createGain(),panner=this.context.createStereoPanner();
        osc.type='sine';osc.frequency.value=55;tone.gain.value=0;panner.pan.value=pan;
        osc.connect(tone);tone.connect(panner);panner.connect(this.gain);osc.start();return{osc,tone};
      });
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  update(state, playing,rate=1) {
    this.comms.update(state,playing,this.muted,rate);
    if (!this.context) return;
    const t = this.context.currentTime;
    const thrust=state.thrust??state.throttle;
    this.gain.gain.setTargetAtTime(playing && !this.muted ? .11 + thrust * .25 : 0, t, .2);
    this.filter.frequency.setTargetAtTime(350 + thrust * 1100 + state.speed * 4, t, .25);
    this.engines.forEach((voice,i)=>{const e=state.engines[i];voice.osc.frequency.setTargetAtTime(48+e.n1*.75,t,.2);voice.tone.gain.setTargetAtTime(e.status==='running'?.015+e.spool*.035:0,t,.3);});
  }
  say(text) {
    if(this.comms.say(text))return;
    if(!text||this.muted||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
    if(!window.speechSynthesis.getVoices().length)return;
    const voice=new SpeechSynthesisUtterance(text);voice.lang='en-US';voice.rate=1;voice.volume=.65;
    window.speechSynthesis.speak(voice);
  }
  cancelSpeech(){this.comms.pause();window.speechSynthesis?.cancel();}
  resetSpeech(){this.comms.reset();window.speechSynthesis?.cancel();}
  dispose() { this.comms.dispose();this.cancelSpeech();this.context?.close(); }
}
