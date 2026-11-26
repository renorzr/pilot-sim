"""Bake the overlapping radio montage at normal speech speed.
Runtime streams one small mix; timeline captions/identity metadata are retained.
"""
import concurrent.futures,hashlib,json,math,pathlib,subprocess,wave
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1];MANIFEST=ROOT/'game/src/failure/voice-assets.json';STAGE=ROOT/'qa/failure-intro/mixes';STAGE.mkdir(parents=True,exist_ok=True)
RATE=24000
MIX_PROFILE='radio-overlap-v3-dispatch-dialogue'

def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def duration(path):return round(float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)])),3)
def ambience(path,total,seed,kind,fade_at):
 rng=np.random.default_rng(seed);t=np.arange(math.ceil(total*RATE))/RATE
 if kind=='procedural':signal=np.zeros((len(t),2))
 else:
  white=rng.normal(0,1,len(t));freq=np.fft.rfftfreq(len(t),1/RATE);spectrum=np.fft.rfft(white);band=(freq>450)*(freq<3200);static=np.fft.irfft(spectrum*band,n=len(t));static/=max(.01,np.std(static));rise=np.clip((t-.35)/1.2,0,1);fade=np.clip((total-.1-t)/max(.4,total-fade_at),0,1);fade=np.where(t<fade_at,1,fade);envelope=rise*fade**1.3
  texture=static*(.014+.013*np.sin(t*1.9)**2)
  for _ in range(18):
   start=rng.uniform(.25,max(.3,fade_at+.5));span=rng.uniform(.018,.09);burst=np.exp(-((t-start)/(span*.4))**2);texture+=white*burst*rng.uniform(.02,.07)
  if kind=='water':tone=np.sin(2*np.pi*105*t+1.3*np.sin(2*np.pi*.4*t))*.012
  else:
   hz=650+235*np.sin(2*np.pi*.30*t);phase=np.cumsum(hz)*2*np.pi/RATE;tone=(np.sin(phase)+.25*np.sin(phase*2))*.015
  tone*=np.clip((t-2.5)/2.2,0,1);mono=(texture+tone)*envelope;signal=np.stack([mono,mono*.88+np.roll(mono,211)*.12],axis=1)
 data=(np.clip(signal,-.95,.95)*32767).astype('<i2')
 with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(data.tobytes())

def main():
 m=json.loads(MANIFEST.read_text());m['mixes']={};jobs=[];cast=['e','g','h','j','xiaoxiao']
 for lang in ['zh','en']:
  for variant in ['a','b']:
   item=m['speech'][lang]['training-'+variant];events=[{'id':'training-'+variant,'at':.22,'role':'instructor','voice':item['voice'],'text':item['text'],'profile':'instructor','item':item,'pan':0,'gain':.85}];jobs.append((lang,'procedural.'+variant,{'kind':'procedural','events':events,'duration':.22+item['duration']+.45,'revealAt':.22+item['duration']*.82,'seed':int(digest([lang,variant])[:8],16)}))
  for context in ['history','generic']:
   for tower in cast if lang=='zh' else ['aria']:
    chatter=next(v for v in cast if v not in [tower,'xiaoxiao']) if lang=='zh' else 'andrew'
    for kind in ['land','water','runway']:
     for variant in ['a','b']:
      for short in [False,True]:
       ident='.'.join([kind,context,tower,variant,'short' if short else 'long']);events=[]
       def add(key,at,role,voice,item,profile,gain,pan):events.append({'id':key,'at':round(at,3),'role':role,'voice':voice,'text':item['text'],'profile':profile,'item':item,'gain':gain,'pan':pan})
       call=m['excerpts'][lang][tower]['history-call' if context=='history' else 'call'];add('controller-call',.55 if short else .9,'tower',tower,call,'broken',.56,-.22)
       if not short:
        report=m['speech'][lang][kind+'-report-'+variant];at=2.0+(0.16 if variant=='b' else 0);add(kind+'-report-'+variant,at,'marine' if kind=='water' else 'rescue' if kind=='runway' else 'police',report['voice'],report,'field',.66,.18);dispatch_at=max(5.1,at+report['duration']-.4)
       else:dispatch_at=1.65
       dispatch=m['speech'][lang][kind+'-dispatch-'+variant];add(kind+'-dispatch-'+variant,dispatch_at,'dispatch',dispatch['voice'],dispatch,'dispatch',.83,-.3)
       response=m['speech'][lang][kind+'-response-'+variant];response_at=dispatch_at+dispatch['duration']-.4;add(kind+'-response-'+variant,response_at,response['role'],response['voice'],response,'responder',.77,.32)
       confirm_at=max(9.0 if short else 13.4,response_at+response['duration']+.25)
       fragment=m['excerpts'][lang][chatter]['understood'];add('channel-fragment',response_at+.65,'background',chatter,fragment,'background',.15,-.5);add('late-channel-fragment',confirm_at+.24,'background',chatter,fragment,'background',.08,.45)
       key='runway-confirm' if kind=='runway' else kind+'-confirm-'+context;confirm=m['speech'][lang][key];add(key,confirm_at,confirm['role'],confirm['voice'],confirm,'confirmation',.88,.04)
       total=confirm_at+confirm['duration']+.65;assert total<19.8,(lang,ident,total,'Shorten dialogue, never accelerate or truncate it');reveal=confirm_at+confirm['duration']*.78;jobs.append((lang,ident,{'kind':kind,'events':events,'duration':total,'revealAt':reveal,'seed':int(digest([lang,ident])[:8],16)}))
 def build(job):
  lang,ident,plan=job;identity=digest({'mix':plan,'profile':MIX_PROFILE});out=STAGE/(identity+'.mp3');bed=STAGE/(identity+'.wav')
  if not out.exists():
   final=plan['events'][-1];ambience(bed,plan['duration'],plan['seed'],plan['kind'],max(.4,final['at']-.2));cmd=['ffmpeg','-nostdin','-v','error','-y','-threads','1','-filter_threads','1','-filter_complex_threads','1','-i',str(bed)]
   for e in plan['events']:cmd+=['-i',str(ROOT/'public'/e['item']['path'])]
   filters=[];sources=['[0:a]']
   for i,e in enumerate(plan['events'],1):
    profile=e['profile'];field_radio=profile in ['field','confirmation','dispatch','responder'];lo=120 if profile=='instructor' else 300 if profile=='dispatch' else 400 if profile=='responder' else 520 if field_radio else 580 if profile=='background' else 460;hi=5200 if profile=='instructor' else 2700 if profile=='dispatch' else 2400 if profile=='responder' else 2350 if profile=='confirmation' else 2100 if profile=='field' else 1550 if profile=='background' else 2000;drive=1.2 if profile=='instructor' else 7 if profile in ['confirmation','responder'] else 9 if profile=='field' else 5.5
    pan=e['pan'];left=math.sqrt((1-pan)/2);right=math.sqrt((1+pan)/2);gate="volume='if(lt(mod(t+0.13,0.39),0.075),0.12,1)':eval=frame," if profile in ['background','broken','field'] else ''
    if profile=='dispatch':gate="volume='if(between(t,1.65,1.82)+between(t,3.12,3.25),0.10,1)':eval=frame,"
    speech=f'[{i}:a]highpass=f={lo},lowpass=f={hi},acompressor=threshold=0.05:ratio=8:attack=2:release=100,volume={drive},asoftclip=type=tanh:threshold=0.6:output=0.72,'
    if field_radio:
     # Field units transmit through their own radio, including the final report.
     # Keep the carrier/squelch local to each transmission, not just the scene bed.
     speech+=f'acrusher=bits=9:mode=lin:mix=0.45,tremolo=f=35:d=0.18,highpass=f={min(lo,450)},lowpass=f={max(hi,2500)},'
     filters.append(speech+gate+f'anull[radio{i}]')
     span=e['item']['duration'];seed=(plan['seed']+i)%2147483647
     interference='+between(t,1.65,1.82)+between(t,3.12,3.25)' if profile=='dispatch' else ''
     filters.append(f"anoisesrc=color=white:amplitude=0.045:sample_rate={RATE}:duration={span}:seed={seed},highpass=f=650,lowpass=f=2600,volume='if(lt(t,0.045)+gt(t,{max(0,span-.06)}){interference},3,0.28)':eval=frame[carrier{i}]")
     speech=f'[radio{i}][carrier{i}]amix=inputs=2:duration=first:normalize=0,'
    else:speech+=gate
    filters.append(speech+f'volume={e["gain"]},afade=t=in:d=0.008,afade=t=out:st={max(0,e["item"]["duration"]-.025)}:d=0.025,pan=stereo|c0={left}*c0|c1={right}*c0,adelay={round(e["at"]*1000)}|{round(e["at"]*1000)}[v{i}]');sources.append(f'[v{i}]')
   filters.append(''.join(sources)+f'amix=inputs={len(sources)}:duration=longest:normalize=0,atrim=duration={plan["duration"]},loudnorm=I=-19:TP=-2:LRA=7[out]');cmd+=['-filter_complex',';'.join(filters),'-map','[out]','-ar',str(RATE),'-ac','2','-b:a','64k',str(out)];subprocess.run(cmd,check=True);bed.unlink(missing_ok=True)
  sha=hashlib.sha256(out.read_bytes()).hexdigest();folder=ROOT/'public/assets/radio/failure';target=folder/(lang+'-mix-'+ident+'-'+sha[:16]+'.mp3');target.write_bytes(out.read_bytes());item={'path':str(target.relative_to(ROOT/'public')),'bytes':target.stat().st_size,'sha256':sha,'duration':duration(out),'revealAt':round(plan['revealAt'],3),'kind':plan['kind'],'voices':sorted({e['voice'] for e in plan['events']}),'events':[{**{k:v for k,v in e.items() if k not in ['item','gain','pan']},'duration':e['item']['duration'],'sourcePath':e['item']['path']} for e in plan['events']]};return lang,ident,item
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for lang,ident,item in pool.map(build,jobs):m['mixes'].setdefault(lang,{})[ident]=item;print(lang,ident,item['duration'],flush=True)
 m['mixProfile']=MIX_PROFILE;m['version']=digest({k:v for k,v in m.items() if k!='version'})[:20];tmp=MANIFEST.with_suffix('.tmp');tmp.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');tmp.replace(MANIFEST);print('COMPLETE',len(jobs),flush=True)
if __name__=='__main__':main()
