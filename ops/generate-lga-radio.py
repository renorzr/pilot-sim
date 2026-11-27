"""Resumable LGA radio; retain all approved Chinese voices and clean pilots.
Fish free-model credentials default to the ignored local file. Existing lines
reuse exact same-speaker recordings; staged work is published only at finalize.
"""
import argparse,asyncio,getpass,hashlib,importlib.util,json,pathlib,shutil,subprocess,sys,urllib.request
import edge_tts
from fish_credentials import load_fish_credential

ROOT=pathlib.Path(__file__).resolve().parents[1];STAGE=ROOT/'qa/lga-radio';STAGE.mkdir(exist_ok=True,parents=True)
spec=importlib.util.spec_from_file_location('jfk_radio',ROOT/'ops/generate-jfk-radio.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
REFS={'e':'41aafb356afe4d46925ab37fbb588c79','g':'0a86f2f473514783a93b37dad673613e','h':'09f2e5951ea543319af82e7d2219a92c','j':'048222d36be842f199ec8ac71993dce4'}
TRIM='silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.025,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.04,areverse'
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def info(p):return {'duration':round(float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)])),3),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def render(source,target,filtered):
 if not target.exists():subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-threads','1','-filter_threads','1','-i',str(source),'-af',TRIM+','+(base.FILTER if filtered else 'loudnorm=I=-18:TP=-2:LRA=7'),'-ar','24000','-ac','1','-b:a','48k',str(target)],check=True)
 return info(target)
def script():
 stand=json.loads((ROOT/'game/src/airports/data/lga-departure.json').read_text())['stand']['ref'];zh,en=base.make_script(stand,'04');zh={k:[[r,t.replace('肯尼迪','拉瓜迪亚')]for r,t in v]for k,v in zh.items()};en={k:[[r,t.replace('Kennedy','LaGuardia')]for r,t in v]for k,v in en.items()};return zh,en
async def main():
 ap=argparse.ArgumentParser();ap.add_argument('--language',action='append',choices=['en','zh']);ap.add_argument('--voice',action='append');ap.add_argument('--fish-stdin',action='store_true');ap.add_argument('--fish-prompt',action='store_true');ap.add_argument('--finalize',action='store_true');ap.add_argument('--publish-english',action='store_true');a=ap.parse_args();key=load_fish_credential(stdin=a.fish_stdin,prompt=a.fish_prompt)
 zh,en=script();packpath=ROOT/'game/src/comms/lga-radio.json';pack={'zh':zh,'en':en,'durations':{'zh':{},'en':{}},'version':digest({'zh':zh,'en':en,'voices':'approved-lga-v1'})[:20]};previous=json.loads((ROOT/'game/src/comms/pilot-voices.json').read_text());clean=json.loads((ROOT/'game/src/comms/english-pilot-clean.json').read_text());sem=asyncio.Semaphore(3)
 async def job(lang,voice,ident,role,text):
  target=STAGE/f'{lang}-{voice}-{ident}.json'
  if target.exists():
   old=json.loads(target.read_text())
   if old['text']==text:return
  async with sem:
   if lang=='zh':
    reusable=next((v for v in previous['voices'][voice]['clips'].values() if v['text']==text and v['role']==role and (role!='pilot' or v.get('clean'))),None)
    if reusable:
     target.write_text(json.dumps({**reusable,'role':role,'text':text,'reuse':True,'voice':voice,'language':lang},ensure_ascii=False,indent=2)+'\n');return
   profile=base.PROFILES['en'][role] if lang=='en' else {'voice':'zh-CN-XiaoxiaoNeural','rate':'+24%','pitch':'-12Hz'} if voice=='xiaoxiao' else None
   identity=digest({'text':text,'profile':profile,'voice':voice,'model':'edge-tts' if profile else 's2.1-pro-free'});raw=STAGE/(identity+'.raw.mp3')
   if not raw.exists():
    if profile:
     for attempt in range(4):
      try:await asyncio.wait_for(edge_tts.Communicate(text,**profile).save(str(raw)),50);break
      except Exception:
       if attempt==3:raise RuntimeError('Edge synthesis failed for '+ident) from None
       await asyncio.sleep(2**attempt)
    else:
     if not key:print('PENDING approved Fish voice',voice,ident,flush=True);return
     payload={'text':'[严肃克制，干练自然的航空无线电通话，快速清晰地报告，不要播音腔] '+text,'reference_id':REFS[voice],'format':'mp3','mp3_bitrate':128,'temperature':.3 if voice=='j' else .5,'top_p':.7,'prosody':{'speed':1.16,'volume':0,'normalize_loudness':True}}
     def fish():
      req=urllib.request.Request('https://api.fish.audio/v1/tts',data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','model':'s2.1-pro-free'})
      with urllib.request.urlopen(req,timeout=90)as r:audio=r.read()
      if len(audio)<1000:raise RuntimeError('Empty Fish recording')
      raw.write_bytes(audio)
     for attempt in range(4):
      try:await asyncio.to_thread(fish);break
      except Exception as error:
       if attempt==3:raise RuntimeError('Fish synthesis failed for '+ident+' ('+type(error).__name__+')') from None
       await asyncio.sleep(2**attempt)
   filtered=STAGE/(identity+'.radio.mp3');record={'role':role,'text':text,'language':lang,'voice':voice,'serviceModel':'edge-tts' if profile else 's2.1-pro-free','signal':None,**render(raw,filtered,True),'file':str(filtered)}
   if role=='pilot':
    dry=STAGE/(identity+'.clean.mp3');record['clean']={**render(raw,dry,False),'file':str(dry)}
   target.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print('READY',lang,voice,ident,record['duration'],flush=True)
 jobs=[]
 for lang in a.language or ['en']:
  for voice in (a.voice or list(previous['voices'])) if lang=='zh' else ['default']:
   for event,lines in (zh if lang=='zh' else en).items():
    for i,(role,text)in enumerate(lines):jobs.append(job(lang,voice,f'lga-{event}-{i}',role,text))
 await asyncio.gather(*jobs)
 # Even before recording completion, the concrete script is available to code
 # tests. Build preflights reject it until every approved voice is complete.
 for lang in ['en','zh']:
  for event,lines in (zh if lang=='zh' else en).items():
   for i,(role,text)in enumerate(lines):
    ident=f'lga-{event}-{i}'
    r=STAGE/f'{lang}-{"default" if lang=="en" else "h" if role=="pilot" else "xiaoxiao"}-{ident}.json'
    if r.exists():pack['durations'][lang][ident]=json.loads(r.read_text())['duration']
 packpath.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
 if a.publish_english:
  for event,lines in en.items():
   for i,(role,text)in enumerate(lines):
    ident=f'lga-{event}-{i}';record=json.loads((STAGE/f'en-default-{ident}.json').read_text());assert record['text']==text
    folder=ROOT/'public/assets/radio/en';shutil.copyfile(record['file'],folder/(ident+'.mp3'))
    if record.get('clean'):
     c=record['clean'];filename=ident+'-clean-'+c['sha256'][:16]+'.mp3';shutil.copyfile(c['file'],folder/'pilots'/filename);clean['clips'][ident]={'text':text,**c,'file':filename}
  clean['version']=digest(clean['clips'])[:20];(ROOT/'game/src/comms/english-pilot-clean.json').write_text(json.dumps(clean,ensure_ascii=False,indent=2)+'\n');print('English LGA recordings verified and installed',flush=True)
 if not a.finalize:return
 expected=[(lang,voice,f'lga-{event}-{i}',role,text)for lang in ['en','zh']for voice in (list(previous['voices'])if lang=='zh' else ['default'])for event,lines in (zh if lang=='zh' else en).items()for i,(role,text)in enumerate(lines)]
 for lang,voice,ident,role,text in expected:
  record=STAGE/f'{lang}-{voice}-{ident}.json';assert record.exists(),f'Missing {lang}/{voice}/{ident}';assert json.loads(record.read_text())['text']==text
 for lang,voice,ident,role,text in expected:
  record=json.loads((STAGE/f'{lang}-{voice}-{ident}.json').read_text())
  if lang=='zh':
   if not record.get('reuse'):
    folder=ROOT/'public/assets/radio/pilots'/voice;filename=ident+'-'+record['sha256'][:16]+'.mp3';shutil.copyfile(record['file'],folder/filename);record['file']=filename
    if record.get('clean'):
     c=record['clean'];filename=ident+'-clean-'+c['sha256'][:16]+'.mp3';shutil.copyfile(c['file'],folder/filename);c['file']=filename
   for k in ['reuse','voice','language']:record.pop(k,None)
   previous['voices'][voice]['clips'][ident]=record
   if voice==('h'if role=='pilot'else'xiaoxiao'):shutil.copyfile(ROOT/'public/assets/radio/pilots'/voice/record['file'],ROOT/'public/assets/radio'/(ident+'.mp3'))
  else:
   folder=ROOT/'public/assets/radio/en';shutil.copyfile(record['file'],folder/(ident+'.mp3'))
   if record.get('clean'):
    c=record['clean'];filename=ident+'-clean-'+c['sha256'][:16]+'.mp3';shutil.copyfile(c['file'],folder/'pilots'/filename);clean['clips'][ident]={'text':text,**c,'file':filename}
 all_lines={}
 for path in [ROOT/'game/src/comms/script.json',*sorted((ROOT/'game/src/comms').glob('*-radio.json'))]:
  data=json.loads(path.read_text());prefix=path.name.removesuffix('-radio.json')+'-'if'zh'in data else''
  for event,entries in data.get('zh',data).items():
   if not isinstance(entries,list):continue
   for i,pair in enumerate(entries):
    if isinstance(pair,list)and len(pair)==2 and pair[0]in['pilot','tower']:all_lines[f'{prefix}{event}-{i}']={'role':pair[0],'text':pair[1]}
 previous['sourceHash']=digest(all_lines)
 pack['version']=digest({'zh':zh,'en':en,'recordings':[json.loads((STAGE/f'{lang}-{voice}-{ident}.json').read_text())['sha256']for lang,voice,ident,role,text in expected]})[:20];packpath.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
 previous['version']=digest({k:v for k,v in previous.items()if k!='version'})[:20];(ROOT/'game/src/comms/pilot-voices.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2)+'\n');clean['version']=digest(clean['clips'])[:20];(ROOT/'game/src/comms/english-pilot-clean.json').write_text(json.dumps(clean,ensure_ascii=False,indent=2)+'\n');print('Finalized all approved LGA recordings',flush=True)
if __name__=='__main__':asyncio.run(main())
