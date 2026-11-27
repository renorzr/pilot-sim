import {aircraftDefinition,flapLabels,flapLimits} from './aircraft/registry.js';
import {LoadingProgress}from './LoadingProgress.jsx';
import {groundActive,groundFrozen} from './missions/ground.js';
import {cockpitLayoutFor} from './views/fcu-layout.js';
import {getLevel} from './missions/catalog.js';
import {runwayOf,airportOf} from './airports/registry.js';
import {levelChecks,holdConfiguration} from './missions/runtime.js';
import { AirplaneLanding, ArrowCounterClockwise, CheckCircle, Play, Warning } from '@phosphor-icons/react';
import { clamp, KT, NM, PHASES, radioAltitude, thrustDetent, targetSpeed, landingChecks, stepFlaps, toggleGear, toggleAP, toggleApproach, setDetent, setLever, cycleAutoBrake, toggleReverse, beginGoAround, confirmChecklist,toggleAutoThrust,confirmAction } from './flight.js';

function FCUTarget({value,onDecrease,onIncrease,decreaseLabel,increaseLabel}){
 return <div className="fcu-value-control"><output>{value}</output><div className="fcu-step-buttons"><button aria-label={increaseLabel} onClick={onIncrease}>+</button><button aria-label={decreaseLabel} onClick={onDecrease}>−</button></div></div>;
}

export function FCU({state:s,onAction,children,physical=false}){
  const FCU_STYLES=cockpitLayoutFor(s).styles,speedRange=aircraftDefinition(s).operations.selectedSpeedRangeKt;
  const change=(key,delta,min,max)=>onAction(f=>{f[key]=clamp(f[key]+delta,min,max);if(key==='selectedSpeed')f.speedMode='selected';if(key==='selectedHeading')f.selectedHeading=(f.selectedHeading+360)%360;});
  return <section className={`fcu-panel${physical?' fcu-physical':''}`} style={physical?FCU_STYLES.panel:undefined} aria-label="飞行控制面板 FCU">
    <div className="fcu-target-bank" style={physical?FCU_STYLES.targets:undefined}>
    <div className="fcu-selection"><button className="fcu-label" onClick={()=>onAction(f=>{f.speedMode=f.speedMode==='managed'?'selected':'managed';})} title="切换管理 / 选择速度">SPD <small>{s.speedMode==='managed'?'管理':'选择'}</small></button><FCUTarget value={Math.round(targetSpeed(s))} decreaseLabel="目标速度减少" increaseLabel="目标速度增加" onDecrease={()=>change('selectedSpeed',-5,...speedRange)} onIncrease={()=>change('selectedSpeed',5,...speedRange)}/></div>
    <div className="fcu-selection"><span className="fcu-label">HDG</span><FCUTarget value={s.selectedHeading} decreaseLabel="目标航向减少" increaseLabel="目标航向增加" onDecrease={()=>change('selectedHeading',-5,-5,360)} onIncrease={()=>change('selectedHeading',5,-5,360)}/></div>
    <div className="fcu-selection altitude-selection"><span className="fcu-label">ALT <small>{s.airline?.navigation?.procedure?'MSL':'ft'}</small></span><FCUTarget value={Math.round(s.selectedAltitude+(s.airline?.navigation?.elevationFt||0))} decreaseLabel="目标高度减少" increaseLabel="目标高度增加" onDecrease={()=>change('selectedAltitude',-500,1000,6000)} onIncrease={()=>change('selectedAltitude',500,1000,6000)}/></div>
    </div><div className="fcu-mode-bank" style={physical?FCU_STYLES.modes:undefined}>
    <button className={`fcu-mode ${s.autoPilot?'on':''}`} disabled={!s.systems.apAvailable} onClick={()=>onAction(toggleAP)} aria-pressed={s.autoPilot} aria-label="自动驾驶 AP1">AP1<small>A</small></button>
    <button className={`fcu-mode ${s.flightDirector?'on':''}`} onClick={()=>onAction(f=>{f.flightDirector=!f.flightDirector;})} aria-pressed={s.flightDirector} aria-label="飞行指引 FD">FD<small>D</small></button>
    <button className={`fcu-mode ${s.autoThrust?'on':''}`} disabled={!s.systems.autoThrustAvailable} onClick={()=>onAction(toggleAutoThrust)} aria-pressed={s.autoThrust} aria-label="自动推力 A/THR">A/THR<small>{s.systems.autoThrustAvailable?'U':'FAULT'}</small></button>
    <button className={`fcu-mode ${s.apprArmed?'on':''}`} disabled={s.goAround||s.mode!=='landing'||!s.systems.ils.localizer||!s.systems.ils.glideSlope} onClick={()=>onAction(toggleApproach)} aria-pressed={s.apprArmed} aria-label="进近预位 APPR">APPR<small>I</small></button>
    </div>
    {children}
  </section>;
}
export function AircraftControls({state:s,onAction,brakePointer}){
  const definition=aircraftDefinition(s),FLAPS=flapLabels(s);
  const configLocked=holdConfiguration(s)||groundActive(s),flapsLocked=configLocked||s.systems.flapsJammed;
  const movingGear=Math.abs(s.gearPosition-(s.gear?1:0))>.02;
  const movingFlaps=Math.abs(s.flapPosition-s.flaps)>.04;
  return <section className={`controls ${definition.cockpit.controlsClass}`} aria-label="飞机构型与推力">
    <div className="throttle-control"><label htmlFor="throttle">推力杆</label><output>{groundActive(s)?`${Math.round(s.throttle*100)}%`:thrustDetent(s)}</output>
      <div className="throttle-track"><input id="throttle" type="range" min="0" max={groundActive(s)?definition.thrust.taxiLeverMax*100:100} value={Math.round(s.throttle*100)} disabled={!!s.result||groundFrozen(s)} aria-label="推力杆位置" onChange={e=>onAction(f=>setLever(f,Number(e.target.value)/100))}/><span className="lever-mark cl-mark">{groundActive(s)?'TAXI':'CL'}</span></div>
      <div className="detent-buttons"><button disabled={groundActive(s)} onClick={()=>onAction(f=>setDetent(f,'CL'))} title="CL 档 · L" aria-label="推力杆 CL">CL</button><button onClick={()=>onAction(f=>setDetent(f,'IDLE'))} title="IDLE · Z" aria-label="推力杆 IDLE">IDLE</button></div>
    </div>
    <div className="switches">
      <button onClick={()=>onAction(toggleGear)} className={`cockpit-switch ${movingGear?'moving':''}`} disabled={!!s.result||configLocked} aria-pressed={s.gear} aria-label="起落架 G"><span>起落架 <kbd>G</kbd></span><span className="gear-lights" aria-hidden="true">{Array.from({length:definition.gear.lights},(_,i)=>i).map(i=><i key={i} className={movingGear?'transit':s.gearPosition>.98?'on':''}/>)}</span><small>{movingGear?'移动中':s.gearPosition>.98?'已放下':'已收起'}</small></button>
      <div className="cockpit-switch flaps-switch"><span>襟翼 <kbd>F / ⇧F</kbd></span><strong className="flap-status">{s.systems.flapsJammed?`${FLAPS[Math.round(s.flapPosition)]} 卡阻`:FLAPS[s.flaps]}<small>{configLocked?' 保持构型':!s.systems.flapsJammed&&movingFlaps?' 移动中':''}</small></strong><div className="flap-buttons"><button disabled={!!s.result||flapsLocked||s.flaps===0} onClick={()=>onAction(f=>stepFlaps(f,-1))} aria-label="襟翼收一档">−</button><span>CONF</span><button disabled={!!s.result||flapsLocked||s.flaps===FLAPS.length-1} onClick={()=>onAction(f=>stepFlaps(f,1))} aria-label="襟翼放一档">+</button></div></div>
      <div className="systems-pair"><button className={`cockpit-switch ${s.spoilersArmed?'armed':''}`} onClick={()=>onAction(f=>{f.spoilersArmed=!f.spoilersArmed;})} aria-pressed={s.spoilersArmed} aria-label="扰流板预位 B"><span>扰流板</span><small>{s.spoilersDeployed?'已展开':s.spoilersArmed?'预位 ARM':'未预位'}</small></button><button className={`cockpit-switch ${s.autoBrake!=='OFF'?'armed':''}`} onClick={()=>onAction(cycleAutoBrake)} aria-label="自动刹车 M"><span>自动刹车</span><small>{s.autoBrakeActive?'制动中':s.autoBrake}</small></button></div>
      <div className="systems-pair"><button className={`cockpit-switch ${s.reverse?'engaged':''}`} onClick={()=>onAction(toggleReverse)} aria-pressed={s.reverse} aria-label="反推 V"><span>反推</span><small>{s.reverse?'REV':'V'}</small></button><button {...brakePointer} className={`cockpit-switch brake-switch ${s.brake?'engaged':''}`} aria-label="按住刹车" aria-pressed={s.brake}><span>刹车</span><small>空格</small></button></div>
    </div>
  </section>;
}
export function ProcedurePanel({state:s,onAction,onRetry}){
  const checks=landingChecks(s),ra=radioAltitude(s),ga=s.goAround,level=getLevel(s.levelId),special=level&&level.kind!=='landing'&&!(s.airline&&s.mode==='landing');
  const returning=s.mission?.recovery?.stage==='return'&&!s.route?.inFinal;
  const items=returning?[{label:`当前：${s.route.points[s.route.index].name}`,ok:true},{label:`返场目标 ${Math.round(s.route.targetAltitude)} ft`,ok:true},{label:'重新建立构型、完成检查并着陆',ok:false}]:special?levelChecks(s):ga?[
    {label:'TOGA / 爬升',ok:s.verticalSpeed>1},
    {label:'起落架收起',ok:s.gearPosition<.02},
    {label:'襟翼收至 1 或以下',ok:s.flapPosition<=1.05},
    {label:'空速至少 150 kt',ok:s.speed*KT>=150},
    {label:`爬升至 ${s.selectedAltitude} ft 附近`,ok:ra>=s.selectedAltitude-30},
  ]:s.mode==='takeoff'?[
    {label:'襟翼起飞档',ok:s.flaps>=1&&s.flaps<=3},
    {label:'推力 FLX / TOGA',ok:s.throttle>.87},
    {label:`速度达到 ${aircraftDefinition(s).operations.rotationSpeedKt} kt`,ok:s.speed*KT>=aircraftDefinition(s).operations.rotationSpeedKt},
    {label:'离地并收起落架',ok:s.airborne&&s.gearPosition<.02},
  ]:checks;
  const stage=['intercept','configure','final','flare','rollout'].indexOf(s.phase)+1;
  return <aside className={`procedure-panel ${ra<500&&!ga&&!special?'compact':''}`} aria-label="飞行流程">
    <div className="procedure-heading"><span>{level?`${String(level.order).padStart(2,'0')} · ${level.title}`:ga?'复飞程序':s.mode==='takeoff'?'起飞程序':`进近 ${Math.max(1,stage)} / 5`}</span><b>{PHASES[s.phase]}</b></div>
    <div className="procedure-data"><span>RWY {runwayOf(s).id}</span><span>{ga?'SRS / GA TRK':s.mode==='takeoff'?`目标 ${s.route?.targetAltitude||level?.targetAltitude||500} ft`:`VAPP ${s.vapp} kt`}</span></div>
    {level?.requiresLanding&&s.mission?.recovery&&<p className="recovery-note">复飞已记录 · 继续返场，着陆停稳后才能通关</p>}
    {s.mission?.alert&&<p className="mission-alert" role="alert">{s.mission.alert}</p>}
    <ul>{items.map(c=><li key={c.label} className={c.ok?'checked':''}><CheckCircle weight={c.ok?'fill':'regular'}/><span>{c.label}</span></li>)}</ul>
    {s.mode==='landing'&&!ga&&<>
      {!special&&<div className="gate-history">{[1000,500].map(height=>{const gate=s.gates.find(g=>g.height===height);return <span key={height} className={gate?(gate.passed?'passed':'missed'):''}>{height} ft <b>{gate?(gate.preset?'预设完成':gate.passed?'稳定':'不稳定'):'待检查'}</b></span>;})}</div>}
      {s.landed&&s.engines.some(e=>e.status==='running')&&<p className="recovery-note">需要再次起飞时按 T，松开刹车后加速抬轮。</p>}
      {(!special||s.mission?.fault||s.route?.inFinal||s.arrival&&level?.kind!=='dual-glide')&&<button className={`checklist-button ${s.landingChecklistConfirmed?'complete':''}`} disabled={s.landingChecklistConfirmed} onClick={()=>onAction(confirmAction)}>{s.landingChecklistConfirmed?'着陆检查完成':'完成着陆检查 · C'}</button>}
      <button className={`goaround-button ${s.warning.includes('不稳定')?'recommended':''}`} disabled={!!s.result||(!s.airborne&&!s.landed)||s.engines.every(e=>e.status!=='running')} onClick={()=>onAction(f=>beginGoAround(f,s.warning||'主动复飞'))}><AirplaneLanding/>{s.landed?'触地复飞':'复飞'} TOGA <kbd>T</kbd></button>
    </>}
    {(s.mission?.kind==='engine-out'||s.mission?.fault)&&s.mission.triggered&&<button className="checklist-button" disabled={s.mission.acknowledged} onClick={()=>onAction(confirmAction)}>{s.mission.acknowledged?'故障已确认 · 保持操纵':'确认故障提示 · C'}</button>}
    {ga&&<button className="checklist-button" disabled={holdConfiguration(s)} onClick={()=>onAction(f=>setDetent(f,'CL'))}>{holdConfiguration(s)?'保持 TOGA · 等待脱离':'推力杆 CL · L'}</button>}
    <button className="stage-retry" onClick={onRetry}><ArrowCounterClockwise/>重试本阶段</button>
  </aside>;
}
export function Briefing({state:s,onReset,onStart,onHelp,loaded,error,started,loadingProgress}){
  const definition=aircraftDefinition(s),FLAPS=flapLabels(s);
  const level=getLevel(s.levelId),departure=s.airline?.navigation?.procedure?s.airline.navigation:null;
  return <section className="flight-card briefing-card" aria-label={error?'加载失败':started?'已暂停':'进近简报'}>
    <p className="eyebrow">{level?`关卡 ${String(level.order).padStart(2,'0')} / ${level.category}`:definition.cockpit.title}</p>
    <h1>{error?'暂时无法起飞':!loaded?'正在准备驾驶舱':started?'飞行已暂停':level?level.title:s.mode==='landing'?'准备进近跑道 27。':'完成一次客机起飞。'}</h1>
    {!loaded&&!error&&<LoadingProgress progress={loadingProgress}/>}
    {error?<p className="card-description">{error}</p>:!started&&level?<>
      <p className="card-description level-brief-description">{level.description}</p>
      {s.historical?<div className="briefing-data"><span>起点 <b>{s.historical.finalPractice?'末进近练习 · 300 ft':'鸟击 · 双发失去推力'}</b></span><span>构型 <b>{s.historical.finalPractice?'收轮 / CONF 2':'收轮 / CONF 0'}</b></span><span>操纵 <b>{s.mission.practice?'你来操纵':'副驾驶 → 玩家'}</b></span></div>:<div className="briefing-data"><span>跑道 <b>{runwayOf(s).id} · {level.kind==='dual-glide'?'滑翔':s.mode==='landing'?'进近':'起飞'}</b></span><span>{s.mode==='landing'?'着陆目标速度':'抬轮参考'} <b>{s.mode==='landing'?s.vapp:definition.operations.rotationSpeedKt} kt</b></span><span>{departure?'许可海拔':level.targetAltitude?'目标高度':'复飞高度'} <b>{departure?`${Math.round(departure.altitude+departure.elevationFt)} ft MSL`:level.targetAltitude?`${level.targetAltitude} ft`:'3000 ft'}</b></span></div>}
      {s.airportId!=='training'&&!s.historical&&<p className="airport-scope-note">{airportOf(s).ident} / {airportOf(s).iata} · 真实地形与机场轮廓<br/>{departure?'按初始离场程序飞行，遵守海拔高度和转弯条件。':'本游戏采用真航向、机场以上高度及简化飞行程序。'}</p>}
      {s.historical&&<div className="briefing-config" role="group" aria-label="历史关卡模式">{[['guided','引导'],['challenge','挑战']].map(([mode,label])=><button key={mode} className={s.historical.mode===mode&&!s.mission.practice?'selected':''} onClick={()=>onReset(null,false,{historical:{mode}})}>{label}</button>)}<button className={s.mission.practice?'selected':''} onClick={()=>onReset(null,false,{historical:{mode:s.historical.mode,practice:true,finalApproach:true}})}>末进近练习 · 不计成绩</button></div>}{level.kind==='landing'&&<div className="briefing-config"><span>着陆构型</span>{definition.flaps.landingConfigurations.map(c=><button key={c} className={s.landingConfig===c?'selected':''} onClick={()=>onReset('landing',false,{landingConfig:c})}>CONF {FLAPS[c]}</button>)}</div>}
      {s.arrival&&<p className="arrival-start-note">起始 {s.arrival.altitude} ft · {s.arrival.speed} kt · 跑道侧方 {Math.abs(s.arrival.x)} m<br/>起落架收起 / 襟翼 0 · {level.kind==='dual-glide'?'应急构型待建立':'检查待完成'}<br/>{level.kind==='dual-glide'?'手飞转向跑道，按时机放轮 / 襟翼':'I 预位 · F / G 构型 · B / M 预位 · C 检查'}</p>}<ul className="level-brief-objectives">{level.objectives.map(o=><li key={o}><CheckCircle/>{o}</li>)}</ul>
      <p className="level-key-hint">{level.keys}{level.requiresLanding&&<><br/>本关需最终着陆停稳 · 复飞后按 ND 继续返场</>}</p>
    </>:!started&&s.mode==='landing'?<>
      <div className="scenario-choice" role="group" aria-label="进近任务"><button className={s.scenario==='full'?'selected':''} onClick={()=>onReset('landing',false,{scenario:'full'})}>完整进近 <small>4–6 分钟</small></button><button className={s.scenario==='short'?'selected':''} onClick={()=>onReset('landing',false,{scenario:'short'})}>短进近 <small>约 90 秒</small></button></div>
      <div className="briefing-data"><span>跑道 <b>27 · ILS 3°</b></span><span>目标速度 <b>{s.vapp} kt</b></span><span>复飞高度 <b>3000 ft</b></span></div>
      <div className="briefing-config"><span>着陆构型</span>{definition.flaps.landingConfigurations.map(c=><button key={c} className={s.landingConfig===c?'selected':''} onClick={()=>onReset('landing',false,{landingConfig:c})}>CONF {FLAPS[c]}</button>)}<small>任务预设 · 64 t · 顶风 5 kt</small></div>
      <p className="card-description">{s.scenario==='full'?'从机场外开始，截获 ILS、减速放襟翼、完成检查，再决定落地或复飞。':'已对准 ILS 并完成着陆构型，专注末进近、拉平和接地减速。'}</p>
    </>:<p className="card-description">{!loaded?'正在加载机场素材…':started?'杆位已回中，飞机姿态保持。准备好后继续。':'FLX / TOGA 加速，125 节后按 ↓ 后拉至约 12° 后松键，离地后收轮。'}</p>}
    <div className="card-actions"><button className="primary-button" disabled={!loaded||!!error} onClick={onStart}><Play weight="fill"/>{error?'无法启动':!loaded?'加载中':started?'继续飞行':level?'开始关卡':s.mode==='landing'?'开始进近':'开始起飞'}</button><button className="text-button" onClick={onHelp}>操作说明</button></div>
    {!started&&<p className="assist-note">{s.historical?'连续滑翔与水面物理 · 正式飞行固定 1×':level?.kind==='dual-glide'?'手飞 + 滑翔 FD · 无推力 / 无自动驾驶':s.route?'手动起飞 · CL 后 A/THR 控速 · AP1 可选辅助':s.mode==='takeoff'?'手动推力 + FD 指引 · 方向舵辅助默认开启':'手飞 + FD 指引 + A/THR 控速 · AP1 可选辅助'} · 松键回杆</p>}
  </section>;
}
