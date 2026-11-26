"""Original failure-scene speech plus curated excerpts of approved recordings.
All crew voices remain unchanged. Emergency roles have their own explicit cast;
existing controller excerpts retain each flight's controller. No credentials or
live synthesis are needed at runtime.
"""
import argparse,asyncio,hashlib,json,pathlib,re,subprocess
import edge_tts
ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'game/src/failure/script.json';MANIFEST=ROOT/'game/src/failure/voice-assets.json'
STAGE=ROOT/'qa/failure-intro/speech';STAGE.mkdir(parents=True,exist_ok=True)
PROFILES=json.loads((ROOT/'game/src/failure/cast.json').read_text())
CAST=['e','g','h','j','xiaoxiao']
def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def info(p):return {'duration':round(float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)])),3),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def write(m):
 m['version']=digest({'script':json.loads(SCRIPT.read_text()),'speech':m['speech'],'excerpts':m['excerpts']})[:20];tmp=MANIFEST.with_suffix('.tmp');tmp.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');tmp.replace(MANIFEST)
def publish(p,ident):
 item=info(p);folder=ROOT/'public/assets/radio/failure';folder.mkdir(parents=True,exist_ok=True);out=folder/(ident+'-'+item['sha256'][:16]+'.mp3');out.write_bytes(p.read_bytes());item['path']=str(out.relative_to(ROOT/'public'));return item

def silence(p):
 r=subprocess.run(['ffmpeg','-nostdin','-v','info','-i',str(p),'-af','silencedetect=noise=-33dB:d=0.10','-f','null','-'],capture_output=True,text=True,check=True)
 return [float(x) for x in re.findall(r'silence_start: ([0-9.]+)',r.stderr)]
def excerpt(m,lang,voice,ident,source,source_item,text,ranges):
 identity=digest({'source':source_item['sha256'],'ranges':ranges,'normalization':'loudnorm-18-v1'});out=STAGE/(identity+'.mp3')
 if not out.exists():
  filters=[];inputs=[]
  for i,(start,end) in enumerate(ranges):filters.append(f'[0:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[a{i}]');inputs.append(f'[a{i}]')
  filters.append(''.join(inputs)+f'concat=n={len(inputs)}:v=0:a=1,loudnorm=I=-18:TP=-2:LRA=7[out]')
  subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-threads','1','-filter_threads','1','-i',str(source),'-filter_complex',';'.join(filters),'-map','[out]','-ar','24000','-ac','1','-b:a','48k',str(out)],check=True)
 item=publish(out,lang+'-'+voice+'-'+ident);item.update({'text':text,'voice':voice,'provider':'approved-recording-excerpt','sourcePath':str(source.relative_to(ROOT/'public')),'sourceSha256':source_item['sha256'],'ranges':ranges});m['excerpts'].setdefault(lang,{}).setdefault(voice,{})[ident]=item;write(m)
def build_excerpts(m):
 historical=json.loads((ROOT/'game/src/history/voice-assets.json').read_text())['clips'];normal=json.loads((ROOT/'game/src/comms/pilot-voices.json').read_text())['voices'];clean=json.loads((ROOT/'game/src/comms/english-pilot-clean.json').read_text())['clips']
 for voice in CAST:
  h=historical['zh'][voice]['us1549-lga-0'];src=ROOT/'public'/h['path'];pauses=silence(src);cut=next((p for p in pauses if 1.5<p<2.1),1.60);tail={'e':4.26,'g':5.22,'h':5.21,'j':5.33,'xiaoxiao':4.61}[voice]
  excerpt(m,'zh',voice,'history-call',src,h,'Cactus 1549，……报告意图。',[[0,cut+.025],[tail,h['duration']]])
  for ident,key,text in [('call','engine-1','云际320，……'),('ack','crosswind-1','……收到……')]:
   item=normal[voice]['clips'][key];src=ROOT/'public/assets/radio/pilots'/voice/item['file'];pauses=silence(src);lower,upper=(.7,1.7) if ident=='call' else (.23,.9);end=next((p for p in pauses if lower<p<upper),1.15 if ident=='call' else .55)
   excerpt(m,'zh',voice,ident,src,item,text,[[0,min(item['duration'],end+.025)]])
  item=historical['zh'][voice]['us1549-teb-1'];src=ROOT/'public'/item['path'];end=next((p for p in silence(src) if .25<p<1.0),.58);excerpt(m,'zh',voice,'understood',src,item,'……明白……',[[0,end+.025]])
 h=historical['en']['aria']['us1549-lga-0'];src=ROOT/'public'/h['path'];pauses=silence(src);cut=next((p for p in pauses if 1.0<p<2.2),1.65);tail=max(0,h['duration']-1.05);excerpt(m,'en','aria','history-call',src,h,'Cactus 1549… report intentions.',[[0,cut+.025],[tail,h['duration']]])
 for ident,key,text,max_end in [('call','engine-1','Skyline 320…',1.25),('ack','crosswind-1','…Roger…',.65)]:
  src=ROOT/'public/assets/radio/en'/(key+'.mp3');item=info(src);end=next((p for p in silence(src) if .25<p<max_end),max_end);excerpt(m,'en','aria',ident,src,item,text,[[0,end+.025]])
 item=clean['atc-recovered-1'];src=ROOT/'public/assets/radio/en/pilots'/item['file'];end=next((p for p in silence(src) if .25<p<.85),.60);excerpt(m,'en','guy','ack',src,item,'…Roger…',[[0,end+.025]])
 item=historical['en']['andrew']['us1549-teb-1'];src=ROOT/'public'/item['path'];end=next((p for p in silence(src) if .25<p<1.0),.75);excerpt(m,'en','andrew','understood',src,item,'…Understood…',[[0,end+.025]])
async def main():
 ap=argparse.ArgumentParser();ap.add_argument('--language',action='append',choices=['zh','en']);ap.add_argument('--excerpts-only',action='store_true');args=ap.parse_args();script=json.loads(SCRIPT.read_text());m=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'schema':1,'speech':{},'excerpts':{}};m['newSpeechVoices']={lang:{role:p['id'] for role,p in roles.items()} for lang,roles in PROFILES.items()};write(m)
 if not args.excerpts_only:
  sem=asyncio.Semaphore(2)
  async def job(lang,ident,line):
   async with sem:
    text=line.get('spokenZh',line['zh']) if lang=='zh' else line['en'];cast=PROFILES[lang][line.get('speaker','instructor' if line['role']=='instructor' else 'field')];profile={k:v for k,v in cast.items() if k!='id'};identity=digest({'text':text,'profile':profile,'normalization':'loudnorm-18-v1'});raw=STAGE/(identity+'.raw.mp3');out=STAGE/(identity+'.mp3')
    if not raw.exists() or raw.stat().st_size<1000:
     for attempt in range(4):
      try:await asyncio.wait_for(edge_tts.Communicate(text,**profile).save(str(raw)),60);break
      except Exception:
       if attempt==3:raise RuntimeError(f'{lang}/{ident}: synthesis failed') from None
       await asyncio.sleep(2**attempt)
    if not out.exists():subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-threads','1','-filter_threads','1','-i',str(raw),'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar','24000','-ac','1','-b:a','48k',str(out)],check=True)
    item=publish(out,lang+'-'+ident);item.update({'text':line[lang],'spokenText':text,'role':line['role'],'voice':cast['id'],'provider':'edge-tts','referenceId':profile['voice']});m['speech'].setdefault(lang,{})[ident]=item;write(m);print(lang,ident,item['duration'],flush=True)
  await asyncio.gather(*(job(lang,ident,line) for lang in args.language or ['zh','en'] for ident,line in script.items()))
 build_excerpts(m);write(m);print('COMPLETE',m['version'],flush=True)
if __name__=='__main__':asyncio.run(main())
