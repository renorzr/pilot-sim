// Session-only flight data. Never serialise this recorder into browser storage.
// 20 Hz samples are taken inside the physics loop, including accelerated flight.
export const RECORDING_HZ=20;
const CHUNK=1024,precise=['time','x','y','z'];
const numeric=[
 'pitch','yaw','roll','speed','verticalSpeed','pitchRate','rollRate','yawRate',
 'gearPosition','flapPosition','throttle','thrust','stickPitch','stickRoll','weight','flaps',
 'selectedSpeed','selectedHeading','selectedAltitude','systems.jammedPosition',
 'controls.rudder','controls.rudderApplied','controls.rudderTrim','controls.pitchCommand','controls.rollCommand',
 'velocity.x','velocity.y','velocity.z','airData.tas','airData.ias','airData.groundSpeed','airData.alpha','airData.beta','airData.loadFactor',
 'ground.steering','weather.visibility','weather.overcast','weather.rain','weather.cloudBase','weather.ambientTurbulence',
 'weather.wind.speedKt','weather.wind.directionDeg','weather.wind.vertical',
 ...[0,1].flatMap(i=>['spool','n1','thrustN','command','health','lever','maxThrustN'].map(k=>`engines.${i}.${k}`)),
 'touchdown.time','touchdown.descent','touchdown.offset','touchdown.z','touchdown.speed','cabin.noseAt',
 'recordedInput.pitch','recordedInput.steer','recordedInput.throttle','recordedInput.rudder',
];
const booleans=['airborne','landed','gear','autoPilot','autoThrust','flightDirector','reverse','spoilersDeployed','spoilersArmed','brake','controls.rudderAssist','recordedInput.brake','recordedInput.precision','impact','goAround','noseWheelDown','autoThrustActive','systems.autoThrustAvailable','systems.apAvailable','systems.fdAvailable','systems.ils.localizer','systems.ils.glideSlope','systems.flapsJammed','systems.thrustLocked','systems.emergencyPower'];
const strings=['mode','phase','ground.stage','engines.0.status','engines.1.status','speedMode','autoBrake'];
// Optional event-only channel leaves the established packed trajectory layout
// and already exported review artifacts unchanged.
const historyNumeric=['water.damage','water.flooding','water.waterSpeed','water.supportN','water.dragN','water.evacuationSeconds','water.firstImpact.time','water.firstImpact.pitch','water.firstImpact.roll','water.firstImpact.alpha','water.firstImpact.ias','water.firstImpact.sinkMps','water.firstImpact.waterSpeed','historical.crew.birdAt','water.elapsed','water.firstImpact.waterBeta','water.firstImpact.massTonnes','historical.alternate.touchdown.time','historical.alternate.touchdown.ias','historical.alternate.touchdown.sinkMps','historical.alternate.touchdown.pitch','historical.alternate.touchdown.roll'];
const historyStrings=['historical.controlSource','historical.strategy','historical.node','historical.manualTarget','historical.alternate.airport','historical.alternate.runway','water.phase','water.firstImpact.part'];
const historyPaths=[...historyNumeric,...historyStrings],historyParts=historyPaths.map(p=>p.split('.'));
const paths=[...numeric,...booleans,...strings],parts=paths.map(p=>p.split('.'));
const motionFields=['pitch','yaw','roll','gearPosition','airborne'].map(k=>[k,paths.indexOf(k)]);
const get=(s,path)=>{let v=s;for(const key of path)v=v?.[key];return v;};
function put(s,path,value){let o=s;for(let i=0;i<path.length-1;i++){const k=path[i];o=o[k]??=(/^\d+$/.test(path[i+1])?[]:{});}o[path.at(-1)]=value;}
const anglePaths=new Set(['pitch','yaw','roll','weather.wind.directionDeg']);
function mix(a,b,u,angle,degree=false){if(!Number.isFinite(a)||!Number.isFinite(b))return a;if(angle){const period=degree?360:Math.PI*2;return a+(((b-a+period/2)%period+period)%period-period/2)*u;}return a+(b-a)*u;}
function baseState(s){return{airportId:s.airportId||'training',levelId:s.levelId,...(s.historical?{historical:structuredClone(s.historical),aerodynamics:structuredClone(s.aerodynamics)}:{}),weather:structuredClone(s.weather),engines:[{},{}],controls:{},airData:{},velocity:{},systems:structuredClone(s.systems),radio:{language:s.radio?.language,pilotVoice:s.radio?.pilotVoice,towerVoice:s.radio?.towerVoice,towerVoices:structuredClone(s.radio?.towerVoices||{}),active:null,pending:[],history:[],fired:{}},callouts:[],calloutSequence:0,result:null};}
function signals(s){return{time:s.time,x:s.x,y:s.y,z:s.z,airportId:s.airportId,airborne:s.airborne,landed:s.landed,goAround:s.goAround,roll:s.roll,phase:s.phase,water:s.water?.phase,faults:s.mission?.events?.length||0,turn:s.airline?.navigation?.index,gates:s.gates?.length||0,impact:!!s.impact,radio:s.radio?.active?.id??null,callout:s.calloutSequence||0,issuedAt:s.atc?.issuedAt};}
export class FlightRecording{
 constructor(){this.seed=Math.floor(Math.random()*4294967296);this.segments=[];this.spans=[];this.events=[];this.timeline=[];this.attempt=1;this.sealed=false;this.dictionary=[null];this.words=new Map();this.previous=null;}
 startSegment(s,reason='start'){
  if(this.sealed)return null;
  const segment={id:this.segments.length,airportId:s.airportId||'training',attempt:this.attempt,reason,base:baseState(s),chunks:[],count:0,start:s.time,end:s.time};
  this.segments.push(segment);this.spans.push({segment:segment.id,until:Infinity});this.previous=null;this.lastTurn=undefined;this.current=segment;this.write(s);return segment;
 }
 retry(s){
  // A stage retry replaces only the branch after its checkpoint. Earlier
  // completed stages still belong to this mission, regardless of attempt ID.
  // Keep all raw segments for a future full player; trim only the replay path.
  let cut=-1;
  for(let i=this.spans.length-1;i>=0;i--){if(this.segments[this.spans[i].segment].start<=s.time+.051){cut=i;break;}}
  if(cut>=0&&this.segments[this.spans[cut].segment].airportId===(s.airportId||'training')){
   this.spans=this.spans.slice(0,cut+1);this.spans[cut].until=Math.min(this.spans[cut].until,s.time);
   this.spans=this.spans.filter(span=>this.segments[span.segment].start<span.until);
  }else this.spans=[];
  this.sealed=false;this.attempt++;this.lastTurn=undefined;this.startSegment(s,'retry');
 }
 replaySegments(){return this.spans.map(span=>{const seg=this.segments[span.segment];return{...seg,end:Math.min(seg.end,span.until)};}).filter(seg=>seg.end>seg.start);}

 word(value){if(value===undefined||value===null)return 0;const key=String(value);if(!this.words.has(key)){this.words.set(key,this.dictionary.length);this.dictionary.push(key);}return this.words.get(key);}
 write(s,input){
  const seg=this.current;if(!seg)return;
  const same=seg.count&&Math.abs(seg.end-s.time)<1e-8,row=(same?seg.count-1:seg.count)%CHUNK;
  // Forced event samples replace an identical timestamp instead of duplicating it.
  if(!same&&!row)seg.chunks.push({precise:new Float64Array(CHUNK*precise.length),values:new Float32Array(CHUNK*paths.length)});
  const chunk=seg.chunks.at(-1),source={...s,recordedInput:s.historical?s.recordedInput:input||s.recordedInput};
  if(s.historical){chunk.history??=new Float32Array(CHUNK*historyPaths.length);historyPaths.forEach((k,i)=>{const v=get(source,historyParts[i]);chunk.history[row*historyPaths.length+i]=i>=historyNumeric.length?this.word(v):v??NaN;});}
  precise.forEach((k,i)=>{chunk.precise[row*precise.length+i]=s[k];});
  paths.forEach((k,i)=>{const value=get(source,parts[i]);chunk.values[row*paths.length+i]=i>=numeric.length+booleans.length?this.word(value):i>=numeric.length?Number(!!value):value===undefined||value===null?NaN:value;});
  if(!same)seg.count++;seg.end=s.time;
 }
 event(type,s){this.events.push({type,segment:this.current.id,attempt:this.attempt,time:s.time});}
 observe(s,input){
  if(this.sealed)return;
  let p=this.previous;
  const jumped=p&&(s.airportId!==p.airportId||s.time<p.time-1e-6||s.time-p.time>1||Math.hypot(s.x-p.x,s.y-p.y,s.z-p.z)>Math.max(200,(s.time-p.time)*500));
  if(!this.current||jumped){this.startSegment(s,jumped?'skip':'start');p=null;}
  // Sparse context accompanies the numeric trajectory for a future full player.
  // Clip planning deliberately ignores radio/callout metadata.
  const metadata=(type,data)=>this.timeline.push({type,segment:this.current.id,attempt:this.attempt,time:s.time,data:structuredClone(data)});
  if((s.radio?.active?.id??null)!==(p?.radio??null))metadata('radio',{line:s.radio?.active??null,language:s.radio?.language,pilotVoice:s.radio?.pilotVoice,towerVoice:s.radio?.towerVoice,towerVoices:s.radio?.towerVoices||{}});
  if((s.calloutSequence||0)>(p?.callout||0))metadata('callouts',s.callouts.filter(c=>c.id>(p?.callout||0)));
  if((s.mission?.events?.length||0)>(p?.faults||0))metadata('mission',s.mission.events.slice(p?.faults||0));
  if(s.atc?.issuedAt!==p?.issuedAt)metadata('clearance',s.atc?.clearance??null);
  if(s.result)metadata('result',s.result);
  const events=[];
  if(p){
   if(s.water?.phase&&!p.water)events.push('water-contact');
   if(s.water?.phase==='evacuation'&&p.water!=='evacuation')events.push('afloat');
   if(!p.airborne&&s.airborne)events.push('takeoff');
   if(!p.landed&&s.landed)events.push('touchdown');
   if(!p.goAround&&s.goAround)events.push('goaround');
   if((s.mission?.events?.length||0)>p.faults)events.push('fault');
   if(Math.abs(s.roll)>.14&&Math.abs(p.roll)<=.14&&s.airborne&&s.time-(this.lastTurn??-100)>20){events.push('turn');this.lastTurn=s.time;}
   if(p.y>155&&s.y<=155&&s.airborne&&!s.goAround)events.push('final');
   if(s.ground?.stage==='parked'&&p.ground!=='parked')events.push('parked');
  }
  if(s.result)events.push(s.result.success?'complete':'failure');
  if(events.length||s.time-this.current.end>=1/RECORDING_HZ-1e-8)this.write(s,input);
  for(const type of events)this.event(type,s);
  this.previous=signals(s);
  if(s.result)this.sealed=true;
 }
 sample(segmentId,time){
  const seg=this.segments[segmentId];if(!seg?.count)return null;
  const at=(i,k)=>seg.chunks[Math.floor(i/CHUNK)].precise[i%CHUNK*precise.length+k];
  const value=(i,k)=>seg.chunks[Math.floor(i/CHUNK)].values[i%CHUNK*paths.length+k];
  let lo=0,hi=seg.count-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(at(mid,0)<=time)lo=mid;else hi=mid-1;}
  const a=lo,b=Math.min(a+1,seg.count-1),u=Math.max(0,Math.min(1,(time-at(a,0))/(at(b,0)-at(a,0)||1))),s=structuredClone(seg.base);
  precise.forEach((k,i)=>{s[k]=mix(at(a,i),at(b,i),u,false);});
  paths.forEach((k,i)=>{
   let v=value(a,i);
   if(i>=numeric.length+booleans.length)v=this.dictionary[v]??null;
   else if(i>=numeric.length)v=!!v;
   else v=mix(v,value(b,i),u,anglePaths.has(k),k==='weather.wind.directionDeg');
   if(v!==null&&(typeof v!=='number'||Number.isFinite(v)))put(s,parts[i],v);
  });
  if(seg.base.historical){for(let i=0;i<historyPaths.length;i++){const channel=index=>seg.chunks[Math.floor(index/CHUNK)].history?.[index%CHUNK*historyPaths.length+i];let v=channel(a);v=i>=historyNumeric.length?this.dictionary[v]??null:mix(v,channel(b),u,false);if(v!==null&&v!==undefined&&(typeof v!=='number'||Number.isFinite(v)))put(s,historyParts[i],v);}}
  if(!s.touchdown?.time&&s.touchdown?.time!==0)delete s.touchdown;
  if(!s.water?.phase)delete s.water;
  return s;
 }
 // Low-cost trajectory traversal for whole-flight discovery. It never clones
 // full visual/control state and never joins separate skip/retry domains.
 *positionSamples(segmentId,interval=1,{start=-Infinity,end=Infinity,motion=false}={}){
  const seg=this.segments[segmentId];if(!seg)return;let next=-Infinity,last=null;
  for(let i=0;i<seg.count;i++){const chunk=seg.chunks[Math.floor(i/CHUNK)],c=chunk.precise,k=i%CHUNK*precise.length,time=c[k];if(time<start)continue;if(time>end)break;last={time,x:c[k+1],y:c[k+2],z:c[k+3]};if(motion)for(const[name,index]of motionFields){const v=chunk.values[i%CHUNK*paths.length+index];last[name]=name==='airborne'?!!v:Number.isFinite(v)?v:0;}if(time+1e-6>=next){yield last;next=time+interval;last=null;}}
  if(last)yield last;
 }
 stats(){return{hz:RECORDING_HZ,frames:this.segments.reduce((n,s)=>n+s.count,0),bytes:this.segments.reduce((n,s)=>n+s.chunks.reduce((m,c)=>m+c.precise.byteLength+c.values.byteLength+(c.history?.byteLength||0),0),0),duration:this.segments.reduce((n,s)=>n+s.end-s.start,0),attempts:this.attempt,sealed:this.sealed,replaySpans:this.spans.map(s=>({segment:s.segment,until:Number.isFinite(s.until)?s.until:null})),timelineEvents:this.timeline.length,segments:this.segments.map(({id,airportId,attempt,reason,count,start,end})=>({id,airportId,attempt,reason,count,start,end})),events:this.events.map(e=>({...e}))};}
}
