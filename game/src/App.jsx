import {useCallback,useEffect,useRef,useState} from 'react';
import {AirplaneLanding,AirplaneTakeoff,ArrowCounterClockwise,ArrowsOut,CheckCircle,Info,Keyboard,ListChecks,Pause,Play,SpeakerHigh,SpeakerSlash,Warning,X,ArrowUp,ArrowDown,ArrowLeft,ArrowRight} from '@phosphor-icons/react';
import {createFlight,advanceSimulation,adjustStick,centerStick,getInstruction,radioAltitude,stepFlaps,toggleGear,toggleAP,toggleApproach,setDetent,cycleAutoBrake,toggleReverse,beginGoAround,confirmChecklist,restoreCheckpoint,acknowledgeLevel,confirmAction,toggleAutoThrust} from './flight.js';
import {createWorld} from './world.js';
import {EngineAudio} from './audio.js';
import {Instruments} from './Instruments.jsx';
import {FCU,AircraftControls,ProcedurePanel,Briefing} from './CockpitPanels.jsx';
import {sampleCabinMotion} from './sim/cabin-motion.js';
import {windReadout} from './sim/weather.js';
import {LevelSelect,LevelResult} from './Levels.jsx';
import {getLevel,nextLevel} from './missions/catalog.js';
import {loadProgress,saveProgress,recordResult,recommendedLevel} from './missions/progress.js';
import {useLanguage} from './i18n/hooks.js';
import {getLanguage,setLanguage,missingTranslations} from './i18n/index.js';
import {setRadioLanguage} from './comms/radio.js';

const localStorageSafe=()=>{try{return window.localStorage;}catch{return null;}};
export function App(){
  const language=useLanguage();
  const scenery=useRef(null),flight=useRef(null),keys=useRef(new Set()),touch=useRef({}),running=useRef(false),sound=useRef(null),pointerStick=useRef(null),rate=useRef(1),lastSpoken=useRef(0);
  const[progress,setProgress]=useState(()=>loadProgress(localStorageSafe())),[showLevels,setShowLevels]=useState(true);
  if(!flight.current)flight.current=createFlight(null,{levelId:recommendedLevel(progress).id});
  const[state,setState]=useState(()=>({...flight.current})),[playing,setPlaying]=useState(false),[started,setStarted]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[muted,setMuted]=useState(false),[help,setHelp]=useState(false),[showProcedure,setShowProcedure]=useState(true),[timeScale,setTimeScale]=useState(1);
  const[cabinScale,setCabinScale]=useState(()=>{try{const v=localStorageSafe()?.getItem('pilot-sim.cabin-motion');if(v!==null&&v!==undefined&&[0,.35,1].includes(Number(v)))return Number(v);}catch{}return window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1;}),cabinScaleRef=useRef(cabinScale),cockpitRig=useRef(null),lastMotion=useRef(null);
  function cycleCabin(){const next=cabinScale===1?.35:cabinScale===.35?0:1;cabinScaleRef.current=next;setCabinScale(next);try{localStorageSafe()?.setItem('pilot-sim.cabin-motion',String(next));}catch{}}
  const publish=useCallback(()=>setState({...flight.current}),[]);
  useEffect(()=>{setRadioLanguage(flight.current,language);publish();},[language,publish]);
  const updatePlaying=useCallback(next=>{
    running.current=next;setPlaying(next);keys.current.clear();touch.current={};pointerStick.current=null;
    if(!next){centerStick(flight.current);setState({...flight.current});sound.current?.cancelSpeech();}
  },[]);
  const act=useCallback(fn=>{if(!flight.current.result){fn(flight.current);publish();}},[publish]);
  const start=useCallback(()=>{if(!loaded||error||flight.current.result)return;setStarted(true);updatePlaying(true);sound.current?.start().catch(()=>{});},[loaded,error,updatePlaying]);
  const pause=useCallback(()=>{if(!started){start();return;}updatePlaying(!running.current);if(running.current)sound.current?.start().catch(()=>{});},[started,start,updatePlaying]);
  const reset=useCallback((mode,autoStart=false,options={})=>{
    const levelId=options.levelId||flight.current.levelId;
    flight.current=createFlight(mode,{levelId,landingConfig:options.landingConfig??(levelId===flight.current.levelId?flight.current.landingConfig:undefined)});
    setRadioLanguage(flight.current,getLanguage());
    setShowLevels(false);
    lastSpoken.current=0;sound.current?.resetSpeech();rate.current=1;setTimeScale(1);setState({...flight.current});setStarted(autoStart);setHelp(false);updatePlaying(autoStart);if(autoStart)sound.current?.start().catch(()=>{});
  },[updatePlaying]);
  const retryStage=useCallback(()=>{
    flight.current=restoreCheckpoint(flight.current);setRadioLanguage(flight.current,getLanguage());lastSpoken.current=flight.current.calloutSequence;sound.current?.resetSpeech();rate.current=1;setTimeScale(1);setState({...flight.current});setStarted(true);setHelp(false);updatePlaying(true);sound.current?.start().catch(()=>{});
  },[updatePlaying]);
  const openLevels=useCallback(()=>{updatePlaying(false);setHelp(false);setShowLevels(true);},[updatePlaying]);
  useEffect(()=>{if(state.result?.levelCleared){setProgress(previous=>{const updated=recordResult(previous,state);saveProgress(localStorageSafe(),updated);return updated;});}},[state.result,state.levelId]);
  const toggleRate=useCallback(()=>{
    if(radioAltitude(flight.current)<=1000||flight.current.goAround)return;
    rate.current=rate.current===1?2:1;setTimeScale(rate.current);
  },[]);
  useEffect(()=>{
    let alive=true,frame=0,last=performance.now(),lastUi=0,lastPublished=-1;
    sound.current=new EngineAudio();const view=createWorld(scenery.current,()=>{if(alive)setLoaded(true);},e=>{if(alive)setError(e);});
    function tick(now){
      if(!alive)return;const dt=Math.min((now-last)/1000,.5);last=now;
      if(running.current){
        if(rate.current!==1&&(radioAltitude(flight.current)<1000||flight.current.goAround)){rate.current=1;setTimeScale(1);}
        const k=keys.current,t=touch.current,input={pitch:(k.has('ArrowDown')||t.down?1:0)-(k.has('ArrowUp')||t.up?1:0),steer:(k.has('ArrowRight')||t.right?1:0)-(k.has('ArrowLeft')||t.left?1:0),throttle:(k.has('KeyW')?1:0)-(k.has('KeyS')?1:0),brake:k.has('Space')||t.brake,precision:k.has('ShiftLeft')||k.has('ShiftRight'),rudder:(k.has('KeyE')?1:0)-(k.has('KeyQ')?1:0),stick:pointerStick.current};
        advanceSimulation(flight.current,input,dt*rate.current);
        if(rate.current!==1&&(radioAltitude(flight.current)<=1000||flight.current.goAround)){rate.current=1;setTimeScale(1);}
        if(flight.current.result){running.current=false;centerStick(flight.current);keys.current.clear();touch.current={};pointerStick.current=null;setPlaying(false);}
      }
      const motion=sampleCabinMotion(flight.current,cabinScaleRef.current);lastMotion.current=motion;
      if(cockpitRig.current)cockpitRig.current.style.transform=`translate(${motion.x*100}cqw,${motion.y*100}cqw) rotate(${motion.roll}rad) scale(var(--cockpit-overscan))`;
      view.update(flight.current,motion);sound.current?.update(flight.current,running.current,rate.current);
      if(now-lastUi>33&&(running.current||flight.current.time!==lastPublished)){lastUi=now;lastPublished=flight.current.time;setState({...flight.current});}
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
    window.__flightSim={snapshot:()=>{const{checkpoint,...s}=flight.current;return{...s,playing:running.current,timeScale:rate.current};},stats:()=>view.stats?.(),audioStats:()=>sound.current?.stats(),motionStats:()=>lastMotion.current,missingTranslations};
    return()=>{alive=false;cancelAnimationFrame(frame);view.dispose();sound.current?.dispose();delete window.__flightSim;};
  },[]);
  useEffect(()=>{
    const last=state.callouts.at(-1);if(last&&last.id>lastSpoken.current){lastSpoken.current=last.id;if(playing)sound.current?.say(last.spoken);}
  },[state.calloutSequence,playing]);
  useEffect(()=>{
    const controlled=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyG','KeyF','Space','KeyP','KeyR','Escape','KeyH','ShiftLeft','ShiftRight','KeyA','KeyD','KeyU','KeyI','KeyT','KeyB','KeyM','KeyV','KeyC','KeyZ','KeyL','KeyK','KeyX','KeyQ','KeyE']);
    function down(e){
      if(!controlled.has(e.code))return;
      if(showLevels){if(e.code==='Escape')setShowLevels(false);return;}
      e.preventDefault();
      if(e.repeat&&!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS'].includes(e.code))return;
      if(e.code==='KeyP'||e.code==='Escape'){if(help)setHelp(false);else pause();return;}
      if(e.code==='KeyR'){reset(flight.current.mode,true);return;}
      if(e.code==='KeyK'){retryStage();return;}
      if(e.code==='KeyH'){updatePlaying(false);setHelp(v=>!v);return;}
      if(flight.current.result)return;
      const shifted=e.shiftKey||keys.current.has('ShiftLeft')||keys.current.has('ShiftRight');
      const actions={KeyG:toggleGear,KeyF:s=>stepFlaps(s,shifted?-1:1),KeyA:toggleAP,KeyI:toggleApproach,KeyD:s=>{s.flightDirector=!s.flightDirector;},KeyU:toggleAutoThrust,KeyT:s=>s.mode!=='landing'?setDetent(s,'TOGA'):beginGoAround(s,s.warning||'主动复飞'),KeyB:s=>{s.spoilersArmed=!s.spoilersArmed;},KeyM:cycleAutoBrake,KeyV:toggleReverse,KeyC:confirmAction,KeyZ:s=>setDetent(s,'IDLE'),KeyL:s=>setDetent(s,'CL')};
      if(actions[e.code]){act(actions[e.code]);return;}if(e.code==='KeyX'){toggleRate();return;}
      if(running.current){if(!e.repeat){const nudge={ArrowUp:[-.08,0],ArrowDown:[.08,0],ArrowRight:[0,.08],ArrowLeft:[0,-.08]}[e.code];if(nudge){adjustStick(flight.current,...nudge.map(v=>v*(shifted?.5:1)));publish();}}keys.current.add(e.code);}
    }
    const up=e=>keys.current.delete(e.code),blur=()=>{keys.current.clear();touch.current={};if(running.current)updatePlaying(false);},visibility=()=>{if(document.hidden)blur();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);};
  },[pause,reset,retryStage,help,showLevels,updatePlaying,act,publish,toggleRate]);
  function fullscreen(){if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>{});}
  function toggleSound(){setMuted(v=>{sound.current.muted=!v;if(!v)sound.current.cancelSpeech();return!v;});sound.current?.start().catch(()=>{});}
  const pointer=key=>({onPointerDown:e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);if(running.current){const nudge={up:[-.08,0],down:[.08,0],right:[0,.08],left:[0,-.08]}[key];if(nudge){adjustStick(flight.current,...nudge);publish();}touch.current[key]=true;}},onPointerUp:()=>{touch.current[key]=false;},onPointerCancel:()=>{touch.current[key]=false;},onLostPointerCapture:()=>{touch.current[key]=false;}});
  function dragStick(e){const r=e.currentTarget.getBoundingClientRect();pointerStick.current={pointerId:e.pointerId,pitch:Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1)),roll:Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1))};}
  const stickPointer={onPointerDown:e=>{if(!running.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);dragStick(e);},onPointerMove:e=>{if(pointerStick.current?.pointerId===e.pointerId)dragStick(e);},onPointerUp:e=>{if(pointerStick.current?.pointerId===e.pointerId)pointerStick.current=null;},onPointerCancel:()=>{pointerStick.current=null;},onLostPointerCapture:()=>{pointerStick.current=null;}};
  const callout=state.callouts.at(-1),showCard=!showLevels&&!playing&&!help&&!state.result,level=getLevel(state.levelId),wind=windReadout(state.airData.wind);
  return <main className="sim-shell"><div className="stage">
    <button className="language-switch" onClick={()=>setLanguage(language==='zh'?'en':'zh')} aria-label={language==='zh'?'Switch to English':'Switch to Chinese'} title={language==='zh'?'English interface and radio':'Chinese interface and radio'}>{language==='zh'?'EN':'ZH'}</button>
    <div className="scenery" ref={scenery}/><div className="cockpit-rig" ref={cockpitRig}><img className="cockpit-frame" src="/assets/cockpit-frame.png" alt="" draggable="false"/><Instruments state={state}/>    <FCU state={state} onAction={act}><StickReadout pitch={state.stickPitch} roll={state.stickRoll} pointer={stickPointer}/></FCU>
    <AircraftControls state={state} onAction={act} brakePointer={pointer('brake')}/>
</div>
    <header className="toolbar"><div className="mode-switch level-toolbar"><button className="selected level-menu-button" onClick={openLevels} aria-label="选择关卡"><ListChecks/><span>关卡</span></button><span className="current-level-title">{String(level.order).padStart(2,'0')} · {level.title}{state.mission?.practice&&<small> · 阶段练习</small>}</span></div>
    <div className={`instruction ${state.warning||state.mission?.alert||state.terrain?.level||state.atc?.deviation&&(state.atc.seconds>=6||state.atc.terrainPriority)?'caution':''}`} role="status">{state.warning?<Warning weight="fill"/>:<span className="status-dot"/>}<span>{getInstruction(state)}</span></div>
    <div className="toolbar-actions"><button className={`icon-button ${showProcedure?'active':''}`} onClick={()=>setShowProcedure(v=>!v)} aria-label="显示或隐藏飞行流程" title="飞行流程"><ListChecks/></button><button className="icon-button" onClick={()=>{updatePlaying(false);setHelp(true);}} aria-label="操作说明" title="操作说明 · H"><Info/></button><button className="icon-button sound-button" onClick={toggleSound} aria-label={muted?'开启声音':'静音'}>{muted?<SpeakerSlash/>:<SpeakerHigh/>}</button><button className="icon-button fullscreen-button" onClick={fullscreen} aria-label="全屏"><ArrowsOut/></button><button className="icon-button pause-button" onClick={pause} disabled={!loaded||!!error||!!state.result} aria-label={playing?'暂停':'继续飞行'}>{playing?<Pause weight="fill"/>:<Play weight="fill"/>}</button></div></header>
    {started&&!showLevels&&!help&&!state.result&&showProcedure&&<ProcedurePanel state={state} onAction={act} onRetry={retryStage}/>}
    {!showLevels&&started&&callout&&!state.terrain?.level&&state.time-callout.time<5&&!help&&<div className={`callout-banner ${callout.kind}`} aria-live="polite">{callout.text}</div>}
    {!showLevels&&started&&state.radio?.active&&!help&&!state.result&&<aside className={`radio-caption ${state.radio.active.role} ${state.radio.active.emergency||''}`}
 aria-label="自动无线电通话"><span>{state.radio.active.role==='tower'?'塔台 · 118.700':'飞行员 · 云际320'}<small>{state.radio.active.emergency==='distress'?'遇险通话':state.radio.active.emergency==='urgency'?'紧迫通话':'自动通话'}</small></span><p>{state.radio.active.text}</p></aside>}
    {started&&!showLevels&&!help&&!state.result&&state.atc?.clearance&&<aside className={`atc-clearance ${state.atc.terrainPriority?'danger':state.atc.deviation&&state.atc.seconds>=6?'deviation':''}`} aria-label="空管当前许可">
      <span>ATC · 当前许可<small>{state.atc.terrainPriority?'避障优先':'自动通话'}</small></span><strong>{state.atc.clearance.label}</strong>
      <p>{state.atc.clearance.altitude!==null?`${state.atc.clearance.climb?'爬升 / 保持':'保持'} ${Math.round(state.atc.clearance.altitude)} ft`:'按进近 / 滑翔路径飞行'}{state.atc.clearance.heading!==undefined?` · 航向 ${Math.round(state.atc.clearance.heading)}°`:''}</p>
      {state.atc.deviation&&(state.atc.seconds>=6||state.atc.terrainPriority)&&<em>{state.atc.deviation.text}</em>}
    </aside>}
    {started&&!showLevels&&!help&&!state.result&&state.stallWarning?.active&&<div className="stall-alert" role="alert"><strong>STALL · 失速警告</strong><span>前推侧杆降低迎角 · 检查速度与推力</span></div>}
    {started&&!showLevels&&!help&&!state.result&&state.terrain?.level>0&&<div className={`terrain-alert severity-${state.terrain.level}`} role="alert"><strong>{state.terrain.level===2?'PULL UP':'TERRAIN AHEAD'}</strong><span>{state.terrain.level===2?'地形危险 · 立即避让':'前方地形升高'}</span></div>}
    {showCard&&<Briefing state={state} onReset={reset} onStart={started?pause:start} onHelp={()=>setHelp(true)} loaded={loaded} error={error} started={started}/>}
    {!showLevels&&state.result&&!help&&<LevelResult state={state} onRetry={retryStage} onRestart={()=>reset(state.mode,true)} onNext={()=>reset(null,false,{levelId:nextLevel(state.levelId).id})} onMenu={openLevels}/>}
    {showLevels&&<LevelSelect key={state.levelId} progress={progress} currentId={state.levelId} onChoose={id=>reset(null,false,{levelId:id})} onClose={()=>setShowLevels(false)}/>}
    {help&&<section className="help-panel a320-help" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button close-help" onClick={()=>setHelp(false)} aria-label="关闭操作说明"><X/></button><p className="eyebrow">手飞、引导与进近程序</p><h2 id="help-title">飞行由你掌握。</h2><p className="help-level-note">当前：{level.title} · {level.keys}</p><div className="help-grid">{[['↑ / ↓','前推压头 / 后拉抬头'],['← / →','滚入 / 反向改平'],['Shift','按住精细操纵'],['W / S','增减推力杆'],['F / ⇧F','襟翼放 / 收一档'],['G','起落架'],['Q / E','方向舵左 / 右（默认辅助）'],['I / A','APPR 预位 / AP1'],['D / U','FD / 自动推力'],['B / M','扰流板预位 / 自动刹车'],['Z / L','IDLE / CL 档'],['T / V','TOGA 复飞 / 反推'],['空格','手动刹车']].map(([key,label])=><div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><p className="help-tip"><strong>松键回杆，飞机保留已有姿态；反向操纵逐步改平。</strong><br/>完整进近：I 预位，按指引减速放襟翼、放轮并完成着陆检查。AP1 可辅助截获与跟踪，200 英尺以下手动接管。30 英尺附近拉平，Z 收到 IDLE，接地后反推与制动。不稳定时按 T 复飞；着陆关卡随后按 ND 海侧返场，最终落地停稳才通关。</p><button className="text-button rudder-assist-toggle" aria-pressed={state.controls.rudderAssist} onClick={()=>act(f=>{f.controls.rudderAssist=!f.controls.rudderAssist;})}>方向舵辅助：{state.controls.rudderAssist?'开启':'关闭'} · Q / E 手动修正</button><button className="text-button cabin-motion-toggle" onClick={cycleCabin}>驾驶舱颠簸：{cabinScale===1?'标准':cabinScale===.35?'减弱':'关闭'}</button><button className="primary-button" onClick={()=>{setHelp(false);if(!state.result)start();}} disabled={!loaded||!!error}><Play weight="fill"/>明白，开始飞行</button><p className="help-shortcuts">P 暂停 · R 从头重试 · K 重试阶段 · X 高空 2× · 杆位框可拖动</p></section>}
    <footer className="cockpit-footer"><span className="flight-label"><span className="status-dot"/>{state.weight} t · 风 {Math.round(wind.directionDeg)}° / {Math.round(wind.speedKt)} kt</span><div className="keyboard-legend"><Keyboard/><span><kbd>↑↓←→</kbd>侧杆</span><span><kbd>F / ⇧F</kbd>襟翼</span><span><kbd>G</kbd>起落架</span><span><kbd>Z</kbd>怠速</span><span><kbd>T</kbd>TOGA</span><span><kbd>空格</kbd>刹车</span></div><button className="time-scale" onClick={toggleRate} disabled={radioAltitude(state)<=1000||state.goAround||!!state.result} aria-label="切换模拟速度">{timeScale}×</button><button className="retry-button" onClick={()=>reset(state.mode,true)} disabled={!loaded||!!error} title="从头重试 · R"><ArrowCounterClockwise/></button><a href="/designs/" className="design-link" target="_blank" rel="noreferrer">设计草案</a></footer>
  </div><aside className="touch-controls" aria-label="触屏操纵"><span>↑ 前推压头 · ↓ 后拉抬头 · 松手回中</span><div className="touch-buttons"><button {...pointer('left')} aria-label="左转"><ArrowLeft/></button><button {...pointer('up')} aria-label="前推压机头"><ArrowUp/></button><button {...pointer('down')} aria-label="后拉抬机头"><ArrowDown/></button><button {...pointer('right')} aria-label="右转"><ArrowRight/></button><button {...pointer('brake')}>刹车</button></div></aside></main>;
}
function StickReadout({pitch,roll,pointer}) {
  const axes=[
    {key:'pitch',label:'俯仰',value:pitch,positive:'抬头',negative:'低头'},
    {key:'roll',label:'左右',value:roll,positive:'右',negative:'左'},
  ];
  return <section className="stick-readout" aria-label="操纵杆开度">
    <span className="stick-title">操纵杆<br/><small>开度</small></span>
    <div className="stick-pad" {...pointer} tabIndex={0} role="group" aria-label="二维侧杆，前推压机头，后拉抬机头，松手自动回中" title="向前拖动压机头 · 向后拖动抬机头 · 松手回中">
      <span className="stick-pad-horizontal"/><span className="stick-pad-vertical"/>
      <span className="stick-pad-position" style={{left:`${50+roll*42}%`,top:`${50+pitch*42}%`}}/>
    </div>
    {axes.map(axis=>{
      const percent=Math.round(axis.value*100);
      return <div className="stick-axis" key={axis.key}>
        <div className="stick-axis-label"><span>{axis.label}<small>{percent===0?'中立':percent>0?axis.positive:axis.negative}</small></span><output data-stick-axis={axis.key}>{percent>0?'+':''}{percent}%</output></div>
        <div className="stick-meter" role="meter" aria-label={`${axis.label}开度`} aria-valuemin={-100} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent===0?'中立':percent>0?axis.positive:axis.negative} ${Math.abs(percent)}%`}>
          <span className="stick-fill" style={{left:`${50+Math.min(axis.value,0)*50}%`,width:`${Math.abs(axis.value)*50}%`}}/>
          <span className="stick-zero"/>
          <span className="stick-position" style={{left:`${50+axis.value*50}%`}}/>
        </div>
      </div>;
    })}
  </section>;
}
