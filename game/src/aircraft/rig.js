// Shared visual actuator runner. A model supplies node bindings and coefficients;
// no manufacturer/model names or physics state writes belong in this module.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const curve=(values,p)=>{const i=Math.min(values.length-2,Math.floor(p)),u=p-i;return values[i]+(values[i+1]-values[i])*u;};
export const rigNodeNames=d=>[...new Set([...d.visual.rig.transforms.map(t=>t.node),...d.visual.rig.fans.map(t=>t.node),...d.visual.rig.wheels.map(t=>t.node),...d.visual.rig.lamps.map(t=>t.node),...d.visual.detailGroups])];
export function createAircraftRig(get,d){
 const settings=d.visual.rig,targets=new Map(),visibility=[];
 for(const t of settings.transforms){
  const object=get(t.node);if(!object)continue;
  const key=t.node+':'+t.property+':'+t.axis;
  if(!targets.has(key))targets.set(key,{object,property:t.property,axis:t.axis,rest:t.property==='position'?object.position[t.axis]:0,terms:[]});
  targets.get(key).terms.push(t);
  if(t.visible)visibility.push({object,...t.visible});
 }
 const actuators=[...targets.values()],fans=settings.fans.map(f=>({...f,object:get(f.node),angle:0})),wheels=settings.wheels.map(w=>({...w,object:get(w.node)})),lamps=settings.lamps.map(l=>({...l,object:get(l.node)}));
 let previousTime=null,wheelPhase=0;
 return{update(s,dt=0){
  const time=Number.isFinite(s.time)?s.time:0,elapsed=dt<=0||previousTime===null||time<previousTime||time-previousTime>1?0:clamp(time-previousTime,0,.25);previousTime=time;
  const gear=clamp(s.gearPosition??(s.gear?1:0)),flaps=clamp(s.flapPosition??s.flaps??0,0,d.flaps.labels.length-1),pitch=clamp(s.autoPilot?(s.controls?.pitchCommand??0)/d.controls.pitchCommandRate:(s.stickPitch??0),-1,1),roll=clamp(s.autoPilot?(s.controls?.rollCommand??0)/d.controls.rollCommandRate:(s.stickRoll??0),-1,1),rudder=clamp(s.controls?.rudderApplied??s.controls?.rudder??0,-1,1),steer=clamp(s.ground?.steering??rudder,-1,1),spoiler=clamp(Number(s.spoilersDeployed)||0);
  const signals={gearPosition:gear,retractedGear:1-gear,gearDoor:Math.sin(Math.PI*gear),flapPosition:flaps,flapAngle:curve(d.flaps.angles,flaps),slatFraction:clamp(flaps),pitch,roll,rudder,steer,spoiler};
  for(const engine of d.engines){const e=s.engines?.[engine.id];signals['reverse'+engine.id]=engine.reverseAvailable!==false&&s.reverse&&s.landed&&s.throttle<d.thrust.idleThreshold&&e?.status==='running'&&e.thrustN<0?clamp((e.spool||0)/d.propulsion.reverseCommand):0;}
  for(const t of actuators){let value=t.rest;for(const term of t.terms)value+=signals[term.signal]*term.scale+(term.offset??0);t.object[t.property][t.axis]=value;}
  for(const v of visibility)v.object.visible=signals[v.signal]>v.above;
  const fanAngles={};
  for(const f of fans){const e=s.engines?.[f.engine],spool=clamp(e?.spool??0),n1=clamp(e?.n1??(e?.status==='running'?d.propulsion.idleN1+spool*d.propulsion.n1Range:0),0,100),rate=n1/100*settings.fanRate;f.angle=(f.angle+elapsed*rate)%(Math.PI*2);if(f.object)f.object.rotation[f.axis]=f.angle;fanAngles[f.key]=f.angle;}
  const gs=s.airData?.groundSpeed??Math.hypot(s.velocity?.x??0,s.velocity?.z??0);wheelPhase=(wheelPhase+elapsed*Math.max(0,gs)/settings.wheelRadius)%(Math.PI*2);
  for(const w of wheels)if(w.object)w.object.rotation.x=wheelPhase*w.scale;
  for(const l of lamps){if(!l.object)continue;if(l.kind==='beacon')l.object.visible=time%1.1<.13;else if(l.kind==='strobe'){const p=time%1.25;l.object.visible=p<.045||p>.11&&p<.155;}else l.object.visible=gear>.1||(!s.airborne&&(s.throttle??0)>.15);}
  return{gearPosition:gear,flapPosition:flaps,spoilersDeployed:spoiler,noseSteering:steer,engines:(s.engines||[]).map(e=>({status:e.status,spool:e.spool,n1:e.n1})),fanAngles,time,surfaces:{pitch,roll,rudder}};
 }};
}
