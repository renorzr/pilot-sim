import {AuditionEffects} from './audition-effects.js?v=radio-presets-1';

const $=selector=>document.querySelector(selector),words={
 zh:{back:'返回游戏',title:'中文飞行员 · 人声试听',intro:'4 个早期候选，1 个原声音作对照。使用相同台词和偏快语速，比较你更喜欢的音色。',radio:'原无线电',vhf:'机载 VHF',static:'强杂音',clean:'干声',radioNote:'原有效果：轻度带宽限制、压缩和背景底噪。',vhfNote:'机载 VHF：更窄的语音频段、明显压缩和电流底噪，收发按键声更突出。',staticNote:'强杂音：更强的静电声、轻微破音和信号起伏，仍保留通话内容。',cleanNote:'干声：不加无线电处理，便于比较原始音色。',sameText:'每个声音朗读同一段：',sequence:'▶ 依次试听',loading:'正在准备试听…',note:'试听不会改变游戏声音。选好后，在对话中回复 A / B / C / D 即可。',volume:'音量',stop:'停止',normal:'普通通话',mayday:'MAYDAY 紧急呼叫',pan:'PAN PAN 优先着陆',play:'▶ 试听',pause:'Ⅱ 暂停',resume:'▶ 继续',current:'原声音',male:'男声',female:'女声',mandarin:'普通话',taiwan:'台湾华语',reference:'对照',brisk:'统一使用偏快语速 · 可对比三档无线电效果',three:'信号词喊三遍，呼叫和后续中文使用同一个声音',failed:'音频播放失败，请重试或刷新页面。',loadFailed:'试听加载失败，请刷新页面重试。',seek:'播放进度',settings:'试听设置',type:'通话类型',effect:'音效',voices:'飞行员声音候选',player:'试听播放器'},
 en:{back:'Back to game',title:'Chinese pilot · Voice auditions',intro:'Four earlier candidates and the previous voice for reference. Identical scripts and a brisk speaking rate make comparison easy.',radio:'Previous radio',vhf:'Aircraft VHF',static:'Heavy static',clean:'Clean voice',radioNote:'Previous effect: light band limiting, compression and background hiss.',vhfNote:'Aircraft VHF: a narrower voice band, stronger compression and hiss, with prominent PTT clicks.',staticNote:'Heavy static: louder crackle, mild distortion and signal flutter while keeping speech intelligible.',cleanNote:'Clean voice: no radio processing, for comparing the original voices.',sameText:'Every voice reads the same script:',sequence:'▶ Play all in order',loading:'Preparing auditions…',note:'Auditions leave the game voice unchanged. Reply A / B / C / D in the conversation when you have chosen.',volume:'Volume',stop:'Stop',normal:'Routine call',mayday:'MAYDAY distress call',pan:'PAN PAN urgency call',play:'▶ Listen',pause:'Ⅱ Pause',resume:'▶ Resume',current:'Previous voice',male:'Male',female:'Female',mandarin:'Mainland Mandarin',taiwan:'Taiwan Mandarin',reference:'Current',brisk:'Same brisk speaking rate · Compare three radio treatments',three:'Three complete signal groups; the declaration and Chinese report use the same voice',failed:'Audio could not play. Please retry or refresh the page.',loadFailed:'Auditions could not load. Please refresh the page.',seek:'Playback position',settings:'Audition settings',type:'Call type',effect:'Audio effect',voices:'Pilot voice candidates',player:'Audition player'},
};
let language='zh';try{language=localStorage.getItem('pilot-sim.language')==='en'?'en':'zh';}catch{}
let manifest,kind='normal',mode='radio',active=null,context,effects,playlist=[],nextTimer,generation=0;
const radio=new Audio(),clean=new Audio();radio.preload=clean.preload='metadata';radio.volume=clean.volume=.7;
radio.id='audition-radio';clean.id='audition-clean';radio.hidden=clean.hidden=true;document.body.append(radio,clean);
const tr=key=>words[language][key],media=()=>mode==='clean'?clean:radio;
const clock=value=>Math.floor((Number.isFinite(value)?value:0)/60)+':'+String(Math.floor((Number.isFinite(value)?value:0)%60)).padStart(2,'0');
function button(label,onClick){const b=document.createElement('button');b.type='button';b.tabIndex=-1;b.textContent=label;b.addEventListener('click',onClick);return b;}
function error(message=''){$('#error').hidden=!message;$('#error').textContent=message;}
function update(){
 const current=media(),playing=!!active&&!current.paused&&!current.ended;
 effects?.update(mode!=='clean'&&playing&&current.readyState>=2,!document.hidden,radio.volume/.7);
 for(const card of document.querySelectorAll('.voice-card')){
  const selected=active?.id===card.dataset.voice;card.classList.toggle('playing',selected&&playing);
  const playButton=card.querySelector('button');playButton.textContent=selected?(playing?tr('pause'):tr('resume')):tr('play');playButton.setAttribute('aria-label',playButton.textContent+' '+card.dataset.voiceName);
 }
 $('#pause').textContent=playing?'Ⅱ':'▶';$('#pause').setAttribute('aria-label',playing?tr('pause'):tr('resume'));
 $('#elapsed').textContent=clock(current.currentTime);$('#duration').textContent=clock(current.duration);
 $('#seek').max=Number.isFinite(current.duration)?current.duration:1;$('#seek').value=current.currentTime||0;
}
function stop({hide=true,queue=true}={}){
 ++generation;clearTimeout(nextTimer);if(queue)playlist=[];
 radio.pause();clean.pause();effects?.silence();if(hide){active=null;$('#player').hidden=true;}update();
}
async function unlock(){
 if(!context){context=new(window.AudioContext||window.webkitAudioContext)();effects=new AuditionEffects(context,radio);effects.setPreset(mode);}
 if(context.state==='suspended')await context.resume();
}
async function play(voice,{continuing=false,startAt=0}={}){
 if(!continuing)playlist=[];
 stop({hide:false,queue:false});const token=generation;
 active=voice;$('#player').hidden=false;$('#playing-name').textContent=voice.current?tr('current')+' · '+voice.name:voice.label+' · '+voice.name;$('#playing-type').textContent=tr(kind)+' · '+tr(mode);error();
 try{
  await unlock();if(token!==generation)return;
  const current=media(),clip=voice.clips[kind].variants[mode==='clean'?'clean':'radio'];current.src=new URL(clip.url+'?v='+clip.sha256.slice(0,12),location.href).href;current.currentTime=0;await current.play();if(startAt>0)current.currentTime=Math.min(startAt,Math.max(0,current.duration-.1));
  if(token!==generation){current.pause();return;}update();
 }catch{if(token===generation){stop();error(tr('failed'));}}
}
async function toggle(voice){
 if(active?.id!==voice.id){await play(voice);return;}
 if(!media().paused){stop({hide:false});return;}
 error();try{await unlock();if(media().ended)media().currentTime=0;await media().play();update();}catch{error(tr('failed'));}
}
function ended(){
 if(!media().ended)return;
 effects?.update(false,true);update();
 if(playlist.length){const token=generation;nextTimer=setTimeout(()=>{if(token===generation)play(playlist.shift(),{continuing:true});},350);}
}
function render(){
 document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=tr('title');
 document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=tr(el.dataset.i18n));$('#language').textContent=language==='zh'?'English':'中文';
 $('.comparison').setAttribute('aria-label',tr('settings'));$('#scripts').setAttribute('aria-label',tr('type'));$('.effect-tabs').setAttribute('aria-label',tr('effect'));$('#voices').setAttribute('aria-label',tr('voices'));$('#player').setAttribute('aria-label',tr('player'));$('#seek').setAttribute('aria-label',tr('seek'));$('#volume').setAttribute('aria-label',tr('volume'));
 $('#game-link').href=new URL('../../',import.meta.url).href;$('#provider-fish').href=new URL('fish/',import.meta.url).href;$('#provider-edge').href=new URL('./',import.meta.url).href;
 $('#provider-fish').textContent=language==='zh'?'Fish Audio · 新候选':'Fish Audio · New voices';$('#provider-edge').textContent=language==='zh'?'Edge TTS · 原候选':'Edge TTS · Earlier voices';
 if(!manifest)return;
 const fish=manifest.provider==='fish',choices=manifest.voices.filter(voice=>!voice.current).map(voice=>voice.label).join(' / ');
 $('#provider-fish').setAttribute('aria-current',fish?'page':'false');$('#provider-edge').setAttribute('aria-current',fish?'false':'page');
 $('.footnote').textContent=tr('note').replace('A / B / C / D',choices);
 if(fish){document.title='Fish Audio · '+tr('title');$('h1').textContent=language==='zh'?'Fish Audio · 飞行员人声试听':'Fish Audio · Pilot voice auditions';$('.lede').textContent=language==='zh'?'游戏已采用 E、G、H、J 和原女声空管晓晓：每趟飞行随机分配两种不同声音给飞行员和空管，无线通话采用机载 VHF 效果。I、F 和原云希继续保留供试听。':'The game uses E, G, H, J and the former Xiaoxiao controller: each flight assigns two different Chinese speakers to pilot and ATC, with the aircraft VHF effect. I, F and the former Yunxi remain for comparison.';}
 $('#scripts').replaceChildren(...Object.keys(manifest.scripts).map(key=>{const b=button(tr(key),()=>{stop();kind=key;render();});b.dataset.script=key;b.setAttribute('aria-pressed',String(kind===key));return b;}));
 $('#effect-note').textContent=tr(mode+'Note');
 const script=manifest.scripts[kind];$('#transcript').textContent=[script.prefix,script.body].filter(Boolean).join(' ');$('#signal-note').textContent=tr(kind==='normal'?'brisk':'three');
 for(const choice of['radio','vhf','static','clean'])$('#'+choice).setAttribute('aria-pressed',String(mode===choice));
 $('#voices').replaceChildren(...manifest.voices.map(voice=>{
  const card=document.createElement('article');card.className='voice-card'+(voice.current?' reference':'');card.dataset.voice=voice.id;card.dataset.voiceName=voice.name;
  const badge=document.createElement('span');badge.className='voice-letter';badge.textContent=voice.current?tr('reference'):voice.label;
  const info=document.createElement('div');info.className='voice-info';const name=document.createElement('h2');name.textContent=voice.current?tr('current')+' · '+voice.name:voice.name;
  const description=document.createElement('p');description.textContent=tr(voice.gender==='男声'?'male':'female')+' · '+tr(voice.locale==='台湾华语'?'taiwan':'mandarin')+(fish?(voice.current?' · Edge TTS':' · Fish Audio'):'');info.append(name,description);
  if(voice.sourceUrl){const source=document.createElement('a');source.className='voice-source';source.href=voice.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';source.textContent=language==='zh'?'查看声音来源':'Voice source';info.append(source);}
  const playButton=button(tr('play'),()=>toggle(voice));playButton.className='play-voice';card.append(badge,info,playButton);return card;
 }));if(active){$('#playing-name').textContent=active.current?tr('current')+' · '+active.name:active.label+' · '+active.name;$('#playing-type').textContent=tr(kind)+' · '+tr(mode);}update();
}
for(const audio of[radio,clean]){for(const event of['play','pause','timeupdate','loadedmetadata'])audio.addEventListener(event,update);audio.addEventListener('ended',ended);audio.addEventListener('error',()=>{if(audio===media()&&active){stop();error(tr('failed'));}});}
$('#language').addEventListener('click',()=>{language=language==='zh'?'en':'zh';render();});
for(const choice of['radio','vhf','static','clean'])$('#'+choice).addEventListener('click',()=>{
 if(mode===choice)return;const voice=active,wasPlaying=voice&&!media().paused&&!media().ended,position=media().currentTime;
 if(mode!=='clean'&&choice!=='clean'){mode=choice;effects?.setPreset(mode);render();return;}
 stop();mode=choice;effects?.setPreset(mode);render();if(wasPlaying)play(voice,{startAt:position});
});
$('#sequence').addEventListener('click',()=>{if(!manifest)return;playlist=manifest.voices.slice(1);play(manifest.voices[0],{continuing:true});});
$('#pause').addEventListener('click',()=>{if(active)toggle(active);});$('#stop').addEventListener('click',()=>stop());
$('#seek').addEventListener('input',event=>{if(Number.isFinite(media().duration))media().currentTime=Number(event.target.value);update();});
$('#volume').addEventListener('input',event=>{radio.volume=clean.volume=Number(event.target.value)/100;update();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop({hide:false});});window.addEventListener('pagehide',()=>stop());
document.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});document.addEventListener('focusin',event=>{if(event.target instanceof HTMLButtonElement)event.target.blur();});
render();
try{const response=await fetch('./manifest.json',{cache:'no-cache'});if(!response.ok)throw new Error('Manifest unavailable');manifest=await response.json();$('#loading').hidden=true;render();}catch{error(tr('loadFailed'));}

// Read-only inspection for audio QA; no playback or game-state setters.
export function auditionStats(){return{mode,kind,active:active?.id??null,paused:media().paused,time:media().currentTime,context:context?.state??null,carrierGain:effects?.carrierGain.gain.value??0,crackleGain:effects?.crackleGain.gain.value??0,preset:effects?.preset??null,level:effects?.level()??0,clicks:effects?.clicks??0,queue:playlist.map(voice=>voice.id)};}
