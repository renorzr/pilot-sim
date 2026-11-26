import argparse, asyncio, array, hashlib, json, math, pathlib, subprocess
import edge_tts
ROOT=pathlib.Path(__file__).resolve().parents[1]
PROFILES={
 'zh':{'tower':{'voice':'zh-CN-XiaoxiaoNeural','rate':'+24%','pitch':'-12Hz'},'pilot':{'voice':'zh-CN-YunxiNeural','rate':'+26%','pitch':'-18Hz'}},
 'en':{'tower':{'voice':'en-US-AriaNeural','rate':'+22%','pitch':'-6Hz'},'pilot':{'voice':'en-US-GuyNeural','rate':'+24%','pitch':'-10Hz'}},
}
FILTER='highpass=f=300,lowpass=f=3300,loudnorm=I=-18:TP=-2:LRA=7'
SEM=asyncio.Semaphore(3)
async def clip(language,event,index,role,text,staging=None):
 async with SEM:
  ident=f'airline-{event}-{index}'
  folder=(staging/'radio' if staging else ROOT/'public/assets/radio')/('en' if language=='en' else '')
  folder.mkdir(parents=True,exist_ok=True);target=folder/(ident+'.mp3')
  identity=json.dumps({'text':text,'profile':PROFILES[language][role],'filter':FILTER},ensure_ascii=False,sort_keys=True)
  raw=pathlib.Path('/tmp')/('pilot-ground-'+hashlib.sha256(identity.encode()).hexdigest()[:20]+'.mp3')
  if not raw.exists() or raw.stat().st_size<1000:
   for attempt in range(4):
    try:
     await asyncio.wait_for(edge_tts.Communicate(text,**PROFILES[language][role]).save(str(raw)),40);break
    except Exception as e:
     if attempt==3:raise
     print('RETRY',ident,attempt,str(e),flush=True);await asyncio.sleep(attempt+1)
  subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(raw),'-af',FILTER,'-ar','24000','-ac','1','-b:a','48k',str(target)],check=True)
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels,bit_rate','-of','json',str(target)]))
  duration=float(probe['format']['duration']);stream=probe['streams'][0]
  assert stream['codec_name']=='mp3' and stream['sample_rate']=='24000' and stream['channels']==1
  assert target.stat().st_size>1000 and .5<duration<20
  pcm=array.array('h',subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','s16le','-acodec','pcm_s16le','-']))
  peak=max(abs(v) for v in pcm)/32768;rms=math.sqrt(sum(v*v for v in pcm)/len(pcm))/32768
  assert .01<peak<.99 and rms>.003,(ident,peak,rms)
  print(language,ident,round(duration,3),'peak',round(peak,4),'rms',round(rms,4),flush=True)
  return language,ident,round(duration,3)
async def main():
 parser=argparse.ArgumentParser();parser.add_argument('--event',action='append');parser.add_argument('--staging-dir',type=pathlib.Path);args=parser.parse_args()
 pack=json.loads((ROOT/'game/src/comms/airline-radio.json').read_text())
 events=args.event or ['departure-climb', 'departure-turn', 'destination-established', 'arrival-final', 'runway-exit', 'arrival-taxi', 'parked']
 results=await asyncio.gather(*[clip(lang,event,i,role,text,args.staging_dir) for lang in ['zh','en'] for event in events for i,(role,text) in enumerate(pack[lang][event])])
 for lang,ident,duration in results:pack['durations'][lang][ident]=duration
 pack['version']=hashlib.sha256(json.dumps({'zh':pack['zh'],'en':pack['en'],'profiles':PROFILES,'filter':FILTER},ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:20]
 output=args.staging_dir/'airline-radio.json' if args.staging_dir else ROOT/'game/src/comms/airline-radio.json'
 output.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
 print('PACK airline',pack['version'],'CLIPS',len(results),flush=True)
if __name__=='__main__':asyncio.run(main())
