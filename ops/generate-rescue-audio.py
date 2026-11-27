"""Original bilingual successful-ditching rescue scene, baked at normal speed."""
import asyncio,hashlib,json,math,pathlib,subprocess,wave
import edge_tts
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1]
STAGE=ROOT/'qa/history-rescue/audio';STAGE.mkdir(parents=True,exist_ok=True)
MANIFEST=ROOT/'game/src/history/rescue-assets.json';RATE=24000;PROFILE='water-rescue-v1'
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def publish(path,ident):
 data=path.read_bytes();sha=hashlib.sha256(data).hexdigest();folder=ROOT/'public/assets/radio/rescue';folder.mkdir(parents=True,exist_ok=True);target=folder/(ident+'-'+sha[:16]+'.mp3');target.write_bytes(data)
 seconds=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(target)]))
 return {'path':str(target.relative_to(ROOT/'public')),'duration':round(seconds,3),'bytes':len(data),'sha256':sha}
def save(m):
 m['version']=digest({k:v for k,v in m.items() if k!='version'})[:20];tmp=MANIFEST.with_suffix('.tmp');tmp.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');tmp.replace(MANIFEST)
def bed(path,total,fade_at,seed):
 t=np.arange(math.ceil(total*RATE))/RATE;rng=np.random.default_rng(seed);noise=rng.normal(0,1,len(t));freq=np.fft.rfftfreq(len(t),1/RATE)
 filtered=np.fft.irfft(np.fft.rfft(noise)*((freq>500)&(freq<2900)),n=len(t));filtered/=max(.01,np.std(filtered))
 fade=np.clip((total-t)/max(.5,total-fade_at),0,1)**1.5;fade=np.where(t<fade_at,1,fade);rise=np.clip(t/1.4,0,1)
 radio=filtered*.012
 hz=670+210*np.sin(2*np.pi*.26*t);phase=np.cumsum(hz)*2*np.pi/RATE;siren=(np.sin(phase)+.16*np.sin(2*phase))*.014*np.clip((t-.4)/3,0,1)
 # A distant shore siren, water wash and approaching boats, not a nearby alarm.
 boat=(np.sin(2*np.pi*92*t+.7*np.sin(t*2))+.35*np.sin(2*np.pi*183*t))*.009*np.clip(t/9,0,1)
 water=np.fft.irfft(np.fft.rfft(noise)*((freq>140)&(freq<650)),n=len(t));water/=max(.01,np.std(water));water*=.008*(.6+.4*np.sin(t*1.3)**2)
 mono=(radio+siren+boat+water)*rise*fade;stereo=np.stack([mono,mono*.86+np.roll(mono,173)*.14],axis=1)
 with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes((np.clip(stereo,-.9,.9)*32767).astype('<i2').tobytes())
def render(plan,out,identity):
 if out.exists():return
 wav=STAGE/(identity+'.wav');bed(wav,plan['duration'],plan['events'][-1]['at']-.25,int(identity[:8],16));cmd=['ffmpeg','-nostdin','-v','error','-y','-threads','1','-filter_threads','1','-filter_complex_threads','1','-i',str(wav)]
 for e in plan['events']:cmd+=['-i',str(ROOT/'public'/e['sourcePath'])]
 filters=[];sources=['[0:a]']
 for i,e in enumerate(plan['events'],1):
  profile=e['profile'];span=e['duration'];radio=profile!='intercom';lo=300 if profile=='dispatch' else 430;hi=2700 if profile=='dispatch' else 2350
  signal=f'[{i}:a]'
  if radio:
   signal+=f'highpass=f={lo},lowpass=f={hi},acompressor=threshold=0.05:ratio=7:attack=2:release=100,volume=6,asoftclip=type=tanh:threshold=0.6:output=0.72,acrusher=bits=9:mode=lin:mix=0.35,'
   if profile=='dispatch':signal+="volume='if(between(t,2.15,2.33),0.12,1)':eval=frame,"
   filters.append(signal+f'anull[speech{i}]');seed=(int(identity[:8],16)+i)%2147483647
   interference='+between(t,2.15,2.33)' if profile=='dispatch' else ''
   filters.append(f"anoisesrc=color=white:amplitude=0.035:sample_rate={RATE}:duration={span}:seed={seed},highpass=f=650,lowpass=f=2600,volume='if(lt(t,0.045)+gt(t,{span-.06}){interference},3,0.28)':eval=frame[noise{i}]")
   signal=f'[speech{i}][noise{i}]amix=inputs=2:duration=first:normalize=0,'
  left=math.sqrt((1-e['pan'])/2);right=math.sqrt((1+e['pan'])/2)
  filters.append(signal+f'volume={e["gain"]},afade=t=in:d=0.008,afade=t=out:st={span-.025}:d=0.025,pan=stereo|c0={left}*c0|c1={right}*c0,adelay={round(e["at"]*1000)}|{round(e["at"]*1000)}[v{i}]');sources.append(f'[v{i}]')
 filters.append(''.join(sources)+f'amix=inputs={len(sources)}:duration=longest:normalize=0,atrim=duration={plan["duration"]},loudnorm=I=-19:TP=-2:LRA=7[out]')
 subprocess.run(cmd+['-filter_complex',';'.join(filters),'-map','[out]','-ar',str(RATE),'-ac','2','-b:a','64k',str(out)],check=True);wav.unlink(missing_ok=True)
async def main():
 script=json.loads((ROOT/'game/src/history/rescue-script.json').read_text());cast=json.loads((ROOT/'game/src/failure/cast.json').read_text());crew=json.loads((ROOT/'game/src/history/crew-cast.json').read_text());historical=json.loads((ROOT/'game/src/history/voice-assets.json').read_text())
 m={'schema':1,'profile':PROFILE,'speech':{},'sources':{},'mixes':{}};sem=asyncio.Semaphore(2)
 async def speech(lang,ident,line):
  async with sem:
   actor=cast[lang][line['speaker']];profile={k:v for k,v in actor.items() if k!='id'};identity=digest({'text':line[lang],'profile':profile,'normalization':'loudnorm-18-v1'});raw=STAGE/(identity+'.raw.mp3');out=STAGE/(identity+'.mp3')
   if not raw.exists() or raw.stat().st_size<1000:
    for attempt in range(4):
     try:await asyncio.wait_for(edge_tts.Communicate(line[lang],**profile).save(str(raw)),60);break
     except Exception:
      if attempt==3:raise RuntimeError(f'{lang}/{ident}: synthesis failed') from None
      await asyncio.sleep(2**attempt)
   if not out.exists():subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(raw),'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar',str(RATE),'-ac','1','-b:a','48k',str(out)],check=True)
   item=publish(out,lang+'-'+ident);item.update({'voice':actor['id'],'referenceId':actor['voice'],'role':line['role'],'text':line[lang],'provider':'edge-tts'});m['speech'].setdefault(lang,{})[ident]=item;save(m);print(lang,ident,item['duration'],flush=True)
 await asyncio.gather(*(speech(lang,ident,line) for lang in ['zh','en'] for ident,line in script.items()))
 jobs=[]
 for lang in ['zh','en']:
  towers=[v for v in historical['cast'][lang]['tower'] if v not in crew[lang].values()]
  for tower in towers:
   for outcome in ['controlled','damaged']:
    events=[]
    def add(ident,at,item,voice,role,profile,gain,pan):
     m['sources'][item['path']]={**item,'voice':voice}
     events.append({'id':ident,'at':round(at,3),'voice':voice,'role':role,'text':item['text'],'duration':item['duration'],'profile':profile,'sourcePath':item['path'],'sourceSha256':item['sha256'],'gain':gain,'pan':pan})
    add('tower',.3,historical['clips'][lang][tower]['us1549-rescue-0'],tower,'tower','vhf',.65,-.22)
    field=m['speech'][lang]['field-'+outcome];add('field',2.0,field,field['voice'],'police','field',.68,.18)
    dispatch=m['speech'][lang]['dispatch'];dispatch_at=max(5.8,2+field['duration']-.5);add('dispatch',dispatch_at,dispatch,dispatch['voice'],'dispatch','dispatch',.8,-.3)
    response=m['speech'][lang]['response'];response_at=dispatch_at+dispatch['duration']-.45;add('response',response_at,response,response['voice'],'marine','responder',.76,.3)
    closing_at=max(14.3,response_at+response['duration']-.35);copilot=crew[lang]['copilot'];add('closing',closing_at,historical['clips'][lang][copilot]['us1549-closing-0'],copilot,'copilot','intercom',.9,0)
    total=closing_at+events[-1]['duration']+.65;assert total<19.8,(lang,outcome,total,'Shorten dialogue instead of accelerating or cutting speech')
    plan={'events':events,'duration':total,'outcome':outcome};key=tower+'.'+outcome;identity=digest({'profile':PROFILE,'plan':plan});jobs.append((lang,key,plan,identity))
 for lang,key,plan,identity in jobs:
  out=STAGE/(identity+'.mix.mp3');render(plan,out,identity);item=publish(out,lang+'-mix-'+key);item.update({'outcome':plan['outcome'],'events':[{k:v for k,v in e.items() if k not in ['gain','pan']} for e in plan['events']]});m['mixes'].setdefault(lang,{})[key]=item;save(m);print(lang,key,item['duration'],flush=True)
 print('COMPLETE',len(jobs),flush=True)
if __name__=='__main__':asyncio.run(main())
