import {createAirportWorldManager}from './views/airport-world-manager.js';
import {createCruiseTransition,advanceCruiseTransition,commitCruiseTransition,cruiseVisualFlight}from './views/cruise-transition.js';
import {LoadingProgress}from './LoadingProgress.jsx';
import {ViewSelector,ExternalView} from './ExternalView.jsx';
import {createViewState,setViewMode,orbitView,zoomView,resetView,resetCameraTransition} from './views/view-state.js';
import {createAirportPresentation,advanceAirportPresentation,finishAirportPresentation,airportPresentationActive}from './views/airport-presentation.js';
import {arrivalPreview,canSkipCruise} from './missions/airline.js';
import {FlightJourneyPanel} from './FlightJourneyPanel.jsx';
import {GroundPanel} from './GroundPanel.jsx';
import {groundActive,groundFrozen,airportIntro,skipAirportIntro} from './missions/ground.js';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AirplaneLanding,AirplaneTakeoff,ArrowCounterClockwise,ArrowsOut,CheckCircle,Info,Keyboard,ListChecks,Pause,Play,SpeakerHigh,SpeakerSlash,Warning,X,ArrowUp,ArrowDown,ArrowLeft,ArrowRight} from '@phosphor-icons/react';
import {createFlight,adjustStick,centerStick,getInstruction,radioAltitude,stepFlaps,toggleGear,toggleAP,toggleApproach,setDetent,cycleAutoBrake,toggleReverse,beginGoAround,confirmChecklist,restoreCheckpoint,acknowledgeLevel,confirmAction,toggleAutoThrust} from './flight.js';
import {createWorld} from './world.js';
import {EngineAudio} from './audio.js';
import {Instruments} from './Instruments.jsx';
import {FCU,AircraftControls,ProcedurePanel,Briefing} from './CockpitPanels.jsx';
import {FCU_FRAME_ASSET} from './views/fcu-layout.js';
import {StickReadout} from './StickReadout.jsx';
import {FastForwardButton} from './FastForwardButton.jsx';
import {advanceAtRate} from './sim/time-acceleration.js';
import {sampleCabinMotion} from './sim/cabin-motion.js';
import {windReadout} from './sim/weather.js';
import {LevelSelect,LevelResult} from './Levels.jsx';
import {getLevel,nextLevel} from './missions/catalog.js';
import {loadProgress,saveProgress,recordResult,recommendedLevel} from './missions/progress.js';
import {useLanguage} from './i18n/hooks.js';
import {getLanguage,setLanguage,missingTranslations} from './i18n/index.js';
import {setRadioLanguage} from './comms/radio.js';
import {siteUrl} from './urls.js';
import {runwayHeading,airportOf} from './airports/registry.js';

const localStorageSafe=()=>{try{return window.localStorage;}catch{return null;}};
export function App(){
  const language=useLanguage();
  const[portrait,setPortrait]=useState(()=>window.matchMedia('(orientation: portrait)').matches);
  const scenery=useRef(null),flight=useRef(null),keys=useRef(new Set()),touch=useRef({}),running=useRef(false),sound=useRef(null),pointerStick=useRef(null),rate=useRef(1),rateOrigin=useRef(null),lastSpoken=useRef(0);
  const viewState=useRef(null);if(!viewState.current){let mode='cockpit';try{mode=localStorageSafe()?.getItem('pilot-sim.view')||mode;}catch{}viewState.current=createViewState(mode);}
  const[viewMode,setViewModeUI]=useState(viewState.current.mode),[externalInstruments,setExternalInstruments]=useState(false),cameraPointers=useRef(new Map());
  const[progress,setProgress]=useState(()=>loadProgress(localStorageSafe())),[showLevels,setShowLevels]=useState(true);
  if(!flight.current)flight.current=createFlight(null,{levelId:recommendedLevel(progress).id});
  const worldManager=useRef(null),cruise=useRef(null),cutsceneOverlay=useRef(null);
  const[cruiseFrame,setCruiseFrame]=useState(null),[prefetchProgress,setPrefetchProgress]=useState(null);
  const presentation=useRef(undefined),startedRef=useRef(false);if(presentation.current===undefined)presentation.current=createAirportPresentation(flight.current);
  const[presenting,setPresenting]=useState(()=>!!presentation.current?.active);
  const[state,setState]=useState(()=>({...flight.current})),[playing,setPlaying]=useState(false),[started,setStarted]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[muted,setMuted]=useState(false),[help,setHelp]=useState(false),[showProcedure,setShowProcedure]=useState(true),[timeScale,setTimeScale]=useState(1);
  const[loadingProgress,setLoadingProgress]=useState({stage:'assets',percent:0});
  const[fastForwardReset,setFastForwardReset]=useState(0);
  const[cabinScale,setCabinScale]=useState(()=>{try{const v=localStorageSafe()?.getItem('pilot-sim.cabin-motion');if(v!==null&&v!==undefined&&[0,.35,1].includes(Number(v)))return Number(v);}catch{}return window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1;}),cabinScaleRef=useRef(cabinScale),cockpitRig=useRef(null),lastMotion=useRef(null);
  function cycleCabin(){if(cruise.current?.active)return;const next=cabinScale===1?.35:cabinScale===.35?0:1;cabinScaleRef.current=next;setCabinScale(next);try{localStorageSafe()?.setItem('pilot-sim.cabin-motion',String(next));}catch{}}
  const publish=useCallback(()=>setState({...flight.current}),[]);
  useEffect(()=>{setRadioLanguage(flight.current,language);publish();},[language,publish]);
  const resetRate=useCallback(()=>{rate.current=1;rateOrigin.current=null;setTimeScale(1);setFastForwardReset(n=>n+1);},[]);
  const handleAirportChange=useCallback(()=>{
    resetCameraTransition(viewState.current);setLoaded(false);setLoadingProgress({stage:'assets',percent:0});setError('');
    lastSpoken.current=0;resetRate();sound.current?.resetSpeech();
    cameraPointers.current.clear();keys.current.clear();touch.current={};pointerStick.current=null;centerStick(flight.current);
    worldManager.current?.useAirport(flight.current.airportId);
  },[resetRate]);
  const beginCruise=useCallback((s=flight.current,options={})=>{
    if(cruise.current?.active)return false;
    if(!canSkipCruise(s))return false;centerStick(s);
    const next=createCruiseTransition(s,options);if(!next)return false;
    cruise.current=next;scenery.current?.parentElement?.classList.add('cruise-active');resetRate();keys.current.clear();touch.current={};pointerStick.current=null;cameraPointers.current.clear();centerStick(s);
    document.activeElement?.blur?.();sound.current?.resetSpeech();sound.current?.start().catch(()=>{});lastSpoken.current=s.calloutSequence;
    worldManager.current?.prefetch(s.airline.destination);
    setCruiseFrame({phase:next.phase,elapsed:0,opacity:0,committed:false,radio:null});publish();return true;
  },[resetRate,publish]);
  const setHeldRate=useCallback(value=>{
    if(cruise.current?.active)return;
    if(value!==1&&!running.current)return;
    rate.current=[1,2,4].includes(value)?value:1;rateOrigin.current=rate.current>1?'hold':null;setTimeScale(rate.current);
  },[]);
  const updatePlaying=useCallback(next=>{
    if(cruise.current?.active)return;
    if(next&&window.matchMedia('(orientation: portrait)').matches)return;
    running.current=next;setPlaying(next);keys.current.clear();touch.current={};pointerStick.current=null;
    if(!next){resetRate();cameraPointers.current.clear();centerStick(flight.current);setState({...flight.current});sound.current?.cancelSpeech();}
  },[resetRate]);
  useEffect(()=>{const media=window.matchMedia('(orientation: portrait)'),sync=()=>{setPortrait(media.matches);if(media.matches)updatePlaying(false);};media.addEventListener('change',sync);sync();return()=>media.removeEventListener('change',sync);},[updatePlaying]);
  useEffect(()=>{if(portrait)document.querySelector('.orientation-dialog')?.focus();},[portrait]);
  const selectView=useCallback(mode=>{if(cruise.current?.active)return;if(!setViewMode(viewState.current,mode))return;keys.current.clear();touch.current={};pointerStick.current=null;cameraPointers.current.clear();centerStick(flight.current);setViewModeUI(mode);try{localStorageSafe()?.setItem('pilot-sim.view',mode);}catch{}publish();},[publish]);
  const act=useCallback(fn=>{if(cruise.current?.active)return;if(!(startedRef.current&&presentation.current?.active)&&!flight.current.result&&(!arrivalPreview(flight.current)||fn===skipAirportIntro)){const airport=flight.current.airportId;fn(flight.current);if(airport!==flight.current.airportId)handleAirportChange();if(groundFrozen(flight.current)){cameraPointers.current.clear();keys.current.clear();touch.current={};pointerStick.current=null;centerStick(flight.current);}publish();}},[publish,handleAirportChange]);
  const start=useCallback(()=>{if(cruise.current?.active)return;if(!loaded||error||flight.current.result||window.matchMedia('(orientation: portrait)').matches)return;startedRef.current=true;setStarted(true);updatePlaying(true);sound.current?.start().catch(()=>{});},[loaded,error,updatePlaying]);
  const pause=useCallback(()=>{if(cruise.current?.active)return;if(!started){start();return;}updatePlaying(!running.current);if(running.current)sound.current?.start().catch(()=>{});},[started,start,updatePlaying]);
  const reset=useCallback((mode,autoStart=false,options={})=>{
    if(cruise.current?.active)return;
    const levelId=options.levelId||flight.current.levelId;
    const previousAirport=flight.current.airportId;
    resetCameraTransition(viewState.current);cameraPointers.current.clear();
    flight.current=createFlight(mode,{levelId,landingConfig:options.landingConfig??(levelId===flight.current.levelId?flight.current.landingConfig:undefined)});
    worldManager.current?.retainDestination(flight.current.airline?.destination);setPrefetchProgress(null);
    if(previousAirport!==flight.current.airportId){handleAirportChange();autoStart=false;}
    presentation.current=createAirportPresentation(flight.current);setPresenting(!!presentation.current?.active);startedRef.current=autoStart;
    setRadioLanguage(flight.current,getLanguage());
    setShowLevels(false);
    lastSpoken.current=0;sound.current?.resetSpeech();resetRate();setState({...flight.current});setStarted(autoStart);setHelp(false);updatePlaying(autoStart);if(autoStart)sound.current?.start().catch(()=>{});
  },[updatePlaying,resetRate,handleAirportChange]);
  const retryStage=useCallback(()=>{
    if(cruise.current?.active)return;
    resetCameraTransition(viewState.current);cameraPointers.current.clear();
    presentation.current=null;setPresenting(false);startedRef.current=true;
    flight.current=restoreCheckpoint(flight.current);setRadioLanguage(flight.current,getLanguage());lastSpoken.current=flight.current.calloutSequence;sound.current?.resetSpeech();resetRate();setState({...flight.current});setStarted(true);setHelp(false);updatePlaying(true);sound.current?.start().catch(()=>{});
  },[updatePlaying,resetRate]);
  const skipIntro=useCallback(()=>{if(cruise.current?.active)return;if(finishAirportPresentation(presentation.current)){setPresenting(false);keys.current.clear();touch.current={};pointerStick.current=null;centerStick(flight.current);publish();}else act(skipAirportIntro);},[act,publish]);
  const openLevels=useCallback(()=>{if(cruise.current?.active)return;updatePlaying(false);setHelp(false);setShowLevels(true);},[updatePlaying]);
  useEffect(()=>{if(state.result?.levelCleared){setProgress(previous=>{const updated=recordResult(previous,state);saveProgress(localStorageSafe(),updated);return updated;});}},[state.result,state.levelId]);
  const toggleRate=useCallback(()=>{
    if(cruise.current?.active)return;
    if(!running.current||!loaded||error||rateOrigin.current==='hold'||radioAltitude(flight.current)<=1000||flight.current.goAround)return;
    rate.current=rate.current===1?2:1;rateOrigin.current=rate.current>1?'keyboard':null;setTimeScale(rate.current);
  },[loaded,error]);
  useEffect(()=>{
    let alive=true,frame=0,last=performance.now(),lastUi=0,lastPublished=-1,retryAt=0;
    setLoaded(false);setLoadingProgress({stage:'assets',percent:0});
    let lastProgress=0,lastStage='',lastPrefetch=0,lastPrefetchStage='',lastPrefetchId='';
    const reportProgress=value=>{if(!alive)return;const now=performance.now();if(value.percent===100||value.stage!==lastStage||now-lastProgress>=100){lastProgress=now;lastStage=value.stage;setLoadingProgress(value);}};
    sound.current??=new EngineAudio();sound.current.muted=muted;
    const worlds=createAirportWorldManager({host:scenery.current,createWorld,onReady:()=>{if(alive){setLoaded(true);if(running.current&&!cruise.current?.active)sound.current?.start().catch(()=>{});}},onError:message=>{if(alive)setError(message);},onProgress:reportProgress,onPrefetch:value=>{const now=performance.now();if(alive&&(value.percent===100||value.error||value.stage!==lastPrefetchStage||value.airportId!==lastPrefetchId||now-lastPrefetch>=150)){lastPrefetch=now;lastPrefetchStage=value.stage;lastPrefetchId=value.airportId;setPrefetchProgress(value);}}});
    worldManager.current=worlds;worlds.useAirport(flight.current.airportId);
    function tick(now){
      if(!alive)return;const dt=Math.min((now-last)/1000,.5);last=now;
      let p=cruise.current;
      if(p?.active){
        const event=advanceCruiseTransition(p,dt,{ready:worlds.ready(),visible:!document.hidden&&!window.matchMedia('(orientation: portrait)').matches});
        if(event==='commit')setCruiseFrame({phase:'black',elapsed:p.elapsed,opacity:1,committed:false,radio:null});
        // Let React paint a fully opaque frame before replacing either world.
        const black=p.phase==='black'&&!p.committed&&cutsceneOverlay.current?.dataset.phase==='black';
        if(black&&commitCruiseTransition(p,flight.current)){handleAirportChange();setState({...flight.current});}
        if(event==='done'){cruise.current=null;setCruiseFrame(null);keys.current.clear();touch.current={};pointerStick.current=null;centerStick(flight.current);}
        if(p.committed&&worlds.current()?.error&&now>=retryAt){retryAt=now+10000;setError('');setLoaded(false);worlds.retry();}
      }else if(advanceAirportPresentation(presentation.current,dt,running.current&&worlds.ready())){
        if(!presentation.current.active){setPresenting(false);keys.current.clear();touch.current={};pointerStick.current=null;centerStick(flight.current);}
      }else if(running.current&&worlds.ready()){
        if(rateOrigin.current==='keyboard'&&(radioAltitude(flight.current)<1000||flight.current.goAround))resetRate();
        const k=keys.current,t=touch.current,input={pitch:(k.has('ArrowDown')||t.down?1:0)-(k.has('ArrowUp')||t.up?1:0),steer:(k.has('ArrowRight')||t.right?1:0)-(k.has('ArrowLeft')||t.left?1:0),throttle:(k.has('KeyW')?1:0)-(k.has('KeyS')?1:0),brake:k.has('Space')||t.brake,precision:k.has('ShiftLeft')||k.has('ShiftRight'),rudder:(k.has('KeyE')?1:0)-(k.has('KeyQ')?1:0),stick:pointerStick.current};
        const wasGroundFrozen=groundFrozen(flight.current)||arrivalPreview(flight.current),previousAirport=flight.current.airportId;
        advanceAtRate(flight.current,input,dt,rate.current,{onCruiseSkip:beginCruise});
        if(previousAirport!==flight.current.airportId){handleAirportChange();setState({...flight.current});}
        if(wasGroundFrozen&&!groundFrozen(flight.current)&&!arrivalPreview(flight.current)){keys.current.clear();touch.current={};pointerStick.current=null;centerStick(flight.current);}
        if(rateOrigin.current==='keyboard'&&(radioAltitude(flight.current)<=1000||flight.current.goAround))resetRate();
        if(flight.current.result){running.current=false;resetRate();centerStick(flight.current);keys.current.clear();touch.current={};pointerStick.current=null;setPlaying(false);}
      }
      p=cruise.current;
      // Eligibility starts a single background load, even if the player keeps
      // flying to the terminal waypoint instead of choosing the early skip.
      if(!p?.committed&&canSkipCruise(flight.current)){
        const prepared=worlds.prepared();
        if(prepared?.error&&now>=retryAt){retryAt=now+10000;worlds.retainDestination(null);}
        worlds.prefetch(flight.current.airline.destination);
      }
      const prepared=worlds.prepared()||(p?.committed?worlds.current():null);
      if(prepared?.ready&&!prepared.warmed&&!prepared.warming){const preview=createFlight(null,{levelId:prepared.id+'-landing'});worlds.warmPrepared(preview,{cinematic:true,cinematicTime:0,view:viewState.current,dt:0});}
      const motion=sampleCabinMotion(flight.current,cabinScaleRef.current);lastMotion.current=motion;
      if(cockpitRig.current)cockpitRig.current.style.transform=`translate(${motion.x*100}cqw,${motion.y*100}cqw) rotate(${motion.roll}rad) scale(var(--cockpit-overscan))`;
      const visual=cruiseVisualFlight(p),renderState=visual||flight.current,cinematic=!visual&&startedRef.current&&airportPresentationActive(flight.current,presentation.current),cinematicTime=presentation.current?.active?presentation.current.elapsed:null,renderView=visual?{...viewState.current,mode:'exterior'}:viewState.current;
      worlds.update(renderState,motion,{cinematic,cinematicTime,cruise:visual?p:null,view:renderView,dt});
      const cameraStats=worlds.current()?.view.viewStats?.(),audible=!document.hidden&&!window.matchMedia('(orientation: portrait)').matches&&(visual?true:!p?.active&&running.current&&worlds.ready());
      sound.current?.update(renderState,audible,p?.active?1:rate.current,{exterior:!!visual||!cinematic&&viewState.current.mode!=='cockpit',distance:cameraStats?.distance??viewState.current.distance,pan:Math.cos(viewState.current.azimuth)});
      if(now-lastUi>33&&(running.current||p?.active||flight.current.time!==lastPublished)){lastUi=now;lastPublished=flight.current.time;setState({...flight.current});if(p?.active)setCruiseFrame({phase:p.phase,elapsed:p.elapsed,opacity:p.opacity,committed:p.committed,radio:p.radio.active});}
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
    window.__flightSim={snapshot:()=>{const{checkpoint,...s}=flight.current;return{...s,playing:running.current,timeScale:rate.current};},airportPresentation:()=>presentation.current?{...presentation.current}:null,cruiseTransition:()=>cruise.current?{phase:cruise.current.phase,elapsed:cruise.current.elapsed,opacity:cruise.current.opacity,committed:cruise.current.committed}:null,prefetch:()=>{const p=worlds.prepared();return p?{airportId:p.id,ready:p.ready&&p.warmed,dataReady:p.ready,error:p.error,progress:p.progress,warmed:p.warmed}:null;},stats:()=>worlds.current()?.view.stats?.(),viewStats:()=>({...worlds.current()?.view.viewStats?.(),selection:{...viewState.current}}),aircraftStats:()=>worlds.current()?.view.aircraftStats?.(),audioStats:()=>sound.current?.stats(),motionStats:()=>lastMotion.current,missingTranslations};
    return()=>{alive=false;cancelAnimationFrame(frame);worlds.dispose();worldManager.current=null;sound.current?.cancelSpeech();delete window.__flightSim;};
  },[resetRate,handleAirportChange,beginCruise]);
  useEffect(()=>()=>{sound.current?.dispose();sound.current=null;},[]);
  useEffect(()=>{
    const last=state.callouts.at(-1);if(last&&last.id>lastSpoken.current){lastSpoken.current=last.id;if(playing)sound.current?.say(last.spoken);}
  },[state.calloutSequence,playing]);
  useEffect(()=>{
    const controlled=new Set(['Digit1','Digit2','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyG','KeyF','Space','KeyP','KeyR','Escape','KeyH','ShiftLeft','ShiftRight','KeyA','KeyD','KeyU','KeyI','KeyT','KeyB','KeyM','KeyV','KeyC','KeyZ','KeyL','KeyK','KeyX','KeyQ','KeyE']);
    function down(e){
      if(cruise.current?.active){if(controlled.has(e.code)||e.code==='Tab')e.preventDefault();return;}
      if(!controlled.has(e.code))return;
      if(window.matchMedia('(orientation: portrait)').matches){e.preventDefault();return;}
      if(showLevels){if(e.code==='Escape')setShowLevels(false);return;}
      e.preventDefault();
      if(e.repeat&&!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS'].includes(e.code))return;
      if(['Digit1','Digit2'].includes(e.code)){selectView({Digit1:'cockpit',Digit2:'exterior'}[e.code]);return;}
      if(e.code==='KeyP'||e.code==='Escape'){if(help)setHelp(false);else pause();return;}
      if(e.code==='KeyR'){reset(flight.current.mode,true);return;}
      if(e.code==='KeyK'){retryStage();return;}
      if(e.code==='KeyH'){updatePlaying(false);setHelp(v=>!v);return;}
      if(flight.current.result||startedRef.current&&presentation.current?.active)return;
      const shifted=e.shiftKey||keys.current.has('ShiftLeft')||keys.current.has('ShiftRight');
      const actions={KeyG:toggleGear,KeyF:s=>stepFlaps(s,shifted?-1:1),KeyA:toggleAP,KeyI:toggleApproach,KeyD:s=>{s.flightDirector=!s.flightDirector;},KeyU:toggleAutoThrust,KeyT:s=>s.mode!=='landing'?setDetent(s,'TOGA'):beginGoAround(s,s.warning||'主动复飞'),KeyB:s=>{s.spoilersArmed=!s.spoilersArmed;},KeyM:cycleAutoBrake,KeyV:toggleReverse,KeyC:confirmAction,KeyZ:s=>setDetent(s,'IDLE'),KeyL:s=>setDetent(s,'CL')};
      if(actions[e.code]){act(actions[e.code]);return;}if(e.code==='KeyX'){toggleRate();return;}
      if(running.current){if(!e.repeat){const nudge={ArrowUp:[-.08,0],ArrowDown:[.08,0],ArrowRight:[0,.08],ArrowLeft:[0,-.08]}[e.code];if(nudge){adjustStick(flight.current,...nudge.map(v=>v*(shifted?.5:1)));publish();}}keys.current.add(e.code);}
    }
    const up=e=>keys.current.delete(e.code),blur=()=>{keys.current.clear();touch.current={};if(running.current)updatePlaying(false);},visibility=()=>{if(document.hidden)blur();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);};
  },[pause,reset,retryStage,help,showLevels,updatePlaying,act,publish,toggleRate,selectView]);
  function fullscreen(){if(cruise.current?.active)return;if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>{});}
  function toggleSound(){if(cruise.current?.active)return;setMuted(v=>{sound.current.muted=!v;if(!v)sound.current.cancelSpeech();return!v;});sound.current?.start().catch(()=>{});}
  const pointer=key=>({onPointerDown:e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);if(running.current&&!presentation.current?.active&&!cruise.current?.active){const nudge={up:[-.08,0],down:[.08,0],right:[0,.08],left:[0,-.08]}[key];if(nudge){adjustStick(flight.current,...nudge);publish();}touch.current[key]=true;}},onPointerUp:()=>{touch.current[key]=false;},onPointerCancel:()=>{touch.current[key]=false;},onLostPointerCapture:()=>{touch.current[key]=false;}});
  function dragStick(e){const r=e.currentTarget.getBoundingClientRect();pointerStick.current={pointerId:e.pointerId,pitch:Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1)),roll:Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1))};}
  const stickPointer={onPointerDown:e=>{if(!running.current||cruise.current?.active)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);dragStick(e);},onPointerMove:e=>{if(pointerStick.current?.pointerId===e.pointerId)dragStick(e);},onPointerUp:e=>{if(pointerStick.current?.pointerId===e.pointerId)pointerStick.current=null;},onPointerCancel:()=>{pointerStick.current=null;},onLostPointerCapture:()=>{pointerStick.current=null;}};
  const orbitPointers={
    onPointerDown:e=>{if(cruise.current?.active||viewState.current.mode!=='exterior'||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);cameraPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});},
    onPointerMove:e=>{if(cruise.current?.active)return;const previous=cameraPointers.current.get(e.pointerId);if(!previous)return;const others=[...cameraPointers.current.entries()].filter(([id])=>id!==e.pointerId);if(others.length){const other=others[0][1],before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(before>2&&after>2)zoomView(viewState.current,Math.log(before/after)/.0025);}else orbitView(viewState.current,e.clientX-previous.x,e.clientY-previous.y);cameraPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});},
    onPointerUp:e=>{cameraPointers.current.delete(e.pointerId);},onPointerCancel:e=>{cameraPointers.current.delete(e.pointerId);},onLostPointerCapture:e=>{cameraPointers.current.delete(e.pointerId);},
    onDoubleClick:()=>{if(!cruise.current?.active)resetView(viewState.current);},onContextMenu:e=>e.preventDefault(),
  };
  const intro=started&&!showLevels&&!help&&!state.result&&(airportIntro(state)||presenting);
  useEffect(()=>{const el=scenery.current?.parentElement?.querySelector('.external-camera-input');if(!el)return;const wheel=e=>{e.preventDefault();if(cruise.current?.active)return;zoomView(viewState.current,e.deltaY);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[viewMode,showLevels,help,intro]);
  const cutsceneActive=!!cruiseFrame,callout=state.callouts.at(-1),showCard=!cutsceneActive&&!showLevels&&!playing&&!help&&!state.result&&(!started||viewMode==='cockpit'&&!intro),level=getLevel(state.levelId),wind=windReadout(state.airData.wind,runwayHeading(state));
  const ground=groundActive(state),destinationProgress=cruiseFrame?.committed?{...loadingProgress,airportId:state.airline?.destination,error}:prefetchProgress;
  const blockTransitionInput=e=>{if(cruise.current?.active){e.preventDefault();e.stopPropagation();}};
  return <main className="sim-shell"><div onClickCapture={blockTransitionInput} onPointerDownCapture={blockTransitionInput} data-cruise-transition={cruiseFrame?.phase} className={`stage ${cutsceneActive?'cruise-active':''} ${intro?'ground-cinematic':''} ${viewMode!=='cockpit'?'view-exterior':''} ${viewMode==='exterior'&&externalInstruments?'instruments-expanded':''}`} data-active-view={viewMode} inert={portrait}>
    {cutsceneActive&&<div ref={cutsceneOverlay} className="cruise-cutscene" role="status" aria-label="巡航转场" data-phase={cruiseFrame.phase} style={{backgroundColor:`rgba(0,0,0,${cruiseFrame.opacity})`}}>
      {!cruiseFrame.committed&&cruiseFrame.radio&&<aside className="cruise-radio" style={{opacity:1-cruiseFrame.opacity}}><small>{cruiseFrame.radio.role==='tower'?'空管':'飞行员'}</small><p>{cruiseFrame.radio.text}</p></aside>}
      <DestinationProgress progress={destinationProgress}/>
    </div>}
    {!cutsceneActive&&!showLevels&&state.airline&&!state.airline.cruiseSkipped&&prefetchProgress&&<DestinationProgress progress={prefetchProgress}/>}
    {state.airportId!=='training'&&!showLevels&&<a className="airport-attribution" href={siteUrl(['xiaoshan','changi','jfk','kansai','daxing'].includes(state.airportId)?`assets/cities/${state.airportId}/sources-v${state.airportId==='xiaoshan'?2:1}.json`:`assets/maps/${state.airportId==='lax'?'lax-city':state.airportId}-source.json`)} target="_blank" rel="noreferrer">{airportOf(state).ident} · © OpenStreetMap contributors / ODbL · OurAirports · Mapzen / USGS{state.airportId==='lax'?' · USDA NAIP 2022':state.airportId==='xiaoshan'?' · Sentinel-2 · EAB':state.airportId==='changi'?' · Sentinel-2':state.airportId==='jfk'?' · USDA NAIP 2022':state.airportId==='kansai'?' · GSI · Microsoft':state.airportId==='daxing'?' · S2 · EAB':''}</a>}
    <button className="language-switch" onClick={()=>setLanguage(language==='zh'?'en':'zh')} aria-label={language==='zh'?'Switch to English':'Switch to Chinese'} title={language==='zh'?'English interface and radio':'Chinese interface and radio'}>{language==='zh'?'EN':'ZH'}</button>
    <div className="scenery" ref={scenery}/>{viewMode!=='cockpit'&&!showLevels&&!help&&!intro&&<div className="external-camera-input" {...orbitPointers} aria-label="机外镜头操作区"/>}{viewMode==='cockpit'&&<div className="cockpit-rig" ref={cockpitRig}><img className="cockpit-frame" src={FCU_FRAME_ASSET} alt="" draggable="false"/><Instruments state={state}/>    <FCU state={state} onAction={act} physical/>
    <AircraftControls state={state} onAction={act} brakePointer={pointer('brake')}/>
</div>}
    {!showLevels&&!help&&<ViewSelector mode={viewMode} onSelect={selectView} expanded={externalInstruments} onToggle={()=>setExternalInstruments(v=>!v)}/>}
    {viewMode!=='cockpit'&&!showLevels&&!help&&!intro&&<ExternalView state={state} onAction={act} brakePointer={pointer('brake')} expanded={externalInstruments} stick={<StickReadout ground={ground} pitch={state.stickPitch} roll={state.stickRoll} pointer={stickPointer}/>}/>}
    {viewMode==='cockpit'&&!showLevels&&!help&&!intro&&<div className="cockpit-stick-panel"><StickReadout ground={ground} pitch={state.stickPitch} roll={state.stickRoll} pointer={stickPointer}/></div>}
    <header className="toolbar"><div className="mode-switch level-toolbar"><button className="selected level-menu-button" onClick={openLevels} aria-label="选择关卡"><ListChecks/><span>关卡</span></button><span className="current-level-title">{String(level.order).padStart(2,'0')} · {level.title}{state.mission?.practice&&<small> · 阶段练习</small>}</span></div>
    <div className={`instruction ${state.warning||state.mission?.alert||state.terrain?.level||state.routeProtection?.warning||state.atc?.deviation&&(state.atc.seconds>=6||state.atc.terrainPriority)?'caution':''}`} role="status">{state.warning?<Warning weight="fill"/>:<span className="status-dot"/>}<span>{getInstruction(state)}</span></div>
    <div className="toolbar-actions"><button className={`icon-button ${showProcedure?'active':''}`} onClick={()=>setShowProcedure(v=>!v)} aria-label="显示或隐藏飞行流程" title="飞行流程"><ListChecks/></button><button className="icon-button" onClick={()=>{updatePlaying(false);setHelp(true);}} aria-label="操作说明" title="操作说明 · H"><Info/></button><button className="icon-button sound-button" onClick={toggleSound} aria-label={muted?'开启声音':'静音'}>{muted?<SpeakerSlash/>:<SpeakerHigh/>}</button><button className="icon-button fullscreen-button" onClick={fullscreen} aria-label="全屏"><ArrowsOut/></button><button className="icon-button pause-button" onClick={pause} disabled={!loaded||!!error||!!state.result} aria-label={playing?'暂停':'继续飞行'}>{playing?<Pause weight="fill"/>:<Play weight="fill"/>}</button></div></header>
    {started&&!showLevels&&!help&&!state.result&&!intro&&showProcedure&&(ground?<GroundPanel state={state} onAction={act} onRetry={retryStage}/>:['climb','cruise-ready','arrival'].includes(state.airline?.phase)?<FlightJourneyPanel state={state} onAction={act} onSkipCruise={()=>beginCruise()}/>:state.airline?.phase==='arrival-preview'?null:<ProcedurePanel state={state} onAction={act} onRetry={retryStage}/>)}
    {!showLevels&&started&&callout&&!state.terrain?.level&&state.time-callout.time<5&&!help&&<div className={`callout-banner ${callout.kind}`} aria-live="polite">{callout.text}</div>}
    {!showLevels&&started&&state.radio?.active&&!help&&!state.result&&<aside className={`radio-caption ${state.radio.active.role} ${state.radio.active.emergency||''}`}
 aria-label="自动无线电通话"><span>{state.radio.active.role==='tower'?(state.airportId!=='training'?'塔台 · 场景频道':'塔台 · 118.700'):'飞行员 · 云际320'}<small>{state.radio.active.emergency==='distress'?'遇险通话':state.radio.active.emergency==='urgency'?'紧迫通话':'自动通话'}</small></span><p>{state.radio.active.text}</p></aside>}
    {started&&!showLevels&&!help&&!state.result&&!intro&&!ground&&state.atc?.clearance&&<aside className={`atc-clearance ${state.atc.terrainPriority?'danger':state.routeProtection?.warning||state.atc.deviation&&state.atc.seconds>=6?'deviation':''}`} aria-label="空管当前许可">
      <span>ATC · 当前许可<small>{state.atc.terrainPriority?'避障优先':'自动通话'}</small></span><strong>{state.atc.clearance.label}</strong>
      <p>{state.atc.clearance.altitude!==null?`${state.atc.clearance.climb?'爬升 / 保持':'保持'} ${Math.round(state.atc.clearance.altitude)} ft`:'按进近 / 滑翔路径飞行'}{state.atc.clearance.heading!==undefined?` · 航向 ${Math.round(state.atc.clearance.heading)}°`:''}</p>
      {state.atc.deviation&&(state.atc.seconds>=6||state.atc.terrainPriority)&&<em>{state.atc.deviation.text}</em>}
      {state.routeProtection?.warning&&!state.routeProtection.suspended&&<em>{`航路偏离 ${(state.routeProtection.distance/1000).toFixed(1)} km`}{state.routeProtection.remaining!==null?` · 持续偏离将失败，剩余 ${Math.ceil(state.routeProtection.remaining)} 秒`:''}</em>}
    </aside>}
    {started&&!showLevels&&!help&&!state.result&&state.stallWarning?.active&&<div className="stall-alert" role="alert"><strong>STALL · 失速警告</strong><span>前推侧杆降低迎角 · 检查速度与推力</span></div>}
    {started&&!showLevels&&!help&&!state.result&&state.terrain?.level>0&&<div className={`terrain-alert severity-${state.terrain.level}`} role="alert"><strong>{state.terrain.level===2?'PULL UP':'TERRAIN AHEAD'}</strong><span>{state.terrain.level===2?'地形危险 · 立即避让':'前方地形升高'}</span></div>}
    {intro&&<div className="airport-intro"><p>{airportOf(state).english} · {airportOf(state).ident}</p><h2>{airportOf(state).name}</h2><span>{state.airline?.phase==='arrival-preview'||presenting?'目的机场 · 进近前展示':`${state.ground?.stand} 机位 · 自动离位准备`}</span><button className="text-button skip-intro" onClick={skipIntro}>跳过机场展示</button></div>}
    {started&&!loaded&&!showLevels&&!showCard&&<div className="ground-transition"><div className="airport-loading-card">{error?<p role="alert">{error}</p>:<><h2>正在准备目标机场…</h2><LoadingProgress progress={loadingProgress}/></>}</div></div>}
    {started&&!showLevels&&!help&&!state.result&&['leaving','skip'].includes(state.ground?.stage)&&<div className="ground-transition"><span>{getInstruction(state)}</span></div>}
    {viewMode!=='cockpit'&&started&&!playing&&!showLevels&&!help&&!state.result&&!intro&&<div className="external-paused">已暂停 · 镜头仍可操作</div>}
    {showCard&&<Briefing state={state} onReset={reset} onStart={started?pause:start} onHelp={()=>setHelp(true)} loaded={loaded} error={error} started={started} loadingProgress={loadingProgress}/>}
    {!showLevels&&state.result&&!help&&<LevelResult state={state} onRetry={retryStage} onRestart={()=>reset(state.mode,true)} onNext={()=>reset(null,false,{levelId:nextLevel(state.levelId).id})} onMenu={openLevels}/>}
    {showLevels&&<LevelSelect key={state.levelId} progress={progress} currentId={state.levelId} onChoose={id=>reset(null,false,{levelId:id})} onClose={()=>setShowLevels(false)}/>}
    {help&&<section className="help-panel a320-help" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button close-help" onClick={()=>setHelp(false)} aria-label="关闭操作说明"><X/></button><p className="eyebrow">手飞、引导与进近程序</p><h2 id="help-title">飞行由你掌握。</h2><p className="help-level-note">当前：{level.title} · {level.keys}</p><div className="help-grid">{[['1 / 2','驾驶舱 / 机外'],['↑ / ↓','前推压头 / 后拉抬头'],['← / →','滚入 / 反向改平'],['Shift','按住精细操纵'],['W / S','增减推力杆'],['F / ⇧F','襟翼放 / 收一档'],['G','起落架'],['Q / E','方向舵左 / 右（默认辅助）'],['I / A','APPR 预位 / AP1'],['D / U','FD / 自动推力'],['B / M','扰流板预位 / 自动刹车'],['Z / L','IDLE / CL 档'],['T / V','TOGA 复飞 / 反推'],['空格','手动刹车']].map(([key,label])=><div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><p className="help-tip"><strong>松键回杆，飞机保留已有姿态；反向操纵逐步改平。</strong><br/>完整进近：I 预位，按指引减速放襟翼、放轮并完成着陆检查。AP1 可辅助截获与跟踪，200 英尺以下手动接管。30 英尺附近拉平，Z 收到 IDLE，接地后反推与制动。不稳定时按 T 复飞；着陆关卡随后按 ND 继续返场，最终落地停稳才通关。</p><button className="text-button rudder-assist-toggle" aria-pressed={state.controls.rudderAssist} onClick={()=>act(f=>{f.controls.rudderAssist=!f.controls.rudderAssist;})}>方向舵辅助：{state.controls.rudderAssist?'开启':'关闭'} · Q / E 手动修正</button><button className="text-button cabin-motion-toggle" onClick={cycleCabin}>驾驶舱颠簸：{cabinScale===1?'标准':cabinScale===.35?'减弱':'关闭'}</button><button className="primary-button" onClick={()=>{setHelp(false);if(!state.result)start();}} disabled={!loaded||!!error}><Play weight="fill"/>明白，开始飞行</button><p className="help-tip">机外方向键始终按飞机自身方向操纵。机外视角默认从机尾跟随；拖动画面空白处环绕，滚轮或双指缩放，双击回到机尾。暂停时仍可观察。</p><p className="help-tip">底部快进：按住 2×，向上拖动 4×，松开恢复正常速度。</p><p className="help-shortcuts">P 暂停 · R 从头重试 · K 重试阶段 · X 高空 2× · 杆位框可拖动</p></section>}
    <footer className="cockpit-footer"><span className="flight-label"><span className="status-dot"/>{state.weight} t · 风 {Math.round(wind.directionDeg)}° / {Math.round(wind.speedKt)} kt</span><div className="keyboard-legend"><Keyboard/><span><kbd>↑↓←→</kbd>侧杆</span><span><kbd>F / ⇧F</kbd>襟翼</span><span><kbd>G</kbd>起落架</span><span><kbd>Z</kbd>怠速</span><span><kbd>T</kbd>TOGA</span><span><kbd>空格</kbd>刹车</span></div><FastForwardButton scale={timeScale} onChange={setHeldRate} cancelKey={fastForwardReset} disabled={!playing||!loaded||showLevels||help||!!error||!!state.result}/><button className="retry-button" onClick={()=>reset(state.mode,true)} disabled={!loaded||!!error} title="从头重试 · R"><ArrowCounterClockwise/></button></footer>
  </div><aside className="touch-controls" aria-label="触屏操纵" inert={portrait||cutsceneActive}><span>↑ 前推压头 · ↓ 后拉抬头 · 松手回中</span><div className="touch-buttons"><button {...pointer('left')} aria-label="左转"><ArrowLeft/></button><button {...pointer('up')} aria-label="前推压机头"><ArrowUp/></button><button {...pointer('down')} aria-label="后拉抬机头"><ArrowDown/></button><button {...pointer('right')} aria-label="右转"><ArrowRight/></button><button {...pointer('brake')}>刹车</button></div></aside>{portrait&&<div className="orientation-guard"><section className="orientation-dialog" role="dialog" aria-modal="true" aria-labelledby="orientation-title" aria-describedby="orientation-description" tabIndex={-1}><div className="orientation-symbol" aria-hidden="true"><ArrowCounterClockwise size={34}/></div><h1 id="orientation-title">请横屏游玩</h1><p id="orientation-description">旋转设备或加宽窗口后继续。</p>{started&&<p className="orientation-paused">飞行已暂停，转回横屏后点击继续。</p>}<button disabled={cutsceneActive} className="orientation-language" onClick={()=>setLanguage(language==='zh'?'en':'zh')}>{language==='zh'?'English':'ZH'}</button></section></div>}</main>;
}

function DestinationProgress({progress}){
  if(!progress?.airportId)return null;
  const percent=progress.percent??0;
  return <div className="destination-prefetch" role="progressbar" aria-label="目的机场加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span>{progress.error?'目的机场载入失败，正在重试…':percent===100?'目的机场已准备就绪':'目的机场准备中'}</span> · {airportOf(progress.airportId).iata} · {percent}%</div>;
}
