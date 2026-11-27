"""Generate self-hosted original US1549 speech; resumable, content addressed.
Fish credentials default to the ignored local file; the free model is mandatory.
The English cast preserves Guy/Aria and adds Andrew for the first officer.
"""
import argparse, asyncio, hashlib, json, pathlib, subprocess, sys, urllib.request
import edge_tts
from fish_credentials import load_fish_credential

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'game/src/history/radio-script.json'
MANIFEST=ROOT/'game/src/history/voice-assets.json'
STAGE=ROOT/'qa/us1549-m3/speech'; STAGE.mkdir(parents=True,exist_ok=True)
PROFILES={
 'en':{'guy':{'voice':'en-US-GuyNeural','rate':'+24%','pitch':'-10Hz'},'aria':{'voice':'en-US-AriaNeural','rate':'+22%','pitch':'-6Hz'},'andrew':{'voice':'en-US-AndrewNeural','rate':'+12%','pitch':'-4Hz'}},
 'zh':{'xiaoxiao':{'voice':'zh-CN-XiaoxiaoNeural','rate':'+24%','pitch':'-12Hz'},'yunxi':{'voice':'zh-CN-YunxiNeural','rate':'+18%','pitch':'-12Hz'},'yunyang':{'voice':'zh-CN-YunyangNeural','rate':'+12%','pitch':'-6Hz'}},
}
REFERENCES={'e':'41aafb356afe4d46925ab37fbb588c79','g':'0a86f2f473514783a93b37dad673613e','h':'09f2e5951ea543319af82e7d2219a92c','j':'048222d36be842f199ec8ac71993dce4'}
def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def info(p):return{'duration':round(float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)])),3),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def write_manifest(m):
 m['version']=digest({'cast':m['cast'],'clips':m['clips']})[:20]
 tmp=MANIFEST.with_suffix('.tmp');tmp.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');tmp.replace(MANIFEST)
async def main():
 ap=argparse.ArgumentParser();ap.add_argument('--language',choices=['zh','en'],action='append');ap.add_argument('--cast',choices=['approved','edge'],default='approved');ap.add_argument('--fish-stdin',action='store_true');ap.add_argument('--voice',action='append');args=ap.parse_args()
 credential=load_fish_credential(stdin=args.fish_stdin)
 script=json.loads(SCRIPT.read_text());m=json.loads(MANIFEST.read_text());sem=asyncio.Semaphore(2)
 langs=args.language or ['en'];jobs=[]
 for lang in langs:
  cast={'pilot':['guy'],'tower':['aria'],'copilot':['andrew']} if lang=='en' else {'pilot':['xiaoxiao'],'tower':['yunxi'],'copilot':['yunyang']} if args.cast=='edge' else {role:[*REFERENCES,'xiaoxiao'] for role in ['pilot','tower','copilot']}
  m['cast'][lang]=cast;m['clips'].setdefault(lang,{})
  for event,lines in script[lang].items():
   for i,(role,text,channel) in enumerate(lines):
    for voice in cast['pilot' if role=='pa' else role]:
     if args.voice and voice not in args.voice:continue
     jobs.append((lang,voice,f'us1549-{event}-{i}',role,text,channel))
 async def job(lang,voice,ident,role,text,channel):
  async with sem:
   profile=PROFILES.get(lang,{}).get(voice);model='edge-tts' if profile else 's2.1-pro-free'
   identity=digest({'language':lang,'voice':voice,'text':text,'profile':profile,'model':model,'normalization':'loudnorm-18-v1'})
   raw=STAGE/(identity+'.raw.mp3');out=STAGE/(identity+'.mp3')
   if not raw.exists() or raw.stat().st_size<1000:
    for attempt in range(4):
     try:
      if profile:await asyncio.wait_for(edge_tts.Communicate(text,**profile).save(str(raw)),45)
      else:
       if not credential:raise RuntimeError('Missing Fish credential: .secrets/fish-audio.key or --fish-stdin')
       def fish():
        payload=json.dumps({'text':'[自然、镇定、简短的机组通话] '+text,'reference_id':REFERENCES[voice],'format':'mp3','mp3_bitrate':128,'normalize':True,'latency':'normal'},ensure_ascii=False).encode()
        req=urllib.request.Request('https://api.fish.audio/v1/tts',data=payload,headers={'Authorization':'Bearer '+credential,'Content-Type':'application/json','model':'s2.1-pro-free'})
        with urllib.request.urlopen(req,timeout=90) as r:raw.write_bytes(r.read())
       await asyncio.to_thread(fish)
      if raw.stat().st_size<1000:raise RuntimeError('Empty speech result')
      break
     except Exception as error:
      if attempt==3:raise RuntimeError(f'{lang}/{voice}/{ident}: speech generation failed ({type(error).__name__})') from None
      await asyncio.sleep(2**attempt)
   if not out.exists():
    subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-threads','1','-filter_threads','1','-i',str(raw),'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar','24000','-ac','1','-b:a','48k',str(out)],check=True)
   item=info(out);assert .3<item['duration']<22
   folder=ROOT/'public/assets/radio/us1549'/lang/voice;folder.mkdir(parents=True,exist_ok=True);name=ident+'-'+item['sha256'][:16]+'.mp3';target=folder/name
   if not target.exists():target.write_bytes(out.read_bytes())
   item.update({'path':str(target.relative_to(ROOT/'public')),'text':text,'role':role,'channel':channel,'provider':model,'referenceId':profile['voice'] if profile else REFERENCES[voice]})
   m['clips'][lang].setdefault(voice,{})[ident]=item;write_manifest(m);print(lang,voice,ident,item['duration'],flush=True)
 await asyncio.gather(*(job(*j) for j in jobs));write_manifest(m);print('COMPLETE',len(jobs),flush=True)
if __name__=='__main__':asyncio.run(main())
