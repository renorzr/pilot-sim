import pack from './pilot-voices.json' with {type:'json'};

export const RADIO_VOICES=pack.voices;
export const RADIO_VOICE_IDS=Object.freeze(Object.keys(RADIO_VOICES));
// Retain the original exports for flight/review helpers that select a pilot.
export const PILOT_VOICES=RADIO_VOICES,PILOT_VOICE_IDS=RADIO_VOICE_IDS;
function choose(ids,sample){
 const value=Number.isFinite(sample)?Math.max(0,Math.min(1-Number.EPSILON,sample)):0;
 return ids[Math.floor(value*ids.length)];
}
export const choosePilotVoice=(sample=Math.random())=>choose(RADIO_VOICE_IDS,sample);
export function chooseRadioVoices({pilotVoice,towerVoice}={},random=Math.random){
 pilotVoice=RADIO_VOICE_IDS.includes(pilotVoice)?pilotVoice:null;
 towerVoice=RADIO_VOICE_IDS.includes(towerVoice)?towerVoice:null;
 if(!pilotVoice)pilotVoice=choose(RADIO_VOICE_IDS.filter(id=>id!==towerVoice),random());
 if(!towerVoice||towerVoice===pilotVoice)towerVoice=choose(RADIO_VOICE_IDS.filter(id=>id!==pilotVoice),random());
 return{pilotVoice,towerVoice};
}
export const radioVoiceFor=(radio,role)=>role==='pilot'?radio?.pilotVoice:role==='tower'?radio?.towerVoice:null;
export const voiceClip=(voice,id)=>RADIO_VOICES[voice]?.clips?.[id]??null;
export const pilotClip=voiceClip;
