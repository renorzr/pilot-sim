import {getLevel} from './missions/catalog.js';
import {levelChecks,holdConfiguration,acknowledgeLevel} from './missions/runtime.js';
import { AirplaneLanding, ArrowCounterClockwise, CheckCircle, Play, Warning } from '@phosphor-icons/react';
import { clamp, FLAPS, FLAP_LIMITS, KT, NM, PHASES, radioAltitude, thrustDetent, targetSpeed, landingChecks, stepFlaps, toggleGear, toggleAP, toggleApproach, setDetent, setLever, cycleAutoBrake, toggleReverse, beginGoAround, confirmChecklist,toggleAutoThrust,confirmAction } from './flight.js';

export function FCU({state:s,onAction,children}){
  const change=(key,delta,min,max)=>onAction(f=>{f[key]=clamp(f[key]+delta,min,max);if(key==='selectedSpeed')f.speedMode='selected';if(key==='selectedHeading')f.selectedHeading=(f.selectedHeading+360)%360;});
  return <section className="fcu-panel" aria-label="飞行控制面板 FCU">
    <div className="fcu-selection"><button className="fcu-label" onClick={()=>onAction(f=>{f.speedMode=f.speedMode==='managed'?'selected':'managed';})} title="切换管理 / 选择速度">SPD <small>{s.speedMode==='managed'?'管理':'选择'}</small></button><div><button aria-label="目标速度减少" onClick={()=>change('selectedSpeed',-5,125,250)}>−</button><output>{Math.round(targetSpeed(s))}</output><button aria-label="目标速度增加" onClick={()=>change('selectedSpeed',5,125,250)}>+</button></div></div>
    <div className="fcu-selection"><span className="fcu-label">HDG</span><div><button aria-label="目标航向减少" onClick={()=>change('selectedHeading',-5,-5,360)}>−</button><output>{s.selectedHeading}</output><button aria-label="目标航向增加" onClick={()=>change('selectedHeading',5,-5,360)}>+</button></div></div>
    <div className="fcu-selection altitude-selection"><span className="fcu-label">ALT <small>ft</small></span><div><button aria-label="目标高度减少" onClick={()=>change('selectedAltitude',-500,1000,6000)}>−</button><output>{s.selectedAltitude}</output><button aria-label="目标高度增加" onClick={()=>change('selectedAltitude',500,1000,6000)}>+</button></div></div>
    <button className={`fcu-mode ${s.autoPilot?'on':''}`} disabled={!s.systems.apAvailable} onClick={()=>onAction(toggleAP)} aria-pressed={s.autoPilot} aria-label="自动驾驶 AP1">AP1<small>A</small></button>
    <button className={`fcu-mode ${s.flightDirector?'on':''}`} onClick={()=>onAction(f=>{f.flightDirector=!f.flightDirector;})} aria-pressed={s.flightDirector} aria-label="飞行指引 FD">FD<small>D</small></button>
    <button className={`fcu-mode ${s.autoThrust?'on':''}`} disabled={!s.systems.autoThrustAvailable} onClick={()=>onAction(toggleAutoThrust)} aria-pressed={s.autoThrust} aria-label="自动推力 A/THR">A/THR<small>{s.systems.autoThrustAvailable?'U':'FAULT'}</small></button>
    <button className={`fcu-mode ${s.apprArmed?'on':''}`} disabled={s.goAround||s.mode!=='landing'||!s.systems.ils.localizer||!s.systems.ils.glideSlope} onClick={()=>onAction(toggleApproach)} aria-pressed={s.apprArmed} aria-label="进近预位 APPR">APPR<small>I</small></button>
    {children}
  </section>;
}
export function AircraftControls({state:s,onAction,brakePointer}){
  const configLocked=holdConfiguration(s),flapsLocked=configLocked||s.systems.flapsJammed;
  const movingGear=Math.abs(s.gearPosition-(s.gear?1:0))>.02;
  const movingFlaps=Math.abs(s.flapPosition-s.flaps)>.04;
  return <section className="controls a320-controls" aria-label="飞机构型与推力">
    <div className="throttle-control"><label htmlFor="throttle">推力杆</label><output>{thrustDetent(s)}</output>
      <div className="throttle-track"><input id="throttle" type="range" min="0" max="100" value={Math.round(s.throttle*100)} disabled={!!s.result} aria-label="推力杆位置" onChange={e=>onAction(f=>setLever(f,Number(e.target.value)/100))}/><span className="lever-mark cl-mark">CL</span></div>
      <div className="detent-buttons"><button onClick={()=>onAction(f=>setDetent(f,'CL'))} title="CL 档 · L" aria-label="推力杆 CL">CL</button><button onClick={()=>onAction(f=>setDetent(f,'IDLE'))} title="IDLE · Z" aria-label="推力杆 IDLE">IDLE</button></div>
    </div>
    <div className="switches">
      <button onClick={()=>onAction(toggleGear)} className={`cockpit-switch ${movingGear?'moving':''}`} disabled={!!s.result||configLocked} aria-pressed={s.gear} aria-label="起落架 G"><span>起落架 <kbd>G</kbd></span><span className="gear-lights" aria-hidden="true">{[0,1,2].map(i=><i key={i} className={movingGear?'transit':s.gearPosition>.98?'on':''}/>)}</span><small>{movingGear?'移动中':s.gearPosition>.98?'已放下':'已收起'}</small></button>
      <div className="cockpit-switch flaps-switch"><span>襟翼 <kbd>F / ⇧F</kbd></span><strong className="flap-status">{s.systems.flapsJammed?`${FLAPS[Math.round(s.flapPosition)]} 卡阻`:FLAPS[s.flaps]}<small>{configLocked?' 保持构型':!s.systems.flapsJammed&&movingFlaps?' 移动中':''}</small></strong><div className="flap-buttons"><button disabled={!!s.result||flapsLocked||s.flaps===0} onClick={()=>onAction(f=>stepFlaps(f,-1))} aria-label="襟翼收一档">−</button><span>CONF</span><button disabled={!!s.result||flapsLocked||s.flaps===4} onClick={()=>onAction(f=>stepFlaps(f,1))} aria-label="襟翼放一档">+</button></div></div>
      <div className="systems-pair"><button className={`cockpit-switch ${s.spoilersArmed?'armed':''}`} onClick={()=>onAction(f=>{f.spoilersArmed=!f.spoilersArmed;})} aria-pressed={s.spoilersArmed} aria-label="扰流板预位 B"><span>扰流板</span><small>{s.spoilersDeployed?'已展开':s.spoilersArmed?'预位 ARM':'未预位'}</small></button><button className={`cockpit-switch ${s.autoBrake!=='OFF'?'armed':''}`} onClick={()=>onAction(cycleAutoBrake)} aria-label="自动刹车 M"><span>自动刹车</span><small>{s.autoBrakeActive?'制动中':s.autoBrake}</small></button></div>
      <div className="systems-pair"><button className={`cockpit-switch ${s.reverse?'engaged':''}`} onClick={()=>onAction(toggleReverse)} aria-pressed={s.reverse} aria-label="反推 V"><span>反推</span><small>{s.reverse?'REV':'V'}</small></button><button {...brakePointer} className={`cockpit-switch brake-switch ${s.brake?'engaged':''}`} aria-label="按住刹车" aria-pressed={s.brake}><span>刹车</span><small>空格</small></button></div>
    </div>
  </section>;
}
export function ProcedurePanel({state:s,onAction,onRetry}){
  const checks=landingChecks(s),ra=radioAltitude(s),ga=s.goAround,level=getLevel(s.levelId),special=level&&level.kind!=='landing';
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
    {label:'速度达到 125 kt',ok:s.speed*KT>=125},
    {label:'离地并收起落架',ok:s.airborne&&s.gearPosition<.02},
  ]:checks;
  const stage=['intercept','configure','final','flare','rollout'].indexOf(s.phase)+1;
  return <aside className={`procedure-panel ${ra<500&&!ga&&!special?'compact':''}`} aria-label="飞行流程">
    <div className="procedure-heading"><span>{level?`${String(level.order).padStart(2,'0')} · ${level.title}`:ga?'复飞程序':s.mode==='takeoff'?'起飞程序':`进近 ${Math.max(1,stage)} / 5`}</span><b>{PHASES[s.phase]}</b></div>
    <div className="procedure-data"><span>RWY 27</span><span>{ga?'SRS / GA TRK':s.mode==='takeoff'?`目标 ${s.route?.targetAltitude||level?.targetAltitude||500} ft`:`VAPP ${s.vapp} kt`}</span></div>
    {level?.requiresLanding&&s.mission?.recovery&&<p className="recovery-note">复飞已记录 · 继续返场，着陆停稳后才能通关</p>}
    {s.mission?.alert&&<p className="mission-alert" role="alert">{s.mission.alert}</p>}
    <ul>{items.map(c=><li key={c.label} className={c.ok?'checked':''}><CheckCircle weight={c.ok?'fill':'regular'}/><span>{c.label}</span></li>)}</ul>
    {s.mode==='landing'&&!ga&&<>
      {!special&&<div className="gate-history">{[1000,500].map(height=>{const gate=s.gates.find(g=>g.height===height);return <span key={height} className={gate?(gate.passed?'passed':'missed'):''}>{height} ft <b>{gate?(gate.preset?'预设完成':gate.passed?'稳定':'不稳定'):'待检查'}</b></span>;})}</div>}
      {s.landed&&s.engines.some(e=>e.status==='running')&&<p className="recovery-note">需要再次起飞时按 T，松开刹车后加速抬轮。</p>}
      {(!special||s.mission?.fault||s.route?.inFinal||s.arrival&&level?.kind!=='dual-glide')&&<button className={`checklist-button ${s.landingChecklistConfirmed?'complete':''}`} disabled={s.landingChecklistConfirmed} onClick={()=>onAction(confirmAction)}>{s.landingChecklistConfirmed?'着陆检查完成':'完成着陆检查 · C'}</button>}
      <button className={`goaround-button ${s.warning.includes('不稳定')?'recommended':''}`} disabled={!!s.result||(!s.airborne&&!s.landed)||s.engines.every(e=>e.status!=='running')} onClick={()=>onAction(f=>beginGoAround(f,s.warning||'主动复飞'))}><AirplaneLanding/>{s.landed?'触地复飞':'复飞'} TOGA <kbd>T</kbd></button>
    </>}
    {(s.mission?.kind==='engine-out'||s.mission?.fault)&&s.mission.triggered&&<button className="checklist-button" disabled={s.mission.acknowledged} onClick={()=>onAction(acknowledgeLevel)}>{s.mission.acknowledged?'故障已确认 · 保持操纵':'确认故障提示 · C'}</button>}
    {ga&&<button className="checklist-button" disabled={holdConfiguration(s)} onClick={()=>onAction(f=>setDetent(f,'CL'))}>{holdConfiguration(s)?'保持 TOGA · 等待脱离':'推力杆 CL · L'}</button>}
    <button className="stage-retry" onClick={onRetry}><ArrowCounterClockwise/>重试本阶段</button>
  </aside>;
}
export function Briefing({state:s,onReset,onStart,onHelp,loaded,error,started}){
  const level=getLevel(s.levelId);
  return <section className="flight-card briefing-card" aria-label={error?'加载失败':started?'已暂停':'进近简报'}>
    <p className="eyebrow">{level?`关卡 ${String(level.order).padStart(2,'0')} / ${level.category}`:'云际 / A320 FLIGHT EXPERIENCE'}</p>
    <h1>{error?'暂时无法起飞':!loaded?'正在准备驾驶舱':started?'飞行已暂停':level?level.title:s.mode==='landing'?'准备进近跑道 27。':'完成一次客机起飞。'}</h1>
    {error?<p className="card-description">{error}</p>:!started&&level?<>
      <p className="card-description level-brief-description">{level.description}</p>
      <div className="briefing-data"><span>跑道 <b>27 · {level.kind==='dual-glide'?'滑翔':s.mode==='landing'?'进近':'起飞'}</b></span><span>{s.mode==='landing'?'着陆目标速度':'抬轮参考'} <b>{s.mode==='landing'?s.vapp:125} kt</b></span><span>{level.targetAltitude?'目标高度':'复飞高度'} <b>{level.targetAltitude?`${level.targetAltitude} ft`:'3000 ft'}</b></span></div>
      {level.kind==='landing'&&<div className="briefing-config"><span>着陆构型</span>{[3,4].map(c=><button key={c} className={s.landingConfig===c?'selected':''} onClick={()=>onReset('landing',false,{landingConfig:c})}>CONF {FLAPS[c]}</button>)}</div>}
      {s.arrival&&<p className="arrival-start-note">起始 {s.arrival.altitude} ft · {s.arrival.speed} kt · 跑道侧方 {Math.abs(s.arrival.x)} m<br/>起落架收起 / 襟翼 0 · {level.kind==='dual-glide'?'应急构型待建立':'检查待完成'}<br/>{level.kind==='dual-glide'?'手飞转向跑道，按时机放轮 / 襟翼':'I 预位 · F / G 构型 · B / M 预位 · C 检查'}</p>}<ul className="level-brief-objectives">{level.objectives.map(o=><li key={o}><CheckCircle/>{o}</li>)}</ul>
      <p className="level-key-hint">{level.keys}{level.requiresLanding&&<><br/>本关需最终着陆停稳 · 复飞后按 ND 继续返场</>}</p>
    </>:!started&&s.mode==='landing'?<>
      <div className="scenario-choice" role="group" aria-label="进近任务"><button className={s.scenario==='full'?'selected':''} onClick={()=>onReset('landing',false,{scenario:'full'})}>完整进近 <small>4–6 分钟</small></button><button className={s.scenario==='short'?'selected':''} onClick={()=>onReset('landing',false,{scenario:'short'})}>短进近 <small>约 90 秒</small></button></div>
      <div className="briefing-data"><span>跑道 <b>27 · ILS 3°</b></span><span>目标速度 <b>{s.vapp} kt</b></span><span>复飞高度 <b>3000 ft</b></span></div>
      <div className="briefing-config"><span>着陆构型</span>{[3,4].map(c=><button key={c} className={s.landingConfig===c?'selected':''} onClick={()=>onReset('landing',false,{landingConfig:c})}>CONF {FLAPS[c]}</button>)}<small>任务预设 · 64 t · 顶风 5 kt</small></div>
      <p className="card-description">{s.scenario==='full'?'从机场外开始，截获 ILS、减速放襟翼、完成检查，再决定落地或复飞。':'已对准 ILS 并完成着陆构型，专注末进近、拉平和接地减速。'}</p>
    </>:<p className="card-description">{!loaded?'正在加载机场素材…':started?'杆位已回中，飞机姿态保持。准备好后继续。':'FLX / TOGA 加速，125 节后按 ↓ 后拉至约 12° 后松键，离地后收轮。'}</p>}
    <div className="card-actions"><button className="primary-button" disabled={!loaded||!!error} onClick={onStart}><Play weight="fill"/>{error?'无法启动':!loaded?'加载中':started?'继续飞行':level?'开始关卡':s.mode==='landing'?'开始进近':'开始起飞'}</button><button className="text-button" onClick={onHelp}>操作说明</button></div>
    {!started&&<p className="assist-note">{level?.kind==='dual-glide'?'手飞 + 滑翔 FD · 无推力 / 无自动驾驶':s.route?'手动起飞 · CL 后 A/THR 控速 · AP1 可选辅助':s.mode==='takeoff'?'手动推力 + FD 指引 · 方向舵辅助默认开启':'手飞 + FD 指引 + A/THR 控速 · AP1 可选辅助'} · 松键回杆</p>}
  </section>;
}
